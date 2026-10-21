export const selectionPattern = /^@[A-Za-z0-9_]{1,15}$/;
const reserved = new Set(['home', 'explore', 'notifications', 'messages', 'settings', 'search', 'compose', 'i', 'intent', 'share']);

export function normalizeHandle(input) {
  let value = String(input ?? '').trim();
  if (/^https?:\/\//i.test(value)) {
    let url;
    try { url = new URL(value); } catch { throw new Error('个人主页链接格式不正确'); }
    if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname.toLowerCase())) {
      throw new Error('请粘贴 X 或 Twitter 的个人主页链接');
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 1 || reserved.has(parts[0].toLowerCase())) throw new Error('请粘贴个人主页链接，而不是帖子或功能页面');
    value = parts[0];
  }
  value = value.replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{1,15}$/.test(value)) throw new Error('用户名需为 1–15 个字母、数字或下划线');
  return value;
}

export function migrateEntries(entries) {
  if (!Array.isArray(entries)) throw new Error('收藏数据无法读取，请先导出备份');
  return entries.map(entry => {
    if (!entry || typeof entry.handle !== 'string' || (entry.note !== undefined && typeof entry.note !== 'string') || (entry.displayName !== undefined && typeof entry.displayName !== 'string')) throw new Error('备份中有无效条目');
    const handle = normalizeHandle(entry.handle);
    return { id: handle.toLowerCase(), handle, displayName: String(entry.displayName || '').trim().slice(0, 100), note: String(entry.note || '').trim().slice(0, 160), createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now() };
  });
}

export function mergeEntry(entries, input, note = '', updateNote = false, displayName = '') {
  const handle = normalizeHandle(input);
  const key = handle.toLowerCase();
  const found = entries.find(entry => entry.id === key);
  const cleanNote = String(note).trim().slice(0, 160);
  const cleanName = String(displayName).trim().slice(0, 100);
  if (found) {
    return { entries: entries.map(entry => entry.id === key ? { ...entry, note: updateNote ? cleanNote : entry.note, displayName: updateNote ? cleanName : (entry.displayName || cleanName) } : entry), duplicate: true, handle: found.handle };
  }
  return { entries: [{ id: key, handle, displayName: cleanName, note: cleanNote, createdAt: Date.now() }, ...entries], duplicate: false, handle };
}

export function mentions(entries, selected, separator = ' ') {
  const safeSeparator = separator === '\n' ? '\n' : ' ';
  return entries.filter(entry => selected.has(entry.id)).map(entry => '@' + normalizeHandle(entry.handle)).join(safeSeparator);
}

// Leading/trailing whitespace prevents a pasted mention from joining adjacent text.
export function copyMentions(entries, selected, separator = ' ') {
  const text = mentions(entries, selected, separator);
  return text ? (separator === '\n' ? '\n' : ' ') + text + (separator === '\n' ? '\n' : ' ') : '';
}
