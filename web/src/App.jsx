import { useEffect, useState } from 'react';
import { useSensors } from './useSensors.js';
import TargetPanel from './TargetPanel.jsx';
import Lights from './Lights.jsx';
import { Icon } from './Icons.jsx';
import Energy, { isFree } from './Energy.jsx';
import { energyState } from './energyState.js';
import Spark from './Spark.jsx';
import Share from './Share.jsx';
import Music from './Music.jsx';
import Masonry from './Masonry.jsx';
import { isDaylight } from '../../src/sun.js';

const RANGES = [
  { label: '6 u', ms: 6 * 3600_000 },
  { label: '24 u', ms: 24 * 3600_000 },
];

const fmt = (t) => t.toLocaleString('nl-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function ago(ts, now) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'zonet';
  if (s < 3600) return `${Math.floor(s / 60)} min geleden`;
  return `${Math.floor(s / 3600)} u geleden`;
}

function trend(history, now) {
  const hourAgo = history.find(([ts]) => ts >= now - 3600_000);
  const cur = history.at(-1)?.[1];
  if (!hourAgo || cur === undefined || history.at(-1)[0] - hourAgo[0] < 10 * 60_000) return null;
  const d = cur - hourAgo[1];
  if (Math.abs(d) < 0.05) return { text: 'stabiel sinds 1 u', dir: 0 };
  return { text: `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}° sinds 1 u`, dir: d > 0 ? 1 : -1 };
}

function Card({ sensor, rangeMs, now }) {
  const t = trend(sensor.history, now);
  const stale = now - sensor.updatedAt > 30 * 60_000;
  return (
    <section className={`card${stale ? ' stale' : ''}`}>
      <div className="card-head">
        <h2>{sensor.name.replace(/^Drukknop\s+/i, '')}</h2>
        <span className="when">{ago(sensor.updatedAt, now)}</span>
      </div>
      <div className="reading">
        <span className="temp">{fmt(sensor.temperature)}</span>
        <span className="unit">°C</span>
      </div>
      {t && <div className={`trend dir${t.dir}`}>{t.dir > 0 ? '↑' : t.dir < 0 ? '↓' : '→'} {t.text}</div>}
      <Spark history={sensor.history} rangeMs={rangeMs} now={now} format={(v) => `${fmt(v)}°`} />
    </section>
  );
}

/** Speaker-pictogram van de speler zelf (via de server), pas gebruikt als het echt laadt; anders het noten-icoon. */
function useBluosIcon(url) {
  const [src, setSrc] = useState(() => { try { return localStorage.getItem('bluosIcon'); } catch { return null; } });
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const u = url ?? src;
    if (!u) { setOk(false); return undefined; }
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      setOk(true);
      setSrc(u);
      try { localStorage.setItem('bluosIcon', u); } catch { /* geen opslag beschikbaar */ }
    };
    img.onerror = () => { if (alive) setOk(false); };
    img.src = u;
    return () => { alive = false; };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  return ok ? src : null;
}

export default function App() {
  const { sensors, lights, energy, sun, version, bluos, bluosCmd, connected, reachable, loaded, target, targetMin, targetMax, setTarget, control } = useSensors();
  const [tab, setTab] = useState(() => {
    try { const t = localStorage.getItem('tab'); return ['lights', 'music', 'energy', 'share'].includes(t) ? t : 'climate'; } catch { return 'climate'; }
  });
  const pick = (t) => {
    setTab(t);
    window.scrollTo({ top: 0 });
    try { localStorage.setItem('tab', t); } catch { /* geen opslag beschikbaar */ }
  };
  const [range, setRange] = useState(1);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => setNow(Date.now()), [sensors]);

  const status = !reachable ? ['err', 'Geen verbinding met server'] : connected ? ['ok', 'Live'] : ['warn', 'Niko niet bereikbaar'];
  const avg = sensors.length ? sensors.reduce((a, s) => a + s.temperature, 0) / sensors.length : null;

  const daylight = isDaylight(sun, now);
  const leader = bluos.zones[0]?.members.find((m) => m.isLeader) ?? bluos.zones[0]?.members[0];
  const brandIcon = useBluosIcon(leader?.icon ? `/api/bluos/img?ip=${leader.ip}&path=${encodeURIComponent(leader.icon)}` : null);
  const eState = energyState(energy, daylight);
  const lightsOn = lights.filter((l) => l.on && l.kind !== 'socket' && l.kind !== 'fan').length;

  return (
    <>
      {tab === 'lights' ? (
        <Lights lights={lights} loaded={loaded} reachable={reachable} control={control} status={status} />
      ) : tab === 'music' ? (
        <Music bluos={bluos} status={status} cmd={bluosCmd} />
      ) : tab === 'share' ? (
        <Share status={status} version={version} />
      ) : tab === 'energy' ? (
        <Energy energy={energy} status={status} now={now} daylight={daylight} sun={sun} />
      ) : (
      <main>
        <header>
          <div>
            <h1>Temperatuur</h1>
            {avg !== null && sensors.length > 1 && <p className="avg">Gemiddeld {fmt(avg)} °C</p>}
          </div>
          <span className={`pill ${status[0]}`}><i />{status[1]}</span>
        </header>

        <Masonry
          items={[
            target !== null && {
              key: 'target',
              weight: 4.4,
              node: <TargetPanel target={target} min={targetMin} max={targetMax} current={avg} onChange={setTarget} />,
            },
            {
              key: 'sensors',
              weight: 0.5 + 2.8 * Math.max(1, sensors.length),
              node: (
                <>
                  <div className="segmented" role="tablist" aria-label="Periode">
                    {RANGES.map((r, i) => (
                      <button key={r.label} role="tab" aria-selected={range === i} className={range === i ? 'on' : ''} onClick={() => setRange(i)}>{r.label}</button>
                    ))}
                  </div>
                  {!loaded && <p className="hint">Laden…</p>}
                  {loaded && sensors.length === 0 && <p className="hint">Wachten op de eerste meting van Niko…</p>}
                  {sensors.map((s) => <Card key={s.uuid} sensor={s} rangeMs={RANGES[range].ms} now={now} />)}
                </>
              ),
            },
          ]}
        />
      </main>
      )}

      <nav className="tabbar" aria-label="Hoofdmenu">
        <button className={tab === 'climate' ? 'on' : ''} onClick={() => pick('climate')}><Icon name="thermo" /><span>Klimaat</span></button>
        <button className={tab === 'lights' ? 'on' : ''} onClick={() => pick('lights')}>
          <Icon name="bulb" /><span>Licht</span>{lightsOn > 0 && <b>{lightsOn}</b>}
        </button>
        <button className={tab === 'music' ? 'on' : ''} onClick={() => pick('music')}>
          {brandIcon ? <i className="brand-icon" style={{ '--icon': `url("${brandIcon}")` }} aria-hidden="true" /> : <Icon name="music" />}
          <span>Muziek</span>
        </button>
        <button className={`${tab === 'energy' ? 'on' : ''} ${daylight && isFree(energy) ? 'free' : ''}`} onClick={() => pick('energy')}>
          <Icon name={daylight && isFree(energy) ? 'sun' : 'bolt'} /><span>Energie</span>
          {eState && <i className={`edot ${eState.key} ${eState.critical ? 'critical' : ''}`} title={eState.label} />}
        </button>
        <button className={tab === 'share' ? 'on' : ''} onClick={() => pick('share')}><Icon name="qr" /><span>Delen</span></button>
      </nav>
    </>
  );
}
