// Bedienbare Niko-toestellen (lichten, dimmers, stopcontacten, ventilatoren): puur datamodel.

import { propertiesToObject } from './niko.js';

const KINDS = { light: 'light', dimmer: 'dimmer', socket: 'socket', 'switched-fan': 'fan' };
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Zet een ruw Niko-toestel om naar { uuid, name, room, kind, on, brightness, online }, of null als het niet schakelbaar is. */
export function toModel(raw) {
  const kind = raw?.Type === 'action' ? KINDS[raw.Model] : undefined;
  if (!kind) return null;
  const params = propertiesToObject(raw.Parameters);
  const model = {
    uuid: raw.Uuid,
    name: String(raw.Name ?? '').trim() || 'Naamloos',
    room: capitalize(String(params.LocationName ?? '').trim() || 'Overig'),
    kind,
    on: false,
    brightness: kind === 'dimmer' ? 100 : null,
    online: raw.Online !== 'False',
  };
  return applyProperties(model, propertiesToObject(raw.Properties));
}

/** Past (gedeeltelijke) Niko-properties toe op een model en geeft een nieuw model terug. */
export function applyProperties(model, props) {
  const next = { ...model };
  if ('Status' in props) next.on = props.Status === 'On';
  if ('Brightness' in props && model.kind === 'dimmer') {
    const value = Number(props.Brightness);
    if (Number.isFinite(value)) next.brightness = value;
  }
  return next;
}

/** Bouwt de Niko-properties voor { on } of { brightness }, of null als er niets te doen valt. */
export function controlProperties(model, { on, brightness } = {}) {
  if (brightness !== undefined && model.kind === 'dimmer') {
    const value = Math.round(clamp(Number(brightness), 0, 100));
    if (!Number.isFinite(value)) return null;
    if (value === 0) return [{ Status: 'Off' }];
    return model.on ? [{ Brightness: String(value) }] : [{ Status: 'On' }, { Brightness: String(value) }];
  }
  if (typeof on === 'boolean') return [{ Status: on ? 'On' : 'Off' }];
  return null;
}
