// Webserver voor de iPhone-app: leest de Niko-sensoren en serveert de React-app
// (web/dist) plus een kleine API. Het Niko-token blijft op de server.
//   GET /api/state   -> huidige toestand + geschiedenis
//   GET /api/stream  -> Server-Sent Events met live updates
//   POST /api/tv     -> { action: 'on' | 'off' } zet de Sony Bravia-tv aan of uit
//   POST /api/bluos  -> { action, ip, ... } bedient BluOS-spelers; GET /api/bluos/img geeft hoezen door
//   GET /api/qr      -> SVG met een QR-code van het adres van de app
//   POST /api/devices -> [{ uuid, on?, brightness? }] bedient lichten, dimmers, stopcontacten
//   POST /api/target -> { target: °C } zet de doeltemperatuur (bewaard in state.json)

import http from 'node:http';
import os from 'node:os';
import QRCode from 'qrcode';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { NikoClient, findSensor, readTemperature } from './niko.js';
import { listSensors } from './sensors.js';
import { toModel, applyProperties, controlProperties } from './home.js';
import { propertiesToObject } from './niko.js';
import { EnergyTracker } from './energy.js';
import { sunTimes } from './sun.js';
import { BluosManager } from './bluos-manager.js';
import { lanPrefixes } from './bluos.js';
import { BraviaTv } from './bravia.js';

const PORT = Number(process.env.PORT) || 3000;
const { version: VERSION } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const DIST = fileURLToPath(new URL('../web/dist/', import.meta.url));
const HISTORY_MS = 24 * 3600_000;
const SAMPLE_EVERY_MS = 5 * 60_000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const config = loadConfig(process.env, { needSeitron: false });
const STATE_FILE = process.env.STATE_FILE || fileURLToPath(new URL('../state.json', import.meta.url));
const TARGET_MIN = 10;
const TARGET_MAX = 28;
let target = config.control.targetTemp;
let saved = {};
try {
  saved = JSON.parse(await readFile(STATE_FILE, 'utf8'));
  if (Number.isFinite(saved.target)) target = saved.target;
} catch { /* nog geen opgeslagen toestand */ }
const energy = new EnergyTracker(saved.energy);
let energyUuid = null;
let lastSave = 0;

const saveState = () => writeFile(STATE_FILE, JSON.stringify({ target, energy, bluos: [...(bluos?.players.keys() ?? saved.bluos ?? [])] }), 'utf8').catch((e) => console.error('FOUT:', e.message));

async function setTarget(value) {
  const v = Math.round(Number(value) * 2) / 2;
  if (!Number.isFinite(v) || v < TARGET_MIN || v > TARGET_MAX) return false;
  target = v;
  broadcast('target', { target });
  await saveState();
  console.log(`Doeltemperatuur: ${target} °C`);
  return true;
}
const sensors = new Map(); // uuid -> { uuid, name, temperature, updatedAt, history: [[ts, °C]] }
let connected = false;
const streams = new Set();
const lights = new Map(); // uuid -> bedienbaar toestel (licht, dimmer, stopcontact, ventilator)

function record(uuid, name, temperature) {
  const now = Date.now();
  const s = sensors.get(uuid) ?? { uuid, name, temperature: null, updatedAt: null, history: [] };
  const last = s.history.at(-1);
  if (!last || last[1] !== temperature || now - last[0] >= SAMPLE_EVERY_MS) s.history.push([now, temperature]);
  while (s.history.length && now - s.history[0][0] > HISTORY_MS) s.history.shift();
  Object.assign(s, { name, temperature, updatedAt: now });
  sensors.set(uuid, s);
  broadcast('sensor', s);
}

function snapshot() {
  return { version: VERSION, tv: tv.snapshot(), bluos: bluos.snapshot(), connected, sun: sunTimes(Date.now(), config.location.lat, config.location.lon), energy: { ...energy.snapshot(), history: energy.history }, lights: [...lights.values()], target, targetMin: TARGET_MIN, targetMax: TARGET_MAX, sensors: [...sensors.values()], now: Date.now() };
}

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of streams) res.write(msg);
}

