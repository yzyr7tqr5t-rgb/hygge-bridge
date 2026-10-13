import { useMemo } from 'react';
import Spark from './Spark.jsx';
import { Icon } from './Icons.jsx';

export const FREE_FROM_W = 150; // vanaf zoveel teruglevering spreken we van gratis zonne-energie
export const isFree = (energy) => (energy?.toGrid ?? 0) >= FREE_FROM_W;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const nl = (v, d) => v.toLocaleString('nl-BE', { minimumFractionDigits: d, maximumFractionDigits: d });
const power = (w) => (Math.abs(w) >= 1000 ? { v: nl(w / 1000, 2), u: 'kW' } : { v: nl(Math.round(w), 0), u: 'W' });
const kwh = (v) => `${nl(v, v < 10 ? 2 : 1)} kWh`;

const CX = 100, CY = 100, R = 82, START = 135, SWEEP = 270;
const point = (deg) => [CX + R * Math.cos((deg * Math.PI) / 180), CY + R * Math.sin((deg * Math.PI) / 180)];
function arc(from, to) {
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
}

function Gauge({ net, peak }) {
  const exporting = net < 0;
  const scale = Math.max(peak ?? 0, Math.abs(net), 1500);
  const frac = clamp(Math.abs(net) / scale, 0, 1);
  const tone = exporting ? 'solar' : frac < 0.3 ? 'low' : frac < 0.65 ? 'mid' : 'high';
  const p = power(Math.abs(net));
  return (
    <div className={`gauge ${tone}`}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <path d={arc(START, START + SWEEP)} className="g-track" />
        <path d={arc(START, START + Math.max(1, SWEEP * frac))} className="g-level" />
      </svg>
      <div className="gauge-center">
        <span className="label">{exporting ? 'Teruglevering' : 'Afname nu'}</span>
        <span className="big">{p.v}<small>{p.u}</small></span>
        {peak ? <span className="g-sub">{Math.round((Math.abs(net) / peak) * 100)}% van maandpiek</span> : null}
      </div>
    </div>
  );
}

function tip(w) {
  if (w >= 2000) return 'Start nu de wasmachine, vaatwasser of droogkast, of verwarm met de airco.';
  if (w >= 800) return 'Goed moment voor de stofzuiger, strijkijzer of om iets op te laden.';
  return 'Laad je telefoon, laptop of fiets op.';
}

/** Statusbanner: is er nu gratis zonne-energie die anders naar het net gaat? */
function Status({ energy, net }) {
  if (isFree(energy)) {
    const p = power(energy.toGrid);
    return (
      <section className="status free">
        <span className="status-icon"><Icon name="sun" size={34} /></span>
        <div className="status-text">
          <span className="status-title">Gratis zonne-energie</span>
          <span className="status-main">{p.v} {p.u} over</span>
          <span className="status-sub">{tip(energy.toGrid)}</span>
        </div>
      </section>
    );
  }
  if (Math.abs(net) < FREE_FROM_W) {
    return (
      <section className="status balanced">
        <span className="status-icon"><Icon name="sun" size={30} /></span>
        <div className="status-text">
          <span className="status-title">In balans</span>
          <span className="status-sub">Je verbruik en je opbrengst houden elkaar in evenwicht.</span>
        </div>
      </section>
    );
  }
  const p = power(net);
  return (
    <section className="status grid">
      <span className="status-icon"><Icon name="bolt" size={30} /></span>
      <div className="status-text">
        <span className="status-title">Je gebruikt stroom van het net</span>
        <span className="status-sub">{p.v} {p.u} afname.{energy.peakTo >= FREE_FROM_W ? ` Vandaag gaf de zon al tot ${power(energy.peakTo).v} ${power(energy.peakTo).u} over.` : ' Wacht op zon om gratis te verbruiken.'}</span>
      </div>
    </section>
  );
}

export default function Energy({ energy, status, now, daylight = true }) {
  const stats = useMemo(() => {
    const h = (energy?.history ?? []).filter(([ts]) => now - ts <= 3600_000);
    const enough = h.length > 1 && h.at(-1)[0] - h[0][0] >= 10 * 60_000; // pas tonen met minstens 10 min data
    return { avgHour: enough ? h.reduce((a, p) => a + p[1], 0) / h.length : null };
  }, [energy, now]);

  const net = energy && energy.fromGrid !== null ? energy.fromGrid - (energy.toGrid ?? 0) : null;

  return (
    <main className="energy">
      <header>
        <div>
          <h1>Energie</h1>
          <p className="avg">Verbruik van het net</p>
        </div>
        <span className={`pill ${status[0]}`}><i />{status[1]}</span>
      </header>

      {net === null ? (
        <p className="hint">Wachten op de energiemeter van Niko…</p>
      ) : (
        <>
          {daylight && <Status energy={energy} net={net} />}

          <section className="card gauge-card">
            <Gauge net={net} peak={energy.monthlyPeak} />
            <div className="g-foot">
                            {stats.avgHour !== null && <span className="chip">gem. laatste uur {power(Math.abs(stats.avgHour)).v} {power(Math.abs(stats.avgHour)).u}{stats.avgHour < 0 ? ' terug' : ''}</span>}
            </div>
          </section>

          <div className="stat-grid">
            <section className="stat">
              <span className="stat-label">Vandaag</span>
              <span className="stat-val">{kwh(energy.kwhFrom)}</span>
              <span className="stat-note">afname, geschat</span>
            </section>
            <section className="stat">
              <span className="stat-label">Maandpiek</span>
              <span className="stat-val">{energy.monthlyPeak !== null ? `${nl(energy.monthlyPeak / 1000, 2)} kW` : '—'}</span>
              <span className="stat-note">hoogste afname</span>
            </section>
            {daylight && (energy.kwhTo > 0.005 || energy.peakTo > 0) && (
              <section className="stat solar">
                <span className="stat-label"><Icon name="sun" size={14} /> Zon vandaag</span>
                <span className="stat-val">{kwh(energy.kwhTo)} teruggeleverd</span>
                <span className="stat-note">piek {power(energy.peakTo).v} {power(energy.peakTo).u} over</span>
              </section>
            )}
          </div>

          <section className="card chart-card">
            <div className="card-head"><h2>Laatste 24 uur</h2><span className="when">nettovermogen</span></div>
            <Spark
              history={energy.history}
              rangeMs={24 * 3600_000}
              now={now}
              color="var(--energy)"
              format={(v) => `${power(v).v} ${power(v).u}`}
            />
          </section>
          <p className="footnote">Het dagtotaal telt enkel zolang deze app-server draait en is daarom een schatting.</p>
        </>
      )}
    </main>
  );
}
