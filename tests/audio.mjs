import { chromium } from 'playwright'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const browser = await chromium.launch({ executablePath: process.env.WHALE_BROWSER
  || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true,
  args: ['--autoplay-policy=document-user-activation-required'] })
const errors = []
let page
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const assets = {}
  for (const file of ['DSniang1.png', 'Ya1.mp3', 'Ya2.mp3', 'D1.mp3', 'D2.mp3',
    'minecraft-exp-orb.wav', 'task-end-a.wav', 'bubble-petpet.gif', 'bubble-money1.gif']) {
    const mime = file.endsWith('.png') ? 'image/png' : file.endsWith('.gif') ? 'image/gif'
      : 'application' // Actual Tampermonkey @resource MIME for these audio files.
    assets[file.replaceAll('.', '_').replaceAll('-', '_')] = `data:${mime};base64,${(await readFile(new URL('../assets/' + file, import.meta.url))).toString('base64')}`
  }
  await page.route('**/*', route => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>Audio fixture</body></html>',
      headers: { 'Content-Security-Policy': "default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'none'; script-src 'unsafe-inline'" } })
    : (errors.push('Unexpected request: ' + route.request().url()), route.abort()))
  page.on('pageerror', error => errors.push(error.stack))
  await page.goto('https://www.deepseek.com/en/')
  await page.evaluate(assets => {
    const attach = Element.prototype.attachShadow
    Element.prototype.attachShadow = function (options) { const root = attach.call(this, options); if (this.id === 'deepseek-whale-userjs') window.testShadow = root; return root }
    window.testValues = new Map([['deepseek-whale-userjs:v1:size', { sound: true, vol: .6, soundSet: 'duck' }]])
    testValues.set('deepseek-whale-userjs:v1:groups', [
      { id: 'wav-pair', name: 'WAV pair', press: 'exp_orb', release: 'end_a' },
      { id: 'release-only', name: 'Release only', press: '', release: 'ya2' },
      { id: 'silent', name: 'Silent', press: '', release: '' },
    ])
    window.testCommands = new Map()
    window.GM_getValue = (key, fallback) => testValues.has(key) ? structuredClone(testValues.get(key)) : fallback
    window.GM_setValue = (key, value) => testValues.set(key, structuredClone(value))
    window.GM_deleteValue = key => testValues.delete(key)
    window.GM_listValues = () => [...testValues.keys()]
    window.GM_getResourceURL = key => assets[key]
    window.GM_registerMenuCommand = (key, value) => { testCommands.set(key, value); return key }
    window.GM_unregisterMenuCommand = key => testCommands.delete(key)
    window.GM_xmlhttpRequest = () => { throw new Error('No API request expected') }
    window.testAudios = []
    window.testAudioEvents = []
    const NativeAudio = window.Audio
    window.Audio = function (...args) {
      const audio = new NativeAudio(...args)
      const name = Object.keys(assets).find(key => assets[key].split(',')[1] === String(args[0]).split(',')[1]) || String(args[0]).slice(0, 100)
      audio.testName = name
      testAudios.push(audio)
      for (const type of ['playing', 'ended', 'error']) audio.addEventListener(type, () => testAudioEvents.push({ name, type, time: audio.currentTime, code: audio.error?.code, volume: audio.volume }))
      const play = audio.play
      audio.play = function () {
        testAudioEvents.push({ name, type: 'play', volume: audio.volume })
        return play.call(audio).catch(error => { testAudioEvents.push({ name, type: 'rejected', error: error.name }); throw error })
      }
      return audio
    }
  }, assets)
  const script = await readFile(new URL('../DeepSeek-Balance-Whale-Widget.user.js', import.meta.url), 'utf8')
  const http = await readFile(new URL('./fixtures/HTTPSend.js', import.meta.url), 'utf8')
  await page.addScriptTag({ content: http + '\n' + script })
  await page.waitForFunction(() => testShadow?.querySelector('.dshwv-img')?.naturalWidth > 0)
  await page.waitForFunction(() => testShadow.querySelector('.dshwv-volpct').textContent === '60%')
  async function clickRole() {
    const point = await page.evaluate(() => { const r = testShadow.querySelector('.dshwv-img').getBoundingClientRect(); return { x: r.x + .65 * r.width, y: r.y + .65 * r.height } })
    await page.mouse.click(point.x, point.y)
  }
  async function selectGroup(name) {
    await page.evaluate(name => {
      testShadow.querySelector('.dshwv-menu-btn').click()
      testShadow.querySelector('.dshwv-audiobtn').click()
      const item = [...testShadow.querySelectorAll('.dshwv-audiolist .dshwv-audioitem')].find(item => item.textContent.includes(name))
      if (!item) throw new Error('Group missing: ' + name)
      item.click()
      testShadow.querySelector('.dshwv-menu-btn').click()
    }, name)
  }
  async function expectClips(names) {
    const offset = await page.evaluate(() => testAudioEvents.length)
    await clickRole()
    await page.waitForFunction(({ names, offset }) => names.every(name => testAudioEvents.slice(offset).some(event => event.name === name && event.type === 'ended')),
      { names, offset }, { timeout: 10000 })
    const events = await page.evaluate(offset => testAudioEvents.slice(offset), offset)
    assert.deepEqual(events.filter(event => event.type === 'playing').map(event => event.name).sort(), names.toSorted())
    assert.ok(events.filter(event => event.type === 'ended').every(event => event.time > 0 && event.volume === .6))
  }
  await expectClips(['Ya1_mp3', 'Ya2_mp3'])
  await selectGroup('音效1')
  await expectClips(['D1_mp3', 'D2_mp3'])
  await selectGroup('WAV pair')
  await expectClips(['minecraft_exp_orb_wav', 'task_end_a_wav'])
  await selectGroup('Release only')
  await expectClips(['Ya2_mp3'])
  await expectClips(['Ya2_mp3']) // Empty press slot must reset the previous release flag.
  await selectGroup('Silent')
  const beforeSilent = await page.evaluate(() => testAudioEvents.length)
  await clickRole()
  await page.waitForTimeout(400)
  assert.equal(await page.evaluate(() => testAudioEvents.length), beforeSilent)
  await selectGroup('小黄鸭')
  await page.evaluate(() => {
    const slider = testShadow.querySelector('.dshwv-volpct').parentElement.querySelector('input')
    slider.value = '0'; slider.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const beforeMuted = await page.evaluate(() => testAudioEvents.length)
  await clickRole()
  await page.waitForTimeout(500)
  assert.equal(await page.evaluate(() => testAudioEvents.length), beforeMuted)
  assert.equal(await page.evaluate(() => testValues.get('deepseek-whale-userjs:v1:size').sound), false)
  assert.deepEqual(await page.evaluate(() => testAudioEvents.filter(event => event.type === 'error' || event.type === 'rejected')), [])
  assert.deepEqual(errors, [])
  await mkdir('test-results', { recursive: true })
  await writeFile('test-results/audio.json', JSON.stringify({ ok: true, events: await page.evaluate(() => testAudioEvents) }, null, 2))
  console.log('Real audio playback checks passed')
} catch (error) {
  console.error('Audio observations:', await page?.evaluate(() => ({ events: window.testAudioEvents,
    audios: window.testAudios?.map(a => ({ name: a.testName, readyState: a.readyState, duration: a.duration, error: a.error?.code })) })), errors)
  throw error
} finally { await browser.close() }
