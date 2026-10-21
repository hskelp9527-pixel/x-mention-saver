import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHandle, selectionPattern, mergeEntry, mentions, copyMentions, migrateEntries, normalizeAvatarUrl, enrichEntries } from '../model.js';

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


test('legacy migration keeps identity, timestamps and notes; display names are explicit', () => {
  const old = migrateEntries([{ id: 'bad', handle: 'Alice', note: '保留', createdAt: 42 }]);
  assert.deepEqual(old, [{ id: 'alice', handle: 'Alice', note: '保留', createdAt: 42, displayName: '', avatarUrl: '' }]);
  const named = mergeEntry(old, 'alice', '', false, '爱丽丝').entries;
  assert.equal(named[0].note, '保留'); assert.equal(named[0].displayName, '爱丽丝');
  assert.equal(mergeEntry(named, 'ALICE', '', false, '页面新名称').entries[0].displayName, '爱丽丝');
  assert.equal(mergeEntry(named, 'alice', '新备注', true, '手动名').entries[0].displayName, '手动名');
  assert.throws(() => migrateEntries([{ handle: 'alice', displayName: {} }]));
});

test('official avatars survive backups; scanning updates only saved people and retains notes',()=>{
  const avatar='https://pbs.twimg.com/profile_images/123/alice_normal.jpg';
  assert.equal(normalizeAvatarUrl(avatar),avatar);
  for(const value of ['javascript:alert(1)','https://evil.test/profile_images/a.jpg','https://pbs.twimg.com.evil.test/profile_images/a.jpg','https://pbs.twimg.com/media/a.jpg'])assert.throws(()=>normalizeAvatarUrl(value));
  const saved=mergeEntry([], 'alice', '私人备注', false, '旧昵称', avatar).entries;
  const result=enrichEntries(saved,[{handle:'ALICE',displayName:'新昵称',avatarUrl:avatar},{handle:'stranger',displayName:'路人',avatarUrl:''}]);
  assert.equal(result.entries.length,1);assert.equal(result.entries[0].displayName,'新昵称');assert.equal(result.entries[0].note,'私人备注');assert.equal(result.updated,1);
  assert.equal(migrateEntries(result.entries)[0].avatarUrl,avatar);
  assert.throws(()=>migrateEntries([{handle:'alice',avatarUrl:'https://evil.test/tracker'}]));
});

test('clipboard mentions force safe separation and outer text boundaries', () => {
  const entries = migrateEntries([{ handle: 'alice' }, { handle: 'bob' }]);
  const selected = new Set(['alice', 'bob']);
  assert.equal(copyMentions(entries, selected, ''), ' @alice @bob ');
  assert.equal(copyMentions(entries, selected, ', '), ' @alice @bob ');
  assert.equal(copyMentions(entries, selected, '\n'), '\n@alice\n@bob\n');
  assert.equal(copyMentions(entries, new Set()), '');
  assert.equal('正文' + copyMentions(entries, selected) + '继续', '正文 @alice @bob 继续');
});
