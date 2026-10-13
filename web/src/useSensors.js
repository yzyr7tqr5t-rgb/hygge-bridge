import { useCallback, useEffect, useRef, useState } from 'react';

/** Laadt de toestand en houdt hem live bij via Server-Sent Events. */
export function useSensors() {
  const [data, setData] = useState({ connected: false, sensors: [], lights: [], energy: null, sun: null, version: null, target: null, targetMin: 10, targetMax: 28, loaded: false, reachable: true });
  const pending = useRef(null); // wachtend POST-timeout: server-updates negeren zolang de gebruiker draait

  const locked = useRef(new Set()); // lampen die de gebruiker nu versleept: server-echo's negeren

  const control = useCallback((commands, { lock = false } = {}) => {
    const byUuid = new Map(commands.map((c) => [c.uuid, c]));
    setData((d) => ({
      ...d,
      lights: d.lights.map((l) => {
        const c = byUuid.get(l.uuid);
        if (!c) return l;
        if (c.brightness !== undefined && l.kind === 'dimmer') {
          const b = Math.round(Math.min(100, Math.max(0, c.brightness)));
          return { ...l, on: b > 0, brightness: b > 0 ? b : l.brightness };
        }
        return typeof c.on === 'boolean' ? { ...l, on: c.on } : l;
      }),
    }));
    if (lock) for (const c of commands) locked.current.add(c.uuid);
    return fetch('/api/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(commands) })
      .catch(() => {})
      .finally(() => { if (lock) setTimeout(() => commands.forEach((c) => locked.current.delete(c.uuid)), 600); });
  }, []);

  const setTarget = useCallback((target) => {
    setData((d) => ({ ...d, target }));
    clearTimeout(pending.current);
    pending.current = setTimeout(async () => {
      try {
        await fetch('/api/target', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target }) });
      } catch { /* volgende server-update corrigeert de weergave */ }
      pending.current = null;
    }, 400);
  }, []);

  useEffect(() => {
    let es;
    let timer;
    let stopped = false;

    const load = () =>
      fetch('/api/state', { cache: 'no-store' })
        .then((r) => r.json())
        .then((s) => !stopped && setData((d) => ({ ...s, target: pending.current ? d.target : s.target, loaded: true, reachable: true })))
        .catch(() => !stopped && setData((d) => ({ ...d, loaded: true, reachable: false })));

    const open = () => {
      es = new EventSource('/api/stream');
      es.addEventListener('sensor', (e) => {
        const s = JSON.parse(e.data);
        setData((d) => {
          const others = d.sensors.filter((x) => x.uuid !== s.uuid);
          return { ...d, reachable: true, sensors: [...others, s].sort((a, b) => a.name.localeCompare(b.name)) };
        });
      });
      es.addEventListener('energy', (e) => {
        const snap = JSON.parse(e.data);
        setData((d) => {
          const history = d.energy?.history ?? [];
          const last = history.at(-1);
          const net = (snap.fromGrid ?? 0) - (snap.toGrid ?? 0);
          const next = !last || snap.updatedAt - last[0] >= 60_000 ? [...history, [snap.updatedAt, net]].slice(-1440) : history;
          return { ...d, reachable: true, energy: { ...snap, history: next } };
        });
      });
      es.addEventListener('lights', (e) => setData((d) => ({ ...d, reachable: true, lights: JSON.parse(e.data) })));
      es.addEventListener('light', (e) => {
        const l = JSON.parse(e.data);
        if (locked.current.has(l.uuid)) return;
        setData((d) => ({ ...d, lights: d.lights.map((x) => (x.uuid === l.uuid ? l : x)) }));
      });
      es.addEventListener('target', (e) => {
        if (pending.current) return;
        setData((d) => ({ ...d, target: JSON.parse(e.data).target }));
      });
      es.addEventListener('status', (e) => setData((d) => ({ ...d, reachable: true, connected: JSON.parse(e.data).connected })));
      es.onerror = () => {
        setData((d) => ({ ...d, reachable: false }));
        es.close();
        timer = setTimeout(() => { load(); open(); }, 5000);
      };
    };

    const onVisible = () => { if (document.visibilityState === 'visible') { load(); if (es?.readyState === 2) open(); } };
    document.addEventListener('visibilitychange', onVisible);
    load();
    open();
    return () => {
      stopped = true;
      clearTimeout(timer);
      es?.close();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return { ...data, setTarget, control };
}
