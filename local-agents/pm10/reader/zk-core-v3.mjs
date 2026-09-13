#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-2.0-only
 * Piloto adaptado el 2026-09-10; referencia AUTH: fananimi/pyzk (GPL v2).
 * MuniControl - identificacion acotada ZKTeco sobre TCP.
 * Implementacion de diagnostico, NO driver productivo ni API oficial.
 * Sin dependencias npm. Una sola autenticacion con CommKey conocida, solo
 * con aprobacion explicita. No lee fichadas/plantillas ni modifica el reloj.
 * Protocolo de referencia: ver REFERENCIAS.md.
 */
import net from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export const TARGET = '172.100.97.131';
export const PORT = 4370;
const MAGIC = Buffer.from([0x50, 0x50, 0x82, 0x7d]);
const MAX_INNER = 8192;
const NAMES = new Map([[1000, 'CONNECT'], [1001, 'EXIT'], [1102, 'AUTH'], [1100, 'GET_VERSION'],
  [11, 'OPTIONS_READ'], [201, 'GET_TIME'], [50, 'GET_COUNTS']]);
const OPTIONS = new Set(['~SerialNumber\0', '~DeviceName\0', '~Platform\0']);
const RESPONSE_NAMES = new Map([[2000, 'ACK_OK'], [2001, 'ACK_ERROR'],
  [2005, 'ACK_UNAUTH'], [65535, 'UNKNOWN_COMMAND'], [65533, 'ERROR_COMMAND']]);

function fail(code, message) { const e = new Error(message); e.code = code; throw e; }
function word(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 65535) fail('ARGUMENT_ERROR', label);
}
export function checksum16(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 2) {
    sum += buffer[i] + ((buffer[i + 1] ?? 0) << 8);
    sum = (sum & 0xffff) + (sum >>> 16);
  }
  while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
  return (~sum) & 0xffff;
}

/** Genera solo comandos acotados de lectura/sesion y AUTH de cuatro bytes. */
export function buildRequest(command, session, reply, payload = Buffer.alloc(0)) {
  if (!NAMES.has(command)) fail('COMMAND_NOT_ALLOWED', 'Comando fuera de la lista de lectura.');
  word(session, 'Session invalida'); word(reply, 'Reply invalido');
  if (!Buffer.isBuffer(payload)) fail('ARGUMENT_ERROR', 'Payload debe ser Buffer.');
  if (command === 1102) {
    if (payload.length !== 4) fail('AUTH_PAYLOAD_INVALID', 'AUTH requiere cuatro bytes.');
  } else if (command === 11) {
    if (!OPTIONS.has(payload.toString('ascii'))) fail('OPTION_NOT_ALLOWED', 'Opcion no permitida.');
  } else if (payload.length) fail('PAYLOAD_NOT_ALLOWED', 'El comando debe enviarse sin datos.');
  const inner = Buffer.alloc(8 + payload.length);
  inner.writeUInt16LE(command, 0); inner.writeUInt16LE(session, 4); inner.writeUInt16LE(reply, 6);
  payload.copy(inner, 8);
  inner.writeUInt16LE(checksum16(inner), 2);
  const top = Buffer.alloc(8);
  MAGIC.copy(top); top.writeUInt32LE(inner.length, 4);
  return Buffer.concat([top, inner]);
}

export function decodeInner(inner) {
  if (!Buffer.isBuffer(inner) || inner.length < 8 || inner.length > MAX_INNER) {
    fail('INVALID_FRAME', 'Longitud invalida de respuesta.');
  }
  const result = {
    command: inner.readUInt16LE(0), checksum: inner.readUInt16LE(2),
    session: inner.readUInt16LE(4), reply: inner.readUInt16LE(6),
    payload: inner.subarray(8), checksumValid: checksum16(inner) === 0,
  };
  if (!result.checksumValid) fail('CHECKSUM_MISMATCH', 'Respuesta con checksum no validado; detener y revisar variante.');
  return result;
}

