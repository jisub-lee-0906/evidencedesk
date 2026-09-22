import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './server.mjs';
import { openaiAnswer } from './rag.mjs';

const docs = [
  { id: 'A', title: '휴가', text: '연차 휴가는 사전 승인 후 사용합니다.' },
  { id: 'B', title: '보안', text: '비밀번호 공유를 금지합니다.' }
];

async function run(options, callback) {
  const server = createServer({ docs, apiKey: '', ...options });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try { return await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((done) => server.close(done)); }
}

function ask(url, question, contentType = 'application/json') {
  return fetch(`${url}/api/ask`, { method: 'POST', headers: { 'content-type': contentType }, body: JSON.stringify({ question }) });
}

test('offline response is grounded in top evidence', async () => run({}, async (url) => {
  const response = await ask(url, '연차 휴가는 어떻게 쓰나요');
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.mode, 'offline-extractive');
  assert.deepEqual(data.citations, ['A']);
  assert.equal(data.evidence.length, 1);
}));

test('provider success accepts a known citation', async () => run({ provider: async () => ({ answer: '승인이 필요합니다.', citations: ['A'] }) }, async (url) => {
  const data = await (await ask(url, '연차 휴가')).json();
  assert.equal(data.answer, '승인이 필요합니다.');
  assert.equal(data.mode, 'provider');
}));

test('provider failure, invalid citation, and duplicate citation return 502', async (t) => {
  for (const provider of [async () => { throw Error('fail'); }, async () => ({ answer: 'x', citations: ['NOPE'] }), async () => ({ answer: 'x', citations: ['A', 'A'] })]) {
    await t.test('rejects bad provider output', () => run({ provider }, async (url) => assert.equal((await ask(url, '연차 휴가')).status, 502)));
  }
});

test('no evidence abstains without calling provider', async () => run({ provider: async () => { throw Error('must not run'); } }, async (url) => {
  const data = await (await ask(url, '우주선 점심 메뉴')).json();
  assert.equal(data.citations.length, 0);
  assert.match(data.answer, /찾지 못했습니다/);
}));

test('provider timeout returns 502 and aborts its signal', async () => run({ timeout: 15, provider: async (_q, _e, signal) => new Promise((_ok, fail) => signal.addEventListener('abort', () => fail(Error('aborted')))) }, async (url) => {
  assert.equal((await ask(url, '연차 휴가')).status, 502);
}));

test('validation, body limit, content type, and static allowlist work', async () => run({}, async (url) => {
  assert.equal((await ask(url, '')).status, 400);
  assert.equal((await ask(url, '연차 휴가', 'text/plain')).status, 415);
  const large = await fetch(`${url}/api/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: '가'.repeat(9000) }) });
  assert.equal(large.status, 413);
  const app = await fetch(`${url}/app.js`);
  assert.match(app.headers.get('content-type'), /text\/javascript/);
  assert.equal((await fetch(`${url}/missing.js`)).status, 404);
}));

test('OpenAI adapter builds constrained request and parses mocked JSON', async () => {
  let request;
  const fetcher = async (_url, options) => {
    request = JSON.parse(options.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":"승인 필요","citations":["A"]}' } }] }), { status: 200 });
  };
  const result = await openaiAnswer({ question: '연차 휴가', evidence: [{ sourceId: 'A' }], apiKey: 'test', fetcher, signal: new AbortController().signal });
  assert.equal(result.answer, '승인 필요');
  assert.equal(request.max_tokens, 500);
  assert.match(request.messages[0].content, /untrusted data/);
  assert.deepEqual(JSON.parse(request.messages[1].content).evidence, [{ sourceId: 'A' }]);
});

test('OpenAI adapter rejects HTTP errors and malformed model JSON', async () => {
  await assert.rejects(openaiAnswer({ question: 'x', evidence: [], apiKey: 'x', fetcher: async () => new Response('', { status: 500 }) }));
  await assert.rejects(openaiAnswer({ question: 'x', evidence: [], apiKey: 'x', fetcher: async () => new Response('not json', { status: 200 }) }));
});