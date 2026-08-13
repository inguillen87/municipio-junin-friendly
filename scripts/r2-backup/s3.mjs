import { createHash, createHmac } from 'node:crypto';
import { createReadStream } from 'node:fs';
import https from 'node:https';

const REGION = 'auto';
const SERVICE = 's3';
const MAX_ERROR_BODY_BYTES = 64 * 1024;
const MAX_SINGLE_PUT_BYTES = 5 * 1024 * 1024 * 1024;

function required(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  return value.trim();
}

export function validateBucket(value) {
  const bucket = required(value, 'bucket');
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error('bucket must be 3-63 lowercase letters, numbers, or hyphens');
  }
  return bucket;
}

export function credentialsFromEnvironment(environment = process.env) {
  const accountId = required(environment.R2_ACCOUNT_ID, 'R2_ACCOUNT_ID');
  if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new Error('R2_ACCOUNT_ID must be a 32-character hexadecimal account id');
  const accessKeyId = required(environment.R2_ACCESS_KEY_ID, 'R2_ACCESS_KEY_ID');
  const secretAccessKey = required(environment.R2_SECRET_ACCESS_KEY, 'R2_SECRET_ACCESS_KEY');
  const sessionToken = environment.R2_SESSION_TOKEN?.trim() || undefined;
  if (!/^[A-Za-z0-9]+$/.test(accessKeyId)) throw new Error('R2_ACCESS_KEY_ID contains invalid characters');
  if (/\r|\n/.test(secretAccessKey) || (sessionToken && /\r|\n/.test(sessionToken))) {
    throw new Error('R2 credentials contain invalid control characters');
  }
  const jurisdiction = environment.R2_JURISDICTION?.trim().toLowerCase() || undefined;
  if (jurisdiction && !/^[a-z0-9-]+$/.test(jurisdiction)) throw new Error('R2_JURISDICTION is invalid');
  return { accountId: accountId.toLowerCase(), accessKeyId, secretAccessKey, sessionToken, jurisdiction };
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding) {
  return createHmac('sha256', key).update(value).digest(encoding);
}

function awsEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function canonicalObjectPath(bucket, key) {
  const safeBucket = validateBucket(bucket);
  const safeKey = required(key, 'key');
  if (safeKey.startsWith('/') || safeKey.includes('..') || /[\u0000-\u001f\u007f]/.test(safeKey)) {
    throw new Error('object key is unsafe');
  }
  return `/${awsEncode(safeBucket)}/${safeKey.split('/').map(awsEncode).join('/')}`;
}

