import { test } from 'node:test';
import assert from 'node:assert/strict';
import { energyState } from '../web/src/energyState.js';

const e = (fromGrid, toGrid = 0, monthlyPeak = 3000) => ({ fromGrid, toGrid, monthlyPeak });

test('geen gegevens geeft null', () => {
  assert.equal(energyState(null), null);
  assert.equal(energyState({ fromGrid: null }), null);
});

test('laag, normaal en hoog verbruik t.o.v. de maandpiek', () => {
  assert.equal(energyState(e(600)).key, 'low'); // 20%
  assert.equal(energyState(e(1500)).key, 'mid'); // 50%
  assert.equal(energyState(e(2100)).key, 'high'); // 70%
  assert.equal(energyState(e(2100)).critical, false);
});

test('verbruik boven de maandpiek is kritiek', () => {
  const s = energyState(e(3200));
  assert.equal(s.key, 'high');
  assert.equal(s.critical, true);
  assert.match(s.label, /Nieuwe maandpiek/);
});

test('zonne-overschot overdag, maar niet \'s nachts', () => {
  assert.equal(energyState(e(0, 2400), true).key, 'solar');
  assert.equal(energyState(e(0, 2400), false).key, 'low');
});

test('kleine teruglevering telt niet als overschot', () => {
  assert.equal(energyState(e(0, 100), true).key, 'low');
});

test('zonder maandpiek gebruikt hij een standaardwaarde', () => {
  assert.equal(energyState({ fromGrid: 3000, toGrid: 0, monthlyPeak: null }).key, 'high');
});
