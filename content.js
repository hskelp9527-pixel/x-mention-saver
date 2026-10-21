(() => {
  const pattern = /^@[A-Za-z0-9_]{1,15}$/;
  const host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;inset:0 auto auto 0;z-index:2147483647;display:none';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `button{box-sizing:border-box;height:32px;padding:0 12px;border:1px solid #b9d9fb;border-radius:999px;background:#fff;color:#0866b9;box-shadow:0 3px 14px #0002;font:600 13px/1 system-ui,sans-serif;white-space:nowrap;cursor:pointer}button:hover{background:#edf6ff}button:focus-visible{outline:2px solid #0866b9;outline-offset:2px}button:disabled{cursor:default}`;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '+ 保存';
  button.setAttribute('aria-label', '保存选中的 X 用户名');
  shadow.append(style, button);
  document.documentElement.append(host);
  let handle = '';
  let displayName = '';
  let avatarUrl = '';
  let busy = false;
  let feedback = false;
  let timer;
  let frame;
  const hide = () => { host.style.display = 'none'; handle = ''; feedback = false; clearTimeout(timer); };

  function refresh() {
    if (busy) return;
    if (document.querySelector('[data-xms-panel]')) { hide(); return; }
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? '';
    if (!pattern.test(text) || !selection.rangeCount || selection.isCollapsed) { hide(); return; }
    // Do not offer a save button in a post editor or a form field.
    const node = selection.anchorNode;
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    if (element?.closest('input,textarea,[contenteditable]:not([contenteditable="false"])')) { hide(); return; }
    const rects = [...selection.getRangeAt(0).getClientRects()].filter(rect => rect.width && rect.height);
    if (!rects.length) { hide(); return; }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) { hide(); return; }
    if (text !== handle) { feedback = false; clearTimeout(timer); }
    handle = text;
    const profile = globalThis.XMSProfiles.extract(element, text);
    displayName = profile.displayName;
    avatarUrl = profile.avatarUrl;
    if (!feedback) button.textContent = '+ 保存';
    button.disabled = false;
    host.style.display = 'block';
    const { width, height } = button.getBoundingClientRect();
    const gap = 8;
    let left, top;
    if (rect.right + gap + width <= innerWidth - gap) {
      left = rect.right + gap; top = rect.top + (rect.height - height) / 2;
    } else if (rect.left - gap - width >= gap) {
      left = rect.left - gap - width; top = rect.top + (rect.height - height) / 2;
    } else {
      left = Math.max(gap, Math.min(rect.left, innerWidth - width - gap));
      top = rect.bottom + gap;
      if (top + height > innerHeight - gap) top = rect.top - height - gap;
    }
    top = Math.max(gap, Math.min(top, innerHeight - height - gap));
    if (rects.some(part => left < part.right && left + width > part.left && top < part.bottom && top + height > part.top)) { hide(); return; }
    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
  }
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(refresh); };
  // Preserve the selection when clicking the floating button.
  button.addEventListener('pointerdown', event => event.preventDefault());
  button.addEventListener('click', async () => {
    if (busy || !handle) return;
    busy = true;
    const savedHandle = handle;
    button.disabled = true;
    button.textContent = '保存中…';
    try {
      const result = await chrome.runtime.sendMessage({ type: 'save', handle: savedHandle, displayName, avatarUrl });
      if (!result?.ok) throw new Error(result?.error || '保存失败');
      button.textContent = result.duplicate ? '✓ 已收藏' : '✓ 已保存';
    } catch {
      button.textContent = '保存失败，请重试';
    } finally {
      busy = false;
      feedback = true;
      button.disabled = false;
      timer = setTimeout(hide, 1800);
      if (window.getSelection()?.toString().trim() !== savedHandle) schedule();
    }
  });
  document.addEventListener('selectionchange', schedule);
  document.addEventListener('xms-panel-open', hide);
  document.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
})();

