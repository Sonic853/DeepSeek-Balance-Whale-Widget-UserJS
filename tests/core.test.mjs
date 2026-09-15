import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { dayKey, isPeak, pickBalance, readPath, parseCustomBalance, validatedURL, observe,
  records, quotaValue, builtinModel } from '../src/core.js'
import { WhaleService } from '../src/service.js'
import { audioResourceURL } from '../src/audio.js'
import { displaySettings, displayKeys } from '../src/display.js'

function memory() {
  const values = new Map()
  return { values, get: (key, fallback) => values.has(key) ? structuredClone(values.get(key)) : fallback,
    set: (key, value) => values.set(key, structuredClone(value)), remove: key => values.delete(key) }
}
const at = value => Date.parse(value)
const sample = (amount, time, extra = {}) => ({ amount, at: at(time), currency: 'CNY', account: 'first', ...extra })

test('display defaults, independent switches, and exact hostname boundaries', () => {
  const store = memory()
  for (const host of ['deepseek.com', 'www.deepseek.com', 'chat.deepseek.com']) assert.equal(displaySettings(store, host).enabled, true)
  for (const host of ['example.com', 'notdeepseek.com', 'deepseek.com.example.com']) assert.equal(displaySettings(store, host).enabled, false)
  assert.deepEqual(displaySettings(store, 'example.com'), { global: false, site: false, deepseek: true, isDeepSeek: false, enabled: false, sources: [] })
  for (const host of ['example.com', 'chat.deepseek.com']) {
    const keys = displayKeys(host)
    for (const global of [false, true]) for (const site of [false, true]) for (const deepseek of [false, true]) {
      for (const [name, value] of Object.entries({ global, site, deepseek })) store.set(keys[name], value)
      assert.equal(displaySettings(store, host).enabled, global || site || (host === 'chat.deepseek.com' && deepseek))
    }
  }
  store.set('display:global', false)
  store.set('display:deepseek', false)
  store.set('display:site:example.com', true)
  assert.equal(displaySettings(store, 'www.example.com').enabled, false, 'site switch only applies to the exact hostname')
})

test('audio resource MIME correction preserves bytes and non-data URLs', () => {
  for (const mime of ['application', 'application/octet-stream', 'text/plain', 'audio/mpeg', '']) {
    assert.equal(audioResourceURL('Ya1.mp3', `data:${mime};base64,SUQzAAAA`), 'data:audio/mpeg;base64,SUQzAAAA')
    assert.equal(audioResourceURL('task-end-a.wav', `data:${mime};base64,UklGRg==`), 'data:audio/wav;base64,UklGRg==')
  }
  for (const url of ['', 'blob:https://www.deepseek.com/123', 'https://example.com/audio.mp3']) assert.equal(audioResourceURL('Ya1.mp3', url), url)
  assert.equal(audioResourceURL('DSniang1.png', 'data:application;base64,abc'), 'data:application;base64,abc')
})

test('sound settings honor mute, preserve enabled volume, and persist volume zero as muted', async () => {
  const store = memory()
  const service = new WhaleService({ store, request: () => { throw new Error('No network expected') }, resources: {} })
  assert.equal((await service.route('size.json', 'GET', {})).vol, 0)
  store.set('size', { sound: false, vol: .5 })
  assert.equal((await service.route('size.json', 'GET', {})).vol, 0)
  for (const vol of [0, .6, 1, 4]) {
    const result = await service.route('size.json', 'PUT', { sound: true, vol })
    assert.equal(result.vol, Math.min(1, vol))
    assert.equal(result.sound, vol > 0)
    assert.equal(store.get('size').vol, result.vol)
  }
  service.dispose()
})

test('Beijing date and peak boundaries include weekends and midnight independent of system timezone', () => {
  assert.equal(dayKey(at('2026-09-15T16:00:00Z')), '2026-09-16')
  for (const [time, peak] of [['2026-09-15T00:59:59Z', false], ['2026-09-15T01:00:00Z', true],
    ['2026-09-15T04:00:00Z', false], ['2026-09-15T06:00:00Z', true], ['2026-09-15T10:00:00Z', false],
    ['2026-09-19T02:00:00Z', false], ['2026-09-20T08:00:00Z', false]]) assert.equal(isPeak(at(time)), peak)
})

test('balance selection is deterministic and rejects absent, empty and nonnumeric fields', () => {
  assert.deepEqual(pickBalance({ balance_infos: [{ currency: 'USD', total_balance: '8' },
    { currency: 'CNY', total_balance: '56.30' }] }), { amount: 56.3, currency: 'CNY' })
  for (const value of [null, '', 'abc', false, [], {}]) assert.throws(() => pickBalance({ balance_infos: [{ currency: 'CNY', total_balance: value }] }))
  assert.throws(() => pickBalance({ balance_infos: [] }))
})

