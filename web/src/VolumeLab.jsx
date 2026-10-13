import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';

// Proefpagina voor volume-ontwerpen: open /?lab=volume. Alles draait op nagebootste spelers; er wordt niets verstuurd.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Nagebootste groep: groepsvolume schaalt de spelers met behoud van verhoudingen (of maakt ze gelijk). */
function useMock() {
  const [players, setPlayers] = useState([
    { id: 'k', name: 'Keuken', vol: 7 },
    { id: 'l', name: 'Living', vol: 7 },
    { id: 'b', name: 'Berging', vol: 9 },
  ]);
  const [keepRatio, setKeepRatio] = useState(true);
  const group = Math.round(players.reduce((a, p) => a + p.vol, 0) / players.length);
  const setGroup = (v) => setPlayers((ps) => {
    const cur = ps.reduce((a, p) => a + p.vol, 0) / ps.length;
    return ps.map((p) => ({ ...p, vol: clamp(Math.round(keepRatio && cur > 0 ? (p.vol * v) / cur : v), 0, 100) }));
  });
  const setPlayer = (id, v) => setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, vol: clamp(Math.round(v), 0, 100) } : p)));
  return { players, group, setGroup, setPlayer, keepRatio, setKeepRatio };
}

/** Slepen op een vlak: geeft een fractie 0..1 terug (horizontaal of verticaal). */
function useTrack(onFraction, axis = 'x') {
  const ref = useRef(null);
  const down = useRef(false);
  const calc = (e) => {
    const r = ref.current.getBoundingClientRect();
    onFraction(clamp(axis === 'x' ? (e.clientX - r.left) / r.width : 1 - (e.clientY - r.top) / r.height, 0, 1));
  };
  return {
    ref,
    onPointerDown: (e) => { down.current = true; ref.current.setPointerCapture(e.pointerId); calc(e); },
    onPointerMove: (e) => { if (down.current) calc(e); },
    onPointerUp: () => { down.current = false; },
    onPointerCancel: () => { down.current = false; },
  };
}

/** − / + met herhalen bij ingedrukt houden. */
function useHold(step) {
  const t = useRef({ d: null, r: null });
  const stop = () => { clearTimeout(t.current.d); clearInterval(t.current.r); };
  useEffect(() => stop, []);
  return {
    onPointerDown: (e) => { e.stopPropagation(); stop(); step(); t.current.d = setTimeout(() => { t.current.r = setInterval(step, 90); }, 380); },
    onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop,
  };
}

function Step({ delta, value, max, onChange, size = '', label }) {
  const hold = useHold(() => onChange(clamp(value.current + delta, 0, max)));
  return (
    <button type="button" className={`lab-step ${size}`} aria-label={label} {...hold} onClick={(e) => e.stopPropagation()}>
      <Icon name={delta < 0 ? 'minus' : 'plus'} size={size === 'xl' ? 30 : size === 'sm' ? 15 : 20} />
    </button>
  );
}

// Een ref die altijd de laatste waarde bewaart, zodat herhalen niet met oude waarden rekent.
const useLatest = (v) => { const r = useRef(v); r.current = v; return r; };


/** Tekst die van kleur wisselt precies op de rand van de vulling (donker op leeg, wit op de kleur). */
function Inked({ frac, axis = 'x', children }) {
  const ref = useRef(null);
  const [size, setSize] = useState(0);
  useEffect(() => {
    const el = ref.current;
    const measure = () => setSize(axis === 'x' ? el.clientWidth : el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [axis]);
  const f = clamp(frac, 0, 1) * 100;
  return (
    <div className="inked" ref={ref} aria-hidden="true">
      <div className="ink base">{children}</div>
      <div className={`ink-fill ${axis}`} style={axis === 'x' ? { width: `${f}%` } : { height: `${f}%` }}>
        <div className="ink over" style={axis === 'x' ? { width: size } : { height: size }}>{children}</div>
      </div>
    </div>
  );
}

// ---------- A: verticale faders ----------
function Fader({ name, value, max, onChange, master = false }) {
  const latest = useLatest(value);
  const f = clamp(value / max, 0, 1);
  const track = useTrack((fr) => onChange(Math.round(fr * max)), 'y');
  return (
    <div className={`lab-fader ${master ? 'master' : ''}`} {...track} role="slider" aria-label={`Volume ${name}`} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} tabIndex={0}>
      <Inked frac={f} axis="y">
        <span className="lab-fader-mid"><span className="lab-num">{value}</span></span>
        <span className="lab-fader-name">{master && <Icon name="group" size={13} />}{name}</span>
      </Inked>
      <div className="lab-fader-top"><Step delta={1} value={latest} max={max} onChange={onChange} size="sm" label={`${name} luider`} /></div>
      <div className="lab-fader-minus"><Step delta={-1} value={latest} max={max} onChange={onChange} size="sm" label={`${name} zachter`} /></div>
    </div>
  );
}
function VariantFaders({ m, max }) {
  return (
    <div className="lab-faders">
      <Fader name="Groep" master value={m.group} max={max} onChange={m.setGroup} />
      {m.players.map((p) => <Fader key={p.id} name={p.name} value={p.vol} max={max} onChange={(v) => m.setPlayer(p.id, v)} />)}
    </div>
  );
}

// ---------- B: brede balken (iOS) ----------
function Pill({ name, value, max, onChange, big = false, icon = 'volume' }) {
  const f = clamp(value / max, 0, 1);
  const track = useTrack((fr) => onChange(Math.round(fr * max)), 'x');
  return (
    <div className={`lab-pill ${big ? 'big' : ''}`} {...track} role="slider" aria-label={`Volume ${name}`} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} tabIndex={0}>
      <Inked frac={f} axis="x">
        <span className="lab-pill-label"><Icon name={icon} size={big ? 24 : 20} />{name}</span>
        <span className="lab-pill-value">{value}</span>
      </Inked>
    </div>
  );
}
function VariantPills({ m, max }) {
  return (
    <div className="lab-pills">
      <Pill big name="Groep" icon="group" value={m.group} max={max} onChange={m.setGroup} />
      {m.players.map((p) => <Pill key={p.id} name={p.name} icon="speaker" value={p.vol} max={max} onChange={(v) => m.setPlayer(p.id, v)} />)}
    </div>
  );
}

