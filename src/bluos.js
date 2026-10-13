// BluOS-spelers (Bluesound, NAD, ...): XML-antwoorden omzetten naar gewone objecten, zones opbouwen
// en de URL's voor commando's samenstellen. Puur (geen netwerk), zodat het eenvoudig te testen is.

import { XMLParser } from 'fast-xml-parser';

export const BLUOS_PORT = 11000;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
});

const arr = (v) => (v === undefined || v === null || v === '' ? [] : Array.isArray(v) ? v : [v]);
const num = (v) => {
  const n = Number(v);
  return v === undefined || v === '' || !Number.isFinite(n) ? null : n;
};
const text = (node) => (node !== null && typeof node === 'object' ? String(node['#text'] ?? '') : node === undefined || node === null ? '' : String(node));

/** /SyncStatus -> { ip, name, model, volume, master: {ip, port} | null, slaves: [...] } of null */
export function parseSyncStatus(xml, ip) {
  let s;
  try { s = parser.parse(xml).SyncStatus; } catch { return null; }
  if (!s || typeof s !== 'object') return null;
  const master = s.master ? { ip: text(s.master), port: num(s.master['@_port']) ?? BLUOS_PORT } : null;
  return {
    ip,
    name: s['@_name'] ?? ip,
    model: s['@_model'] ?? '',
    modelName: s['@_modelName'] ?? s['@_model'] ?? '',
    icon: s['@_icon'] ?? null,
    volume: num(s['@_volume']) ?? 0,
    db: num(s['@_db']),
    mute: s['@_mute'] === '1',
    group: s['@_group'] ?? null,
    master: master && master.ip ? master : null,
    slaves: arr(s.slave).map((x) => ({ ip: x['@_id'], port: num(x['@_port']) ?? BLUOS_PORT, name: x['@_name'] ?? x['@_id'], model: x['@_model'] ?? '' })),
  };
}

/** /Status -> wat er speelt (of null) */
export function parseStatus(xml) {
  let s;
  try { s = parser.parse(xml).status; } catch { return null; }
  if (!s || typeof s !== 'object') return null;
  const serviceType = s.serviceType ? text(s.serviceType) : '';
  const line1 = text(s.twoline_title1) || text(s.title1);
  const line2 = text(s.twoline_title2) || text(s.title2);
  const radio = serviceType === 'RadioService';
  // Radio geeft 'ARTIEST - Nummer • Programma' door: het nummer is de titel, zender en programma de ondertitel.
  const [song, ...rest] = line2.split(' • ');
  const show = rest.join(' • ');
  return {
    state: text(s.state) || 'stop', // play | pause | stop | stream | connecting
    title: (radio ? song : line1) || '',
    subtitle: (radio ? [line1, show].filter(Boolean).join(' · ') : line2) || '',
    detail: text(s.title3),
    image: text(s.image) || text(s.stationImage) || null,
    service: text(s.serviceName) || text(s.service) || null,
    serviceType,
    groupName: text(s.groupName) || null,
    groupVolume: num(text(s.groupVolume)),
    volume: num(text(s.volume)),
    mute: text(s.mute) === '1',
    presetId: text(s.preset_id) || null,
    canSeek: text(s.canSeek) === '1',
    shuffle: text(s.shuffle) === '1',
    repeat: num(text(s.repeat)) ?? 0,
  };
}

/** /Presets -> favorieten */
export function parsePresets(xml) {
  let p;
  try { p = parser.parse(xml).presets; } catch { return []; }
  return arr(p?.preset).map((x) => ({
    id: Number(x['@_id']),
    name: x['@_name'] ?? '',
    image: x['@_image'] ?? null,
    url: x['@_url'] ?? '',
    volume: num(x['@_volume']),
  })).filter((x) => Number.isFinite(x.id));
}

export const isPlaying = (state) => state === 'play' || state === 'stream';

/** Overslaan kan alleen bij nummers (Spotify, bibliotheek, ...), niet bij een live radiostream. */
export const canSkip = (st) => Boolean(st) && st.state !== 'stream' && !/tunein/i.test(st.service ?? '');

/**
 * Bouwt zones (een groep of een losse speler) uit de bekende spelers.
 * @param players [{ ip, sync, status, presets, online }]
 */
