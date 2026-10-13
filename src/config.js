// Leest en valideert de configuratie uit omgevingsvariabelen.

function num(env, key, fallback) {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(value)) throw new Error(`${key} moet een getal zijn (kreeg "${raw}")`);
  return value;
}

function required(env, key) {
  const value = env[key];
  if (!value) throw new Error(`${key} ontbreekt in .env`);
  return value;
}

export function loadConfig(env = process.env, { needSeitron = true } = {}) {
  const dryRun = String(env.DRY_RUN ?? '').toLowerCase() === 'true';

  const config = {
    niko: {
      host: required(env, 'NIKO_HOST'),
      port: num(env, 'NIKO_PORT', 8884),
      username: env.NIKO_USERNAME || 'hobby',
      token: required(env, 'NIKO_TOKEN'),
      sensorName: env.NIKO_SENSOR_NAME || '',
      sensorUuid: env.NIKO_SENSOR_UUID || '',
      caFile: env.NIKO_CA_FILE || new URL('../certs/niko_ca.pem', import.meta.url),
    },
    seitron: {
      iftttKey: needSeitron && !dryRun ? required(env, 'IFTTT_KEY') : env.IFTTT_KEY || '',
      eventSetTemperature: env.IFTTT_EVENT_SET_TEMPERATURE || 'hygge_set_temperature',
      eventAuto: env.IFTTT_EVENT_AUTO || 'hygge_auto',
    },
    control: {
      targetTemp: num(env, 'TARGET_TEMP', 21),
      hysteresis: num(env, 'HYSTERESIS', 0.3),
      heatSetpoint: num(env, 'HEAT_SETPOINT', 25),
      idleSetpoint: num(env, 'IDLE_SETPOINT', 12),
      minSwitchIntervalMs: num(env, 'MIN_SWITCH_INTERVAL_MIN', 10) * 60_000,
      staleAfterMs: num(env, 'STALE_AFTER_MIN', 30) * 60_000,
      resendAfterMs: num(env, 'RESEND_AFTER_MIN', 60) * 60_000,
    },
    location: { lat: num(env, 'LATITUDE', 50.85), lon: num(env, 'LONGITUDE', 4.35) }, // standaard: Brussel
    dryRun,
  };

  if (needSeitron && !config.niko.sensorName && !config.niko.sensorUuid) {
    throw new Error('Geef NIKO_SENSOR_NAME of NIKO_SENSOR_UUID op');
  }
  const c = config.control;
  if (c.hysteresis < 0) throw new Error('HYSTERESIS mag niet negatief zijn');
  if (c.heatSetpoint <= c.targetTemp + c.hysteresis) {
    throw new Error('HEAT_SETPOINT moet duidelijk hoger liggen dan TARGET_TEMP + HYSTERESIS');
  }
  if (c.idleSetpoint >= c.targetTemp - c.hysteresis) {
    throw new Error('IDLE_SETPOINT moet duidelijk lager liggen dan TARGET_TEMP - HYSTERESIS');
  }
  return config;
}