// Mount one small launcher in each editor toolbar, outside its editable DOM. No editor
// text, selection, submit button or X network request is changed.
(() => {
  const editorSelector = '[contenteditable="true"][data-testid^="tweetTextarea_"],textarea[data-testid^="tweetTextarea_"]';
  const mounted = new Map();
  let panel, frame, launcher, desiredHeight = 280;
  function close(restoreFocus = true) {
    panel?.remove(); panel = null; frame = null;
    launcher?.setAttribute('aria-expanded', 'false');
    if (restoreFocus && launcher?.isConnected) launcher.focus();
  }
  function fit() {
    if (!panel) return;
    const viewport = window.visualViewport;
    const left=viewport?.offsetLeft||0, top=viewport?.offsetTop||0, width=viewport?.width||innerWidth, height=viewport?.height||innerHeight;
    const rect=launcher.getBoundingClientRect(), panelWidth=Math.min(340,width-16);
    if(rect.bottom<top||rect.top>top+height||rect.right<left||rect.left>left+width){close(false);return;}
    const below=top+height-rect.bottom-14, above=rect.top-top-14;
    const useBelow=below>=Math.min(desiredHeight,above), panelHeight=Math.max(90,Math.min(desiredHeight,400,height-16,useBelow?below:above));
    panel.style.left=`${Math.max(left+8,Math.min(rect.left,left+width-panelWidth-8))}px`;
    panel.style.top=`${Math.max(top+8,Math.min(useBelow?rect.bottom+6:rect.top-panelHeight-6,top+height-panelHeight-8))}px`;
    panel.style.width=`${panelWidth}px`;panel.style.height=`${panelHeight}px`;
  }
  function open(button) {
    if(panel&&launcher===button){close();return;}
    close(false); launcher = button;desiredHeight=280;launcher.setAttribute('aria-expanded','true');
    panel = document.createElement('div');
    panel.dataset.xmsPanel = '';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '记得 @ 收藏');
    panel.style.cssText = 'box-sizing:border-box;position:fixed;z-index:2147483646;background:white;border:1px solid #b4d6fa;border-radius:14px;box-shadow:0 8px 40px #0004;overflow:hidden';
    frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL('popup.html') + '?parentOrigin=' + encodeURIComponent(location.origin); frame.title = '记得 @ 收藏';
    frame.allow = 'clipboard-write';
    frame.style.cssText = 'width:100%;height:100%;border:0;display:block';
    panel.append(frame); document.documentElement.append(panel); fit();
    document.dispatchEvent(new Event('xms-panel-open'));
    frame.addEventListener('load', () => frame.focus());
  }
  function toolbarFor(editor) {
    // Stop before crossing another composer. A page-wide first toolbar could
    // attach a reply's launcher to the main post editor.
    for (let scope = editor.parentElement; scope && scope !== document.body; scope = scope.parentElement) {
      if (scope.querySelectorAll(editorSelector).length !== 1) break;
      const toolbar = scope.querySelector('[data-testid="toolBar"],[role="toolbar"]');
      if (toolbar && !editor.contains(toolbar)) return toolbar;
    }
    return null;
  }
  function iconGroup(toolbar) {
    const originalButton = toolbar.querySelector('button:not([data-xms-launcher]),[role="button"]:not([data-xms-launcher])');
    const group = originalButton?.parentElement;
    // Use the existing icon row where available; never create another row.
    if (group && toolbar.contains(group) && ['flex', 'inline-flex'].includes(getComputedStyle(group).display) && getComputedStyle(group).flexDirection === 'row') return group;
    return toolbar;
  }
  function placeFloating() {
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const right = left + (viewport?.width || innerWidth), bottom = top + (viewport?.height || innerHeight);
    for (const [editor, record] of mounted) {
      if (!record.floating || !editor.isConnected) continue;
      const rect = editor.getBoundingClientRect();
      record.button.style.display = rect.bottom > top && rect.top < bottom && rect.right > left && rect.left < right ? 'inline-flex' : 'none';
      record.button.style.left = `${Math.max(left + 2, Math.min(rect.right - 32, right - 32))}px`;
      record.button.style.top = `${Math.max(top + 2, Math.min(rect.top + 2, bottom - 32))}px`;
    }
  }
  const resizeObserver = new ResizeObserver(() => { placeFloating(); fit(); });
  function mount() {
    for (const [editor, record] of mounted) {
      if (!editor.isConnected) {
        if (record.button === launcher && panel) close();
        record.button.remove(); resizeObserver.unobserve(editor); mounted.delete(editor);
      }
    }
    for (const editor of document.querySelectorAll(editorSelector)) {
      const toolbar = toolbarFor(editor);
      const current = mounted.get(editor);
      if (current?.button.isConnected && current.toolbar === toolbar) continue;
      current?.button.remove();
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = '@'; button.dataset.xmsLauncher = '';
      button.title = '记得 @';
      button.setAttribute('aria-label', '打开记得 @ 收藏'); button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-expanded', 'false');
      button.style.cssText = 'box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex:0 0 30px;width:30px;height:30px;min-width:30px;max-height:30px;padding:0;margin:0;border:0;border-radius:50%;background:transparent;color:rgb(29,155,240);font:600 20px/1 system-ui;cursor:pointer;touch-action:manipulation;vertical-align:middle';
      button.addEventListener('click', () => open(button));
      let floating = !toolbar;
      if (toolbar) {
        const beforeHeight = toolbar.getBoundingClientRect().height;
        iconGroup(toolbar).append(button);
        // A crowded/wrapping toolbar must not gain a second line.
        if (toolbar.getBoundingClientRect().height > beforeHeight + 0.5) {
          button.remove(); floating = true;
        }
      }
      if (floating) {
        button.dataset.xmsFloating = '';
        button.style.position = 'fixed'; button.style.zIndex = '2147483400';
        document.documentElement.append(button);
      }
      mounted.set(editor, { button, toolbar, floating }); resizeObserver.observe(editor);
    }
    placeFloating();
    if (panel && !launcher?.isConnected) close();
  }
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true; requestAnimationFrame(() => { scheduled = false; mount(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('message', event => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== chrome.runtime.getURL('').replace(/\/$/, '')) return;
    if(event.data?.type==='xms-close-panel')close();
    else if(event.data?.type==='xms-panel-size'&&Number.isFinite(event.data.height)){
      const next=Math.max(180,Math.min(400,event.data.height));if(Math.abs(next-desiredHeight)>1){desiredHeight=next;fit();}
    }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  document.addEventListener('pointerdown',event=>{if(panel&&!panel.contains(event.target)&&!launcher?.contains(event.target))close(false);},true);
  const reposition = () => { placeFloating(); fit(); };
  window.visualViewport?.addEventListener('resize', reposition);
  window.visualViewport?.addEventListener('scroll', reposition);
  window.addEventListener('resize', reposition);
  document.addEventListener('scroll', reposition, true);
  mount();
})();

// Refresh saved profiles from visible X information. Unknown people remain unsaved.
(() => {
  let timer, signature='';
  const scan=()=>globalThis.XMSProfiles.scan();
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id!==chrome.runtime.id||message?.type!=='xms-scan-profiles')return;
    respond({profiles:scan()});return false;
  });
  const update=()=>{
    const profiles=scan(), next=JSON.stringify(profiles);if(next===signature)return;signature=next;
    chrome.runtime.sendMessage({type:'enrich',profiles}).catch(()=>{});
  };
  new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(update,350);}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src','href']});
  update();
})();
