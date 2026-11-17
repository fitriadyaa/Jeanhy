import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import handler from '../src/server/letters.mjs';

test('letters persist, reject invalid requests, limit spam, and paginate without losing older notes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'heeyeon-letters-test-'));
  const previousDirectory = process.env.LETTERS_DATA_DIR;
  const previousProxy = process.env.LETTERS_TRUST_PROXY;
  process.env.LETTERS_DATA_DIR = directory;
  delete process.env.LETTERS_TRUST_PROXY;
  const request = (method, body, query = {}, address = '127.0.0.1', headers = {}) => {
    const response = { headers: {}, setHeader(key, value) { this.headers[key] = value; },
      status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    handler({ method, body, query, headers: { host: 'localhost:9283', ...headers }, socket: { remoteAddress: address } }, response);
    return response;
  };
  const letter = { name: '  뚱땅이  ', message: 'Happy birthday, 희연! 🎸\n<script>alert(1)</script>', color: 'pink', submissionId: randomUUID() };
  try {
    assert.deepEqual(request('GET').data, { letters: [], hasMore: false });
    assert.equal(request('POST', { ...letter, message: '  ' }).code, 400);
    assert.equal(request('POST', { ...letter, message: 'a'.repeat(801) }).code, 400);
    assert.equal(request('POST', { ...letter, name: 123 }).code, 400);
    assert.equal(request('POST', { ...letter, website: 'spam' }).code, 400);
    assert.equal(request('POST', letter, {}, '127.0.0.1', { origin: 'https://another-site.test' }).code, 403);
    const saved = request('POST', letter);
    assert.equal(saved.code, 201);
    assert.equal(saved.data.letter.name, '뚱땅이');
    assert.equal(saved.data.letter.message, letter.message);
    assert.equal(request('GET').data.letters[0].message, letter.message);
    const retry = request('POST', letter);
    assert.equal(retry.code, 200);
    assert.equal(retry.data.letter.id, saved.data.letter.id);
    assert.equal(request('GET').data.letters.length, 1);
    assert.equal(request('POST', { ...letter, submissionId: randomUUID() }).code, 429);
    for (let i = 0; i < 32; i++) {
      assert.equal(request('POST', { ...letter, submissionId: randomUUID(), message: `Wish ${i}` }, {}, `client-${i}`).code, 201);
    }
    const first = request('GET').data;
    assert.equal(first.letters.length, 30);
    assert.equal(first.hasMore, true);
    const second = request('GET', null, { before: first.letters.at(-1).id }).data;
    assert.equal(second.letters.length, 3);
    assert.equal(second.hasMore, false);
    assert.equal(new Set([...first.letters, ...second.letters].map((item) => item.id)).size, 33);
    assert.equal(request('GET', null, { before: 'broken' }).code, 400);
    assert.equal(request('DELETE').code, 405);
  } finally {
    if (previousDirectory === undefined) delete process.env.LETTERS_DATA_DIR;
    else process.env.LETTERS_DATA_DIR = previousDirectory;
    if (previousProxy === undefined) delete process.env.LETTERS_TRUST_PROXY;
    else process.env.LETTERS_TRUST_PROXY = previousProxy;
    rmSync(directory, { recursive: true, force: true });
  }
});
