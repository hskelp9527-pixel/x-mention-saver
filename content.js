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
  let busy = false;
  let feedback = false;
  let timer;
  let frame;
  const hide = () => { host.style.display = 'none'; handle = ''; feedback = false; clearTimeout(timer); };

  function extractName(element, selectedHandle) {
    const block = element?.closest('[data-testid="User-Name"], [data-testid="UserCell"], [data-testid="UserName"]');
    // A nearby post or arbitrary profile link is not reliable evidence of a name.
    if (!block) return '';
    const wanted = selectedHandle.slice(1).toLowerCase();
    if (block.dataset.testid === 'UserName') {
      const nodes = [...block.querySelectorAll('span, [dir="auto"]')];
      if (!nodes.some(node => node.textContent.trim().toLowerCase() === selectedHandle.toLowerCase())) return '';
      return nodes.find(node => node.matches('[dir="auto"]') && node.textContent.trim() && !node.textContent.trim().startsWith('@'))?.textContent.trim().slice(0, 100) || '';
    }
    const links = [...block.querySelectorAll('a[href]')].filter(link => {
      try { return new URL(link.href).pathname.toLowerCase().replace(/\/$/, '') === '/' + wanted; } catch { return false; }
    });
    const nameLink = links.find(link => link.textContent.trim() && !link.textContent.trim().startsWith('@'));
    if (!nameLink) return '';
    // X puts the display name inside dir=auto; exclude badge accessibility text.
    return (nameLink.querySelector('[dir="auto"]')?.textContent || nameLink.textContent).trim().slice(0, 100);
  }
  function refresh() {
    if (busy) return;
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
    displayName = extractName(element, text);
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
      const result = await chrome.runtime.sendMessage({ type: 'save', handle: savedHandle, displayName });
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
  document.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
})();

// Mount one small launcher in each editor toolbar, outside its editable DOM. No editor
// text, selection, submit button or X network request is changed.
(() => {
  const editorSelector = '[contenteditable="true"][data-testid^="tweetTextarea_"],textarea[data-testid^="tweetTextarea_"]';
  const mounted = new Map();
  let panel, frame, launcher;
  function close() {
    panel?.remove(); panel = null; frame = null;
    if (launcher?.isConnected) launcher.focus();
  }
  function fit() {
    if (!panel) return;
    const viewport = window.visualViewport;
    panel.style.left = `${(viewport?.offsetLeft || 0) + 8}px`;
    panel.style.top = `${(viewport?.offsetTop || 0) + 8}px`;
    panel.style.width = `${Math.min(360, (viewport?.width || innerWidth) - 16)}px`;
    panel.style.height = `${Math.max(80, Math.min(480, (viewport?.height || innerHeight) - 16))}px`;
  }
  function open(button) {
    close(); launcher = button;
    panel = document.createElement('div');
    panel.dataset.xmsPanel = '';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '记得 @ 收藏');
    panel.style.cssText = 'box-sizing:border-box;position:fixed;z-index:2147483646;background:white;border:1px solid #b4d6fa;border-radius:14px;box-shadow:0 8px 40px #0004;overflow:hidden';
    frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL('popup.html') + '?parentOrigin=' + encodeURIComponent(location.origin); frame.title = '记得 @ 收藏';
    frame.allow = 'clipboard-write';
    frame.style.cssText = 'width:100%;height:100%;border:0;display:block';
    panel.append(frame); document.documentElement.append(panel); fit();
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
    if (frame && event.source === frame.contentWindow && event.origin === chrome.runtime.getURL('').replace(/\/$/, '') && event.data?.type === 'xms-close-panel') close();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  const reposition = () => { placeFloating(); fit(); };
  window.visualViewport?.addEventListener('resize', reposition);
  window.visualViewport?.addEventListener('scroll', reposition);
  window.addEventListener('resize', reposition);
  document.addEventListener('scroll', placeFloating, true);
  mount();
})();
