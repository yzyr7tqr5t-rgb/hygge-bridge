import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnergyTracker } from '../src/energy.js';

const T0 = new Date('2026-10-10T12:00:00').getTime();
const min = (n) => n * 60_000;

test('negeert properties zonder vermogen', () => {
  const e = new EnergyTracker({}, T0);
  assert.equal(e.apply({ ReportInstantUsage: 'True' }, T0), false);
  assert.equal(e.updatedAt, null);
});

test('telt vermogen op tot kWh en bewaart nettovermogen in de geschiedenis', () => {
  const e = new EnergyTracker({}, T0);
  e.apply({ ElectricalPowerFromGrid: '1000.000', ElectricalPowerToGrid: '0.000', ElectricalMonthlyPeakPowerFromGrid: '3362.000' }, T0);
  e.apply({ ElectricalPowerFromGrid: '2000' }, T0 + min(2)); // 2 min aan 1000 W
  e.apply({ ElectricalPowerToGrid: '500' }, T0 + min(4)); // 2 min aan 2000 W
  assert.ok(Math.abs(e.kwhFrom - (1000 * 2 + 2000 * 2) / 60 / 1000) < 1e-9);
  assert.equal(e.monthlyPeak, 3362);
  assert.deepEqual(e.history.map((p) => p[1]), [1000, 2000, 1500]);
});

test('grote onderbrekingen tellen niet mee en een nieuwe dag begint op nul', () => {
  const e = new EnergyTracker({ day: '2026-10-10', kwhFrom: 2, kwhTo: 0 }, T0);
  assert.equal(e.kwhFrom, 2);
  e.apply({ ElectricalPowerFromGrid: '1000' }, T0);
  e.apply({ ElectricalPowerFromGrid: '1000' }, T0 + min(600)); // 10 u gat: max 5 min
  assert.ok(Math.abs(e.kwhFrom - (2 + 1000 * (5 / 60) / 1000)) < 1e-9);
  e.apply({ ElectricalPowerFromGrid: '1000' }, T0 + 24 * 3_600_000);
  assert.equal(e.kwhFrom, 0);
});

test('opgeslagen waarden van een andere dag worden genegeerd', () => {
  assert.equal(new EnergyTracker({ day: '2026-10-09', kwhFrom: 9 }, T0).kwhFrom, 0);
});

test('onthoudt de hoogste teruglevering van vandaag en wist die op een nieuwe dag', () => {
  const e = new EnergyTracker({}, T0);
  e.apply({ ElectricalPowerFromGrid: '0', ElectricalPowerToGrid: '800' }, T0);
  e.apply({ ElectricalPowerToGrid: '2400' }, T0 + min(1));
  e.apply({ ElectricalPowerToGrid: '300' }, T0 + min(2));
  assert.equal(e.peakTo, 2400);
  e.apply({ ElectricalPowerToGrid: '100' }, T0 + 24 * 3_600_000);
  assert.equal(e.peakTo, 100);
});
