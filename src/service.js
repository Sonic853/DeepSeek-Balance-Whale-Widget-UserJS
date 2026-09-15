import { builtinModel, templates, builtinImages, presetGroups, presetFragments, defaultSettings,
  dayKey, isPeak, number, observe, records, pickBalance, parseCustomBalance, readPath,
  quotaValue, validatedURL, round } from './core.js'

const clone = value => structuredClone(value)
const uid = () => crypto.randomUUID()
const listSort = values => values.slice().sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0)
  || Number(!!b.preset) - Number(!!a.preset) || (b.createdAt || 0) - (a.createdAt || 0))

export class WhaleService {
  constructor({ store, request, resources = {}, now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
    this.store = store
    this.request = request
    this.resources = resources
    this.now = now
    this.wait = wait
    this.pending = new Map()
    this.requests = new Set()
    this.owner = uid()
  }

  models() { return [clone(builtinModel), ...this.store.get('models', [])] }
  settings() {
    const settings = { ...defaultSettings(), ...this.store.get('settings', {}) }
    settings.taskEnd = { ...settings.taskEnd, on: false }
    settings.models = { ...settings.models }
    for (const model of this.models()) {
      const current = settings.models[model.id] || {}
      settings.models[model.id] = { alert: { ...settings.alert, ...current.alert },
        budget: { ...settings.budget, ...current.budget }, quota: quotaValue(current.quota, this.now()) }
    }
    settings.models.deepseek.alert = settings.alert
    settings.models.deepseek.budget = settings.budget
    return settings
  }

  saveSettings(patch) {
    const settings = this.settings()
    for (const key of ['alert', 'budget', 'turnCost']) if (patch[key]) settings[key] = { ...settings[key], ...patch[key] }
    if (patch.modelSettings) {
      const { id, alert, budget, quota } = patch.modelSettings
      if (!this.models().some(model => model.id === id)) throw new Error('模型不存在')
      const current = settings.models[id] || {}
      if (alert) current.alert = { ...current.alert, ...alert }
      if (budget) current.budget = { ...current.budget, ...budget }
      if (quota) {
        const key = dayKey(this.now())
        current.quota = { ...quota, mode: 'manual', used: quota.resetBase ? 0 : Math.max(0, number(quota.used || 0)),
          period: quota.reset === 'daily' ? key : quota.reset === 'monthly' ? key.slice(0, 7) : '' }
      }
      settings.models[id] = current
      if (id === 'deepseek') {
        if (alert) settings.alert = current.alert
        if (budget) settings.budget = current.budget
      }
    }
    settings.taskEnd.on = false
    this.store.set('settings', settings)
    return { ok: true, settings: this.settings() }
  }

  credential(ref) { return this.store.get(`credential:${ref}`, null) }
  setKey(ref, value) {
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(ref)) throw new Error('密钥名称仅支持英文字母、数字、点、下划线和横线')
    const old = this.credential(ref)
    if (value === old?.value) return
    if (value) this.store.set(`credential:${ref}`, { value: String(value).trim(), version: uid() })
    else this.store.remove(`credential:${ref}`)
    for (const model of this.models()) if (model.keyRef === ref) this.store.remove(`cache:${model.id}`)
  }

  descriptor(model) {
    const template = templates.find(template => template.id === model.provider) || templates[1]
    return { ...clone(template.balance), ...model.balance,
      json: { ...template.balance?.json, ...model.balance?.json } }
  }

  async json(url, auth, key, deadline) {
    const timeout = Math.min(10000, deadline - this.now())
    if (timeout <= 0) throw Object.assign(new Error('余额刷新超时'), { code: 'TIMEOUT' })
    const headers = { Accept: 'application/json' }
    if (auth) headers.Authorization = String(auth).replaceAll('{key}', key)
    const task = this.request({ mode: 'GM', method: 'GET', url, headers, responseType: 'json',
      timeout, anonymous: true }, true)
    this.requests.add(task)
    try { return await task } finally { this.requests.delete(task) }
  }

  dispose() { for (const task of this.requests) task.abort?.(); this.requests.clear() }

  async balance(model, force = false) {
    if (this.pending.has(model.id)) return this.pending.get(model.id)
    const run = this.balanceLocked(model, force).finally(() => this.pending.delete(model.id))
    this.pending.set(model.id, run)
    return run
  }

