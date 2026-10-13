// Regellogica: beslist op basis van de Niko-temperatuur wat de Hygge moet doen.
// Puur (geen I/O), zodat het eenvoudig te testen is.
//
// Modi:
//  - 'heat' : Hygge op HEAT_SETPOINT -> ketel brandt
//  - 'idle' : Hygge op IDLE_SETPOINT -> ketel uit
//  - 'auto' : Hygge terug op eigen weekprogramma (failsafe als de Niko-sensor zwijgt)

export function initialState() {
  return { mode: null, lastCommandAt: null, lastReadingAt: null, lastTemperature: null };
}

/** Gewenste modus puur op basis van temperatuur en hysterese. */
export function desiredMode(temperature, currentMode, { targetTemp, hysteresis }) {
  if (temperature < targetTemp - hysteresis) return 'heat';
  if (temperature > targetTemp + hysteresis) return 'idle';
  // Binnen de marge: huidige toestand behouden, anders kiezen t.o.v. het doel.
  if (currentMode === 'heat' || currentMode === 'idle') return currentMode;
  return temperature < targetTemp ? 'heat' : 'idle';
}

/**
 * @returns {{ command: null | { mode: 'heat'|'idle'|'auto', setpoint?: number }, reason: string }}
 */
export function decide(state, now, control) {
  const stale = state.lastReadingAt === null || now - state.lastReadingAt > control.staleAfterMs;
  const mode = stale ? 'auto' : desiredMode(state.lastTemperature, state.mode, control);
  const sinceLast = state.lastCommandAt === null ? Infinity : now - state.lastCommandAt;

  if (mode === state.mode) {
    // In 'auto' niet blijven herhalen: de Hygge volgt dan gewoon zijn eigen schema.
    if (mode !== 'auto' && control.resendAfterMs > 0 && sinceLast >= control.resendAfterMs) {
      return { command: toCommand(mode, control), reason: 'periodieke herhaling' };
    }
    return { command: null, reason: 'geen wijziging' };
  }

  if (stale) {
    // Failsafe: zonder sensor nooit wachten, meteen terug naar het eigen schema.
    if (state.lastReadingAt === null && state.mode === null) {
      return { command: null, reason: 'wacht op eerste meting' };
    }
    return { command: toCommand('auto', control), reason: 'geen recente meting van de Niko-sensor' };
  }

  if (sinceLast < control.minSwitchIntervalMs) {
    const waitMin = Math.ceil((control.minSwitchIntervalMs - sinceLast) / 60_000);
    return { command: null, reason: `wil naar '${mode}', maar wacht nog ${waitMin} min (minimale schakeltijd)` };
  }

  const t = state.lastTemperature.toFixed(1);
  return {
    command: toCommand(mode, control),
    reason: mode === 'heat'
      ? `${t} °C < ${control.targetTemp} °C: verwarmen`
      : `${t} °C ≥ ${control.targetTemp} °C: verwarming uit`,
  };
}

function toCommand(mode, control) {
  if (mode === 'heat') return { mode, setpoint: control.heatSetpoint };
  if (mode === 'idle') return { mode, setpoint: control.idleSetpoint };
  return { mode: 'auto' };
}