class Channel {
  constructor(socket) {
    this.socket = socket; this.buffer = Buffer.alloc(0); this.pending = null; this.error = null;
    socket.on('data', chunk => {
      if (this.buffer.length + chunk.length > MAX_INNER + 8) {
        this.abort(Object.assign(new Error('Respuesta mayor que el limite de metadatos.'), {code: 'FRAME_TOO_LARGE'}));
        return;
      }
      this.buffer = Buffer.concat([this.buffer, chunk]); this.pump();
    });
    socket.on('error', e => this.abort(e));
    socket.on('end', () => this.abort(Object.assign(new Error('El equipo cerro la conexion.'), {code: 'CONNECTION_ENDED'})));
    socket.on('close', () => this.abort(Object.assign(new Error('Socket cerrado.'), {code: 'CONNECTION_CLOSED'})));
  }
  abort(error) {
    this.error ??= error;
    if (this.pending) {
      const p = this.pending; this.pending = null; clearTimeout(p.timer); p.reject(this.error);
    }
    this.socket.destroy();
  }
  pump() {
    if (!this.pending || this.buffer.length < 8) return;
    if (!this.buffer.subarray(0, 4).equals(MAGIC)) {
      this.abort(Object.assign(new Error('No se recibio la cabecera TCP esperada del protocolo.'), {code: 'PROTOCOL_HEADER_MISMATCH'})); return;
    }
    const length = this.buffer.readUInt32LE(4);
    if (length < 8 || length > MAX_INNER) {
      this.abort(Object.assign(new Error('Longitud de trama fuera del perfil de lectura.'), {code: 'INVALID_FRAME_LENGTH'})); return;
    }
    if (this.buffer.length < length + 8) return;
    const inner = Buffer.from(this.buffer.subarray(8, 8 + length));
    this.buffer = this.buffer.subarray(8 + length);
    const p = this.pending; this.pending = null; clearTimeout(p.timer);
    try { p.resolve(decodeInner(inner)); } catch (e) { p.reject(e); this.abort(e); }
  }
  request(packet, timeoutMs) {
    if (this.error) return Promise.reject(this.error);
    if (this.pending) return Promise.reject(new Error('No se permite concurrencia.'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.abort(Object.assign(new Error('Sin respuesta al comando en el plazo permitido.'), {code: 'RESPONSE_TIMEOUT'})), timeoutMs);
      this.pending = {resolve, reject, timer};
      this.socket.write(packet); this.pump();
    });
  }
}

function cleanText(data) {
  if (data.length > 2048) fail('METADATA_INVALID', 'Texto de metadatos demasiado largo.');
  const end = data.indexOf(0);
  // latin1 preserves unknown device bytes. Never print raw terminal escapes.
  return data.subarray(0, end < 0 ? data.length : end).toString('latin1')
    .replace(/[\x00-\x1f\x7f-\x9f]/g, '?').trim();
}
function optionText(data, key) {
  const value = cleanText(data);
  if (value.startsWith(`${key}=`)) return value.slice(key.length + 1).trim();
  return value;
}
export function decodeClock(data) {
  if (data.length !== 4) fail('CLOCK_LAYOUT_UNKNOWN', 'La hora no tiene el formato esperado de 4 bytes.');
  let value = data.readUInt32LE(0);
  const sec = value % 60; value = Math.floor(value / 60);
  const min = value % 60; value = Math.floor(value / 60);
  const hour = value % 24; value = Math.floor(value / 24);
  const day = value % 31 + 1; value = Math.floor(value / 31);
  const month = value % 12 + 1; const year = Math.floor(value / 12) + 2000;
  const date = new Date(Date.UTC(year, month - 1, day, hour, min, sec));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    fail('CLOCK_INVALID', 'El dispositivo devuelve una fecha civil invalida.');
  }
  return date.toISOString().slice(0, 19); // local device time, NOT UTC
}
export function decodeCounts(data) {
  if (data.length < 80) return {layout: 'unknown', bytes: data.length, counts: null};
  const users = data.readInt32LE(16), records = data.readInt32LE(32);
  if (users < 0 || records < 0) return {layout: 'unknown', bytes: data.length, counts: null};
  return {layout: 'legacy-20-int32le-candidate', bytes: data.length,
    counts: {usersReported: users, attendanceRecordsReported: records},
    note: 'Conteos segun layout de referencia. Confirmar contra pantalla del equipo; no prueban descarga.'};
}


/** Perfil legacy: CommKey numérica conocida, sin valor por defecto. */
export function validateCommKey(secret) {
  if (!Buffer.isBuffer(secret) || secret.length < 1 || secret.length > 6
      || [...secret].some(b => b < 48 || b > 57)) {
    fail('COMMKEY_FORMAT_INVALID', 'La CommKey debe ser la clave conocida de 1 a 6 digitos.');
  }
}

