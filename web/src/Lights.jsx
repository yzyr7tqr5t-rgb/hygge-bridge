import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';

const ROOM_ORDER = ['Living', 'Keuken', 'Buro', 'Wc', 'Berging', 'Sas', 'Thuis'];
const isLight = (l) => l.kind === 'light' || l.kind === 'dimmer';
const BY_KIND = { light: 'ceiling', dimmer: 'dimmer', socket: 'socket', fan: 'fan' };
// Niko levert enkel grove pictogramcodes, dus kiezen we het icoon op naam (daarna op soort toestel).
const BY_NAME = [
  [/led(s|strip)/, 'strip'],
  [/spot/, 'spots'],
  [/lichtlijn/, 'track'],
  [/eettafel|mirage/, 'pendant'],
  [/voordeur|achterdeur/, 'door'],
  [/fiets/, 'bike'],
  [/buiten|terras|\bsas\b/, 'lantern'],
];
const iconFor = (d) => (d.kind === 'fan' ? 'fan' : BY_NAME.find(([re]) => re.test(d.name.toLowerCase()))?.[1] ?? BY_KIND[d.kind]);
const KIND_ORDER = { dimmer: 0, light: 1, socket: 2, fan: 3 };

/** Tegel: tik = aan/uit, bij dimmers ook horizontaal slepen = helderheid. */
function Tile({ device, control }) {
  const drag = useRef(null);
  const [live, setLive] = useState(null); // helderheid tijdens het slepen
  const dimmable = device.kind === 'dimmer';
  const level = live ?? (device.on ? device.brightness ?? 100 : 0);
  const send = useRef({ t: 0, timer: null });

  const pushBrightness = (value, final) => {
    const now = Date.now();
    clearTimeout(send.current.timer);
    const fire = () => { send.current.t = Date.now(); control([{ uuid: device.uuid, brightness: value }], { lock: true }); };
    if (final || now - send.current.t > 120) fire();
    else send.current.timer = setTimeout(fire, 120);
  };

  const onPointerDown = (e) => {
    if (!dimmable || !device.online) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, width: e.currentTarget.getBoundingClientRect().width, start: device.on ? device.brightness ?? 100 : 0, moved: false, value: null };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 8) return;
    d.moved = true;
    d.value = Math.round(Math.min(100, Math.max(0, d.start + (dx / d.width) * 110)));
    setLive(d.value);
    pushBrightness(d.value, false);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) {
      pushBrightness(d.value, true);
      setLive(null);
    }
  };
  const onClick = () => {
    if (!device.online) return;
    if (dimmable && live !== null) return;
    control([{ uuid: device.uuid, on: !device.on }]);
  };
  const dragged = useRef(false);

  const state = !device.online ? 'Offline' : !device.on ? 'Uit' : dimmable ? `${level}%` : 'Aan';
  return (
    <button
      className={`tile ${device.on ? 'on' : ''} ${device.kind} ${device.online ? '' : 'offline'}`}
      onPointerDown={(e) => { dragged.current = false; onPointerDown(e); }}
      onPointerMove={(e) => { onPointerMove(e); if (drag.current?.moved) dragged.current = true; }}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={() => { if (dragged.current) { dragged.current = false; return; } onClick(); }}
      aria-pressed={device.on}
      aria-label={`${device.name}, ${state}`}
    >
      {dimmable && <span className="fill" style={{ width: `${level}%` }} />}
      <span className="tile-icon"><Icon name={iconFor(device)} size={32} /></span>
      <span className="tile-text">
        <span className="tile-name">{device.name}</span>
        <span className="tile-state">{state}</span>
      </span>
    </button>
  );
}

const ROOM_ICON = { living: 'sofa', keuken: 'kitchen', buro: 'desk', wc: 'toilet', berging: 'box', sas: 'door', thuis: 'home' };

