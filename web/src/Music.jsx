import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';

/** 'PULSE FLEX - Keuken + 2' -> 'Keuken + 2': het model-voorvoegsel is in de lijst ruis. */
const short = (name) => name.replace(/^[A-Z][A-Z0-9 ]+ - /, '');

/** Afbeeldingen van het internet direct, lokale paden van de speler via de server. */
const art = (url, ip) => (!url ? null : /^https?:/.test(url) ? url : `/api/bluos/img?ip=${ip}&path=${encodeURIComponent(url)}`);

/** Tablet: per zone de brede indeling (hoes links, bediening rechts). */
function useWide() {
  const q = () => window.matchMedia('(min-width: 700px)');
  const [wide, setWide] = useState(() => q().matches);
  useEffect(() => {
    const m = q();
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

function Art({ src, size = 'l' }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  return (
    <div className={`art ${size}`}>
      {src && !broken ? <img src={src} alt="" onError={() => setBroken(true)} /> : <Icon name="music" size={size === 'l' ? 34 : size === 's' ? 18 : 22} />}
    </div>
  );
}

/** Vaste standen voor het groepsvolume. */
const PRESETS = [['Fluisterzacht', 2], ['Zacht', 4], ['Luid', 7]];

/** Een volume dat direct reageert, hooguit 8× per seconde verstuurt en na de laatste wijziging zeker het eindresultaat stuurt. */
function useLevel(value, onChange) {
  const [live, setLive] = useState(null);
  const s = useRef({ at: 0, timer: null, last: null, settle: null, reset: null });
  const current = useRef(value);
  const shown = live ?? value;
  current.current = shown;

  const send = (v) => {
    if (s.current.last === v) return; // niet dubbel versturen
    s.current.last = v;
    s.current.at = Date.now();
    onChange(v);
  };
  const set = (raw) => {
    const v = Math.min(100, Math.max(0, Math.round(raw)));
    if (v === current.current) return;
    clearTimeout(s.current.reset); // een nieuwe wijziging annuleert het terugkoppelen aan de speler
    current.current = v;
    setLive(v);
    clearTimeout(s.current.timer);
    if (Date.now() - s.current.at > 120) send(v);
    else s.current.timer = setTimeout(() => send(v), 120);
    clearTimeout(s.current.settle);
    s.current.settle = setTimeout(() => {
      clearTimeout(s.current.timer);
      send(v);
      s.current.reset = setTimeout(() => { setLive(null); s.current.last = null; }, 500);
    }, 450);
  };
  useEffect(() => () => ['timer', 'settle', 'reset'].forEach((k) => clearTimeout(s.current[k])), []);
  return { shown, set, bump: (d) => set(current.current + d) };
}

/** − of +: een tik is één stap, ingedrukt houden herhaalt. */
function StepBtn({ delta, label, bump, big = false, disabled = false }) {
  const t = useRef({ d: null, r: null });
  const stop = () => { clearTimeout(t.current.d); clearInterval(t.current.r); };
  useEffect(() => stop, []);
  const start = (e) => {
    if (disabled || e.button > 0) return;
    stop();
    bump(delta);
    t.current.d = setTimeout(() => { t.current.r = setInterval(() => bump(delta), 90); }, 400);
  };
  return (
    <button
      type="button" className={`vstep ${big ? 'big' : ''}`} disabled={disabled} aria-label={label}
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onClick={(e) => { if (e.detail === 0) bump(delta); }} // toetsenbord: Enter of spatie
    >
      <Icon name={delta < 0 ? 'minus' : 'plus'} size={big ? 32 : 20} />
    </button>
  );
}

/** Vaste standen voor het groepsvolume en dempen (het grote − getal + is vervallen; het volume per speler staat in de lijst eronder). */
function GroupVolume({ zone, cmd }) {
  const lvl = useLevel(zone.groupVolume, (level) => cmd(zone.grouped ? 'groupVolume' : 'volume', { ip: zone.leader, level }, { lock: true }));
  const label = zone.grouped ? `Groepsvolume ${short(zone.name)}` : `Volume ${short(zone.name)}`;
  return (
    <div className="vol-big">
      <div className="vchips">
        {PRESETS.map(([name, v]) => (
          <button key={name} type="button" className={`vchip ${lvl.shown === v ? 'on' : ''}`} aria-pressed={lvl.shown === v} onClick={() => lvl.set(v)}>{name}<b>{v}</b></button>
        ))}
        <button type="button" className={`vchip mute ${zone.mute ? 'on' : ''}`} aria-pressed={zone.mute} aria-label={zone.mute ? 'Geluid aan' : 'Dempen'} title={zone.mute ? 'Geluid aan' : 'Dempen'} onClick={() => cmd('mute', { ip: zone.leader, mute: !zone.mute })}>
          <Icon name={zone.mute ? 'mute' : 'volume'} size={16} /><span className="vtext">{zone.mute ? 'Geluid aan' : 'Dempen'}</span>
        </button>
      </div>
    </div>
  );
}

/** Eén speler in de groep: naam links, − getal + rechts. */
function PlayerRow({ m, cmd }) {
  const lvl = useLevel(m.volume, (level) => cmd('volume', { ip: m.ip, level }, { lock: true }));
  const name = short(m.name);
  return (
    <div className={`player-row ${m.online ? '' : 'offline'}`}>
      <div className="player-name">
        <b title={m.name}>{name}</b>
        {m.isLeader && <span className="badge">Leider</span>}
        {!m.online && <span className="badge off">Offline</span>}
      </div>
      <div className="vstepper small">
        <StepBtn delta={-1} label={`Volume ${name} zachter`} bump={lvl.bump} disabled={!m.online || lvl.shown <= 0} />
        <span className="vnum small" aria-live="polite">{lvl.shown}</span>
        <StepBtn delta={1} label={`Volume ${name} luider`} bump={lvl.bump} disabled={!m.online || lvl.shown >= 100} />
      </div>
      {m.isLeader
        ? <span className="unlink-slot" aria-hidden="true" />
        : <button className="unlink-btn" onClick={() => cmd('ungroup', { ip: m.ip })} aria-label={`${name} uit de groep halen`} title="Uit de groep halen"><Icon name="unlink" size={18} /></button>}
    </div>
  );
}

/** Waar een favoriet vandaan komt (voor het kleine label onder de naam). */
const sourceOf = (p) => (/spotify/i.test(`${p.name} ${p.url}`) ? 'Spotify' : /tunein/i.test(p.url) ? 'TuneIn' : /radioparadise/i.test(p.url) ? 'Radio Paradise' : /tidal/i.test(p.url) ? 'TIDAL' : /qobuz/i.test(p.url) ? 'Qobuz' : /deezer/i.test(p.url) ? 'Deezer' : '');

function Favorites({ zone, cmd }) {
  const [pending, setPending] = useState(null); // net aangetikt, wacht op bevestiging van de speler
  const active = zone.presets.find((p) => p.active)?.id ?? null;
  useEffect(() => { if (pending !== null && pending === active) setPending(null); }, [active, pending]);

  const pick = (p) => {
    if (p.id === active) return;
    setPending(p.id);
    setTimeout(() => setPending((cur) => (cur === p.id ? null : cur)), 4000);
    cmd('preset', { ip: zone.leader, id: p.id }, { lock: true, lockMs: 3500 }); // de speler heeft even nodig om te wisselen
  };

  return (
    <div className="favs">
      <div className="favs-head">
        <span className="section-label">Favorieten</span>
        <span className="favs-count">{zone.presets.length}</span>
      </div>
      <div className="fav-strip">
        {zone.presets.map((p) => (
          <button
            key={p.id}
            className={`fav ${p.active ? 'active' : ''} ${pending === p.id ? 'pending' : ''}`}
            onClick={() => pick(p)}
            aria-label={`${p.active ? 'Speelt nu: ' : 'Speel '}${p.name}`}
            aria-pressed={p.active}
          >
            <span className="fav-art">
              <Art src={art(p.image, zone.leader)} size="m" />
              {p.active && <span className="fav-now" aria-hidden="true"><i className="eq"><b /><b /><b /></i>Speelt</span>}
              {pending === p.id && <span className="fav-wait" aria-hidden="true" />}
            </span>
            <span className="fav-name">{p.name.replace(/^Spotify:\s*/, '')}</span>
            {sourceOf(p) && <span className="fav-src">{sourceOf(p)}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet-back" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Sluiten"><Icon name="close" size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddSheet({ zone, zones, cmd, onClose }) {
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const candidates = zones
    .filter((z) => z.id !== zone.id)
    .flatMap((z) => z.members.map((m) => ({ ...m, from: z.grouped ? z.name : 'Los', locked: z.grouped && m.isLeader })));

  const toggle = (ip) => setPicked((p) => (p.includes(ip) ? p.filter((x) => x !== ip) : [...p, ip]));
  const submit = async () => {
    setBusy(true);
    const res = await cmd('group', { ip: zone.leader, add: picked });
    setBusy(false);
    if (res.ok) onClose();
    else setError(res.error ?? 'Groeperen is niet gelukt');
  };

  return (
    <Sheet title={`Toevoegen aan ${short(zone.name)}`} onClose={onClose}>
      {candidates.length === 0 && <p className="hint">Alle spelers zitten al in deze groep.</p>}
      <ul className="pick-list">
        {candidates.map((c) => (
          <li key={c.ip}>
            <label className={`pick ${c.locked ? 'locked' : ''}`}>
              <input type="checkbox" disabled={c.locked || !c.online} checked={picked.includes(c.ip)} onChange={() => toggle(c.ip)} />
              <span className="pick-icon"><Icon name="speaker" size={20} /></span>
              <span className="pick-text">
                <b>{short(c.name)}</b>
                <small>{c.locked ? 'Leidt een groep: heft die eerst op' : !c.online ? 'Offline' : c.from === 'Los' ? c.model : `Nu in ${short(c.from)}`}</small>
              </span>
              <span className="pick-check" />
            </label>
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={!picked.length || busy} onClick={submit}>
        {busy ? 'Bezig…' : picked.length ? `Toevoegen (${picked.length})` : 'Kies spelers'}
      </button>
    </Sheet>
  );
}

function Zone({ zone, zones, cmd, detail = false }) {
  const [sheet, setSheet] = useState(null); // 'add' | 'disband'
  const [showPlayers, setShowPlayers] = useState(true);
  const np = zone.nowPlaying;
  const hasSound = Boolean(np?.title || np?.subtitle);
  const cover = art(np?.cover || np?.image, zone.leader); // hoes van het nummer, anders het zenderlogo
  const logo = np?.cover && np?.image ? art(np.image, zone.leader) : null;
  const others = zones.some((z) => z.id !== zone.id);

  return (
    <section className={`zone ${detail ? 'detail' : ''} ${zone.playing ? 'playing' : ''} ${zone.online ? '' : 'offline'}`}>
      <div className="zone-top">
        <div className="art-wrap">
          <Art src={cover} />
          {logo && <img className="art-logo" src={logo} alt="" title={np.service ?? ''} />}
        </div>
        <div className="zone-text">
          <span className="zone-name">{zone.grouped && <Icon name="group" size={14} />}<span title={zone.name}>{short(zone.name)}</span></span>
          <h2 className="zone-title">{hasSound ? np.title || np.subtitle : zone.online ? 'Niets aan het afspelen' : 'Offline'}</h2>
          {hasSound && np.title && np.subtitle && <span className="zone-sub">{np.subtitle}</span>}
          <span className="zone-meta">
            {zone.playing && <i className="eq" aria-hidden="true"><b /><b /><b /></i>}
            {np?.service && <span className="chip">{np.service}</span>}
          </span>
        </div>
      </div>

      <div className="zone-controls">
        <div className="transport">
          <button className="t-btn" onClick={() => cmd('prev', { ip: zone.leader })} disabled={!zone.canSkip} title={zone.canSkip ? undefined : 'Niet beschikbaar bij live radio'} aria-label="Vorige"><Icon name="prev" size={24} /></button>
          <button className="t-btn main" onClick={() => cmd(zone.playing ? 'pause' : 'play', { ip: zone.leader })} aria-label={zone.playing ? 'Pauzeren' : 'Afspelen'}>
            <Icon name={zone.playing ? 'pause' : 'play'} size={30} />
          </button>
          <button className="t-btn" onClick={() => cmd('next', { ip: zone.leader })} disabled={!zone.canSkip} title={zone.canSkip ? undefined : 'Niet beschikbaar bij live radio'} aria-label="Volgende"><Icon name="next" size={24} /></button>
        </div>

        <GroupVolume zone={zone} cmd={cmd} />
      </div>

      {zone.grouped && (
        <div className="players">
          <button className="section-toggle" onClick={() => setShowPlayers((v) => !v)} aria-expanded={showPlayers}>
            <span className="section-label">Spelers ({zone.members.length})</span>
            <span className={`chev ${showPlayers ? 'open' : ''}`}><Icon name="chevron" size={16} /></span>
          </button>
          {showPlayers && <div className="player-grid">{zone.members.map((m) => <PlayerRow key={m.ip} m={m} cmd={cmd} />)}</div>}
        </div>
      )}

      <div className="zone-actions">
        {others && <button className="ghost" onClick={() => setSheet('add')}><Icon name="plus" size={18} />{zone.grouped ? 'Speler toevoegen' : 'Groeperen met…'}</button>}
        {zone.grouped && <button className="ghost danger" onClick={() => setSheet('disband')}><Icon name="unlink" size={18} />Groep opheffen</button>}
      </div>

      {zone.presets.length > 0 && <Favorites zone={zone} cmd={cmd} />}

      {sheet === 'add' && <AddSheet zone={zone} zones={zones} cmd={cmd} onClose={() => setSheet(null)} />}
      {sheet === 'disband' && (
        <Sheet title="Groep opheffen?" onClose={() => setSheet(null)}>
          <p className="sheet-text">De spelers worden los van elkaar. De muziek blijft doorspelen op <b>{short(zone.members.find((m) => m.isLeader)?.name ?? '')}</b>.</p>
          <div className="sheet-buttons">
            <button className="ghost" onClick={() => setSheet(null)}>Annuleren</button>
            <button className="primary danger" onClick={() => { cmd('disband', { ip: zone.leader }); setSheet(null); }}>Groep opheffen</button>
          </div>
        </Sheet>
      )}
    </section>
  );
}

const COVER_LAYOUTS = [['square', 'Vierkant'], ['wide', 'Breed'], ['overlay', 'Titel op hoes'], ['wideoverlay', 'Breed + titel op hoes']];

/** Opmaak van de hoes op de telefoon; de keuze wordt onthouden. Met ?kies=hoes in de link verschijnt de keuzebalk. */
function useCoverLayout() {
  const [layout, setLayout] = useState(() => { try { return localStorage.getItem('coverLayout') || 'square'; } catch { return 'square'; } });
  const set = (v) => { setLayout(v); try { localStorage.setItem('coverLayout', v); } catch { /* geen opslag beschikbaar */ } };
  return [layout, set, new URLSearchParams(window.location.search).get('kies') === 'hoes'];
}

export default function Music({ bluos, status, cmd }) {
  const wide = useWide();
  const [coverLayout, setCoverLayout, picking] = useCoverLayout();
  const { zones, scanning, count } = bluos;
  const groups = zones.filter((z) => z.grouped).length;
  const sub = count === 0 ? (scanning ? 'Zoeken naar spelers…' : 'Geen spelers gevonden') : `${count} ${count === 1 ? 'speler' : 'spelers'}${groups ? ` · ${groups} ${groups === 1 ? 'groep' : 'groepen'}` : ''}`;

  return (
    <main className="music" data-cover={coverLayout}>
      <header>
        <div>
          <h1>Muziek</h1>
          <p className="avg">{sub}</p>
        </div>
        <div className="head-actions">
          <button className={`icon-btn round ${scanning ? 'spin' : ''}`} onClick={() => cmd('scan', {})} aria-label="Spelers zoeken" title="Spelers zoeken"><Icon name="refresh" size={22} /></button>
          <span className={`pill ${status[0]}`}><i />{status[1]}</span>
        </div>
      </header>

      {picking && (
        <div className="cover-picker" role="radiogroup" aria-label="Opmaak van de hoes">
          {COVER_LAYOUTS.map(([id, name]) => (
            <button key={id} type="button" role="radio" aria-checked={coverLayout === id} className={coverLayout === id ? 'on' : ''} onClick={() => setCoverLayout(id)}>{name}</button>
          ))}
        </div>
      )}

      {zones.length === 0 ? (
        <section className="card empty">
          <Icon name="music" size={40} />
          <h2>{scanning ? 'Even zoeken…' : 'Geen BluOS-spelers gevonden'}</h2>
          <p>{scanning ? 'We scannen je netwerk op Bluesound- en NAD-spelers.' : 'Controleer of de spelers aan staan en op hetzelfde netwerk zitten.'}</p>
          <button className="primary" onClick={() => cmd('scan', {})} disabled={scanning}>Opnieuw zoeken</button>
        </section>
      ) : (
        <div className="zones">
          {zones.map((z) => <Zone key={z.id} zone={z} zones={zones} cmd={cmd} detail={wide} />)}
        </div>
      )}
    </main>
  );
}
