import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { search, offlineExtractive, openaiAnswer } from './rag.mjs';

const MAX_BODY_BYTES = 8192;
const assets = new Map([
  ['/', ['index.html', 'text/html']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/style.css', ['style.css', 'text/css']]
]);

function sendJson(response, status, data) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

function readBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let size = 0, chunks = [], done = false;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES && !done) { done = true; rejectBody(Error('too large')); }
      else if (!done) chunks.push(chunk);
    });
    request.on('end', () => { if (!done) resolveBody(Buffer.concat(chunks).toString()); });
    request.on('error', rejectBody);
  });
}

function validAnswer(output, evidence) {
  const ids = new Set(evidence.map((item) => item.sourceId));
  const citations = output?.citations;
  return typeof output?.answer === 'string' && output.answer.trim().length > 0 &&
    output.answer.length <= 4000 && Array.isArray(citations) && citations.length > 0 &&
    citations.length <= evidence.length && citations.every((id) => typeof id === 'string' &&
      id.length > 0 && id.length <= 80 && ids.has(id)) && new Set(citations).size === citations.length;
}

function withTimeout(work, timeout) {
  const controller = new AbortController();
  return new Promise((resolveWork, rejectWork) => {
    const timer = setTimeout(() => { controller.abort(); rejectWork(Error('upstream')); }, timeout);
    Promise.resolve(work(controller.signal)).then(resolveWork, rejectWork).finally(() => clearTimeout(timer));
  });
}

export function createServer({ docs, provider, apiKey = process.env.OPENAI_API_KEY, fetcher = fetch, timeout = 8000 } = {}) {
  return http.createServer(async (request, response) => {
    try {
      const asset = request.method === 'GET' && assets.get(request.url);
      if (asset) {
        response.writeHead(200, { 'content-type': `${asset[1]}; charset=utf-8`, 'x-content-type-options': 'nosniff' });
        return response.end(await readFile(new URL(`./public/${asset[0]}`, import.meta.url)));
      }
      if (request.method !== 'POST' || request.url !== '/api/ask') return sendJson(response, 404, { error: 'not found' });
      if (!String(request.headers['content-type']).includes('application/json')) return sendJson(response, 415, { error: 'application/json required' });
      let input;
      try { input = JSON.parse(await readBody(request)); }
      catch (error) { return sendJson(response, error.message === 'too large' ? 413 : 400, { error: error.message === 'too large' ? 'body too large' : 'invalid JSON' }); }
      if (typeof input?.question !== 'string' || !input.question.trim() || input.question.length > 500) return sendJson(response, 400, { error: 'question must be 1-500 characters' });
      const evidence = search(input.question, docs);
      if (!evidence.length) return sendJson(response, 200, { question: input.question, ...offlineExtractive(evidence), evidence });
      let output;
      if (provider) output = await withTimeout((signal) => provider(input.question, evidence, signal), timeout);
      else if (apiKey) output = await withTimeout((signal) => openaiAnswer({ question: input.question, evidence, apiKey, fetcher, signal }), timeout);
      else output = offlineExtractive(evidence);
      if (!validAnswer(output, evidence)) return sendJson(response, 502, { error: 'upstream returned invalid grounded answer' });
      sendJson(response, 200, { question: input.question, mode: output.mode || 'provider', answer: output.answer, citations: output.citations, evidence });
    } catch { sendJson(response, 502, { error: 'upstream unavailable' }); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const docs = JSON.parse(await readFile(new URL('./data/docs.json', import.meta.url)));
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 3000);
  createServer({ docs }).listen(port, host, () => console.log(`EvidenceDesk on http://${host}:${port}`));
}