// BluOS-spelers: bewaarde en handmatige IP's plus een scan van de lokale netwerken en het netwerk van Niko.
const list = (v) => String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const bluosHosts = [...new Set([...(saved.bluos ?? []), ...list(process.env.BLUOS_HOSTS)])];
const bluos = new BluosManager({
  covers: process.env.BLUOS_COVERS !== 'false', // 'false' = geen hoezen zoeken (titels gaan dan nergens heen)
  hosts: bluosHosts,
  prefixes: lanPrefixes({ interfaces: os.networkInterfaces(), extraHosts: [config.niko.host, ...bluosHosts], extraPrefixes: list(process.env.BLUOS_SUBNETS) }),
});
bluos.on('update', (snap) => broadcast('bluos', snap));
bluos.on('hosts', () => saveState());

// Sony Bravia-tv aan/uit (optioneel: zonder BRAVIA_HOST en BRAVIA_PSK blijft de tv-knop verborgen).
const tv = new BraviaTv({ host: process.env.BRAVIA_HOST, psk: process.env.BRAVIA_PSK });
tv.on('update', (snap) => broadcast('tv', snap));

// Eén verbinding met de controller voor alles: temperaturen, lichten en energie.
// (De controller weigert soms extra verbindingen, dus we houden het bij één.)
const sensorSpecs = listSensors(config.niko);
if (sensorSpecs.length === 0) throw new Error('Geef NIKO_SENSOR_UUID of NIKO_SENSOR_NAME op');
const sensorNames = new Map(); // uuid van een gekozen sensor -> naam

const home = new NikoClient({ ...config.niko, sensorName: '', sensorUuid: '' });
home.on('connect', () => { connected = true; broadcast('status', { connected }); console.log('Verbonden met Niko'); });
home.on('offline', () => { connected = false; broadcast('status', { connected }); });
home.on('error', (err) => console.error('FOUT:', err.message));

function applyEnergy(props) {
  const now = Date.now();
  if (!energy.apply(props, now)) return;
  broadcast('energy', energy.snapshot());
  if (now - lastSave > 60_000) { lastSave = now; saveState(); }
}

function applySensor(raw) {
  const temperature = readTemperature(raw);
  if (temperature !== null) record(raw.Uuid, sensorNames.get(raw.Uuid), temperature);
}

home.on('devices', (list) => {
  sensorNames.clear();
  for (const spec of sensorSpecs) {
    const sensor = findSensor(list, spec);
    if (sensor) sensorNames.set(sensor.Uuid, sensor.Name ?? sensor.Uuid);
    else console.error(`FOUT: sensor "${spec.sensorUuid || spec.sensorName}" niet gevonden. Voer "npm run devices" uit om de namen te zien.`);
  }
  lights.clear();
  for (const raw of list) {
    if (sensorNames.has(raw.Uuid)) applySensor(raw);
    if (raw.Type === 'energyhome') { energyUuid = raw.Uuid; applyEnergy(propertiesToObject(raw.Properties)); }
    const model = toModel(raw);
    if (model) lights.set(model.uuid, model);
  }
  broadcast('lights', [...lights.values()]);
});
home.on('update', (list) => {
  for (const raw of list) {
    if (sensorNames.has(raw.Uuid)) applySensor(raw);
    if (raw.Uuid === energyUuid) applyEnergy(propertiesToObject(raw.Properties));
    const current = lights.get(raw.Uuid);
    if (!current) continue;
    const next = applyProperties(current, propertiesToObject(raw.Properties));
    lights.set(next.uuid, next);
    broadcast('light', next);
  }
});
const clients = [home.connect()];
bluos.start().catch((err) => console.error('FOUT: BluOS starten mislukt:', err.message));
tv.start();

async function serveStatic(req, res) {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, path === '/' ? 'index.html' : path);
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    try { // SPA-fallback
      const body = await readFile(join(DIST, 'index.html'));
      res.writeHead(200, { 'Content-Type': TYPES['.html'] }).end(body);
    } catch {
      res.writeHead(503, { 'Content-Type': 'text/plain' }).end('Frontend nog niet gebouwd: voer "npm run build" uit.');
    }
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}

