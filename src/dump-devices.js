// Hulpscript: toont de ruwe toestellenlijst van de Niko-controller (voor ontwikkeling).
import { loadConfig } from './config.js';
import { NikoClient } from './niko.js';

const config = loadConfig(process.env, { needSeitron: false });
const niko = new NikoClient({ ...config.niko, sensorName: '', sensorUuid: '' });
niko.on('error', (e) => console.error('FOUT:', e.message));
niko.on('devices', async (devices) => {
  console.log(JSON.stringify(devices, null, 1));
  await niko.close();
  process.exit(0);
});
setTimeout(() => process.exit(1), 20000);
niko.connect();