function Room({ name, devices, control, collapsed, onToggle }) {
  const lamps = devices.filter(isLight);
  const onCount = lamps.filter((l) => l.on).length;
  const anyOn = onCount > 0;
  const share = lamps.length ? (onCount / lamps.length) * 100 : 0;
  const bodyRef = useRef(null);
  const mounted = useRef(false);

  // Hoogte-animatie via Web Animations: soepeler dan CSS-transities op grid-rijen.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    el.inert = collapsed;
    if (!mounted.current) { mounted.current = true; return; }
    el.getAnimations().forEach((a) => a.cancel());
    const full = `${el.scrollHeight}px`;
    const frames = collapsed
      ? [{ height: full, opacity: 1 }, { height: '0px', opacity: 0 }]
      : [{ height: '0px', opacity: 0 }, { height: full, opacity: 1 }];
    el.animate(frames, { duration: 340, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  }, [collapsed]);

  const sub = !lamps.length ? `${devices.length} toestel${devices.length === 1 ? '' : 'len'}` : anyOn ? `${onCount} van ${lamps.length} aan` : 'alles uit';
  return (
    <section className={`room ${anyOn ? 'lit' : ''} ${collapsed ? 'collapsed' : ''}`}>
      <div className="room-head">
        <button className="room-toggle" onClick={onToggle} aria-expanded={!collapsed}>
          <span className="room-icon"><Icon name={ROOM_ICON[name.toLowerCase()] ?? 'home'} size={26} /></span>
          <span className="room-title">
            <h2>{name}</h2>
            <span className="room-sub">{sub}</span>
          </span>
          <span className="room-chevron"><Icon name="chevron" size={18} /></span>
        </button>
        {lamps.length > 1 && (
          <button
            className={`switch ${anyOn ? 'on' : ''}`}
            role="switch"
            aria-checked={anyOn}
            aria-label={`Alle lichten ${name}`}
            onClick={() => control(lamps.filter((l) => l.on === anyOn).map((l) => ({ uuid: l.uuid, on: !anyOn })))}
          ><i /></button>
        )}
      </div>
      {lamps.length > 0 && <div className="room-meter"><i style={{ width: `${share}%` }} /></div>}
      <div className="room-body" ref={bodyRef} style={{ height: collapsed ? 0 : 'auto', opacity: collapsed ? 0 : 1 }}>
        <div className="tiles">
          {devices.map((d) => <Tile key={d.uuid} device={d} control={control} />)}
        </div>
      </div>
    </section>
  );
}

export default function Lights({ lights, loaded, reachable, control, status }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('collapsedRooms') ?? '[]')); } catch { return new Set(); }
  });
  const toggleRoom = (name) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (!next.delete(name)) next.add(name);
    try { localStorage.setItem('collapsedRooms', JSON.stringify([...next])); } catch { /* geen opslag beschikbaar */ }
    return next;
  });

  const rooms = useMemo(() => {
    const by = new Map();
    for (const l of lights) (by.get(l.room) ?? by.set(l.room, []).get(l.room)).push(l);
    for (const list of by.values()) list.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name, 'nl'));
    const rank = (r) => (ROOM_ORDER.includes(r) ? ROOM_ORDER.indexOf(r) : 99);
    return [...by.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
  }, [lights]);

  const lamps = lights.filter(isLight);
  const on = lamps.filter((l) => l.on);
  const allOff = () => control(on.map((l) => ({ uuid: l.uuid, on: false })));

  return (
    <main className="lights">
      <header>
        <div>
          <h1>Verlichting</h1>
          <p className="avg">{lamps.length ? `${lamps.length} lichten in ${rooms.length} ruimtes` : ' '}</p>
        </div>
        <span className={`pill ${status[0]}`}><i />{status[1]}</span>
      </header>

      {lamps.length > 0 && (
        <section className={`hero ${on.length ? 'lit' : ''}`}>
          <div>
            <span className="hero-num">{on.length}</span>
            <span className="hero-label">{on.length === 1 ? 'licht aan' : 'lichten aan'}</span>
          </div>
          <button className="hero-btn" onClick={allOff} disabled={!on.length}><Icon name="power" size={20} />Alles uit</button>
        </section>
      )}

      {!loaded && <p className="hint">Laden…</p>}
      {loaded && reachable && lights.length === 0 && <p className="hint">Wachten op de toestellen van Niko…</p>}
      {rooms.map(([name, devices]) => <Room key={name} name={name} devices={devices} control={control} collapsed={collapsed.has(name)} onToggle={() => toggleRoom(name)} />)}
    </main>
  );
}
