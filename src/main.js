/* global GM_getValue, GM_setValue, GM_deleteValue, GM_listValues, GM_getResourceURL,
   GM_registerMenuCommand, GM_unregisterMenuCommand, GM_addValueChangeListener, GM_removeValueChangeListener, HTTPSend */
import { WhaleService } from './service.js'
import { createWidget } from './widget.generated.js'
import { audioResourceURL, createAudioBridge } from './audio.js'
import { displayKeys, displaySettings, displayLabels } from './display.js'

const nativeDocument = document
const nativeWindow = window
const hostId = 'deepseek-whale-userjs'
const prefix = 'deepseek-whale-userjs:v1:'
const startup = { version: '1.0.0', stage: '入口', error: '', http: typeof HTTPSend,
  resourceCount: 0, imageReady: false, audio: { state: '未播放', source: '', error: '' } }
if (window.top === window && ['http:', 'https:'].includes(location.protocol)
  && !nativeDocument.getElementById(hostId)) {
  console.info('[DeepSeek Whale] 用户脚本入口已执行', startup.version)
  try {
    // Keep this command even when widget initialization fails and its DOM is removed.
    GM_registerMenuCommand('🩺 查看小鲸鱼运行状态', () => {
      nativeWindow.alert(JSON.stringify({ ...startup, page: location.origin + location.pathname,
        mounted: !!nativeDocument.getElementById(hostId),
        hidden: !startup.display?.enabled }, null, 2))
    })
    start()
  } catch (error) { reportStartupError(error) }
}

function reportStartupError(error) {
  startup.error = String(error?.message || error)
  console.error(`[DeepSeek Whale] ${startup.stage}失败`, error)
  const notice = nativeDocument.createElement('div')
  notice.id = hostId + '-error'
  notice.style.cssText = 'all:initial;position:fixed;right:12px;bottom:12px;z-index:2147483647;padding:12px;border:1px solid #b91c1c;border-radius:8px;background:#fff;color:#991b1b;font:13px/1.5 Arial,sans-serif;max-width:320px;'
  notice.textContent = '小鲸鱼启动失败：' + startup.error + '。请通过脚本菜单「查看小鲸鱼运行状态」获取详情。'
  nativeDocument.documentElement.appendChild(notice)
}

function start() {
  startup.stage = '显示设置初始化'
  const store = {
    get(key, fallback) { return GM_getValue(prefix + key, fallback) },
    set(key, value) { GM_setValue(prefix + key, value) },
    remove(key) { GM_deleteValue(prefix + key) },
  }
  const keys = displayKeys(location.hostname)
  const commands = [], listeners = []
  let widget = null, ended = false
  function changeDisplay(name, value) {
    store.set(keys[name], value)
    sync()
  }
  function sync() {
    if (ended) return
    const settings = displaySettings(store, location.hostname)
    startup.display = settings
    commands.splice(0).forEach(id => GM_unregisterMenuCommand(id))
    for (const name of Object.keys(keys)) {
      const label = `${settings[name] ? '✅' : '⬜'} ${displayLabels[name]}${name === 'site' ? `（${location.hostname}）` : ''}`
      commands.push(GM_registerMenuCommand(label, () => changeDisplay(name, !displaySettings(store, location.hostname)[name])))
    }
    if (!settings.enabled) {
      widget?.dispose()
      widget = null
      startup.stage = '显示已关闭'
      startup.imageReady = false
      nativeDocument.getElementById(hostId + '-error')?.remove()
      return
    }
    if (!widget) {
      startup.error = ''
      nativeDocument.getElementById(hostId + '-error')?.remove()
      try { widget = mountWidgetHost(store, changeDisplay) }
      catch (error) {
        nativeDocument.getElementById(hostId)?.remove()
        reportStartupError(error)
      }
    }
    widget?.updateDisplay(settings)
  }
  if (typeof GM_addValueChangeListener === 'function') {
    for (const key of Object.values(keys)) listeners.push(GM_addValueChangeListener(prefix + key, (_key, _old, _value, remote) => { if (remote) sync() }))
  }
  const onVisible = () => { if (!nativeDocument.hidden) sync() }
  nativeDocument.addEventListener('visibilitychange', onVisible)
  nativeWindow.addEventListener('pagehide', event => {
    if (event.persisted) return
    ended = true
    widget?.dispose()
    commands.forEach(id => GM_unregisterMenuCommand(id))
    if (typeof GM_removeValueChangeListener === 'function') listeners.forEach(id => GM_removeValueChangeListener(id))
    nativeDocument.removeEventListener('visibilitychange', onVisible)
  }, { once: true })
  sync()
}

