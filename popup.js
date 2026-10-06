import { mentions } from './model.js';
const $ = id => document.getElementById(id);
let entries = [];
const selected = new Set();
let editing = false;
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
async function request(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error || '操作失败，请重试');
  return result;
}
function filtered() {
  const query = $('search').value.trim().toLowerCase();
  return entries.filter(entry => ('@' + entry.handle + ' ' + entry.note).toLowerCase().includes(query));
}
function updateSelection() {
  $('selection-count').textContent = `已选 ${selected.size} 位`;
  $('copy-selected').disabled = selected.size === 0;
  const visible = filtered();
  $('select-all').textContent = visible.length && visible.every(entry => selected.has(entry.id)) ? '取消选择当前结果' : '全选当前结果';
  $('select-all').disabled = !visible.length;
}
function resetForm() {
  editing = false; $('add-form').reset(); $('handle').disabled = false;
  $('save').textContent = '添加'; $('cancel-edit').hidden = true;
}
function render() {
  for (const id of selected) if (!entries.some(entry => entry.id === id)) selected.delete(id);
  $('count').textContent = `${entries.length} 位`;
  $('list').replaceChildren();
  const visible = filtered();
  $('empty').hidden = visible.length > 0;
  $('empty').querySelector('strong').textContent = entries.length ? '没有找到匹配的人' : '把想 @ 的人留在这里';
  $('empty').querySelector('p').hidden = entries.length > 0;
  for (const entry of visible) {
    const row = document.createElement('div'); row.className = 'person';
    row.classList.toggle('selected', selected.has(entry.id));
    const check = document.createElement('input'); check.type = 'checkbox';
    check.id = 'person-' + entry.id; check.checked = selected.has(entry.id);
    check.addEventListener('change', () => {
      if (check.checked) selected.add(entry.id); else selected.delete(entry.id);
      row.classList.toggle('selected', check.checked); updateSelection();
    });
    const info = document.createElement('label'); info.className = 'person-info'; info.htmlFor = check.id;
    const name = document.createElement('strong'); name.textContent = '@' + entry.handle;
    const note = document.createElement('small'); note.textContent = entry.note || '尚未添加备注'; note.title = entry.note;
    info.append(name, note);
    const actions = document.createElement('div'); actions.className = 'actions';
    for (const [text, label, action] of [
      ['复制', '复制 @' + entry.handle, () => copy('@' + entry.handle, '已复制 @' + entry.handle)],
      ['✎', '编辑 @' + entry.handle + ' 的备注', () => {
        editing = true; $('handle').value = '@' + entry.handle; $('handle').disabled = true;
        $('note').value = entry.note; $('save').textContent = '保存'; $('cancel-edit').hidden = false; $('note').focus();
      }],
      ['×', '删除 @' + entry.handle, async () => {
        try { entries = (await request({ type: 'remove', id: entry.id })).entries; render();
          if ($('handle').value.toLowerCase() === '@' + entry.id) resetForm();
          status('已删除 @' + entry.handle);
        } catch (error) { status(error.message, true); }
      }]
    ]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
      button.title = label; button.setAttribute('aria-label', label);
      if (text === '×') button.className = 'remove';
      button.addEventListener('click', action); actions.append(button);
    }
    row.append(check, info, actions); $('list').append(row);
  }
  updateSelection();
}
async function copy(text, message) {
  try { await navigator.clipboard.writeText(text); status(message); }
  catch { status('复制失败，请重新点击复制按钮', true); }
}
$('add-form').addEventListener('submit', async event => {
  event.preventDefault(); $('save').disabled = true;
  try {
    const result = await request({ type: 'save', handle: $('handle').value, note: $('note').value });
    entries = result.entries; status(editing ? '备注已保存' : result.duplicate ? '已在收藏中，备注已更新' : '已收藏 @' + result.handle);
    resetForm(); render();
  } catch (error) { status(error.message, true); }
  finally { $('save').disabled = false; }
});
$('cancel-edit').addEventListener('click', resetForm);
$('search').addEventListener('input', render);
$('select-all').addEventListener('click', () => {
  const visible = filtered(); const all = visible.every(entry => selected.has(entry.id));
  for (const entry of visible) { if (all) selected.delete(entry.id); else selected.add(entry.id); }
  render();
});
$('copy-selected').addEventListener('click', () => copy(mentions(entries, selected, $('separator').value === 'line' ? '\n' : ' '), `已复制 ${selected.size} 个 @用户名`));
$('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ version: 1, entries }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = 'x-mentions-backup.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); status('备份已导出');
});
$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async () => {
  try {
    const file = $('import-file').files[0]; if (!file) return;
    if (file.size > 2 * 1024 * 1024) throw new Error('备份文件不能超过 2 MB');
    const data = JSON.parse(await file.text());
    entries = (await request({ type: 'import', entries: Array.isArray(data) ? data : data.entries })).entries;
    render(); status('备份已合并，重复用户名保留原备注');
  } catch (error) { status(error instanceof SyntaxError ? '请选择有效的 JSON 备份文件' : error.message, true); }
  finally { $('import-file').value = ''; }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.entries) { entries = changes.entries.newValue || []; render(); }
});
try { entries = (await request({ type: 'list' })).entries; render(); }
catch (error) { status(error.message, true); }