test('ledger accumulates small deductions across top-ups without counting credits', () => {
  let ledger = observe(null, sample(10, '2026-09-15T01:00:00Z'))
  ledger = observe(ledger, sample(9.999, '2026-09-15T01:01:00Z'))
  ledger = observe(ledger, sample(19.999, '2026-09-15T01:02:00Z'))
  ledger = observe(ledger, sample(19.998, '2026-09-15T01:03:00Z'))
  assert.equal(ledger.days['2026-09-15'], .002)
  assert.equal(ledger.events.length, 2)
  assert.equal(records(ledger, {}, at('2026-09-15T02:00:00Z')).today.total, .002)
})

test('midnight establishes a new baseline and old/currency/account samples cannot create false spending', () => {
  let ledger = observe(null, sample(10, '2026-09-15T15:58:00Z'))
  ledger = observe(ledger, sample(8, '2026-09-15T15:59:00Z'))
  const before = structuredClone(ledger)
  assert.deepEqual(observe(ledger, sample(1, '2026-09-15T15:58:30Z')), before)
  ledger = observe(ledger, sample(6, '2026-09-15T16:01:00Z'))
  assert.equal(ledger.days['2026-09-15'], 2); assert.equal(ledger.days['2026-09-16'], 0)
  ledger = observe(ledger, sample(1, '2026-09-15T16:02:00Z', { currency: 'USD' }))
  assert.equal(ledger.days['2026-09-16'], 0); assert.equal(ledger.events.length, 0)
  ledger = observe(ledger, sample(.5, '2026-09-15T16:03:00Z', { currency: 'USD', account: 'second' }))
  assert.equal(ledger.events.length, 0)
})

test('custom paths use own properties only; balance scaling and HTTPS endpoint validation work', () => {
  assert.equal(readPath({ a: [{ b: 12 }] }, 'a[0].b'), 12)
  assert.equal(readPath({}, 'constructor.name'), undefined)
  assert.equal(parseCustomBalance({ total: 12000, used: 1000 }, { json: { total: 'total', used: 'used', scale: .001 } }), 11)
  assert.equal(validatedURL('{base}/balance', 'https://example.com'), 'https://example.com/balance')
  for (const url of ['http://example.com', 'https://user:key@example.com', 'javascript:alert(1)']) assert.throws(() => validatedURL(url))
})

test('manual quota resets on Beijing daily/monthly boundaries without fabricated token statistics', () => {
  assert.equal(quotaValue({ used: 100, reset: 'daily', period: '2026-09-15' }, at('2026-09-15T16:00:00Z')).used, 0)
  assert.equal(quotaValue({ used: 100, reset: 'monthly', period: '2026-09' }, at('2026-09-20T00:00:00Z')).used, 100)
})

test('two tabs share one request and ledger; network retries can reuse stale cache, auth failures cannot', async () => {
  const store = memory()
  let calls = 0, time = at('2026-09-15T01:00:00Z'), failure
  const request = async (options, bodyOnly) => {
    calls++
    assert.equal(options.url, 'https://api.deepseek.com/user/balance')
    assert.equal(options.anonymous, true); assert.equal(bodyOnly, true)
    if (failure) throw failure
    return { balance_infos: [{ currency: 'CNY', total_balance: '12' }] }
  }
  const one = new WhaleService({ store, request, now: () => time })
  const two = new WhaleService({ store, request, now: () => time })
  one.setKey('DEEPSEEK_API_KEY', 'test-key')
  const [a, b] = await Promise.all([one.balance(builtinModel), two.balance(builtinModel)])
  assert.equal(calls, 1); assert.equal(a.totalBalance, 12); assert.equal(b.totalBalance, 12)
  time += 60000
  failure = { code: 'NETWORK_ERROR' }
  assert.equal((await one.balance(builtinModel)).stale, true)
  assert.equal(calls, 3)
  failure = { code: 'HTTP_ERROR', status: 401 }
  const denied = await one.balance(builtinModel)
  assert.equal(denied.ok, false); assert.equal(denied.stale, undefined)
  assert.equal(store.get('cache:deepseek', null), null)
})

test('no key never makes a network request and model payloads never expose the key', async () => {
  const store = memory()
  const service = new WhaleService({ store, request: () => assert.fail('must not send a request') })
  assert.equal((await service.balance(builtinModel)).code, 'NO_KEY')
  service.setKey('OTHER', 'secret-not-for-the-ui')
  assert.equal(JSON.stringify(await service.modelPayload()).includes('secret-not-for-the-ui'), false)
  const response = await service.fetch('/dsh-whale/size.json', { method: 'PUT', body: JSON.stringify({ scale: 9, turnCostOn: true }) })
  const config = await response.json()
  assert.equal(config.scale, 2.5); assert.equal(config.turnCostOn, false)
})

