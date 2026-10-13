# Plan: BluOS-spelers bedienen (tab "Muziek")

## Wat er op het netwerk staat (gemeten)
| Speler | IP | Rol nu |
|---|---|---|
| PULSE FLEX – Keuken | 192.168.0.187 | **groepsleider** |
| POWERNODE – Living | 192.168.0.184 | lid |
| PULSE FLEX – Berging | 192.168.0.151 | lid |

Groep "PULSE FLEX – Keuken + 2", speelt TuneIn (VRT Radio 2 Limburg), groepsvolume 7. Negen favorieten (presets): radio + Spotify-lijsten.

## BluOS-API (HTTP, poort 11000, XML) – wat we gebruiken
| Doel | Aanroep |
|---|---|
| Speler herkennen, rol en leden | `GET /SyncStatus` (`<master>` = lid van die leider, `<slave>` = leden van deze leider, niets = alleen) |
| Wat speelt er, groepsvolume | `GET /Status` (`groupVolume`, `title1/2/3`, `image`, `state`) – altijd bij de **leider** vragen |
| Bedienen | `/Play`, `/Pause`, `/Stop`, `/Skip`, `/Back` – naar de **leider** |
| Favorieten | `GET /Presets`, `GET /Preset?id=N` |
| Volume per speler | `GET /Volume?level=0..100`, `?mute=0|1` – naar die speler zelf |
| Groeperen | op de leider: `/AddSlave?slave=IP&port=11000`, `/RemoveSlave?slave=IP&port=11000` |

**Groepsvolume** zetten we zelf: elke speler krijgt hetzelfde aandeel mee (verhoudingen blijven gelijk), want de API heeft geen betrouwbare groepsopdracht.

## Spelers vinden ("scan het netwerk")
1. Bewaarde IP's uit `state.json` (staan direct in de lijst na een herstart).
2. Subnet-scan op poort 11000 van elk lokaal /24-netwerk, plus het netwerk van `NIKO_HOST` (de add-on in Home Assistant zit in een eigen containernetwerk en ziet anders het LAN niet).
3. Optioneel `BLUOS_HOSTS` (vaste IP's) en `BLUOS_SUBNETS` in `.env`.
4. Elke 10 minuten opnieuw, en met de knop **Zoeken** in de app.
5. Fase 2: mDNS (`_musc._tcp`) erbij voor spelers buiten het subnet.

## Scherm (tab "Muziek")
- Eén **kaart per zone** (groep of losse speler): grote hoes, titel/artiest, ⏮ ⏯ ⏭, groepsvolume met mute.
- **Leden** onder de kaart: naam, model, badge **Leider**, eigen volumeregelaar, offline-melding.
- **Groeperen**: knop "Speler toevoegen" opent een lijst; "Uit groep halen" bij een lid; "Groep opheffen".
- **Favorieten**: horizontaal scrollende tegels met de hoes; tik = afspelen op die zone.
- Live bijwerken via de bestaande server-verbinding; volume voelt direct (optimistisch).

## Fasen
1. **Eerste resultaat (nu, lokaal)**: vinden, tonen, afspelen/pauze/volgende, volume per speler en groep, favorieten, groeperen/ontkoppelen, Zoeken-knop.
2. **Leider wisselen** ("Maak leider": groep opnieuw opbouwen met een andere leider), slepen om te groeperen, bediening op het vergrendelscherm-formaat.
3. **mDNS-ontdekking**, zoeken in bronnen (Spotify, TuneIn) en afspeellijst/wachtrij.
4. **Uitrollen naar de Pi** (versie verhogen, pushen; eventueel `BLUOS_SUBNETS` in de add-on-opties).

## Risico's
- Een commando naar een lid in plaats van de leider doet niets of verwart de groep → de server stuurt transportopdrachten altijd naar de leider.
- Leiderwissel stopt waarschijnlijk de muziek kort → pas in fase 2, met bevestiging.
- Alleen IP's die we zelf gevonden hebben mogen bediend worden (geen vrije URL's → geen misbruik via de server).
- Tests sturen geen opdrachten naar echte spelers die geluid of groepen wijzigen.