/** AUTH legacy, construido a partir de la clave aportada y la sesion recibida.
 * Referencia del algoritmo: pyzk make_commkey / commpro MakeKey, ver REFERENCIAS.md.
 * No es TLS ni una garantia criptografica moderna. Nunca persiste el resultado.
 */
export function makeAuthPayload(secret, session) {
  validateCommKey(secret); word(session, 'Session invalida');
  let key = 0n;
  for (const digit of secret) key = key * 10n + BigInt(digit - 48);
  let reflected = 0n;
  for (let bit = 0n; bit < 32n; bit++) {
    reflected = (reflected << 1n) | ((key >> bit) & 1n);
  }
  const value = (reflected + BigInt(session)) & 0xffffffffn;
  const a = Number(value & 255n), b = Number((value >> 8n) & 255n);
  const c = Number((value >> 16n) & 255n), d = Number((value >> 24n) & 255n);
  // Byte shuffle and fixed tick byte from the reference legacy wire layout.
  return Buffer.from([c ^ 0x53 ^ 50, d ^ 0x4f ^ 50, 50, b ^ 0x4b ^ 50]);
}

/** Entrada local sin eco, sin argv, variable de entorno, fichero o valor predeterminado.
 * La memoria mutable se limpia al completar; JS/Node no garantiza borrado forense.
 */
export async function promptCommKey({input = process.stdin, output = process.stdout} = {}) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
    fail('INTERACTIVE_TERMINAL_REQUIRED', 'Abrir el CMD interactivo. No se acepta redireccion de claves.');
  }
  return new Promise((resolve, reject) => {
    const storage = Buffer.alloc(6); let length = 0, done = false;
    const originalRaw = input.isRaw === true;
    const finish = (err, result) => {
      if (done) return; done = true;
      input.off('data', onData); input.off('error', onError); input.off('end', onEnd);
      try { input.setRawMode(originalRaw); } catch {}
      input.pause(); storage.fill(0); output.write('\n');
      if (err) reject(err); else resolve(result);
    };
    const error = (code, message) => Object.assign(new Error(message), {code});
    const onError = () => finish(error('INPUT_ERROR', 'Error leyendo la entrada local.'));
    const onEnd = () => finish(error('INPUT_CLOSED', 'Entrada cerrada. Sin conexion al reloj.'));
    const onData = chunk => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      for (const byte of bytes) {
        if (byte === 3 || byte === 27) return finish(error('CANCELLED', 'Prueba cancelada.'));
        if (byte === 13 || byte === 10) {
          if (!length) return finish(error('NO_KEY', 'Clave vacia. No se conecto ni se probo ningun valor.'));
          return finish(null, Buffer.from(storage.subarray(0, length)));
        }
        if (byte === 8 || byte === 127) { if (length) storage[--length] = 0; continue; }
        if (byte < 48 || byte > 57 || length >= storage.length) {
          return finish(error('COMMKEY_FORMAT_INVALID', 'Entrada no valida. No se conecto al reloj.'));
        }
        storage[length++] = byte;
      }
    };
    output.write('CommKey conocida (entrada oculta; ENTER vacio cancela): ');
    input.on('data', onData); input.once('error', onError); input.once('end', onEnd);
    input.setRawMode(true); input.resume();
  });
}

