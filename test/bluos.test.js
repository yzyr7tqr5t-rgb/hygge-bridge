import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSyncStatus, parseStatus, parsePresets, buildZones, scaleVolumes, commandPath, lanPrefixes,
} from '../src/bluos.js';
import { BluosManager } from '../src/bluos-manager.js';

const syncLeader = `<?xml version="1.0"?><SyncStatus etag="2022" volume="7" name="PULSE FLEX - Keuken" model="P130-a5" modelName="PULSE FLEX" icon="/images/players/P130_nt.png" group="PULSE FLEX - Keuken + 2"><slave id="192.168.0.184" port="11000" name="POWERNODE - Living" model="N230"></slave><slave id="192.168.0.151" port="11000" name="PULSE FLEX - Berging" model="P130-a5"></slave><pairWithSub></pairWithSub></SyncStatus>`;
const syncMember = (name, vol) => `<?xml version="1.0"?><SyncStatus volume="${vol}" name="${name}" model="N230" modelName="POWERNODE EDGE"><master port="11000">192.168.0.187</master></SyncStatus>`;
const syncSingle = `<SyncStatus volume="12" name="Slaapkamer" model="P125" modelName="PULSE"></SyncStatus>`;
const statusRadio = `<status etag="x"><groupName>PULSE FLEX - Keuken + 2</groupName><groupVolume>7</groupVolume><mute>0</mute><serviceName>TuneIn</serviceName><serviceType>RadioService</serviceType><state>stream</state><title1>VRT Radio 2 Limburg</title1><twoline_title1>VRT Radio 2 Limburg</twoline_title1><twoline_title2>BLONDIE - Maria</twoline_title2><image>http://x/logo.jpg</image><preset_id>s25706</preset_id></status>`;
const presetsXml = `<presets prid="0"><preset id="1" name="VRT Radio 1" url="/Play?url=TuneIn:s18555" image="http://x/1.png"></preset><preset id="2" name="Radio 2 &amp; Co" url="/Play?url=TuneIn:s25706" image="/Sources/images/SpotifyIcon.png" volume="7"></preset></presets>`;

test('parseSyncStatus: leider, lid en losse speler', () => {
  const leader = parseSyncStatus(syncLeader, '192.168.0.187');
  assert.equal(leader.name, 'PULSE FLEX - Keuken');
  assert.deepEqual(leader.slaves.map((s) => s.ip), ['192.168.0.184', '192.168.0.151']);
  assert.equal(leader.master, null);
  assert.deepEqual(parseSyncStatus(syncMember('POWERNODE - Living', 7), '192.168.0.184').master, { ip: '192.168.0.187', port: 11000 });
  const single = parseSyncStatus(syncSingle, '192.168.0.9');
  assert.equal(single.master, null);
  assert.equal(single.slaves.length, 0);
  assert.equal(parseSyncStatus('geen xml', 'x'), null);
  assert.equal(parseSyncStatus('<status></status>', 'x'), null);
});

test('parseStatus: radio toont het nummer als titel en de zender als ondertitel', () => {
  const s = parseStatus(statusRadio);
  assert.equal(s.title, 'BLONDIE - Maria');
  assert.equal(s.subtitle, 'VRT Radio 2 Limburg');
  assert.equal(s.groupVolume, 7);
  assert.equal(s.state, 'stream');
  assert.equal(s.mute, false);
});

test('parseStatus: radio splitst nummer en programma', () => {
  const s = parseStatus('<status><serviceType>RadioService</serviceType><state>stream</state><twoline_title1>VRT Radio 2 Limburg</twoline_title1><twoline_title2>MIAMI SOUND MACHINE - Conga • Elke dag telt voor 2</twoline_title2></status>');
  assert.equal(s.title, 'MIAMI SOUND MACHINE - Conga');
  assert.equal(s.subtitle, 'VRT Radio 2 Limburg · Elke dag telt voor 2');
});

test('parseStatus: bij muziekdiensten is de eerste regel de titel', () => {
  const s = parseStatus('<status><serviceType>MusicService</serviceType><state>play</state><twoline_title1>Mamma Mia</twoline_title1><twoline_title2>ABBA</twoline_title2></status>');
  assert.equal(s.title, 'Mamma Mia');
  assert.equal(s.subtitle, 'ABBA');
});

test('parsePresets leest naam, afbeelding en volume', () => {
  const p = parsePresets(presetsXml);
  assert.equal(p.length, 2);
  assert.equal(p[1].name, 'Radio 2 & Co');
  assert.equal(p[1].volume, 7);
  assert.deepEqual(parsePresets('<presets></presets>'), []);
});

const player = (ip, sync, status = null, presets = null) => ({ ip, sync, status, presets, online: true });

