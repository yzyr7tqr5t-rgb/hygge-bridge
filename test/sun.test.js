import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunTimes, isDaylight } from '../src/sun.js';

const hours = (ms) => new Date(ms).getUTCHours() + new Date(ms).getUTCMinutes() / 60;

test('zonsopgang en -ondergang in België rond midzomer', () => {
  const t = sunTimes(Date.UTC(2026, 5, 21, 12), 50.85, 4.35);
  assert.ok(Math.abs(hours(t.rise) - 3.45) < 0.3, `rise ${hours(t.rise)}`); // ± 05:27 zomertijd
  assert.ok(Math.abs(hours(t.set) - 19.95) < 0.3, `set ${hours(t.set)}`); // ± 21:57 zomertijd
});

test('winterdag is korter dan zomerdag', () => {
  const day = (t) => t.set - t.rise;
  assert.ok(day(sunTimes(Date.UTC(2026, 11, 21, 12), 50.85, 4.35)) < day(sunTimes(Date.UTC(2026, 5, 21, 12), 50.85, 4.35)) - 6 * 3_600_000);
});

test('poolnacht geeft null', () => {
  assert.equal(sunTimes(Date.UTC(2026, 11, 21, 12), 80, 10), null);
});

test('isDaylight, ook als de tijden van gisteren zijn', () => {
  const t = sunTimes(Date.UTC(2026, 5, 21, 12), 50.85, 4.35);
  assert.equal(isDaylight(t, Date.UTC(2026, 5, 21, 12)), true);
  assert.equal(isDaylight(t, Date.UTC(2026, 5, 21, 23)), false);
  assert.equal(isDaylight(t, Date.UTC(2026, 5, 23, 12)), true); // twee dagen later
  assert.equal(isDaylight(t, Date.UTC(2026, 5, 23, 2)), false);
  assert.equal(isDaylight(null, Date.now()), true);
});
