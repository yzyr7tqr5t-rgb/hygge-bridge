// Stuurt de Seitron Hygge (via de Hygge Way gateway) aan.
// Seitron heeft geen publieke API; de officiële koppeling voor derden is de
// "Seitron Smart"-service op IFTTT. Deze module vuurt een IFTTT Webhooks-event
// af, en een IFTTT-applet voert daarna de Seitron Smart-actie uit.

const IFTTT_BASE = 'https://maker.ifttt.com/trigger';

export class SeitronHygge {
  constructor({ iftttKey, eventSetTemperature, eventAuto }, { dryRun = false, fetchImpl = fetch, log = console } = {}) {
    this.key = iftttKey;
    this.events = { setTemperature: eventSetTemperature, auto: eventAuto };
    this.dryRun = dryRun;
    this.fetch = fetchImpl;
    this.log = log;
  }

  /** Zet de Hygge in manuele modus op het gegeven setpoint (°C). */
  setTemperature(setpoint) {
    return this.trigger(this.events.setTemperature, { value1: formatSetpoint(setpoint) });
  }

  /** Zet de Hygge terug op zijn eigen weekprogramma. */
  scheduledMode() {
    return this.trigger(this.events.auto, {});
  }

  async trigger(event, body, attempts = 3) {
    if (this.dryRun) {
      this.log.info(`[DRY_RUN] IFTTT-event "${event}" ${JSON.stringify(body)}`);
      return;
    }
    const url = `${IFTTT_BASE}/${encodeURIComponent(event)}/with/key/${encodeURIComponent(this.key)}`;
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const res = await this.fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) return;
        lastError = new Error(`IFTTT antwoordde ${res.status}: ${await res.text().catch(() => '')}`);
        if (res.status >= 400 && res.status < 500 && res.status !== 429) break; // fout in sleutel/event: niet herhalen
      } catch (err) {
        lastError = err;
      }
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 2_000 * 2 ** (attempt - 1)));
    }
    throw lastError;
  }
}

/** Setpoint als tekst met één decimaal (punt als scheidingsteken, zoals IFTTT verwacht). */
export function formatSetpoint(setpoint) {
  return Number(setpoint).toFixed(1);
}
