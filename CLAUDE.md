# Hygge-bridge

Niko Home Control II dashboard voor de iPhone (licht, klimaat, energie, delen) als React-app
met een kleine Node-server. De Seitron Hygge-aansturing (`src/index.js`, `controller.js`, `seitron.js`)
is voorlopig bewust niet in gebruik.

## Opbouw
- `src/server.js` — webserver + API (`/api/state`, `/api/stream` SSE, `/api/devices`, `/api/target`, `/api/qr`). Serveert `web/dist`.
- `src/niko.js` — MQTT-client voor de Niko Hobby API. `home.js` (lichten), `energy.js` (energie), `sun.js` (zonsopgang/-ondergang).
- `web/` — React + Vite (`web/src/*`). Bouwen: `npm run build`.
- `hygge_bridge/config.yaml` + `repository.yaml` — Home Assistant add-on. `Dockerfile`, `docker-entrypoint.sh`, `.github/workflows/build.yml`.

## Opdrachten
```bash
npm test            # alle tests (node --test)
npm run build       # frontend bouwen naar web/dist
npm run serve       # server lokaal starten op poort 3000 (leest .env)
```

## Uitrollen naar de Raspberry Pi (automatisch)
Repo: https://github.com/yzyr7tqr5t-rgb/hygge-bridge (openbaar). De Pi draait Home Assistant OS op `192.168.0.81`;
de add-on **Hygge bridge** staat op `http://192.168.0.81:3010` en haalt zijn container van `ghcr.io/yzyr7tqr5t-rgb/hygge-bridge`.

Volgende deploy:
1. `npm test` en `npm run build` moeten slagen.
2. Alles committen (de werkmap moet schoon zijn, anders weigert `npm version`).
3. `npm version patch` — verhoogt `package.json` én `hygge_bridge/config.yaml` (via `scripts/sync-version.mjs`) en maakt commit + tag.
   De build in GitHub Actions faalt bewust als die twee versies verschillen.
4. `git push` — Actions bouwt de multi-arch container (~1 min) en zet hem op ghcr.io.
5. Home Assistant ziet de nieuwe versie; met *Automatisch bijwerken* aan installeert de Pi hem zelf. Anders: add-on → **Bijwerken** → **Herstarten**.
6. Controleer: `curl -s http://192.168.0.81:3010/api/state | head -c 200` (bevat `"version":"<nieuwe versie>"`, `"connected":true`)
   en de versie onderaan het scherm **Delen** of in het add-on-logboek (`Hygge-app v… op …`).

Controleer de build met `gh run list --repo yzyr7tqr5t-rgb/hygge-bridge --limit 3`.
Een push naar GitHub en het aanmaken van repositories kan door de permissie-instellingen geblokkeerd worden: zeg dat dan
tegen de gebruiker in plaats van het te omzeilen.

## BluOS-spelers (tab Muziek)
Plan en API-notities: `docs/bluos-plan.md`. Code: `src/bluos.js` (puur), `src/bluos-manager.js` (scan, polling, commando's), `web/src/Music.jsx`.
- Spelers worden gevonden met een scan van poort 11000 op de /24-netwerken (lokaal + dat van `NIKO_HOST`); gevonden IP's staan in `state.json`.
- Transportopdrachten (play/pauze/skip/preset) gaan altijd naar de **leider** van de groep; volume naar de speler zelf; groepsvolume schaalt alle leden.
- Hoes bij radio: `src/cover.js` zoekt bij "ARTIEST - Titel" een hoes via iTunes, daarna Deezer (gratis, zonder sleutel), met strenge controle op artiest en titel en met onthouden resultaten. Daarbij gaan **titel en artiest naar Apple/Deezer**; uitzetten met `BLUOS_COVERS=false`. Het zenderlogo blijft de terugval.
- Test tegen echte spelers uitsluitend met **no-op** commando's (zelfde volume), nooit play/pauze/groeperen: dat verstoort muziek in huis.

## Regels en valkuilen
- **Geheimen:** `.env` (met `NIKO_TOKEN`) en `state.json` staan in `.gitignore` en horen nooit in een commit, log of chatbericht.
  Controleer vóór een commit dat het token nergens in staat. De repo is openbaar.
- **Eén Niko-verbinding:** de controller weigert soms extra MQTT-verbindingen (`connack timeout`). `server.js` gebruikt er één.
  Start geen tweede instantie (bijv. een test-container) terwijl de Mac-server draait: stop die eerst, of test met een andere client.
  De Mac-server (poort 3000) en de Pi-add-on delen dezelfde controller.
- **Echte lichten:** testen bedient het echte huis. Schakel niets aan/uit om te testen zonder reden; gebruik een no-op
  (zelfde helderheid) of zet het meteen terug. Klik in de browser met element-refs, niet met coördinaten.
- **Poort:** op de Pi is poort 3000 al bezet door een andere add-on; de add-on gebruikt daarom 3010 (`ports` in `hygge_bridge/config.yaml`).
- **Instellingen op de Pi** staan in de add-on-configuratie (`niko_host`, `niko_token`, `niko_sensor_uuid`, `latitude`, `longitude`), niet in bestanden.
  Het token typt de gebruiker zelf in; vraag er niet om en schrijf het nergens heen.
- **Wachtwoorden:** nooit zelf invoeren (SSH, Samba). Laat de gebruiker die zelf typen.
- **Zonne-energie:** Niko geeft de omvormer (SMA) niet door; we gebruiken enkel `ElectricalPowerToGrid` (teruglevering). Zon-info is 's nachts verborgen (`LATITUDE`/`LONGITUDE`, standaard Brussel).
- **Docker lokaal testen:** `docker build -t hygge-bridge:test .` werkt; Docker Desktop moet draaien (`open -a Docker`).
  De afhankelijkheden zijn puur JavaScript, daarom bouwt de Dockerfile zonder emulatie op de bouwserver.