function mountWidgetHost(store, changeDisplay) {
  startup.stage = 'HTTPSend 加载检查'
  if (typeof HTTPSend !== 'function') {
    throw new Error('HTTPSend @require 未加载，请检查脚本管理器中的外部资源下载状态')
  }
  startup.stage = 'GM 存储与资源初始化'
  const files = ['DSniang1.png', 'Ya1.mp3', 'Ya2.mp3', 'D1.mp3', 'D2.mp3',
    'minecraft-exp-orb.wav', 'task-end-a.wav', 'bubble-petpet.gif', 'bubble-money1.gif']
  const resources = Object.fromEntries(files.map(file => {
    try { return [file, audioResourceURL(file, GM_getResourceURL(file.replaceAll('.', '_').replaceAll('-', '_')))] }
    catch { return [file, ''] }
  }))
  startup.resourceCount = Object.values(resources).filter(Boolean).length
  const service = new WhaleService({ store, request: HTTPSend, resources })
  const audioBridge = createAudioBridge({ window: nativeWindow, asset: url => service.asset(url),
    status: startup.audio, canPlay: () => !disposed })
  startup.stage = 'Shadow DOM 与样式初始化'
  const host = nativeDocument.createElement('div')
  host.id = hostId
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483000!important;pointer-events:none!important;isolation:isolate!important;'
  const shadow = host.attachShadow({ mode: 'closed' })
  const mount = nativeDocument.createElement('div')
  mount.style.cssText = 'font:14px Arial,"Microsoft YaHei",sans-serif;color:#203170;line-height:normal;pointer-events:none;'
  shadow.appendChild(mount)
  nativeDocument.documentElement.appendChild(host)
  const styleMap = new Map()
  // Constructed stylesheets isolate the widget and work on pages with strict style CSP.
  const head = {
    appendChild(style) {
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(style.textContent)
      styleMap.set(style, sheet)
      shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet]
      return style
    },
    removeChild(style) {
      const sheet = styleMap.get(style)
      shadow.adoptedStyleSheets = shadow.adoptedStyleSheets.filter(item => item !== sheet)
      styleMap.delete(style)
      return style
    },
  }
  head.appendChild(Object.assign(nativeDocument.createElement('style'), { textContent:
    ':host{color-scheme:light}*,*::before,*::after{box-sizing:border-box}button,input,select,textarea{font:inherit}button,input,select,textarea,a,[class*="mask"],[class*="panel"],[class*="list"],[class*="window"]{pointer-events:auto}button{touch-action:manipulation}.dshwv-menu{max-height:90vh;overflow-y:auto}.dshwv-usage-window,.dshwv-bubwin,.dshwv-itemwin,.dshwv-modulewin{max-width:96vw!important;max-height:94vh!important;overflow:auto}.whale-user-note{font-size:11px;white-space:normal;line-height:1.5;color:#64748b;margin:7px 0}.whale-user-button{width:100%;border:0;border-radius:6px;padding:7px;background:#203170;color:white;cursor:pointer;margin:3px 0}' }))
  // Opacity alone leaves descendants with pointer-events:auto hittable. Hide
  // the whole closed subtree without removing its geometry used by positioning.
  const closedSurfaces = [
    '.dshwv-menu:not(.dshwv-menu-open)',
    '.dshwv-menu-btn:not(.dshwv-menu-btn-visible)',
    '.dshwv-menu-btn.dshwv-menu-btn-hidden',
    '.dshwv-pop:not(.dshwv-pop-open)',
  ]
  head.appendChild(Object.assign(nativeDocument.createElement('style'), { textContent:
    closedSurfaces.flatMap(selector => [selector, `${selector} *`]).join(',')
      + '{visibility:hidden!important;pointer-events:none!important}' }))

  let hooks, disposed = false
  const displayInputs = new Map()
  let displayNote
  const intervalIds = new Set(), timeoutIds = new Set(), subscriptions = [], commands = []
  const facadeListeners = []
  const documentFacade = new Proxy(nativeDocument, {
    get(target, key) {
      if (key === 'body') return mount
      if (key === 'head') return head
      if (key === 'documentElement') return host
      if (key === 'activeElement') return shadow.activeElement
      if (key === 'querySelector' || key === 'querySelectorAll') return shadow[key].bind(shadow)
      if (key === 'getElementById') return id => shadow.getElementById(id) || [...styleMap.keys()].find(style => style.id === id) || null
      if (key === 'elementFromPoint') return (x, y) => shadow.elementFromPoint(x, y) || target.elementFromPoint(x, y)
      if (key === 'addEventListener') return (type, listener, options) => {
        const capture = typeof options === 'boolean' ? options : !!options?.capture
        if (facadeListeners.some(item => item.type === type && item.listener === listener && item.capture === capture)) return
        const outside = event => { if (!disposed && !event.composedPath().includes(host)) listener(event) }
        const inside = event => { if (!disposed) listener(event) }
        target.addEventListener(type, outside, options)
        shadow.addEventListener(type, inside, options)
        facadeListeners.push({ type, listener, options, capture, outside, inside })
      }
      if (key === 'removeEventListener') return (type, listener, options) => {
        const capture = typeof options === 'boolean' ? options : !!options?.capture
        const index = facadeListeners.findIndex(item => item.type === type && item.listener === listener && item.capture === capture)
        if (index < 0) return
        const item = facadeListeners.splice(index, 1)[0]
        target.removeEventListener(type, item.outside, capture)
        shadow.removeEventListener(type, item.inside, capture)
      }
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  const windowState = new Map()
  const windowFacade = new Proxy({}, {
    get(_, key) {
      const target = nativeWindow
      if (typeof key === 'string' && key.startsWith('__dsh')) return windowState.get(key)
      if (key === 'document') return documentFacade
      if (key === 'addEventListener') return (type, listener, options) => {
        target.addEventListener(type, listener, options)
        subscriptions.push(() => target.removeEventListener(type, listener, options))
      }
      const value = Reflect.get(target, key, target)
      // Keep constructors constructible; bind only Window methods that need their receiver.
      return ['getComputedStyle', 'open', 'removeEventListener'].includes(key) ? value.bind(target) : value
    },
    set(_, key, value) { windowState.set(key, value); return true },
  })
  function asset(value) { return service.asset(value) }
  const bridge = {
    document: documentFacade, window: windowFacade, asset,
    storage: {
      getItem(key) { return store.get(`local:${location.hostname}:${key}`, null) },
      setItem(key, value) { store.set(`local:${location.hostname}:${key}`, String(value)) },
      removeItem(key) { store.remove(`local:${location.hostname}:${key}`) },
    },
    async fetch(url, options) {
      const response = await service.fetch(url, options)
      if (options?.method === 'POST' && url.endsWith('api-models.json')) {
        bridge.setTimeout(() => hooks?.refresh(), 0)
      }
      return response
    },
    Audio: audioBridge.Audio,
    setInterval(callback, ms) {
      const id = nativeWindow.setInterval(() => { if (!nativeDocument.hidden && !disposed) callback() }, ms)
      intervalIds.add(id)
      return id
    },
    clearInterval(id) { nativeWindow.clearInterval(id); intervalIds.delete(id) },
    setTimeout(callback, ms) {
      const id = nativeWindow.setTimeout(() => { timeoutIds.delete(id); if (!disposed) callback() }, ms)
      timeoutIds.add(id)
      return id
    },
    clearTimeout(id) { nativeWindow.clearTimeout(id); timeoutIds.delete(id) },
    ready(value) {
      hooks = value
      startup.stage = '运行中'
      const roleImage = shadow.querySelector('.dshwv-img')
      startup.imageReady = !!roleImage?.naturalWidth
      roleImage?.addEventListener('load', () => { startup.imageReady = true })
      roleImage?.addEventListener('error', () => {
        startup.imageReady = false
        console.error('[DeepSeek Whale] 角色图片加载失败，请检查 GM resource 下载状态')
      })
      const button = nativeDocument.createElement('button')
      button.type = 'button'
      button.className = 'whale-user-button'
      button.textContent = 'API 密钥 / 余额'
      button.addEventListener('click', event => { event.stopPropagation(); hooks.openSettings() })
      const note = nativeDocument.createElement('div')
      note.className = 'whale-user-note'
      note.textContent = '显示 API 账户余额，不代表网页会员额度。今日已用为脚本运行期间观测到的余额下降额。'
      hooks.menu.prepend(button, note)
      for (const [name, text] of Object.entries(displayLabels)) {
        const label = nativeDocument.createElement('label')
        label.style.cssText = 'display:flex;align-items:center;gap:6px;margin:7px 0;cursor:pointer;'
        const input = nativeDocument.createElement('input')
        input.type = 'checkbox'
        input.dataset.whaleDisplay = name
        input.addEventListener('change', () => changeDisplay(name, input.checked))
        displayInputs.set(name, input)
        label.append(input, nativeDocument.createTextNode(text))
        hooks.menu.appendChild(label)
      }
      displayNote = nativeDocument.createElement('div')
      displayNote.className = 'whale-user-note'
      hooks.menu.appendChild(displayNote)
    },
  }
  function command(label, handler) { commands.push(GM_registerMenuCommand(label, handler)) }
  command('🔑 设置 DeepSeek API 密钥', () => hooks?.openSettings())
  command('🔄 刷新余额', () => hooks?.refresh())
  command('📒 导出余额观测记录（不含密钥）', () => {
    const ledgers = Object.fromEntries(GM_listValues().filter(key => key.startsWith(prefix + 'ledger:'))
      .map(key => [key.slice(prefix.length), GM_getValue(key)]))
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ledgers }, null, 2)], { type: 'application/json' })
    const link = nativeDocument.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'deepseek-whale-ledger.json'
    link.click()
    bridge.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  })
  const onVisible = () => { if (!nativeDocument.hidden) hooks?.refresh() }
  nativeDocument.addEventListener('visibilitychange', onVisible)
  subscriptions.push(() => nativeDocument.removeEventListener('visibilitychange', onVisible))
  function dispose() {
    if (disposed) return
    disposed = true
    audioBridge.stop()
    service.dispose()
    for (const id of intervalIds) nativeWindow.clearInterval(id)
    for (const id of timeoutIds) nativeWindow.clearTimeout(id)
    for (const item of facadeListeners) {
      nativeDocument.removeEventListener(item.type, item.outside, item.capture)
      shadow.removeEventListener(item.type, item.inside, item.capture)
    }
    subscriptions.forEach(unsubscribe => unsubscribe())
    commands.forEach(id => GM_unregisterMenuCommand(id))
    host.remove()
  }
  startup.stage = '组件初始化'
  try { createWidget(bridge) } catch (error) {
    dispose()
    throw error
  }
  return {
    dispose,
    updateDisplay(settings) {
      for (const [name, input] of displayInputs) input.checked = settings[name]
      displayNote.textContent = '任一开关符合当前网站时显示。当前来源：' + settings.sources.join('、')
    },
  }
}
