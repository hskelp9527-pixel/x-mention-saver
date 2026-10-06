import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHandle, selectionPattern, mergeEntry, mentions } from '../model.js';

test('selection requires one @ handle; manual input also accepts profiles', () => {
  for (const value of ['@brucejinji711', '@a', '@a_B12']) assert.ok(selectionPattern.test(value));
  for (const value of ['brucejinji711', '你好', '@中文', '@abc @def', 'a@b.com', '@abcdefghijklmnop', '@abc!', '@', '@@abc']) assert.equal(selectionPattern.test(value), false, value);
  assert.equal(normalizeHandle('  @brucejinji711  '), 'brucejinji711');
  assert.equal(normalizeHandle('https://x.com/brucejinji711/?s=21'), 'brucejinji711');
  assert.equal(normalizeHandle('https://twitter.com/Test_Name'), 'Test_Name');
  for (const value of ['https://evil.test/a', 'https://x.com/home', 'https://x.com/abc/status/123', '@a b']) assert.throws(() => normalizeHandle(value));
});

test('case-insensitive duplicate saves preserve notes and batch copy includes @', () => {
  const first = mergeEntry([], '@BruceJinji711', '长文时 @');
  const duplicate = mergeEntry(first.entries, '@brucejinji711');
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.entries.length, 1);
  assert.equal(duplicate.entries[0].note, '长文时 @');
  const edited = mergeEntry(duplicate.entries, 'BRUCEJINJI711', '新备注', true);
  assert.equal(edited.entries[0].note, '新备注');
  const all = mergeEntry(edited.entries, 'another_user').entries;
  const selected = new Set(['brucejinji711', 'another_user']);
  assert.equal(mentions(all, selected), '@another_user @BruceJinji711');
  assert.equal(mentions(all, selected, '\n'), '@another_user\n@BruceJinji711');
  assert.equal(mentions(all, new Set()), '');
});
