// Zonsopgang en -ondergang voor een plaats en dag (standaard zonnestandsformules, nauwkeurig tot enkele minuten).

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;

const toDays = (ms) => ms / DAY_MS - 0.5 + J1970 - J2000;
const fromJulian = (j) => (j + 0.5 - J1970) * DAY_MS;

/** @returns {{ rise: number, set: number } | null} epoch-ms; null bij poolnacht of -dag */
export function sunTimes(ms, lat, lon) {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = toDays(ms);
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n; // benaderde zonne-middag, in dagen
  const M = RAD * (357.5291 + 0.98560028 * ds);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(OBLIQUITY) * Math.sin(L));
  const noon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);

  const cosW = (Math.sin(RAD * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosW < -1 || cosW > 1) return null;
  const w = Math.acos(cosW);
  const setJ = J2000 + (0.0009 + (w + lw) / (2 * Math.PI) + n) + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  return { rise: fromJulian(noon - (setJ - noon)), set: fromJulian(setJ) };
}

/** Schuift zonsopgang/-ondergang van een eerdere dag op naar de dag van `now` (het verschil is een paar minuten per dag). */
export function sunForDay(sun, now) {
  if (!sun) return null;
  const k = Math.round((now - (sun.rise + sun.set) / 2) / DAY_MS);
  return { rise: sun.rise + k * DAY_MS, set: sun.set + k * DAY_MS };
}

/** Is het op dit moment dag? `sun` komt uit sunTimes(); zonder gegevens gaan we uit van dag. */
export function isDaylight(sun, now) {
  const today = sunForDay(sun, now);
  return !today || (now >= today.rise && now < today.set);
}
