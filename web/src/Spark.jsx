import { useId } from 'react';

export default function Spark({ history, rangeMs, now, format, color = 'var(--accent)' }) {
  const id = useId();
  const pts = history.filter(([ts]) => now - ts <= rangeMs);
  if (pts.length < 2) return <div className="spark empty">Nog te weinig data</div>;
  const temps = pts.map((p) => p[1]);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const pad = Math.max((max - min) * 0.1, 0.2);
  const lo = min - pad;
  const hi = max + pad;
  const x = (ts) => ((ts - (now - rangeMs)) / rangeMs) * 300;
  const y = (t) => 70 - ((t - lo) / (hi - lo)) * 60;
  const line = pts.map(([ts, t], i) => `${i ? 'L' : 'M'}${x(ts).toFixed(1)},${y(t).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.at(-1)[0]).toFixed(1)},80 L${x(pts[0][0]).toFixed(1)},80 Z`;
  return (
    <div className="spark">
      <svg viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.35" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="spark-scale"><span>min {format(min)}</span><span>max {format(max)}</span></div>
    </div>
  );
}

