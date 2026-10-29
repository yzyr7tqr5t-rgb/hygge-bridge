import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rpcBody, irccBody, parsePower, findKeyCode, BraviaTv, POWER_OFF_CODE } from '../src/bravia.js';

const keys = { result: [{ bundled: true }, [{ name: 'Num1', value: 'AAA1' }, { name: 'PowerOff', value: 'AAAOFF' }]] };

// Nagebootste tv: onthoudt de verzoeken en antwoordt per pad.
function fakeTv({ power = 'standby', failKeys = false, status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (status !== 200) return { ok: false, status };
    if (url.endsWith('/sony/ircc')) return { ok: true, status: 200, text: async () => '' };
    const { method } = JSON.parse(init.body);
    if (method === 'getPowerStatus') return { ok: true, json: async () => ({ result: [{ status: power }] }) };
    if (method === 'getRemoteControllerInfo') return failKeys ? { ok: true, json: async () => ({ error: [7, 'x'] }) } : { ok: true, json: async () => keys };
    return { ok: true, json: async () => ({ result: [] }) };
  };
  return { calls, fetchImpl };
}

test('rpcBody en irccBody bouwen de verzoeken', () => {
  assert.deepEqual(JSON.parse(rpcBody('setPowerStatus', [{ status: true }])), { method: 'setPowerStatus', id: 1, params: [{ status: true }], version: '1.0' });
  assert.match(irccBody('AAAOFF'), /<IRCCCode>AAAOFF<\/IRCCCode>/);
});

test('parsePower en findKeyCode lezen de antwoorden van de tv', () => {
  assert.equal(parsePower({ result: [{ status: 'active' }] }), 'active');
  assert.equal(parsePower({ result: [{ status: 'standby' }] }), 'standby');
  assert.equal(parsePower({ result: [] }), null);
  assert.equal(parsePower(null), null);
  assert.equal(findKeyCode(keys, 'PowerOff'), 'AAAOFF');
  assert.equal(findKeyCode(keys, 'Bestaat niet'), null);
  assert.equal(findKeyCode({ result: [] }, 'PowerOff'), null);
});

test('zonder host of sleutel is de tv niet ingesteld en gebeurt er niets', async () => {
  const { calls, fetchImpl } = fakeTv();
  const tv = new BraviaTv({ host: '192.168.0.149', fetchImpl });
  assert.equal(tv.configured, false);
  assert.deepEqual(tv.snapshot(), { configured: false, power: null });
  await tv.refresh();
  tv.start();
  await assert.rejects(() => tv.command('on'), /niet ingesteld/);
  assert.equal(calls.length, 0);
});

test('aan: setPowerStatus met de sleutel in de header', async () => {
  const { calls, fetchImpl } = fakeTv();
  const tv = new BraviaTv({ host: '192.168.0.149', psk: 'geheim', fetchImpl });
  const updates = [];
  tv.on('update', (s) => updates.push(s.power));
  await tv.command('on');
  assert.equal(calls[0].url, 'http://192.168.0.149/sony/system');
  assert.equal(calls[0].init.headers['X-Auth-PSK'], 'geheim');
  assert.deepEqual(JSON.parse(calls[0].init.body).params, [{ status: true }]);
  assert.equal(tv.power, 'active');
  assert.deepEqual(updates, ['active']);
});

test('uit: de PowerOff-toets via IRCC, met de code uit de tv', async () => {
  const { calls, fetchImpl } = fakeTv();
  const tv = new BraviaTv({ host: '192.168.0.149', psk: 'geheim', fetchImpl });
  await tv.command('off');
  const ircc = calls.find((c) => c.url.endsWith('/sony/ircc'));
  assert.match(ircc.init.body, /AAAOFF/);
  assert.equal(ircc.init.headers['X-Auth-PSK'], 'geheim');
  assert.equal(tv.power, 'standby');
  assert.ok(!calls.some((c) => c.url.endsWith('/sony/system') && /setPowerStatus/.test(c.init.body)), 'setPowerStatus false zet de tv niet uit');
});

test('uit: valt terug op de vaste PowerOff-code als de toetsenlijst mislukt', async () => {
  const { calls, fetchImpl } = fakeTv({ failKeys: true });
  const tv = new BraviaTv({ host: '192.168.0.149', psk: 'geheim', fetchImpl });
  await tv.command('off');
  assert.match(calls.find((c) => c.url.endsWith('/sony/ircc')).init.body, new RegExp(POWER_OFF_CODE.replace(/[+/=]/g, '\\$&')));
});

test('onbekende actie en een geweigerde sleutel geven een fout', async () => {
  const ok = fakeTv();
  await assert.rejects(() => new BraviaTv({ host: 'h', psk: 'p', fetchImpl: ok.fetchImpl }).command('hop'), /onbekende tv-actie/);
  const denied = fakeTv({ status: 403 });
  const tv = new BraviaTv({ host: 'h', psk: 'fout', fetchImpl: denied.fetchImpl });
  await assert.rejects(() => tv.command('on'), /403/);
  assert.equal(tv.power, null);
});

test('refresh: leest de stand en meldt alleen veranderingen; onbereikbaar = onbekend', async () => {
  const { fetchImpl } = fakeTv({ power: 'active' });
  const tv = new BraviaTv({ host: 'h', psk: 'p', fetchImpl });
  const updates = [];
  tv.on('update', (s) => updates.push(s.power));
  await tv.refresh();
  await tv.refresh();
  assert.deepEqual(updates, ['active']);
  tv.fetch = async () => { throw new Error('time-out'); };
  await tv.refresh();
  assert.deepEqual(updates, ['active', null]);
});
