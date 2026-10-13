# Hygge-bridge

Leest een temperatuursensor uit **Niko Home Control II** en stuurt daarmee de
**Seitron Hygge** (via de **Hygge Way**-gateway) aan. Zo regelt je verwarming op
de temperatuur die Niko meet, in plaats van op de sensor in de Hygge-thermostaat zelf.

```
 Niko-sensor ──MQTT/TLS──▶ hygge-bridge ──HTTPS──▶ IFTTT ──▶ Seitron Smart-cloud ──▶ Hygge Way ──▶ ketel
 (lokaal, Hobby API)       (Raspberry Pi/PC)        (Webhooks)   (officiële service)
```

## Hoe het regelt

| Niko meet                                | Bridge stuurt naar de Hygge             |
|------------------------------------------|-----------------------------------------|
| lager dan `TARGET_TEMP − HYSTERESIS`     | `HEAT_SETPOINT` (bv. 25 °C) → ketel aan |
| hoger dan `TARGET_TEMP + HYSTERESIS`     | `IDLE_SETPOINT` (bv. 12 °C) → ketel uit |
| daartussen                               | niets, huidige toestand blijft          |
| `STALE_AFTER_MIN` geen meting            | Hygge terug naar eigen weekprogramma    |
| bridge stopt (Ctrl+C / systemd stop)     | Hygge terug naar eigen weekprogramma    |

Tussen twee wissels zit minstens `MIN_SWITCH_INTERVAL_MIN` minuten (ketel sparen,
IFTTT-limieten). Valt de bridge of je netwerk weg, dan valt de Hygge dus altijd
terug op zijn eigen programma: je zit nooit in de kou. `IDLE_SETPOINT` werkt ook
als vorstbeveiliging.

## Wat heb je nodig

- Niko Home Control **II** met Connected Controller, softwareversie 2.17 of nieuwer
- Seitron Hygge Home-kit met Hygge Way-gateway, gekoppeld in de **Seitron Smart**-app
- Een (gratis) **IFTTT**-account
- Een toestel dat altijd aan staat in je thuisnetwerk met **Node.js 20.6+** (Raspberry Pi, NAS, pc)

## Installatie

### 1. Niko Hobby API activeren

1. Log in op [mynikohomecontrol.niko.eu](https://mynikohomecontrol.niko.eu) en ga naar je installatie.
2. Activeer de **Hobby API** (onder *Connected services*) en kopieer het **token** (een lange JWT; één jaar geldig — zet een herinnering om het te vernieuwen).
3. Zoek het IP-adres van je Connected Controller (in je router of de Niko-app). Geef het best een vast IP.

### 2. Seitron koppelen via IFTTT

Seitron heeft geen publieke API; de officiële koppeling voor derden is de
[Seitron Smart-service op IFTTT](https://ifttt.com/seitronsmart).

1. Verbind in IFTTT de services **Seitron Smart** (log in met je Seitron Smart-account) en **Webhooks**.
2. Haal je Webhooks-sleutel op via [ifttt.com/maker_webhooks/settings](https://ifttt.com/maker_webhooks/settings) — het stuk na `https://maker.ifttt.com/use/`.
3. Maak **applet 1**:
   - *If*: Webhooks → **Receive a web request**, event name `hygge_set_temperature`
   - *Then*: Seitron Smart → **Set temperature**, kies je Hygge-thermostaat en vul bij de temperatuur het ingrediënt **`{{Value1}}`** in.
4. Maak **applet 2**:
   - *If*: Webhooks → **Receive a web request**, event name `hygge_auto`
   - *Then*: Seitron Smart → **Switch to scheduled mode** (terug naar het weekprogramma).

### 3. Bridge installeren

```bash
cd hygge-bridge
npm install
cp .env.example .env     # en vul NIKO_HOST, NIKO_TOKEN en IFTTT_KEY in
npm run devices          # toont alle Niko-toestellen met een temperatuur
```

Zet de juiste naam (of UUID) in `NIKO_SENSOR_NAME` / `NIKO_SENSOR_UUID`. Test daarna eerst droog:

```bash
DRY_RUN=true npm start   # logt wat er zou gebeuren, verstuurt niets
npm start                # echt aansturen
```

### 4. Automatisch starten (Raspberry Pi / Linux)

```bash
sudo cp hygge-bridge.service /etc/systemd/system/   # pas User en WorkingDirectory aan
sudo systemctl enable --now hygge-bridge
journalctl -u hygge-bridge -f                        # logs volgen
```

## Instellingen (`.env`)

| Variabele                  | Standaard | Betekenis                                              |
|----------------------------|-----------|--------------------------------------------------------|
| `TARGET_TEMP`              | 21        | Gewenste temperatuur (°C) volgens de Niko-sensor       |
| `HYSTERESIS`               | 0,3       | Schakelmarge (°C) rond het doel                        |
| `HEAT_SETPOINT`            | 25        | Setpoint naar de Hygge om te verwarmen                 |
| `IDLE_SETPOINT`            | 12        | Setpoint naar de Hygge om niet te verwarmen            |
| `MIN_SWITCH_INTERVAL_MIN`  | 10        | Minimum minuten tussen twee wissels                    |
| `STALE_AFTER_MIN`          | 30        | Minuten zonder meting → terug naar weekprogramma       |
| `RESEND_AFTER_MIN`         | 60        | Huidig commando herhalen na zoveel minuten (0 = nooit) |
| `DRY_RUN`                  | false     | `true` = enkel loggen                                  |

Kommagetallen mogen met komma of punt (`20,5` of `20.5`).

## Goed om te weten

- **Vertraging:** de Niko-kant is direct (lokaal). Het commando naar de Hygge gaat
  via IFTTT en de Seitron-cloud; reken op enkele seconden tot een minuut. Voor
  verwarming is dat ruim voldoende.
- **De Hygge blijft zelf ook meten.** Daarom stuurt de bridge "extreme" setpoints:
  25 °C forceert de ketel aan, 12 °C forceert hem uit. Pas ze aan als je Hygge op
  een koudere of warmere plek hangt.
- **Token verlopen?** Na een jaar weigert de controller de verbinding
  (`Not authorized` in de logs). Vernieuw het token op mynikohomecontrol en pas `.env` aan.

## Testen

```bash
npm test
```

## Dashboard-app (iPhone) en automatische uitrol

`npm run build && npm run serve` start de webapp (licht, klimaat, energie) op poort 3000.

Op een Raspberry Pi met Home Assistant OS draait ze als add-on, die vanzelf bijwerkt:

1. GitHub Actions bouwt bij elke push naar `main` de container en zet hem op ghcr.io.
2. In Home Assistant: *Instellingen → Add-ons → Add-on store → ⋮ → Repositories* en voeg
   `https://github.com/yzyr7tqr5t-rgb/hygge-bridge` toe. Installeer **Hygge bridge**, vul op het tabblad
   *Configuratie* het controller-IP, het token en de sensoren in, en zet *Automatisch bijwerken* aan.
3. Nieuwe versie uitrollen:

```bash
npm version patch      # verhoogt het versienummer in package.json én in de add-on
git push
```

Zonder Home Assistant kan de container ook gewoon met `docker compose up -d --build` draaien (instellingen uit `.env`).
