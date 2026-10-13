const fmt = (t) => t.toLocaleString('nl-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const CX = 100, CY = 100, R = 82;
const START = 135, SWEEP = 270;
const point = (deg, r = R) => [CX + r * Math.cos((deg * Math.PI) / 180), CY + r * Math.sin((deg * Math.PI) / 180)];
function arc(from, to) {
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
}

export default function TargetPanel({ target, min, max, current, onChange }) {
  const deg = (t) => START + (SWEEP * (clamp(t, min, max) - min)) / (max - min);
  const set = (v) => onChange(clamp(Math.round(v * 2) / 2, min, max));
  const [tx, ty] = point(deg(target));
  const diff = current === null ? null : current - target;
  const state = diff === null ? null : diff < -0.3 ? ['heat', `${fmt(-diff)}° onder doel`] : diff > 0.3 ? ['idle', `${fmt(diff)}° boven doel`] : ['ok', 'op temperatuur'];

  return (
    <section className="target card">
      <div className="dial">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <path d={arc(START, START + SWEEP)} className="track" />
          {current !== null && <path d={arc(START, Math.max(START + 0.5, deg(current)))} className="level" />}
          <circle cx={tx} cy={ty} r="11" className="knob" />
        </svg>
        <div className="dial-center">
          <span className="label">Doel</span>
          <span className="big">{fmt(target)}<small>°C</small></span>
          {state && <span className={`chip ${state[0]}`}>{state[1]}</span>}
        </div>
      </div>

      <div className="stepper">
        <button aria-label="Lager" onClick={() => set(target - 0.5)} disabled={target <= min}>−</button>
        <input
          type="range" min={min} max={max} step="0.5" value={target}
          aria-label="Doeltemperatuur" onChange={(e) => set(Number(e.target.value))}
        />
        <button aria-label="Hoger" onClick={() => set(target + 0.5)} disabled={target >= max}>+</button>
      </div>

      <div className="presets">
        {[['Nacht', 17], ['Weg', 18], ['Comfort', 20.5], ['Warm', 22]].map(([label, v]) => (
          <button key={label} className={target === v ? 'on' : ''} onClick={() => set(v)}>
            {label}<span>{fmt(v)}°</span>
          </button>
        ))}
      </div>
    </section>
  );
}