// ---------- C: draaiknoppen ----------
const CX = 100, CY = 100, R = 82, START = 135, SWEEP = 270;
const pt = (deg) => [CX + R * Math.cos((deg * Math.PI) / 180), CY + R * Math.sin((deg * Math.PI) / 180)];
const arcPath = (a, b) => { const [x1, y1] = pt(a); const [x2, y2] = pt(b); return `M${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 ${b - a > 180 ? 1 : 0} 1 ${x2.toFixed(1)},${y2.toFixed(1)}`; };

function Knob({ name, value, max, onChange, size = 'm' }) {
  const ref = useRef(null);
  const down = useRef(false);
  const latest = useLatest(value);
  const f = clamp(value / max, 0, 1);
  const calc = (e) => {
    const r = ref.current.getBoundingClientRect();
    const deg = (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
    const t = (deg - START + 720) % 360;
    onChange(Math.round((t <= SWEEP ? t / SWEEP : t < SWEEP + (360 - SWEEP) / 2 ? 1 : 0) * max));
  };
  const [tx, ty] = pt(START + SWEEP * f);
  return (
    <div className={`lab-knob ${size}`}>
      <div
        className="lab-knob-dial" ref={ref} role="slider" aria-label={`Volume ${name}`} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} tabIndex={0}
        onPointerDown={(e) => { down.current = true; ref.current.setPointerCapture(e.pointerId); calc(e); }}
        onPointerMove={(e) => down.current && calc(e)} onPointerUp={() => { down.current = false; }} onPointerCancel={() => { down.current = false; }}
      >
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <path d={arcPath(START, START + SWEEP)} className="k-track" />
          <path d={arcPath(START, START + Math.max(0.5, SWEEP * f))} className="k-level" />
          <circle cx={tx} cy={ty} r="12" className="k-thumb" />
        </svg>
        <div className="lab-knob-center"><span className="lab-num">{value}</span><small>{name}</small></div>
      </div>
      <div className="lab-knob-steps">
        <Step delta={-1} value={latest} max={max} onChange={onChange} size={size === 'm' ? '' : 'sm'} label={`${name} zachter`} />
        <Step delta={1} value={latest} max={max} onChange={onChange} size={size === 'm' ? '' : 'sm'} label={`${name} luider`} />
      </div>
    </div>
  );
}
function VariantKnobs({ m, max }) {
  return (
    <div className="lab-knobs">
      <Knob name="Groep" value={m.group} max={max} onChange={m.setGroup} />
      <div className="lab-knob-row">
        {m.players.map((p) => <Knob key={p.id} size="s" name={p.name} value={p.vol} max={max} onChange={(v) => m.setPlayer(p.id, v)} />)}
      </div>
    </div>
  );
}

// ---------- D: grote stappen + vaste standen ----------
function Stepper({ name, value, max, onChange, big = false }) {
  const latest = useLatest(value);
  return (
    <div className={`lab-stepper ${big ? 'big' : ''}`}>
      <Step delta={-1} value={latest} max={max} onChange={onChange} size={big ? 'xl' : ''} label={`${name} zachter`} />
      <div className="lab-stepper-val"><span className="lab-num">{value}</span></div>
      <Step delta={1} value={latest} max={max} onChange={onChange} size={big ? 'xl' : ''} label={`${name} luider`} />
    </div>
  );
}
const PRESETS = [['Fluisterzacht', 4], ['Achtergrond', 10], ['Gezellig', 20], ['Luid', 35]];
function VariantSteps({ m, max }) {
  const slim = useTrack((fr) => m.setGroup(Math.round(fr * max)), 'x');
  return (
    <div className="lab-steps">
      <div className="lab-big">
        <span className="lab-big-label"><Icon name="group" size={14} />Groep</span>
        <Stepper big name="Groep" value={m.group} max={max} onChange={m.setGroup} />
        <div className="lab-slim" {...slim}><i style={{ width: `${clamp(m.group / max, 0, 1) * 100}%` }} /></div>
        <div className="lab-chips">
          {PRESETS.filter(([, v]) => v <= max).map(([n, v]) => <button key={n} type="button" className={`lab-chip ${m.group === v ? 'on' : ''}`} onClick={() => m.setGroup(v)}>{n}<b>{v}</b></button>)}
        </div>
      </div>
      <div className="lab-list">
        {m.players.map((p) => <div key={p.id} className="lab-list-row"><span>{p.name}</span><Stepper name={p.name} value={p.vol} max={max} onChange={(v) => m.setPlayer(p.id, v)} /></div>)}
      </div>
    </div>
  );
}

