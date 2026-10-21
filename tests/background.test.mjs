import test from 'node:test';
import assert from 'node:assert/strict';

let listener;
let saved = { entries: [{ handle: 'alice', note: '旧备注', createdAt: 123 }] };
let insertedMessage;
globalThis.chrome = {
  tabs: { query:async()=>[{id:1}],sendMessage:async(tabId,message,options)=>{if(message.type==='xms-insert-mentions'){insertedMessage={tabId,message,options};return {ok:true};}return {profiles:[{handle:'alice',displayName:'扫描昵称',avatarUrl:'https://pbs.twimg.com/profile_images/123/alice.jpg'},{handle:'stranger',displayName:'未保存',avatarUrl:''}]};} },
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

test('scan uses the page tab and enrich never discloses saved collections to content',async()=>{
  assert.equal((await request({type:'scan'},content)).ok,false);
  const scanned=await request({type:'scan'},ui);assert.equal(scanned.ok,true);assert.equal(scanned.profiles.length,2);
  assert.equal(scanned.entries.find(e=>e.id==='alice').avatarUrl,'https://pbs.twimg.com/profile_images/123/alice.jpg');
  assert.equal(scanned.entries.some(e=>e.id==='stranger'),false);
  const enriched=await request({type:'enrich',profiles:[{handle:'alice',displayName:'再次识别',avatarUrl:''}]},content);
  assert.equal(enriched.ok,true);assert.equal(enriched.entries,undefined);assert.equal(enriched.profiles,undefined);
  const before=structuredClone(saved);
  assert.equal((await request({type:'import',entries:[{handle:'good'},{handle:'bad',avatarUrl:'https://evil.test/tracker'}]},ui)).ok,false);assert.deepEqual(saved,before);
});

test('insertion requires embedded UI and sends only explicitly selected handles to its own tab',async()=>{
  const command={type:'insert',ids:['alice','bob','alice'],composerToken:'12345678-1234-1234-1234-123456789012',separator:'line'};
  assert.equal((await request(command,content)).ok,false);
  assert.equal((await request(command,ui)).ok,false);
  const embedded={...ui,tab:{id:42},frameId:7};
  insertedMessage=undefined;
  assert.equal((await request({...command,ids:['alice','missing']},embedded)).ok,false);
  assert.equal(insertedMessage,undefined);
  const before=structuredClone(saved),result=await request(command,embedded);
  assert.equal(result.ok,true);assert.equal(result.inserted,2);assert.equal(result.entries,undefined);
  assert.deepEqual(insertedMessage,{tabId:42,message:{type:'xms-insert-mentions',composerToken:command.composerToken,handles:['alice','bob'],separator:'\n'},options:{frameId:0}});
  assert.deepEqual(saved,before);
});
