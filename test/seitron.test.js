import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeitronHygge } from '../src/seitron.js';

const cfg = { iftttKey: 'KEY', eventSetTemperature: 'hygge_set_temperature', eventAuto: 'hygge_auto' };
const quiet = { info() {} };

test('setTemperature vuurt het IFTTT-event af met het setpoint in value1', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true }; };
  await new SeitronHygge(cfg, { fetchImpl, log: quiet }).setTemperature(25);
  assert.equal(calls[0].url, 'https://maker.ifttt.com/trigger/hygge_set_temperature/with/key/KEY');
  assert.deepEqual(calls[0].body, { value1: '25.0' });
});

test('scheduledMode gebruikt het auto-event', async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return { ok: true }; };
  await new SeitronHygge(cfg, { fetchImpl, log: quiet }).scheduledMode();
  assert.match(calls[0], /trigger\/hygge_auto\//);
});

test('foute sleutel (401) wordt niet herhaald en geeft een fout', async () => {
  let n = 0;
  const fetchImpl = async () => { n++; return { ok: false, status: 401, text: async () => 'bad key' }; };
  await assert.rejects(new SeitronHygge(cfg, { fetchImpl, log: quiet }).setTemperature(20), /401/);
  assert.equal(n, 1);
});

test('DRY_RUN verstuurt niets', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return { ok: true }; };
  await new SeitronHygge(cfg, { dryRun: true, fetchImpl, log: quiet }).setTemperature(20);
  assert.equal(called, false);
});
