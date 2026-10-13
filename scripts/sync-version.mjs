// Zet het versienummer uit package.json ook in de Home Assistant add-on (hygge_bridge/config.yaml).
// Wordt automatisch uitgevoerd door "npm version".
import { readFileSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const file = new URL('../hygge_bridge/config.yaml', import.meta.url);
writeFileSync(file, readFileSync(file, 'utf8').replace(/^version: .*$/m, `version: "${version}"`));
console.log(`add-on versie: ${version}`);
