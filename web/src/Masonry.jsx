import { useEffect, useState } from 'react';

const query = (px) => window.matchMedia(`(min-width: ${px}px)`);
const count = () => (query(1350).matches ? 3 : query(700).matches ? 2 : 1);

/** Aantal kolommen voor de huidige schermbreedte: 1 (telefoon), 2 (tablet), 3 (breed scherm). */
export function useColumnCount() {
  const [n, setN] = useState(count);
  useEffect(() => {
    const lists = [query(700), query(1350)];
    const update = () => setN(count());
    lists.forEach((l) => l.addEventListener('change', update));
    return () => lists.forEach((l) => l.removeEventListener('change', update));
  }, []);
  return n;
}

/**
 * Verdeelt blokken over kolommen. Elk blok komt in de kolom die tot nu toe het kortst is (op basis van een
 * geschat gewicht), dus de bovenkant van elke kolom begint altijd op dezelfde hoogte.
 * @param items [{ key, weight, node }] (lege waarden worden overgeslagen)
 */
export default function Masonry({ items }) {
  const n = useColumnCount();
  const cols = Array.from({ length: n }, () => ({ height: 0, nodes: [] }));
  for (const item of items.filter(Boolean)) {
    const target = cols.reduce((best, c) => (c.height < best.height ? c : best), cols[0]);
    target.nodes.push(<div className="mi" key={item.key}>{item.node}</div>);
    target.height += item.weight;
  }
  return (
    <div className="cols" style={{ '--n': n }}>
      {cols.map((c, i) => <div className="col" key={i}>{c.nodes}</div>)}
    </div>
  );
}
