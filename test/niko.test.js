import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDevices, findSensor, readTemperature, NikoClient } from '../src/niko.js';

const devices = [
  { Uuid: 'a', Name: 'Woonkamer', Model: 'thermostat', Type: 'hvac', Properties: [{ SetpointTemperature: '21.0' }] },
  { Uuid: 'b', Name: 'Woonkamer', Model: 'thermoswitchx1', Type: 'multisensor', Properties: [{ AmbientTemperature: '20.4' }, { Humidity: '55' }] },
  { Uuid: 'c', Name: 'Keuken', Model: 'light', Type: 'action', Properties: [{ Status: 'On' }] },
];

test('extractDevices leest Params[].Devices', () => {
  assert.equal(extractDevices({ Method: 'devices.list', Params: [{ Devices: devices }] }).length, 3);
  assert.deepEqual(extractDevices({}), []);
});

test('readTemperature', () => {
  assert.equal(readTemperature(devices[1]), 20.4);
  assert.equal(readTemperature(devices[2]), null);
  assert.equal(readTemperature({ Properties: [{ AmbientTemperature: '19,5' }] }), 19.5);
});

test('findSensor op naam kiest de variant met temperatuur', () => {
  assert.equal(findSensor(devices, { sensorName: ' woonkamer ' }).Uuid, 'b');
  assert.equal(findSensor(devices, { sensorUuid: 'a' }).Uuid, 'a');
  assert.equal(findSensor(devices, { sensorName: 'Zolder' }), null);
});

test('NikoClient verwerkt devices.list en daarna statusupdates van de sensor', () => {
  const client = new NikoClient({ host: 'x', port: 8884, username: 'hobby', token: 't', sensorName: 'Woonkamer' });
  const seen = [];
  client.on('temperature', (t) => seen.push(t));
  const send = (topic, msg) => client.handleMessage(topic, Buffer.from(JSON.stringify(msg)));

  send('hobby/control/devices/rsp', { Method: 'devices.list', Params: [{ Devices: devices }] });
  send('hobby/control/devices/evt', { Method: 'devices.status', Params: [{ Devices: [{ Uuid: 'b', Properties: [{ AmbientTemperature: '20.9' }] }] }] });
  send('hobby/control/devices/evt', { Method: 'devices.status', Params: [{ Devices: [{ Uuid: 'c', Properties: [{ Status: 'Off' }] }] }] });
  send('hobby/control/devices/evt', 'geen json');

  assert.deepEqual(seen, [20.4, 20.9]);
});

test('NikoClient meldt een fout als de sensor niet bestaat', () => {
  const client = new NikoClient({ host: 'x', port: 8884, username: 'hobby', token: 't', sensorName: 'Zolder' });
  const errors = [];
  client.on('error', (e) => errors.push(e.message));
  client.handleMessage('hobby/control/devices/rsp', Buffer.from(JSON.stringify({ Method: 'devices.list', Params: [{ Devices: devices }] })));
  assert.match(errors[0], /Zolder/);
});

test('NikoClient meldt statusupdates van alle toestellen en bouwt control-commando\'s', () => {
  const client = new NikoClient({ host: 'x', port: 8884, username: 'hobby', token: 't' });
  const updates = [];
  client.on('update', (d) => updates.push(d[0].Uuid));
  client.handleMessage('hobby/control/devices/evt', Buffer.from(JSON.stringify({ Method: 'devices.status', Params: [{ Devices: [{ Uuid: 'c', Properties: [{ Status: 'Off' }] }] }] })));
  assert.deepEqual(updates, ['c']);

  const sent = [];
  client.client = { publish: (topic, payload) => sent.push({ topic, payload: JSON.parse(payload) }) };
  client.control([{ Uuid: 'c', Properties: [{ Status: 'On' }] }]);
  assert.equal(sent[0].topic, 'hobby/control/devices/cmd');
  assert.deepEqual(sent[0].payload, { Method: 'devices.control', Params: [{ Devices: [{ Uuid: 'c', Properties: [{ Status: 'On' }] }] }] });
});
