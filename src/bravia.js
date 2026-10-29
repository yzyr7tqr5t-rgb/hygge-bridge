// Sony Bravia-tv aan/uit zetten via de IP-bediening (REST + IRCC) van de tv.
// Aan: setPowerStatus. Uit: de IRCC-toets PowerOff (setPowerStatus false zet de KD-55AG9 niet uit).
// De sleutel (PSK) is wat de gebruiker in de tv instelde onder Netwerk > IP-bediening > Voorgedeelde sleutel.

import { EventEmitter } from 'node:events';

const REQUEST_TIMEOUT_MS = 4000;
// IRCC-code van PowerOff; wordt bij voorkeur uit de tv zelf gelezen (getRemoteControllerInfo).
export const POWER_OFF_CODE = 'AAAAAQAAAAEAAAAvAw==';

/** JSON-RPC-body voor de Bravia-API. */
export function rpcBody(method, params = []) {
  return JSON.stringify({ method, id: 1, params, version: '1.0' });
}

/** SOAP-envelop voor één IRCC-toets. */
export function irccBody(code) {
  return `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1"><IRCCCode>${code}</IRCCCode></u:X_SendIRCC></s:Body></s:Envelope>`;
}

/** 'active' | 'standby' | null uit het antwoord van getPowerStatus. */
export function parsePower(json) {
  const status = json?.result?.[0]?.status;
  return status === 'active' || status === 'standby' ? status : null;
}

/** IRCC-code van een toets (zoals 'PowerOff') uit het antwoord van getRemoteControllerInfo. */
export function findKeyCode(json, name) {
  const keys = json?.result?.[1];
  return Array.isArray(keys) ? keys.find((k) => k?.name === name)?.value ?? null : null;
}

export class BraviaTv extends EventEmitter {
  /** @param opts.host IP van de tv; @param opts.psk voorgedeelde sleutel; zonder beide is de tv niet ingesteld. */
  constructor({ host = '', psk = '', fetchImpl = fetch, pollMs = 10_000 } = {}) {
    super();
    this.host = host;
    this.psk = psk;
    this.fetch = fetchImpl;
    this.pollMs = pollMs;
    this.power = null; // 'active' | 'standby' | null (onbekend / onbereikbaar)
    this.timer = null;
  }

  get configured() {
    return Boolean(this.host && this.psk);
  }

  snapshot() {
    return { configured: this.configured, power: this.power };
  }

  async rpc(service, method, params) {
    const res = await this.fetch(`http://${this.host}/sony/${service}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-PSK': this.psk },
      body: rpcBody(method, params),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`tv gaf ${res.status} (sleutel fout of IP-bediening uit?)`);
    const json = await res.json();
    if (json.error) throw new Error(`tv-fout ${json.error[0]}: ${json.error[1]}`);
    return json;
  }

  async sendKey(code) {
    const res = await this.fetch(`http://${this.host}/sony/ircc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=UTF-8',
        SOAPACTION: '"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"',
        'X-Auth-PSK': this.psk,
      },
      body: irccBody(code),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`tv gaf ${res.status} op de toets`);
  }

  setPower(power) {
    if (this.power === power) return;
    this.power = power;
    this.emit('update', this.snapshot());
  }

  /** Leest de stand van de tv; onbereikbaar telt als onbekend (null). */
  async refresh() {
    if (!this.configured) return this.power;
    try {
      this.setPower(parsePower(await this.rpc('system', 'getPowerStatus')));
    } catch {
      this.setPower(null);
    }
    return this.power;
  }

  /** action: 'on' | 'off'. Werkt de weergave meteen bij en controleert daarna wat de tv echt doet. */
  async command(action) {
    if (!this.configured) throw new Error('tv niet ingesteld (BRAVIA_HOST en BRAVIA_PSK)');
    if (action === 'on') {
      await this.rpc('system', 'setPowerStatus', [{ status: true }]);
      this.setPower('active');
    } else if (action === 'off') {
      let code = POWER_OFF_CODE;
      try { code = findKeyCode(await this.rpc('system', 'getRemoteControllerInfo'), 'PowerOff') ?? code; } catch { /* vaste code */ }
      await this.sendKey(code);
      this.setPower('standby');
    } else {
      throw new Error(`onbekende tv-actie: ${action}`);
    }
    setTimeout(() => this.refresh(), 3000).unref();
  }

  start() {
    if (!this.configured) return;
    this.refresh();
    this.timer = setInterval(() => this.refresh(), this.pollMs);
    this.timer.unref();
  }

  stop() {
    clearInterval(this.timer);
  }
}
