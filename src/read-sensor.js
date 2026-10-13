// Leest enkel de Niko-sensor(en) en toont de temperatuur; stuurt niets naar de Hygge.
// NIKO_SENSOR_UUID (of NIKO_SENSOR_NAME) mag meerdere waarden bevatten, gescheiden door een komma.

import { loadConfig } from './config.js';
import { NikoClient } from './niko.js';
import { listSensors } from './sensors.js';

const config = loadConfig(process.env, { needSeitron: false });
const sensors = listSensors(config.niko);
if (sensors.length === 0) throw new Error('Geef NIKO_SENSOR_UUID of NIKO_SENSOR_NAME op');

const clients = sensors.map((sensor) => {
  const niko = new NikoClient({ ...config.niko, ...sensor });
  niko.on('connect', () => console.log(`Verbonden met Niko op ${config.niko.host}:${config.niko.port}`));
  niko.on('offline', () => console.error('verbinding verbroken, opnieuw proberen…'));
  niko.on('error', (err) => console.error('FOUT:', err.message));
  niko.on('temperature', (t, device) => {
    console.log(new Date().toISOString(), `${device.Name ?? 'Sensor'}: ${t.toFixed(1)} °C`);
  });
  return niko.connect();
});

process.on('SIGINT', async () => {
  await Promise.all(clients.map((c) => c.close()));
  process.exit(0);
});