test('manual refresh bypasses cache, midnight cache resets today, and changed keys archive the previous ledger', async () => {
  const store = memory()
  let time = at('2026-09-15T15:59:55Z'), balance = 20, calls = 0
  const service = new WhaleService({ store, now: () => time, wait: async () => {}, request: async () => {
    calls++
    return { balance_infos: [{ currency: 'CNY', total_balance: String(balance) }] }
  } })
  service.setKey('DEEPSEEK_API_KEY', 'first-key')
  await service.balance(builtinModel)
  time += 1000; balance = 19
  assert.equal((await service.balance(builtinModel)).totalBalance, 20)
  assert.equal(calls, 1)
  assert.equal((await (await service.fetch('/dsh-whale/balance.json?refresh=1')).json()).todayUsage, 1)
  assert.equal(calls, 2)
  time += 5000
  assert.equal((await service.balance(builtinModel)).todayUsage, 0)
  assert.equal(calls, 2)
  service.setKey('DEEPSEEK_API_KEY', 'second-key')
  time++; balance = 1
  assert.equal((await service.balance(builtinModel)).todayUsage, 0)
  const archive = [...store.values].find(([key]) => key.startsWith('ledger:archive:deepseek:'))
  assert.equal(archive[1].days['2026-09-15'], 1)
  assert.equal(store.get('ledger:deepseek').events.length, 0)
})

test('custom total/usage endpoints share a deadline and a key changed in flight discards the response', async () => {
  const store = memory()
  let time = at('2026-09-15T01:00:00Z'), calls = 0
  const model = { id: 'custom1', provider: 'custom', keyRef: 'CUSTOM', currency: 'USD',
    balance: { url: 'https://example.com/total', auth: 'Bearer {key}', json: { total: 'total', scale: .01 },
      usage: { url: 'https://example.com/used', json: { used: 'used', scale: .01 } } } }
  store.set('models', [model])
  const service = new WhaleService({ store, now: () => time, wait: async () => {}, request: async options => {
    calls++
    assert.equal(options.timeout, 10000)
    time += 2000
    return options.url.endsWith('total') ? { total: 1200 } : { used: 50 }
  } })
  service.setKey('CUSTOM', 'custom-key')
  assert.equal((await service.balance(model)).totalBalance, 11.5)
  assert.equal(calls, 2)
  service.request = async () => {
    service.setKey('DEEPSEEK_API_KEY', 'changed-key')
    return { balance_infos: [{ currency: 'CNY', total_balance: '1' }] }
  }
  service.setKey('DEEPSEEK_API_KEY', 'old-key')
  assert.equal((await service.balance(builtinModel)).code, 'KEY_CHANGED')
  assert.equal(store.get('ledger:deepseek', null), null)
})

test('resources upload, resolve, pin and delete with references repaired and builtins protected', async () => {
  const store = memory()
  const service = new WhaleService({ store, request() {}, resources: { 'DSniang1.png': 'data:image/png;base64,AA==' } })
  const data = 'data:audio/wav;base64,' + 'A'.repeat(100)
  const upload = await service.route('audio.json', 'POST', { action: 'upload-fragment', audio: data, name: 'clip' })
  assert.equal(service.asset(`/dsh-whale/audio-fragment.wav?id=${upload.id}`), data)
  await service.route('audio.json', 'POST', { action: 'save-group', id: 'my-group', name: 'pair', press: upload.id, release: '' })
  assert.equal(service.asset('/dsh-whale/sound/press.mp3?set=my-group'), data)
  await service.route('audio.json', 'POST', { action: 'delete-fragment', id: upload.id })
  assert.equal(service.audio().groups.find(group => group.id === 'my-group').press, '')
  await assert.rejects(service.route('audio.json', 'POST', { action: 'delete-fragment', id: 'ya1' }))
  assert.throws(() => service.upload('roles', 'data:image/svg+xml;base64,AA==', 'svg', 20))
})

test('generated userscript pins HTTPSend, matches HTTP(S) websites, and omits DSH boot and one-second turn polling', async () => {
  const script = await readFile(new URL('../DeepSeek-Balance-Whale-Widget.user.js', import.meta.url), 'utf8')
  assert.match(script, /@version\s+1\.0\.0\s/)
  assert.match(script, /@require\s+https:\/\/update\.greasyfork\.org\/scripts\/595862\/1932262\/HTTPSend%202\.js/)
  assert.deepEqual([...script.matchAll(/@match\s+(\S+)/g)].map(match => match[1]), ['http://*/*', 'https://*/*'])
  assert.equal(script.includes('function pollLastTurn'), false)
  assert.equal(script.includes('function dshwIsChatRoot'), false)
  assert.match(script, /attachShadow\(\{ mode: "closed" \}\)/)
})

test('main script runs when concatenated immediately after the published semicolonless @require', async () => {
  const http = await readFile(new URL('./fixtures/HTTPSend.js', import.meta.url), 'utf8')
  const script = await readFile(new URL('../DeepSeek-Balance-Whale-Widget.user.js', import.meta.url), 'utf8')
  let entered = 0
  const context = { window: { top: null }, get document() { entered++; return {} } }
  // A different top window skips actual mounting, but the module must still run.
  runInNewContext(http + '\n' + script.replace('\n;\n', '\n'), context, { timeout: 1000 })
  assert.equal(entered, 0, 'without the boundary, the old false CommonJS branch swallows the main script')
  runInNewContext(http + '\n' + script, context, { timeout: 1000 })
  assert.equal(entered, 1)
})
