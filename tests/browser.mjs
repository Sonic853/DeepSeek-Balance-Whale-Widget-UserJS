import { chromium } from 'playwright'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const browser = await chromium.launch({ executablePath: process.env.WHALE_BROWSER
  || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const errors = []
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const assets = {}
  for (const file of ['DSniang1.png', 'Ya1.mp3', 'Ya2.mp3', 'D1.mp3', 'D2.mp3',
    'minecraft-exp-orb.wav', 'task-end-a.wav', 'bubble-petpet.gif', 'bubble-money1.gif']) {
    const mime = file.endsWith('.png') ? 'image/png' : file.endsWith('.gif') ? 'image/gif'
      : file.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav'
    assets[file.replaceAll('.', '_').replaceAll('-', '_')] = `data:${mime};base64,${(await readFile(new URL(`../assets/${file}`, import.meta.url))).toString('base64')}`
  }
  const script = await readFile(new URL('../DeepSeek-Balance-Whale-Widget.user.js', import.meta.url), 'utf8')
  const http = await readFile(new URL('./fixtures/HTTPSend.js', import.meta.url), 'utf8')
  await context.route('**/*', route => {
    if (route.request().isNavigationRequest()) return route.fulfill({ contentType: 'text/html',
      headers: { 'Content-Security-Policy': "default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'none'; script-src 'unsafe-inline'" },
      body: '<!doctype html><html><head><meta charset="utf-8"><title>DeepSeek fixture</title></head><body><button id="ordinary" onclick="window.ordinaryClicks=(window.ordinaryClicks||0)+1">网页原有按钮</button><div id="root"></div></body></html>' })
    errors.push(`Unexpected page request: ${route.request().url()}`)
    return route.abort()
  })
  await context.addInitScript(({ assets, http }) => {
    const attach = Element.prototype.attachShadow
    Element.prototype.attachShadow = function (options) {
      const shadow = attach.call(this, options)
      if (this.id === 'deepseek-whale-userjs') window.testShadow = shadow
      return shadow
    }
    window.testValues = new Map()
    window.testCommands = new Map()
    window.testCalls = []
    window.testResourceCalls = 0
    window.testBalance = 12.345
    window.GM_getValue = (key, fallback) => testValues.has(key) ? structuredClone(testValues.get(key)) : fallback
    window.GM_setValue = (key, value) => testValues.set(key, structuredClone(value))
    window.GM_deleteValue = key => testValues.delete(key)
    window.GM_listValues = () => [...testValues.keys()]
    window.GM_getResourceURL = key => { testResourceCalls++; return assets[key] }
    window.GM_registerMenuCommand = (label, callback) => { testCommands.set(label, callback); return label }
    window.GM_unregisterMenuCommand = label => testCommands.delete(label)
    window.GM_xmlhttpRequest = details => {
      testCalls.push({ url: details.url, auth: details.headers.Authorization })
      const timer = setTimeout(() => details.onload({ status: window.testStatus || 200, response: {
        balance_infos: [{ currency: 'CNY', total_balance: String(testBalance) }], is_available: true,
      } }), 10)
      return { abort() { clearTimeout(timer); details.onabort?.({ status: 0 }) } }
    }
  }, { assets, http })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.stack))
  page.on('console', message => { if (message.type() === 'error' && message.text().includes('[DeepSeek Whale]')) errors.push(message.text()) })
  await page.goto('https://chat.deepseek.com/')
  // Tampermonkey concatenates @require and main code into one execution unit.
  // Separate script tags hide ASI bugs at that boundary.
  await page.addScriptTag({ content: http + '\n' + script })
  await page.waitForFunction(() => window.testShadow?.querySelector('.dshwv-img')?.naturalWidth > 0)
  assert.equal(await page.evaluate(() => document.getElementById('deepseek-whale-userjs').shadowRoot), null)
  assert.equal(await page.evaluate(() => testCalls.length), 0)
  await page.locator('#ordinary').click()
  assert.equal(await page.evaluate(() => ordinaryClicks), 1)

  // Place a real webpage button beneath the menu's first action. A transparent
  // menu must never steal this coordinate, either initially or after closing.
  async function clickThroughClosedMenu() {
    const point = await page.evaluate(() => {
      const menu = testShadow.querySelector('.dshwv-menu')
      const action = menu.querySelector('.whale-user-button')
      const rect = action.getBoundingClientRect()
      const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
      const button = document.getElementById('under-menu') || document.createElement('button')
      button.id = 'under-menu'
      button.textContent = '菜单下方的网页按钮'
      button.style.cssText = `position:fixed;left:${point.x - 50}px;top:${point.y - 12}px;width:100px;height:24px;z-index:10;`
      button.onclick = () => { window.underMenuClicks = (window.underMenuClicks || 0) + 1 }
      document.body.appendChild(button)
      return point
    })
    const before = await page.evaluate(() => window.underMenuClicks || 0)
    await page.mouse.click(point.x, point.y)
    assert.equal(await page.evaluate(() => window.underMenuClicks || 0), before + 1, 'closed menu must pass the click to the page')
    assert.equal(await page.evaluate(() => testShadow.querySelector('.dshwv-menu').classList.contains('dshwv-menu-open')), false)
    await page.evaluate(() => testShadow.querySelector('.dshwv-menu input').focus())
    assert.equal(await page.evaluate(() => testShadow.querySelector('.dshwv-menu').contains(testShadow.activeElement)), false, 'closed menu must not take keyboard focus')
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => testShadow.querySelector('.dshwv-menu').contains(testShadow.activeElement)), false)
    await page.evaluate(() => document.getElementById('under-menu').remove())
  }
  await clickThroughClosedMenu()

  async function checkInvisibleHitTargets() {
    const hits = await page.evaluate(() => {
      const root = testShadow.querySelector('.dshwv-root').getBoundingClientRect()
      const hits = new Set()
      for (let y = Math.max(0, root.top - 420); y < Math.min(innerHeight, root.bottom + 8); y += 7) {
        for (let x = Math.max(0, root.left - 350); x < Math.min(innerWidth, root.right + 350); x += 7) {
          const target = testShadow.elementFromPoint(x, y)
          if (!target || target.getRootNode() !== testShadow) continue
          for (let el = target; el && el !== testShadow; el = el.parentElement) {
            const style = getComputedStyle(el)
            if (style.visibility === 'hidden' || Number(style.opacity) === 0 || el.inert) {
              hits.add(target.className + ' under ' + el.className)
              break
            }
          }
        }
      }
      return [...hits]
    })
    assert.deepEqual(hits, [], 'invisible widget controls must not receive pointer hits')
  }
  await checkInvisibleHitTargets()

  // Hover reveals the menu button. Opening restores interaction; closing via
  // the button and via an outside click must both restore click-through.
  const menuToggle = (await page.evaluateHandle(() => testShadow.querySelector('.dshwv-menu-btn'))).asElement()
  assert.equal(await menuToggle.isVisible(), false, 'transparent menu toggle must be hidden')
  async function openMenuByPointer() {
    const point = await page.evaluate(() => { const r = testShadow.querySelector('.dshwv-img').getBoundingClientRect(); return { x: r.x + r.width * .65, y: r.y + r.height * .65 } })
    await page.mouse.move(point.x, point.y)
    const rect = await menuToggle.boundingBox()
    assert.ok(rect, 'hovering the character must reveal its menu button')
    const approach = await page.evaluate(() => {
      const r = testShadow.querySelector('.dshwv-img').getBoundingClientRect()
      return { x: r.left + 2, y: r.top + 2 }
    })
    await page.mouse.move(approach.x, approach.y, { steps: 20 })
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2, { steps: 32 })
    assert.equal(await menuToggle.isVisible(), true, 'menu button must stay visible while moving from the character across transparent pixels')
    assert.equal(await page.evaluate(() => {
      const button = testShadow.querySelector('.dshwv-menu-btn')
      const r = button.getBoundingClientRect()
      return [.15, .5, .85].every(x => [.15, .5, .85].every(y =>
        testShadow.elementFromPoint(r.x + x * r.width, r.y + y * r.height)?.closest('.dshwv-menu-btn') === button))
    }), true, 'the center and edges of the menu button must not be obstructed')
    await menuToggle.click()
    await page.waitForFunction(() => testShadow.querySelector('.dshwv-menu').classList.contains('dshwv-menu-open'))
    await page.evaluate(() => testShadow.querySelector('.dshwv-menu .whale-user-button').focus())
    assert.equal(await page.evaluate(() => testShadow.querySelector('.dshwv-menu .whale-user-button') === testShadow.activeElement), true)
  }
  await openMenuByPointer()
  await menuToggle.click()
  await clickThroughClosedMenu()
  await checkInvisibleHitTargets()
  await openMenuByPointer()
  await page.mouse.click(640, 100)
  await clickThroughClosedMenu()

  // Revealing the button near the character must not make transparent art
  // swallow clicks intended for the webpage below it.
  const transparentPoint = await page.evaluate(() => {
    const r = testShadow.querySelector('.dshwv-img').getBoundingClientRect()
    const button = document.createElement('button')
    button.id = 'under-transparent-art'
    button.textContent = 'Under art'
    button.style.cssText = `position:fixed;left:${r.x}px;top:${r.y}px;width:20px;height:20px;z-index:10;`
    button.onclick = () => { window.transparentArtClicked = true }
    document.body.appendChild(button)
    return { x: r.x + 2, y: r.y + 2 }
  })
  await page.mouse.click(transparentPoint.x, transparentPoint.y)
  assert.equal(await page.evaluate(() => window.transparentArtClicked), true)
  await page.locator('#under-transparent-art').evaluate(button => button.remove())

  // Hidden bubble links may explicitly opt into pointer events too.
  const hiddenLinkPoint = await page.evaluate(() => {
    const link = document.createElement('a')
    link.id = 'test-hidden-link'
    link.href = '#hidden-link'
    link.textContent = '气泡中的链接'
    link.style.cssText = 'pointer-events:auto;position:absolute;left:0;top:0;width:90px;height:22px;'
    testShadow.querySelector('.dshwv-text').appendChild(link)
    const r = link.getBoundingClientRect()
    const point = { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    const button = document.createElement('button')
    button.id = 'under-bubble'
    button.textContent = '气泡下方的网页按钮'
    button.style.cssText = `position:fixed;left:${point.x - 50}px;top:${point.y - 12}px;width:100px;height:24px;z-index:10;`
    button.onclick = () => { window.underBubbleClicked = true }
    document.body.appendChild(button)
    return point
  })
  await page.mouse.click(hiddenLinkPoint.x, hiddenLinkPoint.y)
  assert.equal(await page.evaluate(() => window.underBubbleClicked), true)
  await page.evaluate(() => {
    const link = testShadow.getElementById('test-hidden-link')
    link.focus()
    if (testShadow.activeElement === link) throw new Error('Hidden bubble link received focus')
    link.remove()
    document.getElementById('under-bubble').remove()
  })

  const image = await page.evaluate(() => { const r = testShadow.querySelector('.dshwv-img').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  assert.ok(image.w > 50 && image.x >= 0 && image.y >= 0)
  await page.mouse.click(image.x + image.w * .65, image.y + image.h * .65)
  await page.waitForFunction(() => testShadow.querySelector('.dshwv-pop').classList.contains('dshwv-pop-open'))
  await page.evaluate(() => [...testCommands].find(([label]) => label.includes('设置 DeepSeek'))[1]())
  await page.waitForFunction(() => [...testShadow.querySelectorAll('input[type=password]')].some(el => el.getBoundingClientRect().width > 0))
  const password = (await page.evaluateHandle(() => testShadow.querySelector('input[type=password]'))).asElement()
  await password.fill('test-browser-key')
  const save = (await page.evaluateHandle(() => [...testShadow.querySelectorAll('.dshwv-usage-card button')].find(el => el.textContent === '保存'))).asElement()
  await save.click()
  await page.waitForFunction(() => [...testValues.keys()].some(key => key.includes('ledger:deepseek')))
  await page.waitForFunction(() => testShadow.querySelector('.dshwv-root').title.includes('API 余额'))
  await page.waitForFunction(() => [...testShadow.querySelectorAll('.dshwv-text .dshwv-trow')].some(el => el.textContent.includes('12.35')))
  assert.equal(await page.evaluate(() => testCalls[0].auth), 'Bearer test-browser-key')
  assert.equal(await page.evaluate(() => testShadow.textContent.includes('test-browser-key')), false)
  assert.equal(await page.evaluate(() => localStorage.length), 0)
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true })
  await page.screenshot({ path: new URL('../test-results/settings-desktop.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') })

  await page.evaluate(() => {
    testShadow.querySelectorAll('.dshwv-usage-mask').forEach(el => el.remove())
    testBalance = 12.34
    ;[...testCommands].find(([label]) => label.includes('刷新余额'))[1]()
  })
  await page.waitForFunction(() => [...testValues].some(([key, ledger]) => key.includes('ledger:deepseek') && ledger.events.length === 1))
  const ledger = await page.evaluate(() => [...testValues].find(([key]) => key.includes('ledger:deepseek'))[1])
  assert.equal(ledger.events[0].cost, .005)
  await page.waitForFunction(() => [...testShadow.querySelectorAll('.dshwv-text .dshwv-trow')].some(el => el.textContent.includes('12.34')))

  await page.evaluate(() => { testStatus = 401; [...testCommands].find(([label]) => label.includes('刷新余额'))[1]() })
  await page.waitForFunction(() => testShadow.querySelector('.dshwv-root').title.includes('HTTP 401'))
  assert.ok(await page.evaluate(() => [...testShadow.querySelectorAll('.dshwv-text .dshwv-trow')].some(el => el.textContent === '余额不可用')))
  await page.evaluate(() => { testStatus = 200; [...testCommands].find(([label]) => label.includes('刷新余额'))[1]() })
  await page.waitForFunction(() => [...testShadow.querySelectorAll('.dshwv-text .dshwv-trow')].some(el => el.textContent.includes('12.34')))

  // Drag opaque pixels to the left edge; movement must mirror the original art.
  await page.mouse.move(image.x + image.w * .6, image.y + image.h * .6)
  await page.mouse.down()
  await page.mouse.move(65, 680, { steps: 14 })
  await page.mouse.up()
  await page.waitForFunction(() => testShadow.querySelector('.dshwv-root').classList.contains('dshwv-left'))
  await page.screenshot({ path: new URL('../test-results/widget-desktop.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(400)
  const bounds = await page.evaluate(() => { const r = testShadow.querySelector('.dshwv-root').getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom } })
  assert.ok(bounds.x >= -1 && bounds.y >= -1 && bounds.right <= 391 && bounds.bottom <= 845)
  await page.screenshot({ path: new URL('../test-results/widget-mobile.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') })
  // Open and save the original bubble editor through real DOM controls.
  await openMenuByPointer()
  const bubbleButton = (await page.evaluateHandle(() => [...testShadow.querySelectorAll('.dshwv-menu button')]
    .find(el => el.textContent.includes('自定义泡泡')))).asElement()
  assert.ok(bubbleButton, 'bubble editor entry should exist')
  await bubbleButton.click()
  await page.waitForFunction(() => testShadow.querySelector('.dshwv-bubmask').getBoundingClientRect().width > 0)
  const bubbleSave = (await page.evaluateHandle(() => [...testShadow.querySelectorAll('.dshwv-bubmask button')]
    .find(el => el.textContent === '保存'))).asElement()
  await bubbleSave.click()
  await page.waitForFunction(() => [...testValues.keys()].some(key => key.endsWith(':bubble')))
  await page.evaluate(() => [...testCommands].find(([label]) => label.includes('DeepSeek 网站显示'))[1]())
  assert.equal(await page.locator('#deepseek-whale-userjs').isVisible(), false)
  await page.locator('#ordinary').click()
  assert.equal(await page.evaluate(() => ordinaryClicks), 2)

  const offsite = await context.newPage()
  await offsite.goto('https://example.com/')
  await offsite.addScriptTag({ content: http + '\n' + script })
  assert.equal(await offsite.locator('#deepseek-whale-userjs').count(), 0)
  assert.equal(await offsite.evaluate(() => testCommands.size), 4, 'inactive websites keep the three switches and diagnostics')
  assert.equal(await offsite.evaluate(() => testCalls.length), 0)
  assert.equal(await offsite.evaluate(() => testResourceCalls), 0, 'inactive websites do not load widget assets')
  await offsite.evaluate(() => [...testCommands].find(([label]) => label.includes('本站显示'))[1]())
  await offsite.waitForFunction(() => window.testShadow?.querySelector('.dshwv-img')?.naturalWidth > 0)
  const savedSettings = await offsite.evaluate(() => [...testValues])
  await offsite.reload()
  await offsite.evaluate(values => { window.testValues = new Map(values) }, savedSettings)
  await offsite.addScriptTag({ content: http + '\n' + script })
  await offsite.waitForFunction(() => window.testShadow?.querySelector('.dshwv-img')?.naturalWidth > 0)
  await offsite.evaluate(() => [...testCommands].find(([label]) => label.includes('本站显示'))[1]())
  assert.equal(await offsite.locator('#deepseek-whale-userjs').count(), 0)
  assert.equal(await offsite.evaluate(() => testCommands.size), 4, 'unmount removes widget action menus')
  assert.deepEqual(errors, [])

  // An early style failure used to leave no command or visible error to inspect.
  const failed = await context.newPage()
  await failed.goto('https://www.deepseek.com/en/')
  await failed.addScriptTag({ content: http })
  await failed.evaluate(() => { window.CSSStyleSheet = class { constructor() { throw new Error('test stylesheet failure') } } })
  await failed.addScriptTag({ content: script })
  assert.match(await failed.locator('#deepseek-whale-userjs-error').innerText(), /test stylesheet failure/)
  assert.ok(await failed.evaluate(() => [...testCommands.keys()].some(label => label.includes('运行状态'))))
  let diagnostic
  failed.on('dialog', async dialog => { diagnostic = JSON.parse(dialog.message()); await dialog.dismiss() })
  await failed.evaluate(() => [...testCommands].find(([label]) => label.includes('运行状态'))[1]())
  assert.equal(diagnostic.stage, 'Shadow DOM 与样式初始化')
  assert.equal(diagnostic.error, 'test stylesheet failure')

  const missing = await context.newPage()
  await missing.goto('https://www.deepseek.com/en/')
  await missing.addScriptTag({ content: script })
  assert.match(await missing.locator('#deepseek-whale-userjs-error').innerText(), /HTTPSend @require 未加载/)
  assert.ok(await missing.evaluate(() => [...testCommands.keys()].some(label => label.includes('运行状态'))))

  await writeFile(new URL('../test-results/browser.json', import.meta.url), JSON.stringify({ ok: true,
    checks: ['closed shadow', 'strict CSP', 'no DSH dependency', 'ordinary page input', 'closed menu click-through and focus exclusion', 'hidden menu toggle', 'menu approach across transparent pixels and hit grid', 'invisible hit target scan', 'transparent artwork click-through', 'menu reopen and outside close', 'hidden bubble link click-through', 'click bubble', 'key setup', 'live balance values', 'auth error and recovery', 'manual refresh bypasses cache', 'balance ledger', 'drag/mirror', 'mobile viewport', 'bubble editor save', 'display switches unmount', 'ordinary websites default off and enable on demand', 'startup diagnostics survive style failure', 'missing require error'], errors }, null, 2))
  console.log('Browser checks passed. Screenshots: test-results/*.png')
} catch (error) { console.error('Browser errors:', errors); throw error }
finally { await browser.close() }