  async balanceLocked(model, force) {
    const descriptor = this.descriptor(model)
    const credential = this.credential(model.keyRef)
    if ((model.builtin || descriptor.auth?.includes('{key}')) && !credential?.value) {
      return { ok: false, code: 'NO_KEY', error: '请在菜单 → API 密钥 / 余额中配置密钥' }
    }
    if (!descriptor.url) return { ok: false, code: 'NO_URL', error: '请配置余额接口地址' }
    let url
    try { url = validatedURL(descriptor.url, model.baseUrl || '') }
    catch (error) { return { ok: false, code: 'CONFIG', error: error.message } }
    const identity = `${credential?.version || 'anonymous'}:${url}:${model.currency}:${JSON.stringify(descriptor)}`
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
    const account = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    const cacheKey = `cache:${model.id}`, leaseKey = `lease:${model.id}`
    const cached = () => {
      const cache = this.store.get(cacheKey, null)
      return cache?.account === account ? cache : null
    }
    const initial = cached()
    const currentPayload = (cache, stale = false) => ({ ...cache.payload, stale,
      todayUsage: this.store.get(`ledger:${model.id}`, null)?.days?.[dayKey(this.now())] || 0,
      isPeak: isPeak(this.now()) })
    if (!force && initial && this.now() - initial.at < 25000) return currentPayload(initial)
    // GM storage is shared across DeepSeek subdomains. Verify ownership after
    // giving concurrent tabs time to publish a lease; recheck the cache afterwards.
    const deadline = this.now() + 23500
    let lease
    while (this.now() < deadline) {
      const current = this.store.get(leaseKey, null)
      const fresh = cached()
      if (fresh && fresh.at > (initial?.at || 0)) return currentPayload(fresh)
      if (!current || current.until < this.now()) {
        lease = { owner: `${this.owner}:${uid()}`, until: this.now() + 30000 }
        this.store.set(leaseKey, lease)
        await this.wait(80)
        if (this.store.get(leaseKey, null)?.owner === lease.owner) break
      }
      lease = null
      await this.wait(120)
    }
    if (!lease) return initial ? currentPayload(initial, true)
      : { ok: false, code: 'BUSY', error: '其他标签页正在刷新，请稍后再试' }
    try {
      const requestDeadline = this.now() + 22000
      const fetchOnce = async () => {
        const data = await this.json(url, descriptor.auth, credential?.value || '', requestDeadline)
        if (model.builtin) return pickBalance(data)
        let amount
        if (descriptor.usage?.url) {
          const usageURL = validatedURL(descriptor.usage.url, model.baseUrl || '')
          const usage = await this.json(usageURL, descriptor.auth, credential?.value || '', requestDeadline)
          const total = number(readPath(data, descriptor.json.total)) * number(descriptor.json.scale ?? 1)
          const used = number(readPath(usage, descriptor.usage.json.used)) * number(descriptor.usage.json.scale ?? 1)
          amount = round(total - used)
        } else amount = parseCustomBalance(data, descriptor)
        return { amount, currency: model.currency || 'CNY' }
      }
      let balance
      try { balance = await fetchOnce() } catch (error) {
        if (!this.transient(error)) throw error
        await this.wait(500)
        balance = await fetchOnce()
      }
      // If settings/key changed while the HTTP request was in flight, discard it.
      if ((this.credential(model.keyRef)?.version || '') !== (credential?.version || '')) {
        return { ok: false, code: 'KEY_CHANGED', error: '密钥已更新，请重新刷新余额' }
      }
      const currentModel = this.models().find(item => item.id === model.id)
      if (!currentModel || JSON.stringify(this.descriptor(currentModel)) !== JSON.stringify(descriptor)
        || (currentModel.baseUrl || '') !== (model.baseUrl || '') || currentModel.currency !== model.currency) {
        return { ok: false, code: 'CONFIG_CHANGED', error: '接口配置已更新，请重新刷新余额' }
      }
      const at = this.now()
      const previous = this.store.get(`ledger:${model.id}`, null)
      if (previous?.last && (previous.last.account !== account || previous.last.currency !== balance.currency)) {
        this.store.set(`ledger:archive:${model.id}:${previous.last.account}:${previous.last.currency}`, previous)
      }
      const ledger = observe(previous,
        { ...balance, account, at })
      this.store.set(`ledger:${model.id}`, ledger)
      const payload = { ok: true, totalBalance: balance.amount, currency: balance.currency,
        todayUsage: ledger.days[dayKey(at)] || 0, isPeak: isPeak(at), updatedAt: at, usageMode: 'ledger' }
      this.store.set(cacheKey, { at, account, payload })
      return payload
    } catch (error) {
      const last = cached()
      if (this.transient(error) && last) return currentPayload(last, true)
      if (!this.transient(error)) this.store.remove(cacheKey)
      return { ok: false, code: error.code || 'API_ERROR', error: error.status === 401 || error.status === 403
        ? `密钥无效或没有余额查询权限（HTTP ${error.status}）`
        : error.status ? `余额接口返回 HTTP ${error.status}` : '余额请求失败，请检查网络与接口配置' }
    } finally {
      if (this.store.get(leaseKey, null)?.owner === lease.owner) this.store.remove(leaseKey)
    }
  }

