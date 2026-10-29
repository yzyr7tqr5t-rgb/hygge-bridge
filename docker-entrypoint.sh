#!/bin/sh
# Als de container als Home Assistant add-on draait, komen de instellingen uit /data/options.json;
# anders (gewone Docker) uit de omgevingsvariabelen.
if [ -f /data/options.json ]; then
  opt() { node -p "String(require('/data/options.json')['$1'] ?? '')"; }
  export NIKO_HOST="$(opt niko_host)"
  export NIKO_TOKEN="$(opt niko_token)"
  export NIKO_SENSOR_UUID="$(opt niko_sensor_uuid)"
  export LATITUDE="$(opt latitude)"
  export LONGITUDE="$(opt longitude)"
  export BRAVIA_HOST="$(opt bravia_host)"
  export BRAVIA_PSK="$(opt bravia_psk)"
fi
exec node /app/src/server.js