/** Solo el host municipal identificado, o loopback para tests. Sin escaneos. */
export async function identify({host = TARGET, port = PORT, timeoutMs = 6000, pacingMs = 200, commKey = null, approvedOneAttempt = false} = {}) {
  if (!(host === TARGET && port === PORT) && host !== '127.0.0.1') {
    fail('TARGET_NOT_ALLOWED', 'Este piloto solo permite el reloj identificado o loopback para pruebas.');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail('ARGUMENT_ERROR', 'Puerto invalido.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 15000) fail('ARGUMENT_ERROR', 'Timeout invalido.');
  if (commKey !== null) {
    if (approvedOneAttempt !== true) {
      if (Buffer.isBuffer(commKey)) commKey.fill(0);
      fail('AUTH_APPROVAL_REQUIRED', 'Se requiere aprobacion de un solo intento conocido.');
    }
    try { validateCommKey(commKey); } catch (e) { if (Buffer.isBuffer(commKey)) commKey.fill(0); throw e; }
  }
  const report = {
    schemaVersion: 'municontrol.zk-knownkey-pilot.v2',
    startedAt: new Date().toISOString(), finishedAt: null,
    endpoint: {host, port, transport: 'tcp'},
    status: 'STARTED', tcpConnected: false, protocolResponseValidated: false,
    sessionAcceptedWithoutCommKey: false, authenticationAccepted: false, credentialAttempts: 0,
    attendanceDownloaded: false, biometricTemplatesRead: false,
    metadata: {}, observations: [], exchanges: [], error: null,
    note: 'Una clave conocida como maximo por ejecucion. No hay recuperacion ni busqueda de claves. AUTH aun no homologado contra el reloj real.',
  };
  const socket = new net.Socket(); const channel = new Channel(socket);
  let session = 0, previousReply = 65534, sessionOpen = false;
  const exchange = async (command, payload = Buffer.alloc(0)) => {
    const sentReply = (previousReply + 1) % 65535;
    const trace = {command: NAMES.get(command), code: command, startedAt: new Date().toISOString()};
    report.exchanges.push(trace);
    const packet = buildRequest(command, session, sentReply, payload);
    let result;
    try { result = await channel.request(packet, timeoutMs); }
    finally { if (command === 1102) packet.fill(0); }
    trace.responseCode = result.command;
    trace.response = RESPONSE_NAMES.get(result.command) ?? `CODE_${result.command}`;
    trace.payloadBytes = result.payload.length;
    trace.checksumValidated = result.checksumValid;
    trace.replyIdMatches = result.reply === sentReply;
    if (command !== 1000 && result.session !== session) fail('SESSION_MISMATCH', 'La respuesta pertenece a otra sesion.');
    if (!trace.replyIdMatches) fail('REPLY_MISMATCH', 'Respuesta de otro comando. No se reintenta.');
    previousReply = result.reply;
    return result;
  };
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.destroy(); reject(Object.assign(new Error('Timeout de conexion TCP.'), {code: 'TCP_CONNECT_TIMEOUT'})); }, timeoutMs);
      const onError = e => { clearTimeout(timer); reject(e); };
      socket.once('error', onError);
      socket.connect({host, port, family: 4}, () => {
        clearTimeout(timer); socket.off('error', onError); resolve();
      });
    });
    report.tcpConnected = true;
    const hello = await exchange(1000);
    if (![2000, 2005].includes(hello.command)) {
      report.status = 'SESSION_REJECTED';
      report.observations.push(`CONNECT devolvio ${hello.command}; no se consultaron datos.`);
      return report;
    }
    report.protocolResponseValidated = true;
    session = hello.session;
    if (hello.command === 2005) {
      if (commKey === null) {
        report.status = 'COMMKEY_REQUIRED';
        report.observations.push('Falta la clave conocida. No se probo ninguna clave.');
        return report;
      }
      const authPayload = makeAuthPayload(commKey, session);
      commKey.fill(0);
      let auth;
      try {
        report.credentialAttempts = 1;
        auth = await exchange(1102, authPayload);
      } finally { authPayload.fill(0); }
      if (auth.command !== 2000) {
        report.status = 'AUTH_NOT_ACCEPTED';
        report.observations.push('La autenticacion no fue aceptada. No se probaron alternativas ni reintentos.');
        return report;
      }
      report.authenticationAccepted = true;
    } else {
      report.sessionAcceptedWithoutCommKey = true;
      if (commKey !== null) commKey.fill(0);
    }
    sessionOpen = true;
    const queries = [
      ['serialNumber', 11, Buffer.from('~SerialNumber\0', 'ascii'), d => optionText(d, '~SerialNumber')],
      ['firmware', 1100, Buffer.alloc(0), cleanText],
      ['deviceName', 11, Buffer.from('~DeviceName\0', 'ascii'), d => optionText(d, '~DeviceName')],
      ['platform', 11, Buffer.from('~Platform\0', 'ascii'), d => optionText(d, '~Platform')],
      ['deviceTimeLocal', 201, Buffer.alloc(0), decodeClock],
      ['reportedCounts', 50, Buffer.alloc(0), decodeCounts],
    ];
    for (const [field, code, payload, decoder] of queries) {
      await delay(pacingMs);
      const result = await exchange(code, payload);
      if (result.command === 2005) { report.status = 'COMMKEY_REQUIRED'; break; }
      if (result.command !== 2000) {
        report.metadata[field] = null;
        report.observations.push(`${field}: respuesta ${result.command}; no se reintento.`);
        continue;
      }
      try { report.metadata[field] = decoder(result.payload); }
      catch (e) {
        report.metadata[field] = null;
        report.observations.push(`${field}: ${e.code ?? 'DECODE_ERROR'}; revisar layout.`);
      }
    }
    if (report.status === 'STARTED') {
      const complete = Object.keys(report.metadata).length === 6 && Object.values(report.metadata).every(v => v != null && v !== '') && report.metadata.reportedCounts?.counts != null;
      report.status = complete ? 'METADATA_READ_OK' : 'METADATA_PARTIAL';
    }
  } catch (e) {
    report.status = report.tcpConnected ? 'PROTOCOL_READ_FAILED' : 'TCP_CONNECTION_FAILED';
    report.error = {code: e.code ?? 'UNKNOWN', message: String(e.message).slice(0, 240)};
  } finally {
    if (sessionOpen && !channel.error) {
      try { await exchange(1001); }
      catch { report.observations.push('EXIT sin confirmacion. Se cerro el socket; no se reintento.'); }
    }
    if (commKey !== null) commKey.fill(0);
    socket.destroy(); report.finishedAt = new Date().toISOString();
  }
  return report;
}


