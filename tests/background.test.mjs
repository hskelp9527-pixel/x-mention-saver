import test from 'node:test';
import assert from 'node:assert/strict';

let listener;
let saved = { entries: [{ handle: 'alice', note: '旧备注', createdAt: 123 }] };
globalThis.chrome = {
  runtime: { id: 'extension-id', getURL: path => 'chrome-extension://extension-id/' + path, onMessage: { addListener: fn => { listener = fn; } } },
  storage: { local: { get: async () => structuredClone(saved), set: async data => { saved = structuredClone(data); } } }
};
await import('../background.js');
const ui = { id: 'extension-id', url: 'chrome-extension://extension-id/popup.html' };
const content = { id: 'extension-id', tab: { id: 1 }, frameId: 0, url: 'https://x.com/home' };
const request = (message, sender) => new Promise(resolve => listener(message, sender, resolve));

test('sender boundary protects collections and migration/import stay atomic', async () => {
  const denied = await request({ type: 'list' }, content);
  assert.equal(denied.ok, false);
  assert.equal((await request({ type: 'list' }, { ...ui, id: 'other-extension' })).ok, false);
  assert.equal((await request({ type: 'save', handle: 'evil' }, { ...content, url: 'https://x.com.evil.test/' })).ok, false);
  assert.equal((await request({ type: 'save', handle: 'nested' }, { ...content, frameId: 1 })).ok, false);
  const result = await request({ type: 'save', handle: 'alice', displayName: '爱丽丝', note: '不能覆盖' }, content);
  assert.equal(result.ok, true); assert.equal(result.entries, undefined);
  const list = await request({ type: 'list' }, ui);
  assert.equal(list.entries[0].displayName, '爱丽丝');
  assert.equal(list.entries[0].note, '旧备注'); assert.equal(list.entries[0].createdAt, 123);
  const before = structuredClone(saved);
  assert.equal((await request({ type: 'import', entries: [{ handle: 'good' }, { handle: 'bad', displayName: {} }] }, ui)).ok, false);
  assert.deepEqual(saved, before);
  // Failed work does not poison subsequent requests on the shared queue.
  assert.equal((await request({ type: 'save', handle: 'bob', displayName: '鲍勃' }, ui)).ok, true);
  assert.equal((await request({ type: 'list' }, ui)).entries.length, 2);
});
