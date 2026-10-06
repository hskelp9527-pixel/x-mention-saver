import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const extension = fileURLToPath(new URL('..', import.meta.url));
const profile = await mkdtemp(join(tmpdir(), 'x-mention-test-'));
const output = resolve(extension, 'artifacts');
await mkdir(output, { recursive: true });
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.BROWSER_PATH || (existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe') ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : chromium.executablePath()),
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 1000, height: 740 }
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = [];
  const popup = await context.newPage();
  popup.on('pageerror', error => errors.push(error.message));
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.waitForFunction(() => document.querySelector('#select-all').disabled);
  console.log('Loaded extension popup');
  await popup.locator('#handle').fill('@brucejinji711');
  await popup.locator('#note').fill('长文时记得 @ 他');
  await popup.locator('#save').click();
  await popup.locator('.person').waitFor();
  assert.equal(await popup.locator('.person').count(), 1);
  await popup.locator('#handle').fill('https://x.com/another_user');
  await popup.locator('#save').click();
  await popup.waitForFunction(() => document.querySelectorAll('.person').length === 2);
  await popup.locator('#select-all').click();
  await popup.locator('#copy-selected').click();
  await popup.waitForFunction(() => document.querySelector('#status').textContent.includes('已复制 2'));
  assert.equal(await popup.evaluate(() => navigator.clipboard.readText()), '@another_user @brucejinji711');
  await popup.locator('#separator').selectOption('line');
  await popup.locator('#copy-selected').click();
  assert.equal((await popup.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), '@another_user\n@brucejinji711');
  console.log('Verified clipboard and CRUD');
  await popup.locator('#search').fill('长文');
  assert.equal(await popup.locator('.person').count(), 1);
  assert.equal(await popup.locator('#selection-count').textContent(), '已选 2 位');
  await popup.locator('#search').fill('');
  await popup.locator('[aria-label="编辑 @brucejinji711 的备注"]').click();
  await popup.locator('#note').fill('会帮忙转发');
  await popup.locator('#save').click();
  await popup.waitForFunction(() => document.querySelector('#status').textContent === '备注已保存');

  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await context.route('https://x.com/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>选中保存演示</title></head><body style="font:20px system-ui;padding:120px 80px"><h2>模拟 X 页面 · 选中用户名即可收藏</h2><span id="handle">@BruceJinji711</span><p id="new">@new_friend</p><p id="invalid">普通文字</p><p id="email">person@example.com</p><p id="multi">@alice @bob</p><p id="long">@abcdefghijklmnop</p><p id="right" style="position:fixed;right:8px;top:25px">@near_edge</p><div contenteditable="true" id="editor">@in_editor</div></body></html>` }));
  await page.goto('https://x.com/home');
  assert.equal(await page.evaluate(() => document.characterSet), 'UTF-8');
  assert.equal(await page.locator('h2').textContent(), '模拟 X 页面 · 选中用户名即可收藏');
  assert.equal(await page.locator('#invalid').textContent(), '普通文字');
  await page.waitForFunction(() => [...document.documentElement.children].some(el => el.style.zIndex === '2147483647'));
  console.log('Loaded selection script');
  async function select(elementId) {
    await page.evaluate(id => {
      const range = document.createRange(); range.selectNodeContents(document.getElementById(id));
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    }, elementId);
    await page.waitForTimeout(70);
  }
  async function bounds() {
    return page.evaluate(() => {
      const el = [...document.documentElement.children].find(el => el.style.zIndex === '2147483647');
      const a = el.getBoundingClientRect(); const b = getSelection().getRangeAt(0).getBoundingClientRect();
      return { button: { x: a.x, y: a.y, width: a.width, height: a.height }, overlaps: a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top, display: el.style.display };
    });
  }
  await select('handle');
  let state = await bounds();
  assert.equal(state.display, 'block'); assert.equal(state.overlaps, false);
  await page.mouse.click(state.button.x + state.button.width / 2, state.button.y + 16);
  await popup.bringToFront();
  await popup.waitForFunction(() => document.querySelector('#count').textContent === '2 位');
  assert.equal((await worker.evaluate(() => chrome.storage.local.get('entries'))).entries.find(entry => entry.id === 'brucejinji711').note, '会帮忙转发');
  await page.bringToFront(); await select('new');
  state = await bounds(); await page.mouse.click(state.button.x + 20, state.button.y + 16);
  await popup.bringToFront();
  await popup.waitForFunction(() => document.querySelector('#count').textContent === '3 位');
  await page.bringToFront();
  for (const name of ['invalid', 'email', 'multi', 'long', 'editor']) {
    await select(name); assert.equal((await bounds()).display, 'none', name);
  }
  await select('right'); state = await bounds();
  assert.equal(state.display, 'block'); assert.equal(state.overlaps, false);
  assert.ok(state.button.x >= 0 && state.button.x + state.button.width <= 1000);
  await page.keyboard.press('Escape'); assert.equal((await bounds()).display, 'none');
  await page.setViewportSize({ width: 200, height: 740 });
  await select('right'); state = await bounds();
  assert.equal(state.display, 'block'); assert.equal(state.overlaps, false);
  assert.ok(state.button.x >= 0 && state.button.x + state.button.width <= 200);
  await page.setViewportSize({ width: 1000, height: 740 });
  await select('new');
  await page.screenshot({ path: join(output, 'selection-preview.png') });
  await popup.bringToFront();
  await popup.locator('#search').fill('');
  const popupHeight = await popup.evaluate(() => document.body.getBoundingClientRect().height);
  await popup.screenshot({ path: join(output, 'popup-preview.png'), clip: { x: 0, y: 0, width: 390, height: popupHeight } });
  // Reopening keeps data while resetting the temporary selection.
  await popup.reload();
  await popup.waitForFunction(() => document.querySelector('#count').textContent === '3 位');
  assert.equal(await popup.locator('#selection-count').textContent(), '已选 0 位');
  const before = (await worker.evaluate(() => chrome.storage.local.get('entries'))).entries;
  const invalidImport = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'import', entries: [{ handle: 'valid_one' }, { handle: 'bad handle' }] }));
  assert.equal(invalidImport.ok, false);
  assert.deepEqual((await worker.evaluate(() => chrome.storage.local.get('entries'))).entries, before);
  await popup.locator('[aria-label="删除 @new_friend"]').click();
  await popup.waitForFunction(() => document.querySelector('#count').textContent === '2 位');
  assert.deepEqual(errors, []);
  console.log('PASS: real extension storage, popup CRUD/search/copy, strict selection, button placement, duplicate protection, persistence, atomic import.');
} finally {
  if (context) await context.close();
  await rm(profile, { recursive: true, force: true });
}