test('buildZones: een groep met de leider bovenaan en een losse speler apart', () => {
  const zones = buildZones([
    player('192.168.0.184', parseSyncStatus(syncMember('POWERNODE - Living', 6), '192.168.0.184')),
    player('192.168.0.187', parseSyncStatus(syncLeader, '192.168.0.187'), parseStatus(statusRadio), parsePresets(presetsXml)),
    player('192.168.0.151', parseSyncStatus(syncMember('PULSE FLEX - Berging', 8), '192.168.0.151')),
    player('192.168.0.9', parseSyncStatus(syncSingle, '192.168.0.9')),
  ]);
  assert.equal(zones.length, 2);
  const group = zones[0];
  assert.equal(group.leader, '192.168.0.187');
  assert.equal(group.grouped, true);
  assert.equal(group.members.length, 3);
  assert.equal(group.members[0].isLeader, true);
  assert.equal(group.groupVolume, 7);
  assert.equal(group.playing, true);
  assert.equal(group.presets.length, 2);
  assert.deepEqual(group.presets.map((p) => p.active), [false, true]); // preset_id s25706 speelt
  assert.equal(zones[1].name, 'Slaapkamer');
  assert.equal(zones[1].grouped, false);
});

test('buildZones: een lid met onbekende leider wordt een losse speler', () => {
  const zones = buildZones([player('192.168.0.184', parseSyncStatus(syncMember('X', 5), '192.168.0.184'))]);
  assert.equal(zones.length, 1);
  assert.equal(zones[0].grouped, false);
});

test('scaleVolumes behoudt de verhoudingen en klemt tussen 0 en 100', () => {
  assert.deepEqual(scaleVolumes([10, 20], 15, 30), [20, 40]);
  assert.deepEqual(scaleVolumes([50, 90], 70, 100), [71, 100]);
  assert.deepEqual(scaleVolumes([10, 20], 15, 0), [0, 0]);
  assert.deepEqual(scaleVolumes([0, 0], 0, 25), [25, 25]);
});

test('commandPath controleert de invoer', () => {
  assert.equal(commandPath('play'), '/Play');
  assert.equal(commandPath('next'), '/Skip');
  assert.equal(commandPath('volume', { level: 33.4 }), '/Volume?level=33');
  assert.equal(commandPath('volume', { level: 120 }), null);
  assert.equal(commandPath('volume', { level: 'abc' }), null);
  assert.equal(commandPath('preset', { id: 4 }), '/Preset?id=4');
  assert.equal(commandPath('preset', { id: '4; rm' }), null);
  assert.equal(commandPath('mute', { mute: true }), '/Volume?mute=1');
  assert.equal(commandPath('addSlave', { slave: '192.168.0.9' }), '/AddSlave?slave=192.168.0.9&port=11000');
  assert.equal(commandPath('nope'), null);
});

test('lanPrefixes: lokale netwerken zonder docker en met het netwerk van Niko erbij', () => {
  const interfaces = {
    en0: [{ family: 'IPv4', address: '192.168.0.183', internal: false }],
    lo0: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    docker: [{ family: 'IPv4', address: '172.30.32.1', internal: false }],
    other: [{ family: 'IPv4', address: '169.254.1.1', internal: false }],
  };
  assert.deepEqual(lanPrefixes({ interfaces, extraHosts: ['192.168.0.209', '192.168.5.20'], extraPrefixes: ['10.0.1'] }).sort(), ['10.0.1', '192.168.0', '192.168.5']);
  assert.deepEqual(lanPrefixes({ interfaces: { x: [{ family: 'IPv4', address: '172.30.32.2', internal: false }] }, extraHosts: ['192.168.0.209'] }), ['192.168.0']);
});

// ---------- manager met een nagebootst netwerk ----------
function fakeNetwork(responses) {
  const calls = [];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    const key = `${u.hostname}${u.pathname}`;
    calls.push(`${u.hostname}${u.pathname}${u.search}`);
    const known = Object.keys(responses).some((k) => k.startsWith(`${u.hostname}/`));
    const body = responses[key] ?? (known && !u.pathname.match(/^\/(SyncStatus|Status|Presets)$/) ? '<ok/>' : undefined); // commando's: altijd ok
    if (body === undefined) throw new Error('niet bereikbaar');
    return { ok: true, status: 200, text: async () => body };
  };
  return { fetchImpl, calls };
}

