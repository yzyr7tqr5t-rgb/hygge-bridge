// Verbinding met de Niko Home Control II Connected Controller via de Hobby API.
// De Hobby API is een lokale MQTT-broker (TLS, poort 8884). Gebruikersnaam is
// "hobby", wachtwoord is het JWT-token uit mynikohomecontrol.niko.eu.

import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import mqtt from 'mqtt';

const TEMPERATURE_PROPERTY = 'AmbientTemperature';

/** Haalt de lijst toestellen uit een Niko-bericht ({ Params: [{ Devices: [...] }] }). */
export function extractDevices(message) {
  const params = Array.isArray(message?.Params) ? message.Params : [];
  const withDevices = params.find((p) => p && Array.isArray(p.Devices));
  return withDevices ? withDevices.Devices : [];
}

/** Zet Niko's lijst van { sleutel: waarde }-objecten om naar één object. */
export function propertiesToObject(properties) {
  const out = {};
  for (const entry of Array.isArray(properties) ? properties : []) {
    Object.assign(out, entry);
  }
  return out;
}

/** Leest de omgevingstemperatuur (°C) uit een toestel, of null als die er niet is. */
export function readTemperature(device) {
  const raw = propertiesToObject(device?.Properties)[TEMPERATURE_PROPERTY];
  if (raw === undefined || raw === null || raw === '') return null;
  const value = Number(String(raw).replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/** Zoekt de gekozen sensor in de toestellenlijst, op UUID of (hoofdletterongevoelig) op naam. */
export function findSensor(devices, { sensorUuid, sensorName }) {
  if (sensorUuid) return devices.find((d) => d.Uuid === sensorUuid) ?? null;
  const wanted = sensorName.trim().toLowerCase();
  const matches = devices.filter((d) => String(d.Name ?? '').trim().toLowerCase() === wanted);
  // Bij dubbele namen (bv. een thermostaat én een sensor "Woonkamer") de variant met temperatuur nemen.
  return matches.find((d) => readTemperature(d) !== null) ?? matches[0] ?? null;
}

/**
 * Events:
 *  - 'connect'                    verbonden met de controller
 *  - 'devices' (devices[])        volledige toestellenlijst ontvangen
 *  - 'temperature' (°C, device)   nieuwe meting van de gekozen sensor
 *  - 'update' (devices[])         statuswijziging van één of meer toestellen (gedeeltelijke Properties)
 *  - 'error' (Error)
 *  - 'offline'
 */
export class NikoClient extends EventEmitter {
  constructor({ host, port, username, token, caFile, sensorName = '', sensorUuid = '' }) {
    super();
    this.options = { host, port, username, token, caFile };
    this.sensorName = sensorName;
    this.sensorUuid = sensorUuid;
    this.sensorUuidResolved = sensorUuid || null;
    this.sensorDisplayName = sensorName || sensorUuid;
    this.closing = false;
    this.topics = {
      cmd: `${username}/control/devices/cmd`,
      rsp: `${username}/control/devices/rsp`,
      evt: `${username}/control/devices/evt`,
    };
    this.client = null;
  }

  connect() {
    const { host, port, username, token, caFile } = this.options;
    this.client = mqtt.connect({
      protocol: 'mqtts',
      host,
      port,
      username,
      password: token,
      protocolVersion: 4,
      clientId: `hygge-bridge-${Math.random().toString(16).slice(2, 10)}`,
      ca: readFileSync(caFile),
      rejectUnauthorized: true,
      // Het certificaat van de controller bevat geen hostnaam/IP: enkel de CA-keten controleren.
      checkServerIdentity: () => undefined,
      reconnectPeriod: 10_000,
      connectTimeout: 15_000,
    });

    this.client.on('connect', () => {
      this.client.subscribe([this.topics.rsp, this.topics.evt], { qos: 1 }, (err) => {
        if (err) return this.emit('error', err);
        this.requestDeviceList();
      });
      this.emit('connect');
    });
    this.client.on('message', (topic, payload) => this.handleMessage(topic, payload));
    this.client.on('error', (err) => !this.closing && this.emit('error', err));
    this.client.on('offline', () => !this.closing && this.emit('offline'));
    return this;
  }

  requestDeviceList() {
    this.client?.publish(this.topics.cmd, JSON.stringify({ Method: 'devices.list' }), { qos: 1 });
  }

  /** Stuurt commando's naar toestellen: [{ Uuid, Properties: [{ Status: 'On' }] }]. */
  control(devices) {
    this.client?.publish(this.topics.cmd, JSON.stringify({ Method: 'devices.control', Params: [{ Devices: devices }] }), { qos: 1 });
  }

  handleMessage(topic, payload) {
    let message;
    try {
      message = JSON.parse(payload.toString());
    } catch {
      return; // geen JSON: negeren
    }
    const devices = extractDevices(message);

    if (topic === this.topics.rsp && message.Method === 'devices.list') {
      this.emit('devices', devices);
      const sensor = findSensor(devices, { sensorUuid: this.sensorUuid, sensorName: this.sensorName });
      if (!sensor) {
        if (this.sensorName || this.sensorUuid) {
          this.emit('error', new Error(
            `Sensor "${this.sensorUuid || this.sensorName}" niet gevonden. Voer "npm run devices" uit om de namen te zien.`,
          ));
        }
        return;
      }
      this.sensorUuidResolved = sensor.Uuid;
      this.sensorDisplayName = sensor.Name ?? sensor.Uuid;
      this.emitTemperature(sensor);
      return;
    }

    if (topic === this.topics.rsp && message.Method === 'devices.control') {
      const code = message.ErrCode ?? message.Params?.[0]?.ErrCode;
      if (code !== undefined && String(code) !== '0') this.emit('error', new Error(`Niko weigerde het commando (${code}): ${message.ErrMessage ?? ''}`));
      return;
    }

    if (topic === this.topics.evt && ['devices.status', 'devices.changed'].includes(message.Method)) {
      this.emit('update', devices);
      const update = devices.find((d) => d.Uuid === this.sensorUuidResolved);
      if (update) this.emitTemperature(update);
      return;
    }

    if (topic === this.topics.evt && ['devices.added', 'devices.removed'].includes(message.Method)) {
      this.requestDeviceList(); // configuratie gewijzigd: sensor opnieuw opzoeken
    }
  }

  emitTemperature(device) {
    const temperature = readTemperature(device);
    if (temperature !== null) this.emit('temperature', temperature, { Name: this.sensorDisplayName, ...device });
  }

  close() {
    this.closing = true;
    return new Promise((resolve) => (this.client ? this.client.end(false, {}, resolve) : resolve()));
  }
}
