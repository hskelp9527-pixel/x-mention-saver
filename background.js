import { mergeEntry } from './model.js';

// All writes run here in order, including requests from multiple X tabs.
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!['list', 'save', 'remove', 'import'].includes(message?.type)) return;
  // Page scripts can only request an individual save through the content script.
  const fromPage = Boolean(sender.tab) && !sender.url?.startsWith(chrome.runtime.getURL(''));
  if (fromPage && message.type !== 'save') return;
  const work = queue.then(async () => {
    const data = await chrome.storage.local.get({ entries: [] });
    let entries = data.entries;
    if (!Array.isArray(entries)) throw new Error('收藏数据无法读取，请先导出备份');
    let result = {};
    if (message.type === 'save') {
      result = mergeEntry(entries, message.handle, message.note, !fromPage);
      entries = result.entries;
    } else if (message.type === 'remove') {
      entries = entries.filter(entry => entry.id !== message.id);
    } else if (message.type === 'import') {
      if (!Array.isArray(message.entries) || message.entries.length > 5000) throw new Error('备份格式不正确或超过 5000 条');
      // Validate the whole backup before committing any changes.
      for (const entry of message.entries.slice().reverse()) {
        if (!entry || typeof entry.handle !== 'string' || (entry.note !== undefined && typeof entry.note !== 'string')) throw new Error('备份中有无效条目');
        entries = mergeEntry(entries, entry.handle, entry.note).entries;
      }
    }
    if (message.type !== 'list') await chrome.storage.local.set({ entries });
    return { ok: true, ...result, entries };
  });
  queue = work.catch(() => {});
  work.then(respond, error => respond({ ok: false, error: error.message }));
  return true;
});
