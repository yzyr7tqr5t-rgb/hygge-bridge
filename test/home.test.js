import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toModel, applyProperties, controlProperties } from '../src/home.js';

const dimmer = {
  Uuid: 'd1', Name: 'Spots bureau ', Model: 'dimmer', Type: 'action', Online: 'True',
  Parameters: [{ LocationName: 'buro' }],
  Properties: [{ Status: 'On' }, { Brightness: '30' }],
};

test('toModel zet dimmers en lichten om, en negeert de rest', () => {
  assert.deepEqual(toModel(dimmer), { uuid: 'd1', name: 'Spots bureau', room: 'Buro', kind: 'dimmer', on: true, brightness: 30, online: true });
  assert.equal(toModel({ ...dimmer, Model: 'light' }).brightness, null);
  assert.equal(toModel({ ...dimmer, Model: 'comfort' }), null);
  assert.equal(toModel({ ...dimmer, Type: 'panel' }), null);
});

test('applyProperties verwerkt gedeeltelijke updates', () => {
  const next = applyProperties(toModel(dimmer), { Status: 'Off' });
  assert.equal(next.on, false);
  assert.equal(next.brightness, 30);
  assert.equal(applyProperties(next, { Brightness: '55' }).brightness, 55);
});

test('controlProperties', () => {
  const on = toModel(dimmer);
  const off = { ...on, on: false };
  assert.deepEqual(controlProperties(on, { on: false }), [{ Status: 'Off' }]);
  assert.deepEqual(controlProperties(on, { brightness: 40.4 }), [{ Brightness: '40' }]);
  assert.deepEqual(controlProperties(off, { brightness: 40 }), [{ Status: 'On' }, { Brightness: '40' }]);
  assert.deepEqual(controlProperties(on, { brightness: 0 }), [{ Status: 'Off' }]);
  assert.deepEqual(controlProperties(on, { brightness: 250 }), [{ Brightness: '100' }]);
  assert.equal(controlProperties(on, {}), null);
});
