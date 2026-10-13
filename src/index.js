// Hygge-bridge: Niko Home Control temperatuursensor -> Seitron Hygge Way.

import { loadConfig } from './config.js';
import { NikoClient } from './niko.js';
import { SeitronHygge } from './seitron.js';
import { decide, initialState } from './controller.js';

const log = {
  info: (...a) => console.log(new Date().toISOString(), ...a),
  error: (...a) => console.error(new Date().toISOString(), 'FOUT:', ...a),
};

const config = loadConfig();
const niko = new NikoClient(config.niko);
const hygge = new SeitronHygge(config.seitron, { dryRun: config.dryRun, log });
const state = initialState();
let busy = false;

async function evaluate() {
  if (busy) return;
  busy = true;
  try {
    const now = Date.now();
    const { command, reason } = decide(state, now, config.control);
    if (!command) return;

    if (command.mode === 'auto') {
      log.info(`Hygge -> eigen weekprogramma (${reason})`);
      await hygge.scheduledMode();
    } else {
      log.info(`Hygge -> ${command.setpoint} °C (${reason})`);
      await hygge.setTemperature(command.setpoint);
    }
    state.mode = command.mode;
    state.lastCommandAt = now;
  } catch (err) {
    log.error('commando naar Seitron mislukt:', err.message);
  } finally {
    busy = false;
  }
}

niko.on('connect', () => log.info(`Verbonden met Niko Home Control op ${config.niko.host}:${config.niko.port}`));
niko.on('offline', () => log.error('verbinding met Niko verbroken, opnieuw proberen…'));
niko.on('error', (err) => log.error(err.message));
niko.on('temperature', (temperature, device) => {
  if (temperature !== state.lastTemperature) {
    log.info(`${device.Name ?? 'Sensor'}: ${temperature.toFixed(1)} °C (doel ${config.control.targetTemp} °C)`);
  }
  state.lastTemperature = temperature;
  state.lastReadingAt = Date.now();
  evaluate();
});

// Ook zonder nieuwe meting regelmatig evalueren (failsafe, herhalingen, schakeltijd).
const timer = setInterval(evaluate, 60_000);

log.info(`Hygge-bridge gestart${config.dryRun ? ' (DRY_RUN: er wordt niets verstuurd)' : ''}`);
niko.connect();

async function shutdown(signal) {
  log.info(`${signal} ontvangen, Hygge terug naar eigen weekprogramma en afsluiten…`);
  clearInterval(timer);
  try {
    if (state.mode && state.mode !== 'auto') await hygge.scheduledMode();
  } catch (err) {
    log.error('kon Hygge niet terugzetten:', err.message);
  }
  await niko.close();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
