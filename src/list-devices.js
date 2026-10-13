// Hulpscript: toont alle Niko-toestellen die een temperatuur doorgeven,
// zodat je de juiste NIKO_SENSOR_NAME of NIKO_SENSOR_UUID kan kiezen.

import { loadConfig } from './config.js';
import { NikoClient, readTemperature } from './niko.js';

const config = loadConfig(process.env, { needSeitron: false });
const niko = new NikoClient({ ...config.niko, sensorName: '', sensorUuid: '' });

const timeout = setTimeout(() => {
  console.error('Geen antwoord van de controller binnen 20 s. Klopt NIKO_HOST en NIKO_TOKEN?');
  process.exit(1);
}, 20_000);

niko.on('error', (err) => console.error('FOUT:', err.message));
niko.on('devices', async (devices) => {
  clearTimeout(timeout);
  const rows = devices
    .map((d) => ({ naam: d.Name, temperatuur: readTemperature(d), type: `${d.Model}/${d.Type}`, uuid: d.Uuid }))
    .filter((r) => r.temperatuur !== null);
  if (rows.length === 0) console.log(`Geen toestellen met temperatuur gevonden (${devices.length} toestellen in totaal).`);
  else console.table(rows);
  await niko.close();
  process.exit(0);
});
niko.connect();
