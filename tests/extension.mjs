// Opt-in integration check using an installed Tampermonkey extension's program
// files, an empty temporary profile, real @require/@resource downloads, and no key.
import { chromium } from 'playwright'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const extension = process.env.WHALE_TAMPERMONKEY
if (!extension) throw new Error('Set WHALE_TAMPERMONKEY to the extension version directory containing manifest.json')
const code = await readFile(new URL('../DeepSeek-Balance-Whale-Widget.user.js', import.meta.url), 'utf8')
await mkdir('test-results', { recursive: true })
const profile = resolve('test-results/edge-extension-' + Date.now())
const server = createServer((req, res) => {
  const install = req.url.endsWith('.user.js')
  res.writeHead(200, { 'Content-Type': install ? 'text/javascript' : 'text/html' })
  res.end(install ? code : '<!doctype html><title>Ordinary site</title><button>Ordinary page button</button>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let context
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.WHALE_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`], ignoreDefaultArgs: ['--disable-extensions'],
  })
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 })
  const extensionId = new URL(worker.url()).host
  const page = await context.newPage()
  // These changes apply ONLY to the empty test profile created above.
  await page.goto('edge://extensions/')
  await page.evaluate(() => new Promise((resolve, reject) => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true },
    () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve())))
  await page.evaluate(extensionId => new Promise((resolve, reject) => chrome.developerPrivate.updateExtensionConfiguration({ extensionId, userScriptsAccess: true },
    () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve())), extensionId)
  await worker.evaluate(() => chrome.userScripts.getScripts())
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await page.waitForFunction(() => document.querySelector('input,select'))
  await page.goto(`http://127.0.0.1:${server.address().port}/Whale.user.js`).catch(error => {
    if (!error.message.includes('ERR_ABORTED')) throw error
  })
  let installer
  const deadline = Date.now() + 15000
  // The new page initially has an empty URL; a page-event URL predicate misses it.
  while (Date.now() < deadline) {
    installer = context.pages().find(page => page.url().includes('/ask.html'))
    if (installer) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(installer, 'Tampermonkey install page should open')
  await installer.getByRole('button', { name: /^(安装|Install)$/, exact: true }).click()
  console.log('Installed in empty profile:', extensionId)
  const logs = [], errors = []
  const debug = await context.newCDPSession(page)
  const parsed = []
  debug.on('Debugger.scriptParsed', script => { if (script.url.includes('userscript')) parsed.push(script) })
  await debug.send('Debugger.enable')
  page.on('pageerror', error => errors.push(error.stack))
  page.on('console', message => { if (message.text().includes('[DeepSeek Whale]')) {
    logs.push(message.text()); if (message.type() === 'error') errors.push(message.text())
  } })
  // Let installation finish registering scripts before navigating.
  await page.waitForTimeout(3000)
  await page.goto('https://www.deepseek.com/en/', { waitUntil: 'domcontentloaded' })
  await page.bringToFront()
  try {
    await page.waitForFunction(() => document.getElementById('deepseek-whale-userjs') || document.getElementById('deepseek-whale-userjs-error'), null, { timeout: 60000 })
  } catch (error) {
    console.error('Startup observations:', JSON.stringify({ logs, errors }))
    console.error('Userscript sources:', parsed.map(script => script.url))
    for (const item of parsed) {
      const { scriptSource } = await debug.send('Debugger.getScriptSource', { scriptId: item.scriptId })
      if (!scriptSource.includes('deepseek-whale-userjs')) continue
      await writeFile('test-results/injected-source.js', scriptSource)
      const at = scriptSource.indexOf('module.exports = HTTPSend')
      console.error('Require boundary:', scriptSource.slice(at - 60, at + 900))
    }
    throw error
  }
  const startupError = await page.evaluate(() => document.getElementById('deepseek-whale-userjs-error')?.textContent || null)
  assert.equal(startupError, null, startupError)
  const cdp = await context.newCDPSession(page)
  const tree = await cdp.send('DOM.getDocument', { depth: -1, pierce: true })
  function findImage(node) {
    if (node.nodeName === 'IMG' && node.attributes?.includes('dshwv-img')) return node
    for (const child of [...node.children || [], ...node.shadowRoots || []]) { const found = findImage(child); if (found) return found }
  }
  const node = findImage(tree.root)
  assert.ok(node, 'role image must be inside the closed shadow root')
  const remote = await cdp.send('DOM.resolveNode', { nodeId: node.nodeId })
  const loaded = await cdp.send('Runtime.callFunctionOn', { objectId: remote.object.objectId, returnByValue: true, awaitPromise: true,
    functionDeclaration: `async function() {
      if (!this.complete) await new Promise((resolve, reject) => { this.addEventListener('load', resolve, {once:true}); this.addEventListener('error', reject, {once:true}); setTimeout(() => reject(new Error('Image timeout')), 10000) });
      return { width: this.naturalWidth, height: this.naturalHeight, bounds: this.getBoundingClientRect().toJSON() };
    }` })
  const image = loaded.result.value
  assert.equal(image?.width, 610)
  assert.ok(image.bounds.width > 0 && image.bounds.bottom > 0)
  const closedMenu = await cdp.send('Runtime.callFunctionOn', { objectId: remote.object.objectId, returnByValue: true,
    functionDeclaration: `function() {
      const menu = this.getRootNode().querySelector('.dshwv-menu');
      const rect = menu.querySelector('.whale-user-button').getBoundingClientRect();
      return { inert: menu.inert, point: {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2} };
    }` })
  const menu = closedMenu.result.value
  assert.equal(menu.inert, true)
  await page.evaluate(point => {
    const button = document.createElement('button')
    button.id = 'extension-menu-underlay'
    button.textContent = 'Click-through check'
    button.style.cssText = `position:fixed;left:${point.x - 40}px;top:${point.y - 12}px;width:80px;height:24px;z-index:2147482999;`
    button.onclick = () => { button.dataset.clicked = 'true' }
    document.body.appendChild(button)
  }, menu.point)
  await page.mouse.click(menu.point.x, menu.point.y)
  assert.equal(await page.locator('#extension-menu-underlay').getAttribute('data-clicked'), 'true')
  await page.locator('#extension-menu-underlay').evaluate(button => button.remove())
  async function menuState() {
    const result = await cdp.send('Runtime.callFunctionOn', { objectId: remote.object.objectId, returnByValue: true,
      functionDeclaration: `function() {
        const shadow = this.getRootNode(), button = shadow.querySelector('.dshwv-menu-btn');
        const menu = shadow.querySelector('.dshwv-menu'), rect = button.getBoundingClientRect();
        const blocked = [];
        for (const x of [.15, .5, .85]) for (const y of [.15, .5, .85]) {
          const target = shadow.elementFromPoint(rect.x + x * rect.width, rect.y + y * rect.height);
          if (target?.closest('.dshwv-menu-btn') !== button) blocked.push(String(target?.className || target?.tagName));
        }
        return { image: this.getBoundingClientRect().toJSON(), button: rect.toJSON(),
          visible: getComputedStyle(button).visibility === 'visible', blocked,
          open: menu.classList.contains('dshwv-menu-open'), inert: menu.inert };
      }` })
    return result.result.value
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.mouse.move(640, 100)
    assert.equal((await menuState()).visible, false)
    const { image: r, button: b } = await menuState()
    await page.mouse.move(r.x + r.width * .65, r.y + r.height * .65)
    await page.mouse.move(r.x + 2, r.y + 2, { steps: 20 })
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 32 })
    const beforeClick = await menuState()
    assert.equal(beforeClick.visible, true, 'menu must remain visible across transparent pixels')
    assert.deepEqual(beforeClick.blocked, [], 'no control may obstruct the menu button')
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
    assert.equal((await menuState()).open, true, 'one click must open the menu')
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
    assert.equal((await menuState()).inert, true, 'one click must close the menu')
  }
  const prototype = await cdp.send('Runtime.evaluate', { expression: 'HTMLAudioElement.prototype' })
  const audioObjects = await cdp.send('Runtime.queryObjects', { prototypeObjectId: prototype.result.objectId })
  const audioInfo = await cdp.send('Runtime.callFunctionOn', { objectId: audioObjects.objects.objectId, returnByValue: true, awaitPromise: true,
    functionDeclaration: `async function() {
      window.whaleAudioEvents = [];
      for (const [id, audio] of this.entries()) {
        for (const type of ['playing', 'ended', 'error']) audio.addEventListener(type, () => window.whaleAudioEvents.push({id, type, time:audio.currentTime, volume:audio.volume, error:audio.error?.message}));
        if (!audio.error && audio.readyState < 2) await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Audio preload timeout')), 5000);
          audio.addEventListener('loadeddata', () => {clearTimeout(timer); resolve()}, {once:true});
          audio.addEventListener('error', () => {clearTimeout(timer); reject(new Error(audio.error.message))}, {once:true});
        });
      }
      return this.map(audio => ({mime:audio.src.split(',')[0], readyState:audio.readyState, error:audio.error?.message, volume:audio.volume}));
    }` })
  const audioResources = audioInfo.result.value
  assert.ok(audioResources?.length >= 2, 'press and release audio elements must exist')
  for (const audio of audioResources) {
    assert.equal(audio.error, undefined)
    assert.ok(audio.readyState >= 2, 'real @resource audio must decode')
    assert.equal(audio.mime, 'data:audio/mpeg;base64')
    assert.equal(audio.volume, 0, 'fresh install is muted')
  }
  await cdp.send('Runtime.callFunctionOn', { objectId: remote.object.objectId,
    functionDeclaration: `function() {
      const slider = this.getRootNode().querySelector('.dshwv-volpct').parentElement.querySelector('input');
      slider.value = '0.6'; slider.dispatchEvent(new Event('input', {bubbles:true}));
    }` })
  const fresh = await cdp.send('Runtime.callFunctionOn', { objectId: remote.object.objectId, returnByValue: true,
    functionDeclaration: `function() { return {bounds:this.getBoundingClientRect().toJSON(),volume:this.getRootNode().querySelector('.dshwv-volpct').textContent}; }` })
  assert.equal(fresh.result.value.volume, '60%')
  const bounds = fresh.result.value.bounds
  await page.mouse.click(bounds.x + bounds.width * .65, bounds.y + bounds.height * .65)
  await page.waitForFunction(() => new Set(window.whaleAudioEvents.filter(event => event.type === 'ended').map(event => event.id)).size === 2, null, { timeout: 5000 })
  const audioEvents = await page.evaluate(() => window.whaleAudioEvents)
  assert.equal(audioEvents.filter(event => event.type === 'playing').length, 2)
  assert.ok(audioEvents.every(event => event.type !== 'error' && event.volume === .6))
  assert.ok(audioEvents.filter(event => event.type === 'ended').every(event => event.time > 0))
  // Real GM storage must synchronize display policy across origins/tabs.
  const ordinary = await context.newPage()
  const ordinaryDebug = await context.newCDPSession(ordinary)
  await ordinaryDebug.send('Debugger.enable')
  const ordinaryScripts = []
  ordinaryDebug.on('Debugger.scriptParsed', script => { if (script.url.includes('userscript')) ordinaryScripts.push(script) })
  await ordinary.goto(`http://127.0.0.1:${server.address().port}/display-test`, { waitUntil: 'domcontentloaded' })
  const injectionDeadline = Date.now() + 15000
  while (!ordinaryScripts.length && Date.now() < injectionDeadline) await ordinary.waitForTimeout(100)
  assert.ok(ordinaryScripts.length, 'script must execute on ordinary HTTP websites')
  assert.equal(await ordinary.locator('#deepseek-whale-userjs').count(), 0, 'ordinary website defaults off')
  async function setDisplay(name, checked) {
    await cdp.send('Runtime.callFunctionOn', { objectId: remote.object.objectId,
      arguments: [{ value: name }, { value: checked }], functionDeclaration: `function(name, checked) {
        const input = this.getRootNode().querySelector('[data-whale-display="' + name + '"]');
        if (input.checked !== checked) input.click();
      }` })
  }
  await setDisplay('global', true)
  await ordinary.waitForSelector('#deepseek-whale-userjs', { state: 'attached', timeout: 15000 })
  await ordinary.reload()
  await ordinary.waitForSelector('#deepseek-whale-userjs', { state: 'attached', timeout: 15000 })
  await setDisplay('global', false)
  await ordinary.waitForSelector('#deepseek-whale-userjs', { state: 'detached', timeout: 15000 })
  assert.equal(await page.locator('#deepseek-whale-userjs').count(), 1, 'DeepSeek switch remains enabled independently')
  await setDisplay('site', true)
  await setDisplay('deepseek', false)
  assert.equal(await page.locator('#deepseek-whale-userjs').count(), 1, 'site switch remains enabled independently')
  assert.equal(await ordinary.locator('#deepseek-whale-userjs').count(), 0, 'site switch does not enable another hostname')
  await setDisplay('site', false)
  await page.waitForSelector('#deepseek-whale-userjs', { state: 'detached' })
  assert.deepEqual(errors, [])
  await page.screenshot({ path: 'test-results/extension-deepseek.png' })
  await writeFile('test-results/extension.json', JSON.stringify({ ok: true, extensionId, image, closedMenuClickThrough: true, menuButtonApproachAndHitGrid: true, displaySwitchesAndCrossTabSync: true, audioResources, audioEvents, logs, errors, profile }, null, 2))
  console.log('Real Tampermonkey on DeepSeek homepage passed:', extensionId)
} finally { await context?.close(); server.close() }
