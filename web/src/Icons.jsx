const PATHS = {
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" /></>,
  dimmer: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" /><path d="M12 8v4" /></>,
  socket: <><rect x="4" y="4" width="16" height="16" rx="5" /><path d="M9.5 10v2M14.5 10v2M10 15.5h4" /></>,
  fan: <><circle cx="12" cy="12" r="1.6" /><path d="M12 10.4C12 6 14 4 16 4.5c1.7.5 1.4 3-.8 4.6M13.6 12c4.4 0 6.4 2 5.9 4-.5 1.7-3 1.4-4.6-.8M12 13.6c0 4.4-2 6.4-4 5.9-1.7-.5-1.4-3 .8-4.6M10.4 12C6 12 4 10 4.5 8c.5-1.7 3-1.4 4.6.8" /></>,
  thermo: <><path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z" /><path d="M12 9v7" /></>,
  power: <><path d="M12 3v8" /><path d="M6.3 6.6a8 8 0 1 0 11.4 0" /></>,
  strip: <><rect x="2.5" y="10" width="19" height="4" rx="2" /><path d="M6 6.5v-1M12 6.5v-2M18 6.5v-1M6 17.5v1M12 17.5v2M18 17.5v1" /></>,
  spots: <><path d="M2.5 4h19" /><path d="M4.5 4v1.5a2 2 0 0 0 4 0V4M10 4v1.5a2 2 0 0 0 4 0V4M15.5 4v1.5a2 2 0 0 0 4 0V4" /><path d="M6.5 10v2.5M12 10v3.5M17.5 10v2.5M4.5 9.5 3.5 11M8.5 9.5l1 1.5M19.5 9.5l1 1.5" /></>,
  track: <><path d="M2.5 4.5h19" /><path d="M7 4.5v3M12 4.5v3M17 4.5v3" /><circle cx="7" cy="10" r="2.5" /><circle cx="12" cy="10" r="2.5" /><circle cx="17" cy="10" r="2.5" /><path d="M7 15v2M12 15v3M17 15v2" /></>,
  pendant: <><path d="M12 2.5V8" /><path d="M5.5 16.5a6.5 6.5 0 0 1 13 0Z" /><path d="M10 20h4" /></>,
  ceiling: <><path d="M3 4.5h18" /><path d="M6 4.5a6 6 0 0 0 12 0" /><path d="M9 16.5 8 19M12 17.5v3.5M15 16.5l1 2.5" /></>,
  lantern: <><path d="M9.5 2.5h5M12 2.5V5" /><path d="M8 5h8l1.5 3v8L16 19H8l-1.5-3V8Z" /><path d="M9.5 8.5v7M14.5 8.5v7M10 21.5h4" /></>,
  door: <><path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21M3.5 21h17" /><circle cx="14.5" cy="12.5" r=".7" /></>,
  bike: <><circle cx="6" cy="16" r="3.5" /><circle cx="18" cy="16" r="3.5" /><path d="M6 16l4-8h5l3 8M10 8l3 8M9 6h3" /></>,
  sofa: <><path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3" /><path d="M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3Z" /><path d="M5 18v2M19 18v2" /></>,
  kitchen: <><path d="M5 10h14v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3Z" /><path d="M3 10h18M9 6.5c0-1.2 1-1.3 1-2.5M14 6.5c0-1.2 1-1.3 1-2.5" /></>,
  desk: <><rect x="5" y="3.5" width="14" height="9" rx="1.8" /><path d="M12 12.5V16M8 16h8M4 20h16" /></>,
  toilet: <><path d="M8 3h8v5H8Z" /><path d="M5 10h14c0 4-2 7-7 7s-7-3-7-7Z" /><path d="M9 21h6M12 17v4" /></>,
  box: <><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5Z" /><path d="m3 7.5 9 4.5 9-4.5M12 12v9" /></>,
  home: <path d="m3 11 9-8 9 8M5.5 9.5V20h13V9.5M10 20v-6h4v6" />,
  bolt: <path d="M13 2.5 5 13.5h6l-1 8 8-11h-6Z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  qr: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><path d="M14 14h2.5v2.5M20.5 14v.01M14 20.5h.01M17 20.5h3.5V18" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
};

export function Icon({ name, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