  transient(error) { return error?.code === 'NETWORK_ERROR' || error?.code === 'TIMEOUT' || error?.status >= 500 }

  async modelPayload(force = false) {
    const settings = this.settings()
    const models = await Promise.all(this.models().map(async model => {
      const result = await this.balance(model, force)
      return { ...model, balanceDesc: this.descriptor(model), balanceMode: 'api', hasBalanceApi: true,
        hasKey: !!this.credential(model.keyRef)?.value, balance: result.ok ? result.totalBalance : null,
        currency: result.currency || model.currency, todayUsage: result.ok ? result.todayUsage : null,
        todayUsageCurrency: result.currency || model.currency, usageSource: 'balance',
        settings: settings.models[model.id], quota: settings.models[model.id]?.quota || null,
        error: result.ok ? null : result.error, stale: !!result.stale, price: null, matchIds: [] }
    }))
    return { ok: true, builtinId: 'deepseek', templates: clone(templates), models }
  }

  async updateModels(body) {
    const action = body.action || 'save'
    if (action === 'set-key' || action === 'delete-key') {
      this.setKey(String(body.keyRef || ''), action === 'set-key' ? String(body.keyValue || '') : '')
      return { ok: true }
    }
    if (action === 'model-settings') return this.saveSettings({ modelSettings: body })
    const models = this.models()
    if (action === 'probe') {
      const model = models.find(model => model.id === body.id)
      if (!model) throw new Error('模型不存在')
      const result = await this.balance(model, true)
      return { ...result, message: result.ok ? '余额接口连接成功' : result.error }
    }
    if (action === 'delete') {
      const model = models.find(model => model.id === body.id)
      if (!model || model.builtin) throw new Error('内置 DeepSeek 不可删除')
      this.store.set('models', models.filter(model => !model.builtin && model.id !== body.id))
      for (const key of [`cache:${body.id}`, `ledger:${body.id}`]) this.store.remove(key)
      if (!this.models().some(other => other.keyRef === model.keyRef)) this.store.remove(`credential:${model.keyRef}`)
      const settings = this.settings()
      delete settings.models[body.id]
      this.store.set('settings', settings)
      const clean = value => {
        if (Array.isArray(value)) return value.filter(item => item?.modelId !== body.id
          && item?.module?.modelId !== body.id).map(clean)
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clean(child)]))
        return value
      }
      this.store.set('bubble', clean(this.store.get('bubble', null)))
      return this.modelPayload()
    }
    if (action !== 'save') throw new Error('不支持的模型操作')
    const input = body.model || body
    if (input.id === 'deepseek') {
      if (body.keyValue?.trim()) this.setKey('DEEPSEEK_API_KEY', body.keyValue)
      return { ...(await this.modelPayload()), id: 'deepseek', keySaved: !!body.keyValue?.trim() }
    }
    const id = input.id || `model_${uid()}`
    const existing = models.find(model => model.id === id)
    let keyRef = String(input.keyRef || `CUSTOM_${id}`).trim()
    if (!existing && models.some(model => model.keyRef === keyRef)) keyRef += `_${uid().slice(0, 8)}`
    const model = { id, name: String(input.name || '自定义 API').slice(0, 60), provider: 'custom', keyRef,
      currency: input.currency === 'USD' ? 'USD' : 'CNY', baseUrl: String(input.baseUrl || '').replace(/\/+$/, ''),
      balance: clone(input.balance || {}) }
    validatedURL(model.balance.url, model.baseUrl)
    if (model.balance.usage?.url) validatedURL(model.balance.usage.url, model.baseUrl)
    const custom = models.filter(model => !model.builtin && model.id !== id)
    if (custom.length >= 20) throw new Error('最多配置 20 个自定义余额接口')
    if (body.keyValue?.trim()) this.setKey(keyRef, body.keyValue)
    this.store.set('models', [...custom, model])
    this.store.remove(`cache:${id}`)
    return { ...(await this.modelPayload()), id, keySaved: !!body.keyValue?.trim() }
  }

  asset(value) {
    if (typeof value !== 'string' || !value.startsWith('/dsh-whale/')) return value
    const url = new URL(value, 'https://whale.invalid')
    const path = url.pathname.split('/').pop(), id = url.searchParams.get('id')
    if (path === 'image.png') return this.resources['DSniang1.png'] || ''
    if (path === 'rua.gif') return this.resources['bubble-petpet.gif'] || ''
    if (path === 'role-image.png') return this.store.get(`asset:${id}`, '')
    if (path === 'bubble-img.png') {
      const builtin = builtinImages.find(image => image.id === id)
      return builtin ? this.resources[builtin.file] || '' : this.store.get(`asset:${id}`, '')
    }
    let fragment = id
    if (path === 'press.mp3' || path === 'release.mp3') {
      const group = this.audio().groups.find(group => group.id === (url.searchParams.get('set') || 'duck'))
      fragment = group?.[path === 'press.mp3' ? 'press' : 'release']
    }
    if (!fragment) return ''
    const builtin = presetFragments.find(item => item.id === fragment)
    return builtin ? this.resources[builtin.file] || '' : this.store.get(`asset:${fragment}`, '')
  }

  roles() {
    return { ok: true, roles: listSort([{ id: 'default', name: '小鲸鱼', format: 'png', preset: true },
      ...this.store.get('roles', [])]).map(role => ({ ...role,
      url: role.id === 'default' ? '/dsh-whale/image.png' : `/dsh-whale/role-image.png?id=${encodeURIComponent(role.id)}` })) }
  }
  images() { return { ok: true, images: [...clone(builtinImages), ...this.store.get('images', [])] } }
  audio() { return { ok: true, fragments: [...clone(presetFragments), ...this.store.get('fragments', [])],
    groups: listSort([...clone(presetGroups), ...this.store.get('groups', [])]) } }

  upload(type, value, name, maxMB) {
    const audio = type === 'fragments'
    const pattern = audio ? /^data:audio\/wav;base64,[A-Za-z0-9+/=]+$/
      : /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/
    if (typeof value !== 'string' || !pattern.test(value)) throw new Error('文件格式不支持')
    if (value.length > maxMB * 1024 * 1024 * 4 / 3 + 100) throw new Error(`文件不能超过 ${maxMB} MB`)
    const list = this.store.get(type, [])
    if (list.length >= 100) throw new Error('此资源分类最多保存 100 个文件')
    const id = `${type}_${uid()}`
    const entry = { id, name: String(name || '未命名').slice(0, 60), createdAt: this.now(),
      format: !audio && value.startsWith('data:image/gif') ? 'gif' : 'png' }
    this.store.set(`asset:${id}`, value)
    this.store.set(type, [...list, entry])
    return id
  }

  removeAsset(type, id) {
    const list = this.store.get(type, [])
    if (!list.some(item => item.id === id)) throw new Error('内置资源不可删除，或资源不存在')
    this.store.set(type, list.filter(item => item.id !== id))
    this.store.remove(`asset:${id}`)
    if (type === 'fragments') this.store.set('groups', this.store.get('groups', []).map(group => ({ ...group,
      press: group.press === id ? '' : group.press, release: group.release === id ? '' : group.release })))
  }

  pin(type, id, pinned) {
    const list = this.store.get(type, [])
    const entry = list.find(item => item.id === id)
    if (!entry) throw new Error('资源不存在')
    entry.pinnedAt = pinned ? this.now() : null
    entry.pinned = !!pinned
    this.store.set(type, list)
  }

  async route(path, method, body) {
    const write = method === 'POST' || method === 'PUT'
    if (path === 'balance.json') return this.balance(builtinModel, !!body.force)
    if (path === 'size.json') {
      const config = { scale: 1, sound: false, vol: 0, soundSet: 'duck', bubbleOn: true,
        ...this.store.get('size', {}), ...(write ? body : {}), turnCostOn: false, usageMode: 'ledger' }
      config.scale = Math.min(2.5, Math.max(.6, Number(config.scale) || 1))
      config.vol = config.sound === false ? 0 : Math.min(1, Math.max(0, Number(config.vol) || 0))
      config.sound = config.vol > 0
      if (write) this.store.set('size', config)
      return { ok: true, ...config }
    }
    if (path === 'usage-settings.json') return write ? this.saveSettings(body) : { ok: true, settings: this.settings() }
    if (path === 'usage-records.json') return records(this.store.get('ledger:deepseek', null), this.settings(), this.now())
    if (path === 'api-models.json') return write ? this.updateModels(body) : this.modelPayload(!!body.force)
    if (path === 'bubble.json') {
      if (write) {
        if (!Array.isArray(body.items) || !Array.isArray(body.lib)) throw new Error('气泡配置格式不正确')
        if (JSON.stringify(body).length > 512 * 1024) throw new Error('气泡配置不能超过 512 KB')
        this.store.set('bubble', { v: 1, items: body.items, lib: body.lib, tapAdvance: body.tapAdvance === true })
      }
      return { ok: true, config: this.store.get('bubble', null) }
    }
    if (path === 'roles.json') {
      const id = write ? this.upload('roles', body.image, body.name, 20) : undefined
      return { ...this.roles(), id }
    }
    if (path === 'role-pin.json') { this.pin('roles', body.id, body.pinned); return this.roles() }
    if (path === 'role-delete.json') { this.removeAsset('roles', body.id); return this.roles() }
    if (path === 'bubble-imgs.json') return this.images()
    if (path === 'bubble-img-upload.json') {
      if (body.action === 'delete') this.removeAsset('images', body.id)
      else if (body.action === 'upload') {
        const id = this.upload('images', body.data, body.name, 8)
        return { ...this.images(), id }
      }
      else throw new Error('不支持的图片操作')
      return this.images()
    }
    if (path === 'audio.json') {
      if (!write) return this.audio()
      if (body.action === 'upload-fragment') {
        const id = this.upload('fragments', body.audio, body.name, 8)
        return { ...this.audio(), id }
      }
      if (body.action === 'delete-fragment') this.removeAsset('fragments', body.id)
      else if (body.action === 'delete-group') this.removeAsset('groups', body.id)
      else if (body.action === 'pin-group') this.pin('groups', body.id, body.pinned)
      else if (body.action === 'save-group') {
        const id = body.id || `group_${uid()}`
        if (presetGroups.some(group => group.id === id)) throw new Error('内置音效组不可修改')
        const groups = this.store.get('groups', [])
        const group = groups.find(group => group.id === id) || { id, createdAt: this.now() }
        group.name = String(body.name || '音效组').slice(0, 60)
        for (const slot of ['press', 'release']) {
          const fragment = String(body[slot] || '')
          if (fragment && !this.audio().fragments.some(item => item.id === fragment)) throw new Error('音频片段不存在')
          group[slot] = fragment
        }
        this.store.set('groups', [...groups.filter(group => group.id !== id), group])
      } else throw new Error('不支持的音频操作')
      return this.audio()
    }
    throw new Error(`移植版没有此接口：${path}`)
  }

  async fetch(input, options = {}) {
    if (!String(input).startsWith('/dsh-whale/')) throw new Error('挂件仅允许使用内部服务接口')
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const url = new URL(input, 'https://whale.invalid')
    const path = url.pathname.split('/').pop()
    let result, status = 200
    try { result = await this.route(path, options.method || 'GET', options.body ? JSON.parse(options.body)
      : { force: url.searchParams.get('refresh') === '1' }) }
    catch (error) { status = 400; result = { ok: false, error: error.message } }
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return new Response(JSON.stringify(result), { status, headers: { 'Content-Type': 'application/json' } })
  }
}
