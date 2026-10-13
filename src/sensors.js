// Splitst NIKO_SENSOR_UUID / NIKO_SENSOR_NAME (komma-gescheiden) in een lijst sensoren.

const list = (value) => String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export function listSensors({ sensorUuid, sensorName }) {
  const uuids = list(sensorUuid);
  if (uuids.length) return uuids.map((uuid) => ({ sensorUuid: uuid, sensorName: '' }));
  return list(sensorName).map((name) => ({ sensorName: name, sensorUuid: '' }));
}
