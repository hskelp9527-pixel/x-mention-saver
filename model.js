export const selectionPattern = /^@[A-Za-z0-9_]{1,15}$/;
const reserved = new Set(['home', 'explore', 'notifications', 'messages', 'settings', 'search', 'compose', 'i', 'intent', 'share']);

export function normalizeAvatarUrl(input = '') {
  if (!input) return '';
  if (typeof input !== 'string' || input.length > 2048) throw new Error('头像链接格式不正确');
  let url;
  try { url = new URL(input); } catch { throw new Error('头像链接格式不正确'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !(
    (url.hostname === 'pbs.twimg.com' && url.pathname.startsWith('/profile_images/')) ||
    (url.hostname === 'abs.twimg.com' && url.pathname.startsWith('/sticky/default_profile_images/'))
  )) throw new Error('只接受 X 页面中的官方头像链接');
  url.hash = ''; return url.href;
}

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
    if (!entry || typeof entry.handle !== 'string' || (entry.note !== undefined && typeof entry.note !== 'string') || (entry.displayName !== undefined && typeof entry.displayName !== 'string') || (entry.avatarUrl !== undefined && typeof entry.avatarUrl !== 'string')) throw new Error('备份中有无效条目');
    const handle = normalizeHandle(entry.handle);
    return { id: handle.toLowerCase(), handle, displayName: String(entry.displayName || '').trim().slice(0, 100), avatarUrl: normalizeAvatarUrl(entry.avatarUrl), note: String(entry.note || '').trim().slice(0, 160), createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now() };
  });
}

export function mergeEntry(entries, input, note = '', updateNote = false, displayName = '', avatarUrl = '') {
  const handle = normalizeHandle(input);
  const key = handle.toLowerCase();
  const found = entries.find(entry => entry.id === key);
  const cleanNote = String(note).trim().slice(0, 160);
  const cleanName = String(displayName).trim().slice(0, 100);
  const cleanAvatar = normalizeAvatarUrl(avatarUrl);
  if (found) {
    return { entries: entries.map(entry => entry.id === key ? { ...entry, note: updateNote ? cleanNote : entry.note, displayName: updateNote ? cleanName : (entry.displayName || cleanName), avatarUrl: cleanAvatar || entry.avatarUrl || '' } : entry), duplicate: true, handle: found.handle };
  }
  return { entries: [{ id: key, handle, displayName: cleanName, avatarUrl: cleanAvatar, note: cleanNote, createdAt: Date.now() }, ...entries], duplicate: false, handle };
}

// Reading a page may update known people; it must never auto-save strangers.
export function enrichEntries(entries, profiles) {
  if (!Array.isArray(profiles) || profiles.length > 500) throw new Error('页面扫描结果格式不正确');
  const known = new Map(profiles.map(profile => {
    if (!profile || typeof profile.handle !== 'string' || typeof profile.displayName !== 'string' || typeof profile.avatarUrl !== 'string') throw new Error('页面资料格式不正确');
    return [normalizeHandle(profile.handle).toLowerCase(), { displayName: profile.displayName.trim().slice(0,100), avatarUrl: normalizeAvatarUrl(profile.avatarUrl) }];
  }));
  let updated = 0;
  const next = entries.map(entry => {
    const profile = known.get(entry.id); if (!profile) return entry;
    const displayName = profile.displayName || entry.displayName, avatarUrl = profile.avatarUrl || entry.avatarUrl || '';
    if (displayName === entry.displayName && avatarUrl === (entry.avatarUrl || '')) return entry;
    updated++; return { ...entry, displayName, avatarUrl };
  });
  return { entries: next, updated };
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