export function buildZones(players) {
  const byIp = new Map(players.map((p) => [p.ip, p]));
  const memberOf = new Map(); // ip van lid -> ip van leider

  for (const p of players) {
    if (!p.sync) continue;
    if (p.sync.master && byIp.has(p.sync.master.ip) && p.sync.master.ip !== p.ip) memberOf.set(p.ip, p.sync.master.ip);
    for (const s of p.sync.slaves) if (byIp.has(s.ip) && s.ip !== p.ip && !memberOf.has(s.ip)) memberOf.set(s.ip, p.ip);
  }

  const view = (p, leaderIp) => ({
    ip: p.ip,
    name: p.sync?.name ?? p.ip,
    model: p.sync?.modelName || p.sync?.model || '',
    icon: p.sync?.icon ?? null,
    volume: p.sync?.volume ?? 0,
    online: p.online,
    isLeader: p.ip === leaderIp,
  });

  return players
    .filter((p) => p.sync && !memberOf.has(p.ip))
    .map((leader) => {
      const memberIps = [...memberOf].filter(([, l]) => l === leader.ip).map(([ip]) => ip);
      const members = [view(leader, leader.ip), ...memberIps.map((ip) => view(byIp.get(ip), leader.ip))];
      const st = leader.status;
      const volumes = members.filter((m) => m.online).map((m) => m.volume);
      return {
        id: leader.ip,
        leader: leader.ip,
        name: members.length > 1 ? (leader.sync.group ?? `${leader.sync.name} + ${members.length - 1}`) : leader.sync.name,
        grouped: members.length > 1,
        online: leader.online,
        state: st?.state ?? 'stop',
        playing: isPlaying(st?.state),
        canSkip: canSkip(st), // bij live radio (TuneIn) is er geen volgend of vorig nummer
        nowPlaying: st ? { title: st.title, subtitle: st.subtitle, detail: st.detail, image: st.image, cover: leader.cover?.url ?? null, coverSource: leader.cover?.source ?? null, service: st.service, presetId: st.presetId } : null,
        groupVolume: st?.groupVolume ?? (volumes.length ? Math.round(volumes.reduce((a, b) => a + b, 0) / volumes.length) : 0),
        mute: st?.mute ?? false,
        members,
        presets: (leader.presets ?? []).map((p) => ({ ...p, active: Boolean(st?.presetId && p.url.includes(st.presetId)) })),
      };
    })
    .sort((a, b) => Number(b.grouped) - Number(a.grouped) || a.name.localeCompare(b.name, 'nl'));
}

/** Nieuwe volumes voor een groep: elke speler behoudt zijn aandeel (verhoudingen blijven gelijk). */
export function scaleVolumes(volumes, current, target) {
  const clamp = (v) => Math.min(100, Math.max(0, Math.round(v)));
  if (!(current > 0)) return volumes.map(() => clamp(target)); // groep stond op 0: iedereen gelijk
  return volumes.map((v) => clamp((v * target) / current));
}

/** Pad + query voor een commando, of null als de parameters niet kloppen. */
export function commandPath(action, params = {}) {
  const level = Math.round(Number(params.level));
  const valid = Number.isFinite(level) && level >= 0 && level <= 100;
  switch (action) {
    case 'play': return '/Play';
    case 'pause': return '/Pause';
    case 'stop': return '/Stop';
    case 'next': return '/Skip';
    case 'prev': return '/Back';
    case 'preset': return Number.isInteger(params.id) && params.id > 0 ? `/Preset?id=${params.id}` : null;
    case 'volume': return valid ? `/Volume?level=${level}` : null;
    case 'mute': return typeof params.mute === 'boolean' ? `/Volume?mute=${params.mute ? 1 : 0}` : null;
    case 'addSlave': return params.slave ? `/AddSlave?slave=${encodeURIComponent(params.slave)}&port=${BLUOS_PORT}` : null;
    case 'removeSlave': return params.slave ? `/RemoveSlave?slave=${encodeURIComponent(params.slave)}&port=${BLUOS_PORT}` : null;
    default: return null;
  }
}

const PRIVATE = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2[0-9])\./];
const NOT_LAN = [/^172\.17\./, /^172\.30\./, /^172\.31\./]; // docker en Home Assistant (intern)

/** Alle /24-netwerken waarop we naar spelers zoeken, als 'a.b.c'. */
export function lanPrefixes({ interfaces = {}, extraHosts = [], extraPrefixes = [] } = {}) {
  const out = new Set();
  const add = (ip) => {
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return;
    if (PRIVATE.some((r) => r.test(ip)) && !NOT_LAN.some((r) => r.test(ip))) out.add(ip.split('.').slice(0, 3).join('.'));
  };
  for (const list of Object.values(interfaces)) for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) add(a.address);
  for (const h of extraHosts) add(h);
  for (const p of extraPrefixes) if (/^\d+\.\d+\.\d+$/.test(p)) out.add(p);
  return [...out];
}
