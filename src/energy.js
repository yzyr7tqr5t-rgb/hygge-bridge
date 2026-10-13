// Energiemeting uit het Niko "energyhome"-toestel: huidig vermogen, maandpiek en een
// lopende schatting van het dagverbruik (kWh) door het vermogen in de tijd op te tellen.

const HOUR = 3_600_000;
const HISTORY_MS = 24 * HOUR;
const SAMPLE_EVERY_MS = 60_000;
const MAX_GAP_MS = 5 * 60_000; // langere onderbrekingen (server uit) tellen we niet mee

const dayKey = (ms) => new Date(ms).toLocaleDateString('sv-SE');
const parse = (v) => {
  const n = Number(String(v).replace(',', '.'));
  return v === undefined || v === '' || !Number.isFinite(n) ? undefined : n;
};

export class EnergyTracker {
  constructor(saved = {}, now = Date.now()) {
    this.fromGrid = null;
    this.toGrid = null;
    this.monthlyPeak = null;
    this.updatedAt = null;
    this.history = []; // [[ts, nettovermogen in W]]
    this.day = dayKey(now);
    this.kwhFrom = 0;
    this.kwhTo = 0;
    this.peakTo = 0; // hoogste teruglevering (W) van vandaag
    if (saved.day === this.day) {
      this.kwhFrom = Number(saved.kwhFrom) || 0;
      this.kwhTo = Number(saved.kwhTo) || 0;
      this.peakTo = Number(saved.peakTo) || 0;
    }
  }

  /** Verwerkt (gedeeltelijke) Niko-properties. Geeft true terug als er een vermogen of piek in zat. */
  apply(props, now = Date.now()) {
    const from = parse(props.ElectricalPowerFromGrid);
    const to = parse(props.ElectricalPowerToGrid);
    const peak = parse(props.ElectricalMonthlyPeakPowerFromGrid);
    if (from === undefined && to === undefined && peak === undefined) return false;

    const newDay = dayKey(now) !== this.day;
    if (newDay) {
      this.day = dayKey(now);
      this.kwhFrom = 0;
      this.kwhTo = 0;
      this.peakTo = 0;
    }
    if (this.updatedAt !== null && !newDay) {
      const hours = Math.min(now - this.updatedAt, MAX_GAP_MS) / HOUR;
      this.kwhFrom += ((this.fromGrid ?? 0) * hours) / 1000;
      this.kwhTo += ((this.toGrid ?? 0) * hours) / 1000;
    }
    if (from !== undefined) this.fromGrid = from;
    if (to !== undefined) {
      this.toGrid = to;
      this.peakTo = Math.max(this.peakTo, to);
    }
    if (peak !== undefined) this.monthlyPeak = peak;
    this.updatedAt = now;

    if (this.fromGrid !== null) {
      const net = this.fromGrid - (this.toGrid ?? 0);
      const last = this.history.at(-1);
      if (!last || now - last[0] >= SAMPLE_EVERY_MS) this.history.push([now, net]);
      while (this.history.length && now - this.history[0][0] > HISTORY_MS) this.history.shift();
    }
    return true;
  }

  snapshot() {
    const { fromGrid, toGrid, monthlyPeak, updatedAt, kwhFrom, kwhTo, peakTo, day } = this;
    return { fromGrid, toGrid, monthlyPeak, updatedAt, kwhFrom, kwhTo, peakTo, day };
  }

  toJSON() {
    return { day: this.day, kwhFrom: this.kwhFrom, kwhTo: this.kwhTo, peakTo: this.peakTo };
  }
}