const network = () => fakeNetwork({
  '192.168.0.187/SyncStatus': syncLeader,
  '192.168.0.187/Status': statusRadio,
  '192.168.0.187/Presets': presetsXml,
  '192.168.0.184/SyncStatus': syncMember('POWERNODE - Living', 6),
  '192.168.0.151/SyncStatus': syncMember('PULSE FLEX - Berging', 8),
  '192.168.0.9/SyncStatus': syncSingle,
  '192.168.0.9/Status': '<status><state>stop</state></status>',
  '192.168.0.9/Presets': '<presets></presets>',
});

async function manager() {
  const net = network();
  const m = new BluosManager({ fetchImpl: net.fetchImpl, hosts: [] });
  for (const ip of ['192.168.0.187', '192.168.0.184', '192.168.0.151', '192.168.0.9']) await m.probe(ip);
  await m.pollOnce();
  net.calls.length = 0;
  return { m, calls: net.calls };
}

test('manager: scan vindt spelers en bouwt zones', async () => {
  const net = network();
  const m = new BluosManager({ fetchImpl: net.fetchImpl, prefixes: ['192.168.0'] });
  await m.scan();
  const snap = m.snapshot();
  assert.equal(snap.count, 4);
  assert.equal(snap.zones.length, 2);
  assert.equal(snap.scanning, false);
});

test('manager: transport gaat naar de leider, ook als je een lid kiest', async () => {
  const { m, calls } = await manager();
  await m.command('pause', { ip: '192.168.0.184' });
  assert.deepEqual(calls, ['192.168.0.187/Pause']);
  m.stop();
});

test('manager: volume gaat naar de speler zelf en groepsvolume houdt verhoudingen', async () => {
  const { m, calls } = await manager();
  await m.command('volume', { ip: '192.168.0.184', level: 20 });
  assert.deepEqual(calls, ['192.168.0.184/Volume?level=20']);
  calls.length = 0;
  await m.command('groupVolume', { ip: '192.168.0.187', level: 14 }); // 7 -> 14: alles ×2 (leider 7, living nu 20, berging 8)
  assert.deepEqual(calls.sort(), ['192.168.0.151/Volume?level=16', '192.168.0.184/Volume?level=40', '192.168.0.187/Volume?level=14']);
  await assert.rejects(() => m.command('volume', { ip: '192.168.0.184', level: 500 }), /ongeldig/);
});

test('manager: groeperen, ontkoppelen en opheffen', async () => {
  const { m, calls } = await manager();
  await m.command('group', { ip: '192.168.0.187', add: ['192.168.0.9'] });
  assert.deepEqual(calls, ['192.168.0.187/AddSlave?slave=192.168.0.9&port=11000']);
  calls.length = 0;
  await m.command('ungroup', { ip: '192.168.0.151' });
  assert.deepEqual(calls, ['192.168.0.187/RemoveSlave?slave=192.168.0.151&port=11000']);
  await assert.rejects(() => m.command('ungroup', { ip: '192.168.0.187' }), /alleen een lid/);
  calls.length = 0;
  await m.command('disband', { ip: '192.168.0.187' });
  assert.deepEqual(calls, ['192.168.0.187/RemoveSlave?slave=192.168.0.184&port=11000', '192.168.0.187/RemoveSlave?slave=192.168.0.151&port=11000']);
});

test('manager: een leider van een groep kan niet zomaar bij een andere groep', async () => {
  const { m } = await manager();
  await assert.rejects(() => m.command('group', { ip: '192.168.0.9', add: ['192.168.0.187'] }), /leidt zelf een groep/);
});

test('manager: onbekende spelers en acties worden geweigerd', async () => {
  const { m, calls } = await manager();
  await assert.rejects(() => m.command('play', { ip: '10.9.9.9' }), /onbekende speler/);
  await assert.rejects(() => m.command('hack', { ip: '192.168.0.187' }), /onbekende actie/);
  assert.equal(calls.length, 0);
});

// ---------- hoes bij radionummers ----------
const radioStatus = (title2) => `<status><serviceType>RadioService</serviceType><state>stream</state><twoline_title1>VRT Radio 2 Limburg</twoline_title1><twoline_title2>${title2}</twoline_title2><image>http://x/logo.jpg</image></status>`;

async function coverManager(findCover, statusXml) {
  const net = fakeNetwork({
    '192.168.0.187/SyncStatus': syncLeader.replace(/<slave[^>]*><\/slave>/g, ''),
    '192.168.0.187/Status': statusXml,
    '192.168.0.187/Presets': presetsXml,
  });
  const m = new BluosManager({ fetchImpl: net.fetchImpl, findCover });
  await m.probe('192.168.0.187');
  return m;
}

