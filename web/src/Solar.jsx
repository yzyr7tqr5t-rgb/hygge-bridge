import { useMemo } from 'react';
import Spark from './Spark.jsx';
import { Icon } from './Icons.jsx';
import { sunForDay } from '../../src/sun.js';
import { isFree, FREE_FROM_W } from './energyState.js';

const nl = (v, d) => v.toLocaleString('nl-BE', { minimumFractionDigits: d, maximumFractionDigits: d });
const power = (w) => (w >= 1000 ? { v: nl(w / 1000, 2), u: 'kW' } : { v: nl(Math.round(w), 0), u: 'W' });
const kwh = (v) => `${nl(v, v < 10 ? 2 : 1)} kWh`;
const clock = (ms) => new Date(ms).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
const left = (ms) => {
  const m = Math.max(0, Math.round(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)} u ${m % 60} min` : `${m} min`;
};

// Halve cirkel van zonsopgang (links) naar zonsondergang (rechts).
const CX = 150, CY = 80, RX = 130, RY = 62; // lage, brede boog
const at = (f) => [CX - RX * Math.cos(Math.PI * f), CY - RY * Math.sin(Math.PI * f)];
const arc = (f0, f1) => {
  const [x0, y0] = at(f0);
  const [x1, y1] = at(f1);
  return `M${x0.toFixed(1)},${y0.toFixed(1)} A${RX},${RY} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;
};

function DayArc({ rise, set, now }) {
  const f = Math.min(1, Math.max(0, (now - rise) / (set - rise)));
  const [sx, sy] = at(f);
  return (
    <div className="day-arc">
      <svg viewBox="0 0 300 96" aria-hidden="true">
        <path d={arc(0, 1)} className="arc-track" />
        <path d={arc(0, Math.max(f, 0.002))} className="arc-done" />
        <line x1="10" y1={CY} x2="290" y2={CY} className="horizon" />
        <circle cx={sx} cy={sy} r="15" className="sun-glow" />
        <circle cx={sx} cy={sy} r="9" className="sun-core" />
      </svg>
      <div className="arc-times">
        <span><b>{clock(rise)}</b>opkomst</span>
        <span className="arc-left">nog {left(set - now)} zon</span>
        <span><b>{clock(set)}</b>ondergang</span>
      </div>
    </div>
  );
}

/** Aparte zonne-energie-kaart: zonnestand, wat de zon nu overlaat en wat er vandaag naar het net ging. */
export default function Solar({ energy, sun, now }) {
  const today = sunForDay(sun, now);
  const exporting = isFree(energy);
  const exportW = energy.toGrid ?? 0;

  // Teruglevering sinds zonsopgang (alleen het deel waarbij er stroom naar het net ging).
  const history = useMemo(
    () => energy.history.filter(([ts]) => !today || ts >= today.rise).map(([ts, net]) => [ts, Math.max(0, -net)]),
    [energy.history, today?.rise],
  );

  const drawn = energy.kwhFrom;
  const sent = energy.kwhTo;
  const total = drawn + sent;
  const sentShare = total > 0 ? (sent / total) * 100 : 0;

  return (
    <section className={`solar-card card ${exporting ? 'on' : ''}`}>
      <div className="solar-head">
        <span className="solar-icon"><Icon name="sun" size={22} /></span>
        <div>
          <h2>Zonne-energie</h2>
          <span className="solar-state">
            {exporting ? `Nu ${power(exportW).v} ${power(exportW).u} over voor jou` : `Geen overschot (vanaf ${FREE_FROM_W} W teruglevering)`}
          </span>
        </div>
      </div>

      {today && <DayArc rise={today.rise} set={today.set} now={now} />}

      <div className="solar-stats">
        <div><span>Nu terug</span><b>{power(exportW).v}<small>{power(exportW).u}</small></b></div>
        <div><span>Piek</span><b>{power(energy.peakTo ?? 0).v}<small>{power(energy.peakTo ?? 0).u}</small></b></div>
        <div><span>Vandaag</span><b>{nl(sent, sent < 10 ? 2 : 1)}<small>kWh</small></b></div>
      </div>

      <div className="balance">
        <div className="balance-labels"><span>Afname {kwh(drawn)}</span><span>Teruglevering {kwh(sent)}</span></div>
        <div className="balance-bar" role="img" aria-label={`Vandaag ${kwh(drawn)} afgenomen en ${kwh(sent)} teruggeleverd`}>
          <i className="bal-draw" style={{ width: `${100 - sentShare}%` }} />
          <i className="bal-sent" style={{ width: `${sentShare}%` }} />
        </div>
      </div>

      <div className="solar-chart">
        <span className="solar-chart-title">Teruglevering vandaag</span>
        <Spark
          history={history}
          rangeMs={today ? Math.max(3600_000, now - today.rise + 5 * 60_000) : 12 * 3600_000}
          now={now}
          color="var(--sun)"
          format={(v) => `${power(v).v} ${power(v).u}`}
        />
      </div>
    </section>
  );
}
