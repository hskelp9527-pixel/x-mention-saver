import { copyMentions } from './model.js';
const $ = id => document.getElementById(id);
let entries = [];
const selected = new Set();
let editing = false;
let pageProfiles = [];
let candidateSignature = '';
const composerToken=new URLSearchParams(location.search).get('composer');
const canInsert=window.parent!==window&&/^[a-f0-9-]{36}$/i.test(composerToken||'');
let inserting=false;
function parentOrigin(){try{const origin=new URLSearchParams(location.search).get('parentOrigin')||new URL(document.referrer).origin;return /^https:\/\/(www\.)?(x|twitter)\.com$/.test(origin)?origin:null;}catch{return null;}}
function notifySize(){if(window.parent===window)return;requestAnimationFrame(()=>{const main=document.querySelector('main'),children=[...main.children].filter(e=>e.getClientRects().length),top=main.getBoundingClientRect().top,bottom=Math.max(top,...children.map(e=>e.getBoundingClientRect().bottom));const height=Math.ceil(document.querySelector('header').offsetHeight+document.querySelector('footer').offsetHeight+bottom-top+main.scrollTop+4),origin=parentOrigin();if(origin)window.parent.postMessage({type:'xms-panel-size',height},origin);});}
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
async function request(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error || '操作失败，请重试');
  return result;
}
function filtered() {
  const query = $('search').value.trim().toLowerCase();
  return entries.filter(entry => ('@' + entry.handle + ' ' + entry.displayName + ' ' + entry.note).toLowerCase().includes(query));
}
function updateSelection() {
  $('selection-count').textContent = `已选 ${selected.size} 位`;
  $('copy-selected').disabled = selected.size === 0;
  $('insert-selected').disabled = selected.size === 0;
  document.querySelector('footer').classList.toggle('has-selection',selected.size>0);
  const visible = filtered();
  $('select-all').textContent = visible.length && visible.every(entry => selected.has(entry.id)) ? '取消选择当前结果' : '全选当前结果';
  $('select-all').disabled = !visible.length;
  notifySize();
}
function resetForm() {
  editing = false; $('add-form').reset(); $('handle').disabled = false;
  $('save').textContent = '添加'; $('cancel-edit').hidden = true;
  $('manual-add').open = false;
}
function avatar(profile) {
  const wrap=document.createElement('span');wrap.className='avatar';wrap.textContent=(profile.displayName||profile.handle||'@').slice(0,1);
  if(profile.avatarUrl){const img=document.createElement('img');img.src=profile.avatarUrl;img.alt='';img.referrerPolicy='no-referrer';img.addEventListener('error',()=>img.remove(),{once:true});wrap.append(img);}
  return wrap;
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
    const info = document.createElement(canInsert?'button':'label'); info.className = 'person-info';
    if(canInsert){info.type='button';info.title='点击加入输入框';info.setAttribute('aria-label','插入 @'+entry.handle);info.addEventListener('click',()=>insertPeople([entry.id]));}
    else info.htmlFor = check.id;
    check.setAttribute('aria-label','选择 @'+entry.handle);
    const name = document.createElement('strong'); name.textContent = entry.displayName || '@' + entry.handle;
    const handle = document.createElement('small');handle.textContent='@'+entry.handle;
    const note = document.createElement('small'); note.textContent = entry.note; note.title = entry.note;note.hidden=!entry.note;
    info.append(name,handle,note);
    const actions = document.createElement('div'); actions.className = 'actions';
    for (const [text, label, action] of [
      ['复制', '复制 @' + entry.handle, () => copy(copyMentions([entry], new Set([entry.id])), '已复制 @' + entry.handle)],
      ['昵称', '复制显示昵称 ' + (entry.displayName || '未填写'), () => entry.displayName ? copy(entry.displayName, '已复制显示昵称') : status('请先编辑补充显示昵称', true)],
      ['✎', '编辑 @' + entry.handle + ' 的备注', () => {
        $('manual-add').open = true;
        editing = true; $('handle').value = '@' + entry.handle; $('handle').disabled = true;
        $('display-name').value = entry.displayName || ''; $('note').value = entry.note; $('save').textContent = '保存'; $('cancel-edit').hidden = false; $('note').focus();
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
    let picture=avatar(entry);
    if(canInsert){const button=document.createElement('button');button.type='button';button.className='avatar-insert';button.title='加入 @'+entry.handle;button.setAttribute('aria-label','通过头像插入 @'+entry.handle);button.append(picture);button.addEventListener('click',()=>insertPeople([entry.id]));picture=button;}
    row.append(check, picture, info, actions); $('list').append(row);
  }
  updateSelection();
  renderCandidates();
  notifySize();
}
function renderCandidates(){
  const signature=JSON.stringify([pageProfiles,entries.map(e=>e.id)]);
  if(signature===candidateSignature)return;
  candidateSignature=signature;
  $('candidates').replaceChildren();$('page-count').textContent=pageProfiles.length?`(${pageProfiles.length})`:'';
  for(const profile of pageProfiles){
    const row=document.createElement('div');row.className='candidate';const info=document.createElement('div');info.className='candidate-info';
    const name=document.createElement('strong');name.textContent=profile.displayName||'@'+profile.handle;const handle=document.createElement('small');handle.textContent='@'+profile.handle;info.append(name,handle);
    const saved=entries.some(e=>e.id===profile.handle.toLowerCase());const button=document.createElement('button');button.type='button';button.textContent=saved?'已保存':'保存';button.disabled=saved;button.setAttribute('aria-label','保存 @'+profile.handle);
    button.onclick=async()=>{button.disabled=true;try{entries=(await request({type:'save',...profile})).entries;render();renderCandidates();status('已保存头像、昵称和 @'+profile.handle);}catch(error){button.disabled=false;status(error.message,true);}};
    row.append(avatar(profile),info,button);$('candidates').append(row);
  }
  notifySize();
}
async function scanPage(quiet=false){
  $('scan-page').disabled=true;
  try{const result=await request({type:'scan'});entries=result.entries;pageProfiles=result.profiles||[];render();renderCandidates();$('scan-hint').textContent=pageProfiles.length?`已识别 ${pageProfiles.length} 位，点击保存即可`:'当前页面没有识别到用户，请打开帖子、用户主页或关注列表';if(!quiet)status(`已扫描，补齐 ${result.updated||0} 位已保存用户的资料`);}
  catch(error){$('scan-hint').textContent=error.message;if(!quiet)status(error.message,true);}
  finally{$('scan-page').disabled=false;}
}
$('scan-page').onclick=()=>scanPage();
$('page-people').addEventListener('toggle',()=>{if($('page-people').open)scanPage(true);});
$('manual-add').addEventListener('toggle',notifySize);
$('page-people').addEventListener('toggle',notifySize);
async function copy(text, message) {
  try { await navigator.clipboard.writeText(text); status(message); }
  catch {
    // Some mobile browsers restrict async clipboard APIs in embedded frames.
    const field = document.createElement('textarea'); field.value = text;
    field.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
    document.body.append(field); field.select();
    try { if (!document.execCommand('copy')) throw new Error('copy'); status(message); }
    catch { status('复制失败，请从浏览器工具栏打开插件后重试', true); }
    finally { field.remove(); }
  }
}
async function insertPeople(ids){
  if(inserting)return;
  inserting=true;
  try{
    await request({type:'insert',ids,composerToken,separator:$('separator').value});
    const origin=parentOrigin();if(origin)window.parent.postMessage({type:'xms-close-panel',inserted:true},origin);
  }catch(error){status(error.message,true);}
  finally{inserting=false;}
}
$('add-form').addEventListener('submit', async event => {
  event.preventDefault(); $('save').disabled = true;
  try {
    const result = await request({ type: 'save', handle: $('handle').value, note: $('note').value, displayName: $('display-name').value });
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
$('copy-selected').addEventListener('click', () => copy(copyMentions(entries, selected, $('separator').value === 'line' ? '\n' : ' '), `已复制 ${selected.size} 个 @用户名`));
$('insert-selected').addEventListener('click',()=>insertPeople([...selected]));
$('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ version: 3, entries }, null, 2)], { type: 'application/json' });
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

// The embedding page receives only a close signal, never saved people or notes.
if (window.parent !== window) {
  document.body.classList.add('embedded');
  $('close-panel').hidden = false;
  const closePanel = () => {
    const origin=parentOrigin();if(origin)window.parent.postMessage({type:'xms-close-panel'},origin);
  };
  $('close-panel').addEventListener('click', closePanel);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closePanel(); });
  notifySize();
}
if(canInsert){document.body.classList.add('direct-insert');$('insert-selected').hidden=false;$('copy-selected').textContent='复制';$('copy-selected').classList.remove('primary','copy');status('点头像或昵称直接加入，多选后可一起加入。');notifySize();}
scanPage(true);