function amzTimestamp(now) {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function normalizeHeaderValue(value) {
  return String(value).trim().replace(/\s+/g, ' ');
}

export function signS3Request({
  method,
  bucket,
  key,
  headers = {},
  payloadSha256,
  credentials,
  now = new Date(),
}) {
  const amzDate = amzTimestamp(now);
  const dateStamp = amzDate.slice(0, 8);
  const jurisdictionPart = credentials.jurisdiction ? `.${credentials.jurisdiction}` : '';
  const host = `${credentials.accountId}${jurisdictionPart}.r2.cloudflarestorage.com`;
  const normalizedHeaders = Object.fromEntries(
    Object.entries({
      ...headers,
      host,
      'x-amz-content-sha256': payloadSha256,
      'x-amz-date': amzDate,
      ...(credentials.sessionToken ? { 'x-amz-security-token': credentials.sessionToken } : {}),
    }).map(([name, value]) => [name.toLowerCase(), normalizeHeaderValue(value)]),
  );
  const sortedHeaderNames = Object.keys(normalizedHeaders).sort();
  const canonicalHeaders = `${sortedHeaderNames.map((name) => `${name}:${normalizedHeaders[name]}`).join('\n')}\n`;
  const signedHeaders = sortedHeaderNames.join(';');
  const canonicalRequest = [
    method.toUpperCase(),
    canonicalObjectPath(bucket, key),
    '',
    canonicalHeaders,
    signedHeaders,
    payloadSha256,
  ].join('\n');
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, hash(canonicalRequest)].join('\n');
  const dateKey = hmac(`AWS4${credentials.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, REGION);
  const serviceKey = hmac(regionKey, SERVICE);
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = hmac(signingKey, stringToSign, 'hex');
  return {
    host,
    path: canonicalObjectPath(bucket, key),
    headers: {
      ...normalizedHeaders,
      authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    canonicalRequest,
  };
}

function requestError(statusCode, statusMessage, body) {
  const safeBody = body.toString('utf8').replace(/[\r\n\t]+/g, ' ').slice(0, 1000);
  const error = new Error(`R2 S3 request failed: HTTP ${statusCode} ${statusMessage ?? ''}${safeBody ? ` (${safeBody})` : ''}`.trim());
  error.statusCode = statusCode;
  return error;
}

async function request({ method, bucket, key, headers, payloadSha256, credentials, body, consume }) {
  const signed = signS3Request({ method, bucket, key, headers, payloadSha256, credentials });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: 'https:',
        hostname: signed.host,
        method,
        path: signed.path,
        headers: signed.headers,
      },
      async (response) => {
        if ((response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300) {
          try {
            resolve(await consume(response));
          } catch (error) {
            reject(error);
          }
          return;
        }
        const chunks = [];
        let received = 0;
        response.on('data', (chunk) => {
          if (received < MAX_ERROR_BODY_BYTES) chunks.push(chunk.subarray(0, MAX_ERROR_BODY_BYTES - received));
          received += chunk.length;
        });
        response.once('end', () => reject(requestError(response.statusCode, response.statusMessage, Buffer.concat(chunks))));
        response.once('error', reject);
      },
    );
    req.once('error', reject);
    if (body && typeof body.pipe === 'function') {
      body.once('error', reject);
      body.pipe(req);
    }
    else {
      if (body) req.write(body);
      req.end();
    }
  });
}

function metadataHeaders(artifact, cutoff) {
  return {
    'content-length': String(artifact.bytes),
    'content-type': artifact.mediaType,
    ...(artifact.contentEncoding ? { 'content-encoding': artifact.contentEncoding } : {}),
    'cache-control': 'no-store',
    'if-none-match': '*',
    'x-amz-meta-sha256': artifact.sha256,
    'x-amz-meta-bytes': String(artifact.bytes),
    'x-amz-meta-cutoff': cutoff,
    'x-amz-meta-role': artifact.role,
    'x-amz-meta-public': 'false',
    'x-amz-storage-class': 'STANDARD',
  };
}

async function put({ bucket, artifact, cutoff, credentials, body }) {
  if (artifact.bytes > MAX_SINGLE_PUT_BYTES) {
    throw new Error('artifact exceeds the 5 GiB single-PUT limit; use an approved multipart S3 tool');
  }
  return request({
    method: 'PUT',
    bucket,
    key: artifact.key,
    headers: metadataHeaders(artifact, cutoff),
    payloadSha256: artifact.sha256,
    credentials,
    body,
    consume: async (response) => {
      response.resume();
      return { status: 'uploaded', etag: response.headers.etag };
    },
  });
}

export async function headObject({ bucket, artifact, cutoff, credentials }) {
  const result = await request({
    method: 'HEAD',
    bucket,
    key: artifact.key,
    headers: {},
    payloadSha256: hash(''),
    credentials,
    consume: async (response) => {
      response.resume();
      return response.headers;
    },
  });
  const actualBytes = Number(result['content-length']);
  if (
    actualBytes !== artifact.bytes
    || result['x-amz-meta-sha256'] !== artifact.sha256
    || result['x-amz-meta-bytes'] !== String(artifact.bytes)
    || (artifact.id === 'manifest-000' && result['x-amz-meta-cutoff'] !== cutoff)
    || result['x-amz-meta-role'] !== artifact.role
    || result['x-amz-meta-public'] !== 'false'
  ) {
    throw new Error(`remote HEAD metadata mismatch for ${artifact.id}`);
  }
  return { status: 'head-verified', etag: result.etag, bytes: actualBytes };
}

export async function putFileImmutable({ bucket, artifact, filePath, cutoff, credentials }) {
  try {
    return await put({ bucket, artifact, cutoff, credentials, body: createReadStream(filePath) });
  } catch (error) {
    if (error?.statusCode !== 412) throw error;
    await headObject({ bucket, artifact, cutoff, credentials });
    return { status: 'already-present' };
  }
}

export async function putBufferImmutable({ bucket, artifact, buffer, cutoff, credentials }) {
  if (!Buffer.isBuffer(buffer) || buffer.length !== artifact.bytes || hash(buffer) !== artifact.sha256) {
    throw new Error('manifest upload buffer failed local integrity validation');
  }
  try {
    return await put({ bucket, artifact, cutoff, credentials, body: buffer });
  } catch (error) {
    if (error?.statusCode !== 412) throw error;
    await headObject({ bucket, artifact, cutoff, credentials });
    return { status: 'already-present' };
  }
}

export async function downloadAndHash({ bucket, artifact, credentials }) {
  return request({
    method: 'GET',
    bucket,
    key: artifact.key,
    headers: {},
    payloadSha256: hash(''),
    credentials,
    consume: (response) => new Promise((resolve, reject) => {
      const digest = createHash('sha256');
      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += chunk.length;
        digest.update(chunk);
      });
      response.once('error', reject);
      response.once('end', () => {
        const sha256 = digest.digest('hex');
        if (bytes !== artifact.bytes || sha256 !== artifact.sha256) {
          reject(new Error(`downloaded content integrity mismatch for ${artifact.id}`));
          return;
        }
        resolve({ status: 'download-verified', bytes, sha256 });
      });
    }),
  });
}

export function redactSecrets(message, environment = process.env) {
  let safe = String(message);
  for (const name of ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_SESSION_TOKEN']) {
    const value = environment[name];
    if (value) safe = safe.split(value).join('[REDACTED]');
  }
  return safe;
}