test('hoes: een radionummer krijgt de hoes, het zenderlogo blijft beschikbaar', async () => {
  const asked = [];
  const m = await coverManager(async (t) => { asked.push(t); return { url: 'https://cdn/maria.jpg', source: 'iTunes' }; }, radioStatus('BLONDIE - Maria'));
  const updates = [];
  m.on('update', (s) => updates.push(s.zones[0].nowPlaying.cover));
  await m.pollOnce();
  await new Promise((r) => setTimeout(r, 10));
  const np = m.snapshot().zones[0].nowPlaying;
  assert.equal(np.cover, 'https://cdn/maria.jpg');
  assert.equal(np.coverSource, 'iTunes');
  assert.equal(np.image, 'http://x/logo.jpg'); // logo blijft
  assert.deepEqual(asked, ['BLONDIE - Maria']);
  assert.ok(updates.includes('https://cdn/maria.jpg')); // het scherm wordt bijgewerkt zodra de hoes er is
  await m.pollOnce();
  assert.deepEqual(asked, ['BLONDIE - Maria']); // zelfde nummer: niet opnieuw zoeken
});

test('hoes: zonder treffer of met covers uit blijft het bij het zenderlogo', async () => {
  const none = await coverManager(async () => null, radioStatus('BART HERMAN - Vintage &amp; oldskool'));
  await none.pollOnce();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(none.snapshot().zones[0].nowPlaying.cover, null);

  const net = fakeNetwork({ '192.168.0.187/SyncStatus': syncSingle, '192.168.0.187/Status': radioStatus('BLONDIE - Maria'), '192.168.0.187/Presets': presetsXml });
  const off = new BluosManager({ fetchImpl: net.fetchImpl, covers: false });
  assert.equal(off.findCover, null);
});

test('hoes: bij een nieuw nummer verdwijnt de oude hoes meteen', async () => {
  let n = 0;
  const m = await coverManager(async (t) => {
    if (t.startsWith('B')) await new Promise((r) => setTimeout(r, 40)); // het tweede nummer is even onderweg
    return { url: `https://cdn/${++n}.jpg`, source: 'iTunes' };
  }, radioStatus('A - Eerste'));
  await m.pollOnce();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(m.snapshot().zones[0].nowPlaying.cover, 'https://cdn/1.jpg');
  const p = m.players.get('192.168.0.187');
  m.fetch = async (url) => ({ ok: true, status: 200, text: async () => (String(url).includes('/Status') ? radioStatus('B - Tweede') : syncLeader.replace(/<slave[^>]*><\/slave>/g, '')) });
  await m.pollLeader(p);
  assert.equal(m.snapshot().zones[0].nowPlaying.cover, null); // nog zoeken
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(m.snapshot().zones[0].nowPlaying.cover, 'https://cdn/2.jpg');
});

// ---------- overslaan alleen bij nummers ----------
test('canSkip: niet bij live radio (TuneIn), wel bij nummers', () => {
  const stream = parseStatus('<status><state>stream</state><serviceName>TuneIn</serviceName><serviceType>RadioService</serviceType><twoline_title1>VRT Radio 2</twoline_title1></status>');
  const track = parseStatus('<status><state>play</state><serviceName>Spotify</serviceName><serviceType>MusicService</serviceType><twoline_title1>Mamma Mia</twoline_title1></status>');
  const radioPlay = parseStatus('<status><state>play</state><serviceName>TuneIn</serviceName><serviceType>RadioService</serviceType></status>');
  const zone = (st) => buildZones([player('192.168.0.9', parseSyncStatus(syncSingle, '192.168.0.9'), st)])[0];
  assert.equal(zone(stream).canSkip, false);
  assert.equal(zone(radioPlay).canSkip, false); // ook als TuneIn 'play' meldt
  assert.equal(zone(track).canSkip, true);
  assert.equal(zone(null).canSkip, false);
});

test('manager: volgende en vorige worden bij live radio geweigerd, bij nummers doorgegeven', async () => {
  const { m, calls } = await manager(); // 192.168.0.187 speelt TuneIn (stream)
  await assert.rejects(() => m.command('next', { ip: '192.168.0.187' }), /live radio/);
  await assert.rejects(() => m.command('prev', { ip: '192.168.0.184' }), /live radio/); // ook via een lid
  assert.equal(calls.length, 0);
  await m.command('pause', { ip: '192.168.0.187' }); // pauzeren mag wel
  assert.deepEqual(calls, ['192.168.0.187/Pause']);
  const spotify = '<status><state>play</state><serviceName>Spotify</serviceName><serviceType>MusicService</serviceType><twoline_title1>Mamma Mia</twoline_title1></status>';
  m.players.get('192.168.0.187').status = parseStatus(spotify);
  calls.length = 0;
  await m.command('next', { ip: '192.168.0.187' });
  assert.deepEqual(calls, ['192.168.0.187/Skip']);
});
