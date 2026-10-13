import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, desiredMode, initialState } from '../src/controller.js';

const MIN = 60_000;
const control = {
  targetTemp: 21, hysteresis: 0.3, heatSetpoint: 25, idleSetpoint: 12,
  minSwitchIntervalMs: 10 * MIN, staleAfterMs: 30 * MIN, resendAfterMs: 60 * MIN,
};
const at = (temp, now, extra = {}) => ({ ...initialState(), lastTemperature: temp, lastReadingAt: now, ...extra });

test('hysterese: onder de marge verwarmen, erboven stoppen', () => {
  assert.equal(desiredMode(20.6, 'idle', control), 'heat');
  assert.equal(desiredMode(21.4, 'heat', control), 'idle');
});

test('binnen de marge blijft de huidige modus behouden', () => {
  assert.equal(desiredMode(21.2, 'heat', control), 'heat');
  assert.equal(desiredMode(20.8, 'idle', control), 'idle');
  assert.equal(desiredMode(20.9, null, control), 'heat');
  assert.equal(desiredMode(21.0, 'auto', control), 'idle');
});

test('eerste meting onder doel stuurt meteen het verwarm-setpoint', () => {
  const { command } = decide(at(19.5, 0), 0, control);
  assert.deepEqual(command, { mode: 'heat', setpoint: 25 });
});

test('minimale schakeltijd wordt gerespecteerd', () => {
  const state = at(22, 5 * MIN, { mode: 'heat', lastCommandAt: 0 });
  assert.equal(decide(state, 5 * MIN, control).command, null);
  assert.deepEqual(decide(state, 10 * MIN, control).command, { mode: 'idle', setpoint: 12 });
});

test('geen nieuw commando als er niets verandert', () => {
  const state = at(21.1, 20 * MIN, { mode: 'heat', lastCommandAt: 0 });
  assert.equal(decide(state, 20 * MIN, control).command, null);
});

test('zelfde commando wordt periodiek herhaald', () => {
  const state = at(20, 60 * MIN, { mode: 'heat', lastCommandAt: 0 });
  assert.deepEqual(decide(state, 60 * MIN, control).command, { mode: 'heat', setpoint: 25 });
  assert.equal(decide(state, 60 * MIN, { ...control, resendAfterMs: 0 }).command, null);
});

test('failsafe: zonder recente meting terug naar weekprogramma, ook binnen de schakeltijd', () => {
  const state = at(20, 0, { mode: 'heat', lastCommandAt: 25 * MIN });
  assert.deepEqual(decide(state, 31 * MIN, control).command, { mode: 'auto' });
  // en daarna niet blijven herhalen
  const after = { ...state, mode: 'auto', lastCommandAt: 31 * MIN };
  assert.equal(decide(after, 200 * MIN, control).command, null);
});

test('na het opstarten wachten op een eerste meting', () => {
  assert.equal(decide(initialState(), 0, control).command, null);
});

test('sensor komt terug na failsafe: meteen weer regelen', () => {
  const state = at(19, 40 * MIN, { mode: 'auto', lastCommandAt: 39 * MIN });
  // binnen schakeltijd -> wachten
  assert.equal(decide(state, 40 * MIN, control).command, null);
  assert.deepEqual(decide(state, 49 * MIN, control).command, { mode: 'heat', setpoint: 25 });
});
