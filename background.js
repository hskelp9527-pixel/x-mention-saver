import { mergeEntry, migrateEntries } from './model.js';

// One queue owns storage writes across popups and all X tabs.
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!['list', 'save', 'remove', 'import'].includes(message?.type)) return;
  const extensionOrigin = chrome.runtime.getURL('');
  const trustedUI = sender.id === chrome.runtime.id && sender.url?.startsWith(extensionOrigin) && new URL(sender.url).pathname === '/popup.html';
  let trustedContent = false;
  try {
    const url = new URL(sender.url);
    trustedContent = sender.id === chrome.runtime.id && Boolean(sender.tab) && sender.frameId === 0 && url.protocol === 'https:' && ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname);
  } catch {}
  // Only our isolated content script may save. The collection is only sent to
  // our extension-origin UI, including the iframe; never to X's MAIN world.
  if (!trustedUI && !(trustedContent && message.type === 'save')) {
    respond({ ok: false, error: '不允许的请求来源' }); return false;
  }
  const work = queue.then(async () => {
    const data = await chrome.storage.local.get({ entries: [] });
    let entries = migrateEntries(data.entries);
    let result = {};
    if (message.type === 'save') {
      result = mergeEntry(entries, message.handle, message.note, trustedUI, message.displayName);
      entries = result.entries;
    } else if (message.type === 'remove') {
      entries = entries.filter(entry => entry.id !== message.id);
    } else if (message.type === 'import') {
      if (!Array.isArray(message.entries) || message.entries.length > 5000) throw new Error('备份格式不正确或超过 5000 条');
      const imported = migrateEntries(message.entries); // Validate all before mutation.
      for (const entry of imported.slice().reverse()) entries = mergeEntry(entries, entry.handle, entry.note, false, entry.displayName).entries;
    }
    if (message.type !== 'list' || JSON.stringify(data.entries) !== JSON.stringify(entries)) await chrome.storage.local.set({ entries });
    return { ok: true, ...result, entries: trustedUI ? entries : undefined };
  });
  queue = work.catch(() => {});
  work.then(respond, error => respond({ ok: false, error: error.message }));
  return true;
});
