// Accounting is based on observed balance decreases, never inferred chat tokens.
export const DAY = 86400000
export const round = value => Math.round((value + Number.EPSILON) * 1e6) / 1e6
export const dayKey = (time = Date.now()) => new Date(time + 8 * 3600000).toISOString().slice(0, 10)
export const dayOffset = (date, offset) => dayKey(Date.parse(`${date}T00:00:00+08:00`) + offset * DAY)

export function isPeak(time = Date.now()) {
  const date = new Date(time + 8 * 3600000)
  const day = date.getUTCDay(), hour = date.getUTCHours()
  return day > 0 && day < 6 && ((hour >= 9 && hour < 12) || (hour >= 14 && hour < 18))
}

export function number(value) {
  if (!['number', 'string'].includes(typeof value)
    || (typeof value === 'string' && !value.trim())) throw new Error('接口未返回有效数值')
  const result = Number(value)
  if (!Number.isFinite(result)) throw new Error('接口未返回有效数值')
  return result
}

export function pickBalance(data) {
  const infos = data?.balance_infos
  if (!Array.isArray(infos) || !infos.length) throw new Error('余额接口缺少 balance_infos')
  const info = infos.find(info => info.currency === 'CNY') || infos.find(info => info.currency === 'USD')
  if (!info) throw new Error('余额接口未返回 CNY 或 USD')
  return { amount: number(info.total_balance), currency: info.currency }
}

export function readPath(data, path) {
  if (!path) return undefined
  const parts = String(path).replace(/\[(\d+)\]/g, '.$1').split('.')
  let value = data
  for (const part of parts) {
    if (!part || ['__proto__', 'prototype', 'constructor'].includes(part)
      || value === null || typeof value !== 'object' || !Object.hasOwn(value, part)) return undefined
    value = value[part]
  }
  return value
}

export function parseCustomBalance(data, descriptor) {
  const fields = descriptor.json || {}
  const scale = fields.scale === undefined || fields.scale === '' ? 1 : number(fields.scale)
  if (fields.remaining) return round(number(readPath(data, fields.remaining)) * scale)
  return round((number(readPath(data, fields.total)) - number(readPath(data, fields.used))) * scale)
}

export function validatedURL(value, base = '') {
  const url = new URL(String(value).replaceAll('{baseUrl}', base).replaceAll('{base}', base))
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('余额接口必须使用不含用户名和密码的 HTTPS 地址')
  return url.href
}

export function observe(previous, { amount, currency, account, at = Date.now() }) {
  amount = number(amount)
  const ledger = structuredClone(previous || { days: {}, events: [], last: null })
  const last = ledger.last
  if (last && at <= last.at) return ledger
  const date = dayKey(at)
  const compatible = last && last.account === account && last.currency === currency
  const sameDay = compatible && dayKey(last.at) === date
  // Switching key/currency establishes a fresh baseline; the UI follows that account.
  if (last && !compatible) { ledger.days = {}; ledger.events = [] }
  const delta = sameDay ? round(Math.max(0, last.amount - amount)) : 0
  ledger.days[date] = round((ledger.days[date] || 0) + delta)
  if (delta > 0) ledger.events.push({ ts: at, day: date, cost: delta, model: '(余额差观测)', currency })
  ledger.last = { amount, currency, account, at }
  // Compact older details into daily totals. Never round each observation to cents.
  ledger.events = ledger.events.filter(event => event.ts >= at - 90 * DAY).slice(-20000)
  for (const date of Object.keys(ledger.days)) if (date < dayOffset(dayKey(at), -364)) delete ledger.days[date]
  return ledger
}

export function records(ledger, settings, now = Date.now()) {
  const today = dayKey(now)
  const day = date => ({ date, total: ledger?.days?.[date] || 0, models: [] })
  const days7 = Array.from({ length: 7 }, (_, index) => day(dayOffset(today, -index)))
  return {
    ok: true, currency: ledger?.last?.currency || 'CNY',
    today: { ...day(today), models: [] }, days7,
    total7: round(days7.reduce((sum, day) => sum + day.total, 0)),
    all: { days: Object.keys(ledger?.days || {}).sort().reverse().map(day),
      events: (ledger?.events || []).slice(-20000).reverse() }, settings,
  }
}

export function quotaValue(quota, now = Date.now()) {
  if (!quota) return null
  const key = dayKey(now)
  const reset = quota.reset === 'daily' ? key : quota.reset === 'monthly' ? key.slice(0, 7) : ''
  const used = reset && quota.period !== reset ? 0 : Math.max(0, Number(quota.used) || 0)
  return { ...quota, mode: 'manual', used, autoUsed: used, autoToday: 0 }
}

export function defaultSettings() {
  return {
    taskEnd: { on: false, sel: 'frag:exp_orb' },
    alert: { on: false, below: 5, autoClose: true, ttlSec: 6,
      lines: [{ type: 'text', text: '余额低于 {below}', size: 6, bold: true }] },
    budget: { on: false, amount: 10, autoClose: true, ttlSec: 6,
      lines: [{ type: 'text', text: '今日观测消费已达 {amount}', size: 6, bold: true }] },
    turnCost: { lines: [] }, models: {},
  }
}

export const templates = [
  { id: 'deepseek', name: 'DeepSeek', builtin: true, currency: 'CNY', keyRef: 'DEEPSEEK_API_KEY',
    hasBalance: true, kind: 'balance', balance: { url: 'https://api.deepseek.com/user/balance', auth: 'Bearer {key}', json: { remaining: 'balance_infos[0].total_balance' } } },
  { id: 'custom', name: '自定义 HTTP', currency: 'CNY', keyRef: 'CUSTOM_API_KEY', hasBalance: true,
    kind: 'balance', needsBaseUrl: true, balance: { url: '', auth: 'Bearer {key}', json: {} },
    apiNote: '使用你配置的 HTTPS 余额接口，按余额下降额记账；不读取网页对话或本机会话日志。' },
]

export const builtinModel = { id: 'deepseek', name: 'DeepSeek', provider: 'deepseek', builtin: true,
  currency: 'CNY', keyRef: 'DEEPSEEK_API_KEY' }

export const presetGroups = [
  { id: 'duck', name: '小黄鸭', press: 'ya1', release: 'ya2', preset: true },
  { id: 'fx1', name: '音效1', press: 'd1', release: 'd2', preset: true },
]
export const presetFragments = [
  { id: 'ya1', name: '小黄鸭·按下', file: 'Ya1.mp3' },
  { id: 'ya2', name: '小黄鸭·松开', file: 'Ya2.mp3' },
  { id: 'd1', name: '音效1·按下', file: 'D1.mp3' },
  { id: 'd2', name: '音效1·松开', file: 'D2.mp3' },
  { id: 'exp_orb', name: 'Minecraft·经验球', file: 'minecraft-exp-orb.wav' },
  { id: 'end_a', name: 'A', file: 'task-end-a.wav' },
].map(fragment => ({ ...fragment, preset: true }))
export const builtinImages = [
  { id: 'bimg_petpet', name: 'petpet', file: 'bubble-petpet.gif', builtin: true },
  { id: 'bimg_money1', name: 'money1', file: 'bubble-money1.gif', builtin: true },
]
