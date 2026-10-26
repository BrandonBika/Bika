import { handleZegoToken } from '../supabase/functions/zego-token/handler.js';

const MAX_REQUEST_BYTES = 8192;

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  if (request.body !== undefined) {
    const body = Buffer.isBuffer(request.body)
      ? request.body.toString('utf8')
      : typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) throw new RangeError('request body too large');
    return body;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) throw new RangeError('request body too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export default async function zegoToken(request, response) {
  let body;
  try {
    body = await readBody(request);
  } catch (error) {
    if (error instanceof RangeError && error.message === 'request body too large') {
      sendJson(response, 413, { error: 'The request is too large.' });
      return;
    }
    console.error('[zego-token] could not read request body');
    sendJson(response, 400, { error: 'A recipient list is required.' });
    return;
  }

  let webResponse;
  try {
    const headers = new Headers();
    if (request.headers.authorization) headers.set('authorization', request.headers.authorization);
    if (request.headers['content-type']) headers.set('content-type', request.headers['content-type']);
    if (request.headers.origin) headers.set('origin', request.headers.origin);

    const method = request.method || 'GET';
    const url = new URL(request.url || '/api/zego-token', `https://${request.headers.host || 'localhost'}`);
    const webRequest = new Request(url, {
      method,
      headers,
      ...(!['GET', 'HEAD'].includes(method) && body ? { body } : {})
    });

    webResponse = await handleZegoToken(webRequest, {
      env: {
        ZEGO_APP_ID: process.env.ZEGO_APP_ID,
        ZEGO_SERVER_SECRET: process.env.ZEGO_SERVER_SECRET,
        APP_ENV: process.env.APP_ENV,
        NODE_ENV: process.env.NODE_ENV,
        ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS
      },
      supabaseUrl: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY
    });
  } catch {
    console.error('[zego-token] request handler failed');
    sendJson(response, 500, { error: 'Could not create a call token.' });
    return;
  }

  webResponse.headers.forEach((value, name) => response.setHeader(name, value));
  response.statusCode = webResponse.status;
  response.end(await webResponse.text());
}