async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--run') {
    console.log('Uso: node municontrol-zk-autenticar.mjs --run');
    console.log('Solo clave conocida por entrada oculta. No pasar claves por argumentos.');
    process.exitCode = 2; return;
  }
  if (Number(process.versions.node.split('.')[0]) < 18) {
    fail('NODE_VERSION', 'Requiere Node.js 18 o posterior.');
  }
  console.log('Piloto autonomo GPL-2.0, sin garantia. Ver REFERENCIAS.md y LICENSE-GPL-2.0.txt.');
  console.log(`Destino fijo ${TARGET}:${PORT}, TCP. VPN conectada en esta computadora.`);
  console.log('UNA autenticacion con una clave conocida. Sin reintentos ni claves predeterminadas.');
  console.log('No introducir suposiciones. ENTER vacio o ESC cancela sin conectar.');
  console.log('Solo metadatos; no descarga fichadas, usuarios ni biometria.');
  const commKey = await promptCommKey();
  try {
    const base = path.dirname(fileURLToPath(import.meta.url));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const out = path.join(base, 'resultados', `${stamp}-${randomBytes(3).toString('hex')}`);
    await mkdir(out, {recursive: true});
    console.log('Ejecutando una sesion. No abrir otro colector sobre este reloj en paralelo.');
    const report = await identify({commKey, approvedOneAttempt: true});
    const jsonPath = path.join(out, 'identificacion-autenticada.json');
    await writeFile(jsonPath, JSON.stringify(report, null, 2)+'\n', {encoding:'utf8',flag:'wx',mode:0o600});
    const lines = [
      `Estado: ${report.status}`,
      `TCP conectado: ${report.tcpConnected}`,
      `Respuesta inicial de protocolo validada: ${report.protocolResponseValidated}`,
      `Intentos de autenticacion: ${report.credentialAttempts}`,
      `Autenticacion aceptada: ${report.authenticationAccepted}`,
      `Serial: ${report.metadata.serialNumber ?? 'pendiente'}`,
      `Firmware: ${report.metadata.firmware ?? 'pendiente'}`,
      `Modelo declarado: ${report.metadata.deviceName ?? 'pendiente'}`,
      `Hora declarada por el reloj: ${report.metadata.deviceTimeLocal ?? 'pendiente'}`,
      'Fichadas y biometria: no consultadas. Sin escritura en Neon, GRH o el reloj.',
      ...report.observations,
      ...(report.error ? [`Error: ${report.error.code}`] : []),
    ];
    await writeFile(path.join(out,'resumen.txt'),lines.join('\n')+'\n',{encoding:'utf8',flag:'wx',mode:0o600});
    console.log(lines.join('\n'));
    console.log(`Resultado (no contiene la clave):\n${jsonPath}`);
    process.exitCode = ['METADATA_READ_OK','METADATA_PARTIAL'].includes(report.status) ? 0 : 3;
  } finally { commKey.fill(0); }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(e => { console.error(`Error: ${e.code ?? 'LOCAL_ERROR'}. ${String(e.message).slice(0,240)}`); process.exitCode=2; });
}