function readJson(req, handler) {
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 16_384) req.destroy(); });
  req.on('end', () => {
    let parsed;
    try { parsed = JSON.parse(body); } catch { /* ongeldig */ }
    handler(parsed);
  });
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (pathname === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(snapshot()));
  } else if (pathname === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(`event: status\ndata: ${JSON.stringify({ connected })}\n\n`);
    res.write(`event: target\ndata: ${JSON.stringify({ target })}\n\n`);
    res.write(`event: bluos\ndata: ${JSON.stringify(bluos.snapshot())}\n\n`);
    res.write(`event: tv\ndata: ${JSON.stringify(tv.snapshot())}\n\n`);
    res.write(`event: energy\ndata: ${JSON.stringify(energy.snapshot())}\n\n`);
    res.write(`event: lights\ndata: ${JSON.stringify([...lights.values()])}\n\n`);
    streams.add(res);
    req.on('close', () => streams.delete(res));
  } else if (pathname === '/api/bluos' && req.method === 'POST') {
    // Body: { action, ip, ...parameters } voor een bekende BluOS-speler
    readJson(req, async (body) => {
      try {
        await bluos.command(body?.action, body ?? {});
        json(res, 200, { ok: true });
      } catch (err) {
        json(res, 400, { ok: false, error: err.message });
      }
    });
  } else if (pathname === '/api/tv' && req.method === 'POST') {
    // Body: { action: 'on' | 'off' }
    readJson(req, async (body) => {
      try {
        await tv.command(body?.action);
        json(res, 200, { ok: true, power: tv.power });
      } catch (err) {
        json(res, 400, { ok: false, error: err.message });
      }
    });
  } else if (pathname === '/api/bluos/img') {
    // Hoes of icoon van een speler doorgeven (alleen van spelers die we zelf gevonden hebben)
    const q = new URL(req.url, 'http://x').searchParams;
    const path = q.get('path') ?? '';
    if (!bluos.players.has(q.get('ip')) || !path.startsWith('/') || path.startsWith('//') || path.includes('..')) return json(res, 400, { ok: false });
    fetch(`http://${q.get('ip')}:11000${path}`, { signal: AbortSignal.timeout(5000) })
      .then(async (r) => {
        const type = r.headers.get('content-type') ?? '';
        if (!r.ok || !type.startsWith('image/')) return json(res, 404, { ok: false });
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600' }).end(Buffer.from(await r.arrayBuffer()));
      })
      .catch(() => json(res, 502, { ok: false }));
  } else if (pathname === '/api/qr') {
    // QR-code (SVG) van het adres waarmee deze pagina geopend is, om de app op een ander toestel te openen.
    QRCode.toString(`http://${req.headers.host}`, { type: 'svg', margin: 1, color: { dark: '#14161a', light: '#ffffff' } })
      .then((svg) => res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }).end(svg))
      .catch(() => json(res, 500, { ok: false }));
  } else if (pathname === '/api/target' && req.method === 'POST') {
    readJson(req, async (body) => {
      const ok = await setTarget(body?.target);
      json(res, ok ? 200 : 400, { ok, target });
    });
  } else if (pathname === '/api/devices' && req.method === 'POST') {
    // Body: [{ uuid, on?, brightness? }, ...]
    readJson(req, (body) => {
      const devices = [];
      for (const cmd of Array.isArray(body) ? body : []) {
        const model = lights.get(cmd?.uuid);
        const Properties = model && controlProperties(model, cmd);
        if (Properties) devices.push({ Uuid: model.uuid, Properties });
      }
      if (devices.length === 0) return json(res, 400, { ok: false });
      home.control(devices);
      json(res, 200, { ok: true, count: devices.length });
    });
  } else {
    serveStatic(req, res);
  }
});

setInterval(() => { for (const res of streams) res.write(': ping\n\n'); }, 25_000);
server.listen(PORT, '0.0.0.0', () => console.log(`Hygge-app v${VERSION} op http://localhost:${PORT}`));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    // Is de controller onbereikbaar, dan blijft het sluiten van de verbinding hangen: na 3 s toch afsluiten.
    setTimeout(() => process.exit(0), 3000).unref();
    bluos.stop();
    tv.stop();
    await saveState();
    await Promise.all(clients.map((c) => c.close()));
    process.exit(0);
  });
}
