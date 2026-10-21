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

// Mount one launcher beside each X editor, outside its editable DOM. No editor
// text, selection, submit button or X network request is changed.
(() => {
  const mounted = new WeakMap();
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
    panel.style.width = `${Math.min(420, (viewport?.width || innerWidth) - 16)}px`;
    panel.style.height = `${Math.max(100, (viewport?.height || innerHeight) - 16)}px`;
  }
  function open(button) {
    close(); launcher = button;
    panel = document.createElement('div');
    panel.dataset.xmsPanel = '';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '记得 @ 收藏');
    panel.style.cssText = 'position:fixed;z-index:2147483646;background:white;border:1px solid #b4d6fa;border-radius:14px;box-shadow:0 8px 40px #0004;overflow:hidden';
    frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL('popup.html') + '?parentOrigin=' + encodeURIComponent(location.origin); frame.title = '记得 @ 收藏';
    frame.allow = 'clipboard-write';
    frame.style.cssText = 'width:100%;height:100%;border:0;display:block';
    panel.append(frame); document.documentElement.append(panel); fit();
    frame.addEventListener('load', () => frame.focus());
  }
  function mount() {
    for (const editor of document.querySelectorAll('[contenteditable="true"][data-testid^="tweetTextarea_"],textarea[data-testid^="tweetTextarea_"]')) {
      if (mounted.get(editor)?.isConnected) continue;
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = '@ 记得'; button.dataset.xmsLauncher = '';
      button.setAttribute('aria-label', '打开记得 @ 收藏'); button.setAttribute('aria-haspopup', 'dialog');
      button.style.cssText = 'display:block;min-height:44px;padding:8px 14px;margin:4px 0;border:1px solid #b4d6fa;border-radius:24px;background:#fff;color:#0866b9;font:600 14px system-ui;cursor:pointer;touch-action:manipulation';
      button.addEventListener('click', () => open(button));
      editor.insertAdjacentElement('afterend', button); mounted.set(editor, button);
    }
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
  window.visualViewport?.addEventListener('resize', fit);
  window.visualViewport?.addEventListener('scroll', fit);
  window.addEventListener('resize', fit);
  mount();
})();
