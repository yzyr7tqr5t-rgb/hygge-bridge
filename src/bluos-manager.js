// Vindt BluOS-spelers op het netwerk, houdt hun toestand bij en voert commando's uit.

import { EventEmitter } from 'node:events';
import {
  BLUOS_PORT, parseSyncStatus, parseStatus, parsePresets, buildZones, commandPath, scaleVolumes,
} from './bluos.js';
import { createCoverFinder } from './cover.js';

const SCAN_TIMEOUT_MS = 1500;
const REQUEST_TIMEOUT_MS = 3000;
const OFFLINE_AFTER = 3; // mislukte polls achter elkaar
const PRESETS_REFRESH_MS = 10 * 60_000;

export class BluosManager extends EventEmitter {
  /**
   * @param opts.prefixes  /24-netwerken om te scannen, als ['192.168.0']
   * @param opts.hosts     IP's die we al kennen (bewaard of handmatig)
   */
  constructor({ prefixes = [], hosts = [], fetchImpl = fetch, pollMs = 2500, rescanMs = 10 * 60_000, covers = true, findCover = null } = {}) {
    super();
    this.prefixes = prefixes;
    this.fetch = fetchImpl;
    this.pollMs = pollMs;
    this.rescanMs = rescanMs;
    this.players = new Map(); // ip -> { ip, sync, status, presets, presetsAt, failures, online }
    this.scanning = false;
    this.lastScanAt = null;
    this.lastJson = '';
    this.timers = [];
    this.seedHosts = hosts;
    // Hoes van het nummer dat op de radio speelt (alleen titel en artiest gaan naar iTunes/Deezer). Uit te zetten met covers: false.
    this.findCover = findCover ?? (covers ? createCoverFinder() : null);
  }

  // ---------- verbinding ----------
  async get(ip, path, timeout = REQUEST_TIMEOUT_MS) {
    const res = await this.fetch(`http://${ip}:${BLUOS_PORT}${path}`, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) throw new Error(`${ip}${path} gaf ${res.status}`);
    return res.text();
  }

  async probe(ip, timeout = SCAN_TIMEOUT_MS) {
    try {
      const sync = parseSyncStatus(await this.get(ip, '/SyncStatus', timeout), ip);
      if (!sync) return false;
      const existing = this.players.get(ip);
      this.players.set(ip, { ip, sync, status: existing?.status ?? null, presets: existing?.presets ?? null, presetsAt: existing?.presetsAt ?? 0, failures: 0, online: true });
      return true;
    } catch {
      return false;
    }
  }

  /** Zoekt spelers op alle bekende netwerken. */
  async scan() {
    if (this.scanning) return;
    this.scanning = true;
    this.emitIfChanged();
    try {
      const ips = this.prefixes.flatMap((p) => Array.from({ length: 254 }, (_, i) => `${p}.${i + 1}`));
      const before = this.players.size;
      await Promise.all(ips.map((ip) => this.probe(ip)));
      this.lastScanAt = Date.now();
      if (this.players.size !== before) this.emit('hosts', [...this.players.keys()]);
    } finally {
      this.scanning = false;
      await this.pollOnce();
    }
  }

  async start() {
    await Promise.all(this.seedHosts.map((ip) => this.probe(ip, REQUEST_TIMEOUT_MS)));
    await this.pollOnce();
    this.scan();
    this.timers.push(setInterval(() => this.pollOnce(), this.pollMs));
    this.timers.push(setInterval(() => this.scan(), this.rescanMs));
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }

  // ---------- toestand bijhouden ----------
  async pollPlayer(p) {
    try {
      const sync = parseSyncStatus(await this.get(p.ip, '/SyncStatus'), p.ip);
      if (!sync) throw new Error('geen SyncStatus');
      p.sync = sync;
      p.failures = 0;
      p.online = true;
    } catch {
      p.failures += 1;
      if (p.failures >= OFFLINE_AFTER) p.online = false;
    }
  }

  /** Zoekt de hoes bij het radionummer; het zenderlogo blijft staan tot er een goede treffer is. */
  updateCover(p) {
    const st = p.status;
    const title = this.findCover && st?.serviceType === 'RadioService' ? st.title : '';
    if (!title) { p.cover = null; p.coverKey = null; return; }
    if (p.coverKey === title) return;
    p.coverKey = title;
    p.cover = null;
    this.findCover(title)
      .then((hit) => { if (hit && p.coverKey === title) { p.cover = hit; this.emitIfChanged(); } })
      .catch(() => {});
  }