// ---------- E: mixer ----------
function VariantMixer({ m, max }) {
  const track = useTrack((fr) => m.setGroup(Math.round(fr * max)), 'x');
  return (
    <div className="lab-mixer">
      <div className="lab-master" {...track} role="slider" aria-label="Groepsvolume" aria-valuemin={0} aria-valuemax={max} aria-valuenow={m.group} tabIndex={0}>
        <Inked frac={m.group / max} axis="x">
          <span className="lab-master-value"><Icon name="group" size={20} />{m.group}</span>
        </Inked>
        {m.players.map((p) => <i key={p.id} className="lab-mark" style={{ left: `${clamp(p.vol / max, 0, 1) * 100}%` }} title={p.name}><b>{p.name[0]}</b></i>)}
      </div>
      <label className="lab-keep">
        <input type="checkbox" checked={m.keepRatio} onChange={(e) => m.setKeepRatio(e.target.checked)} />
        <span className="lab-switch"><i /></span>
        <span>Verhoudingen behouden</span>
      </label>
      <div className="lab-channels">
        {m.players.map((p) => <Fader key={p.id} name={p.name} value={p.vol} max={max} onChange={(v) => m.setPlayer(p.id, v)} />)}
      </div>
    </div>
  );
}

const VARIANTS = [
  { id: 'faders', name: 'Faders', idea: 'Verticale regelaars naast elkaar, zoals een mengtafel. Eén tik of sleep zet het volume; + en − voor het fijne werk.', View: VariantFaders },
  { id: 'pills', name: 'Balken', idea: 'Brede, hoge balken zoals in iOS: ruime aanraakzone, naam en getal in de balk zelf. Eén duim, geen knopjes.', View: VariantPills },
  { id: 'knobs', name: 'Knoppen', idea: 'Draaiknoppen zoals de thermostaat: draai of tik op − en +. Groot voor de groep, klein per speler.', View: VariantKnobs },
  { id: 'steps', name: 'Stappen', idea: 'Grote − en + met een groot getal en vaste standen (Achtergrond, Gezellig). Geen slepen: ideaal voor kleine aanpassingen.', View: VariantSteps },
  { id: 'mixer', name: 'Mixer', idea: 'Een groepsbalk met een stipje per speler, en eronder een fader per speler. Je ziet meteen hoe de spelers zich verhouden.', View: VariantMixer },
];

export default function VolumeLab() {
  const m = useMock();
  const [variant, setVariant] = useState(() => { try { return localStorage.getItem('labVariant') || 'faders'; } catch { return 'faders'; } });
  const [fine, setFine] = useState(true);
  const v = VARIANTS.find((x) => x.id === variant) ?? VARIANTS[0];
  const needsFull = [m.group, ...m.players.map((p) => p.vol)].some((x) => x > 40);
  const max = fine && !needsFull ? 40 : 100;
  const pick = (id) => { setVariant(id); try { localStorage.setItem('labVariant', id); } catch { /* geen opslag */ } };

  return (
    <main className="lab">
      <header>
        <div>
          <h1>Volume-proef</h1>
          <p className="avg">Nagebootste spelers: er wordt niets verstuurd.</p>
        </div>
        <a className="lab-back" href="/">Terug</a>
      </header>

      <div className="lab-tabs" role="tablist" aria-label="Ontwerp">
        {VARIANTS.map((x, i) => (
          <button key={x.id} role="tab" aria-selected={x.id === variant} className={x.id === variant ? 'on' : ''} onClick={() => pick(x.id)}>
            <b>{'ABCDE'[i]}</b>{x.name}
          </button>
        ))}
      </div>
      <p className="lab-idea">{v.idea}</p>

      <label className="lab-keep">
        <input type="checkbox" checked={fine && !needsFull} disabled={needsFull} onChange={(e) => setFine(e.target.checked)} />
        <span className="lab-switch"><i /></span>
        <span>Fijn bereik 0–40 <small>{needsFull ? '(uit: een volume staat boven 40)' : '(handiger bij zacht luisteren)'}</small></span>
      </label>

      <section className="lab-stage"><v.View m={m} max={max} /></section>

      <p className="lab-note">Probeer: het groepsvolume omhoog en omlaag, één speler apart, en kleine stapjes met + en −. Zeg welk ontwerp (of welke onderdelen) je het fijnst vindt.</p>
    </main>
  );
}
