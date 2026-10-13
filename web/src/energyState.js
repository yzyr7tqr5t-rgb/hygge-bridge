// Beoordeelt de energietoestand: overschot van de zon, of laag/normaal/hoog verbruik t.o.v. de maandpiek.

export const FREE_FROM_W = 150; // vanaf zoveel teruglevering spreken we van gratis zonne-energie
export const FALLBACK_PEAK_W = 3500; // als er nog geen maandpiek bekend is
export const LOW_BELOW = 0.3; // aandeel van de maandpiek
export const HIGH_FROM = 0.65;

export const isFree = (energy) => (energy?.toGrid ?? 0) >= FREE_FROM_W;

const nl = (v) => Math.round(v).toLocaleString('nl-BE');

/**
 * @returns {{ key: 'solar'|'low'|'mid'|'high', critical: boolean, label: string, text: string, pct: number } | null}
 */
export function energyState(energy, daylight = true) {
  if (!energy || energy.fromGrid === null || energy.fromGrid === undefined) return null;
  const peak = energy.monthlyPeak > 0 ? energy.monthlyPeak : FALLBACK_PEAK_W;
  const draw = Math.max(0, energy.fromGrid - (energy.toGrid ?? 0));
  const pct = Math.round((draw / peak) * 100);

  if (daylight && isFree(energy)) {
    return { key: 'solar', critical: false, label: 'Zon levert overschot', pct, text: `${nl(energy.toGrid)} W gaat naar het net. Gebruik nu gratis stroom.` };
  }
  if (draw >= peak) {
    return { key: 'high', critical: true, label: 'Nieuwe maandpiek', pct, text: 'Je verbruik is nu hoger dan je maandpiek. Zet zware apparaten even uit.' };
  }
  if (draw / peak >= HIGH_FROM) {
    return { key: 'high', critical: false, label: 'Hoog verbruik', pct, text: `Je zit dicht bij je maandpiek (${pct}%). Stel zware apparaten even uit.` };
  }
  if (draw / peak >= LOW_BELOW) {
    return { key: 'mid', critical: false, label: 'Normaal verbruik', pct, text: `Een normaal niveau: ${pct}% van je maandpiek.` };
  }
  return { key: 'low', critical: false, label: 'Laag verbruik', pct, text: 'Rustig op het net, er is ruimte om apparaten te gebruiken.' };
}