  async pollLeader(p) {
    try {
      p.status = parseStatus(await this.get(p.ip, '/Status'));
      this.updateCover(p);
      if (!p.presets || Date.now() - p.presetsAt > PRESETS_REFRESH_MS) {
        p.presets = parsePresets(await this.get(p.ip, '/Presets'));
        p.presetsAt = Date.now();
      }
    } catch { /* volgende ronde opnieuw */ }
  }

  async pollOnce() {
    await Promise.all([...this.players.values()].map((p) => this.pollPlayer(p)));
    const leaders = buildZones([...this.players.values()]).map((z) => this.players.get(z.leader)).filter((p) => p?.online);
    await Promise.all(leaders.map((p) => this.pollLeader(p)));
    this.emitIfChanged();
  }

  snapshot() {
    const zones = buildZones([...this.players.values()]);
    return { zones, scanning: this.scanning, lastScanAt: this.lastScanAt, count: this.players.size };
  }

  emitIfChanged() {
    const snap = this.snapshot();
    const json = JSON.stringify({ ...snap, lastScanAt: null });
    if (json === this.lastJson) return;
    this.lastJson = json;
    this.emit('update', snap);
  }

  // ---------- commando's ----------
  known(ip) {
    const p = this.players.get(ip);
    if (!p) throw new Error('onbekende speler');
    return p;
  }

  async send(ip, path) {
    await this.get(ip, path);
  }

  /** Alle commando's die we ondersteunen. Geeft een korte fout (Error) bij ongeldige invoer. */
  async command(action, params = {}) {
    if (action === 'scan') { this.scan(); return; }

    const p = this.known(params.ip);
    const zone = buildZones([...this.players.values()]).find((z) => z.members.some((m) => m.ip === p.ip));
    const leaderIp = zone?.leader ?? p.ip;

    switch (action) {
      case 'play': case 'pause': case 'stop': case 'next': case 'prev': case 'preset': {
        if ((action === 'next' || action === 'prev') && !zone?.canSkip) throw new Error('Overslaan kan niet bij live radio');
        const path = commandPath(action, params);
        if (!path) throw new Error('ongeldige opdracht');
        await this.send(leaderIp, path); // transport gaat altijd naar de leider van de groep
        break;
      }
      case 'volume': { // volume van één speler
        const path = commandPath('volume', params);
        if (!path) throw new Error('ongeldig volume');
        await this.send(p.ip, path);
        if (p.sync) p.sync.volume = Math.round(Number(params.level));
        break;
      }
      case 'mute': {
        const path = commandPath('mute', params);
        if (!path) throw new Error('ongeldige opdracht');
        await this.send(leaderIp, path);
        break;
      }
      case 'groupVolume': { // verhoudingen binnen de groep blijven gelijk
        if (!zone) throw new Error('geen groep');
        const target = Math.round(Number(params.level));
        if (!commandPath('volume', { level: target })) throw new Error('ongeldig volume');
        const members = zone.members.filter((m) => m.online);
        const next = scaleVolumes(members.map((m) => m.volume), zone.groupVolume, target);
        await Promise.all(members.map((m, i) => this.send(m.ip, `/Volume?level=${next[i]}`)));
        members.forEach((m, i) => { const mp = this.players.get(m.ip); if (mp?.sync) mp.sync.volume = next[i]; });
        break;
      }
      case 'group': { // spelers toevoegen aan de groep van deze speler
        const adds = (Array.isArray(params.add) ? params.add : []).map((ip) => this.known(ip));
        for (const a of adds) {
          if (a.ip === leaderIp) continue;
          const own = buildZones([...this.players.values()]).find((z) => z.members.some((m) => m.ip === a.ip));
          if (own && own.leader === a.ip && own.grouped) throw new Error(`${a.sync?.name ?? a.ip} leidt zelf een groep; heft die eerst op`);
          if (own && own.leader !== a.ip) await this.send(own.leader, commandPath('removeSlave', { slave: a.ip })); // eerst uit de oude groep
          await this.send(leaderIp, commandPath('addSlave', { slave: a.ip }));
        }
        break;
      }
      case 'ungroup': { // één speler uit de groep halen
        if (!zone || zone.leader === p.ip) throw new Error('alleen een lid kan uit de groep');
        await this.send(zone.leader, commandPath('removeSlave', { slave: p.ip }));
        break;
      }
      case 'disband': { // hele groep opheffen
        if (!zone?.grouped) throw new Error('geen groep');
        for (const m of zone.members.filter((x) => !x.isLeader)) await this.send(zone.leader, commandPath('removeSlave', { slave: m.ip }));
        break;
      }
      default:
        throw new Error(`onbekende actie "${action}"`);
    }
    setTimeout(() => this.pollOnce().catch(() => {}), 350); // snel de nieuwe toestand tonen
  }
}
