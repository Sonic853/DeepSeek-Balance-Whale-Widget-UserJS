import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { parse } from 'acorn'
import { build } from 'esbuild'

const source = (await readFile(new URL('../vendor/whale-widget.js', import.meta.url), 'utf8')).replaceAll('\r\n', '\n')
const walk = (node, visit) => {
  if (!node || typeof node !== 'object') return
  if (node.type) visit(node)
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => walk(child, visit))
    else if (value && typeof value === 'object') walk(value, visit)
  }
}
let init
walk(parse(source, { ecmaVersion: 'latest' }), node => {
  if (node.type === 'FunctionDeclaration' && node.id.name === 'dshwInit') init = node
})
if (!init) throw new Error('Upstream dshwInit was not found')
let body = source.slice(init.body.body[2].start, init.body.end - 1)
const end = body.indexOf('// —— 每轮对话消耗检测：')
if (end < 0) throw new Error('Upstream last-turn polling boundary changed')
body = body.slice(0, end)
const edits = []
let imageAssignments = 0, quotaFunctions = 0, dateFunctions = 0
walk(parse(body, { ecmaVersion: 'latest', allowReturnOutsideFunction: true }), node => {
  if (node.type === 'Literal' && typeof node.value === 'string' && node.value.includes('html ')) {
    edits.push({ start: node.start, end: node.end, text: JSON.stringify(node.value.replaceAll('html ', ':host ')) })
  }
  if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && node.left.property.name === 'src') {
    edits.push({ start: node.right.start, end: node.right.end, text: `bridge.asset(${body.slice(node.right.start, node.right.end)})` })
    imageAssignments++
  }
  if (node.type === 'FunctionDeclaration' && node.id.name === 'buildModeSel') {
    edits.push({ start: node.start, end: node.end,
      text: "function buildModeSel() { return apiSelectEl([['manual', '手动填写']], 'manual') }" })
    quotaFunctions++
  }
  if (node.type === 'FunctionDeclaration' && ['usageTodayKeyStr', 'usageEvTime'].includes(node.id.name)) {
    edits.push({ start: node.start, end: node.end, text: node.id.name === 'usageTodayKeyStr'
      ? "function usageTodayKeyStr() { return new Date(Date.now() + 28800000).toISOString().slice(0, 10) }"
      : "function usageEvTime(ev) { try { return new Date(Number(ev.ts) + 28800000).toISOString().slice(11, 16) } catch (_) { return '' } }" })
    dateFunctions++
  }
})
if (imageAssignments !== 13 || quotaFunctions !== 1 || dateFunctions !== 2) throw new Error('Upstream adaptation points changed')
for (const edit of edits.sort((a, b) => b.start - a.start)) body = body.slice(0, edit.start) + edit.text + body.slice(edit.end)

function replace(from, to) {
  if (!body.includes(from)) throw new Error(`Upstream patch target changed: ${from.slice(0, 90)}`)
  body = body.replaceAll(from, () => to)
}
replace("isNew ? 'openrouter' : m.provider", "isNew ? 'custom' : m.provider")
// The image's transparent pixels are gaps in the artwork, not gaps in the
// route to its menu. Only the button becomes hittable; the image stays porous.
replace("  if (!menuBtnHide) menuBtn.classList.toggle('dshwv-menu-btn-visible', over || menuOpen)", `  var imageRect = img.getBoundingClientRect()
  var buttonRect = menuBtn.getBoundingClientRect()
  var nearMenu = [imageRect, buttonRect].some(function (r) {
    return r.width > 0 && r.height > 0 && e.clientX >= r.left - 6 && e.clientX <= r.right + 6 && e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6
  })
  if (!menuBtnHide) menuBtn.classList.toggle('dshwv-menu-btn-visible', nearMenu || menuOpen)`)
replace('var soundOn = true', 'var soundOn = false')
replace('var soundVol = 0.9', 'var soundVol = 0')
replace(`  if (!pressAudio) {
    // 按压槽留空:按压事件静音,但“按压已结束”标记保持同步,松开时若松开槽有声仍会响
    pressEnded = true
    return
  }
`, '')
replace(`    pressEnded = false
    releasePlayed = false`, `    pressEnded = false
    releasePlayed = false
    if (!pressAudio) { pressEnded = true; return }`)
replace(`function applySoundSet() {
  try {`, `function applySoundSet() {
  try {
    if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = null }
    if (pressAudio) { pressAudio.onended = null; pressAudio.pause() }
    if (releaseAudio) releaseAudio.pause()
    pressEnded = false
    releasePlayed = false`)
replace("menuBox.className = 'dshwv-menu'", `menuBox.className = 'dshwv-menu'
menuBox.inert = true
menuBox.setAttribute('aria-hidden', 'true')
menuBtn.setAttribute('aria-expanded', 'false')`)
replace("menuBox.classList.toggle('dshwv-menu-open', menuOpen)", `menuBox.classList.toggle('dshwv-menu-open', menuOpen)
  menuBox.inert = !menuOpen
  menuBox.setAttribute('aria-hidden', String(!menuOpen))
  menuBtn.setAttribute('aria-expanded', String(menuOpen))`)
replace("menuBox.classList.remove('dshwv-menu-open')", `menuBox.classList.remove('dshwv-menu-open')
  menuBox.inert = true
  menuBox.setAttribute('aria-hidden', 'true')
  menuBtn.setAttribute('aria-expanded', 'false')`)
replace("bubbleBox.className = 'dshwv-pop'", "bubbleBox.className = 'dshwv-pop'; bubbleBox.inert = true")
replace("bubbleBox.classList.remove('dshwv-pop-open')", "bubbleBox.classList.remove('dshwv-pop-open'); bubbleBox.inert = true")
replace("bubbleBox.classList.add('dshwv-pop-open')", "bubbleBox.classList.add('dshwv-pop-open'); bubbleBox.inert = false")
replace('if (apiTemplates[ti].builtin) continue', 'if (apiTemplates[ti].builtin && (isNew || m.provider !== apiTemplates[ti].id)) continue')
replace('写入 DSH 官方凭据（.credentials.yaml）时使用的名字', '密钥存入用户脚本管理器专用存储，不写入网页 localStorage')
replace('粘贴 API key（保存时写入 DSH 凭据）', '粘贴 API key（保存到用户脚本管理器）')
replace('今日总额来自余额差值,暂不含模型明细(启用会话记录后将按模型展示)', '仅统计脚本运行期间观测到的余额下降额，无法归属到具体对话或模型。')
replace('已用按会话 token 自动累计（跨天保留）', '已用手动填写，用户脚本无法读取本机会话 token')
replace("autoHint.style.display = unitSel.value === 'money' ? 'none' : ''", "autoHint.style.display = 'none'")
replace("autoHint.style.display = money ? 'none' : ''", "autoHint.style.display = 'none'")
replace('把自动统计的起点设为当前值（比如换了新资源包时用），已用从 0 重新算。', '将手动填写的已用值重置为 0。')
replace("function usageMoney(x) { return '¥'", "function usageMoney(x) { return (state.currency === 'USD' ? '$' : '¥')")
replace("readonlyRow('单价', pTxt)", "readonlyRow('记账方式', '按余额差观测，不估算会话 token 价格')")
replace('function bubbleAmountText() {', `function bubbleAmountText() {
  if (state.status === 'error') return state.message && state.message.indexOf('配置密钥') >= 0 ? '未配置 API key' : '余额不可用'`)
replace("        state.message = (data && data.error) ? String(data.error) : '获取失败'", "        state.message = (data && data.error) ? String(data.error) : '获取失败'\n        root.title = state.message")
replace("      state.message = '获取失败'", "      state.message = '获取失败'; root.title = state.message")
replace('fetch(BALANCE_URL,', "fetch(BALANCE_URL + (manual ? '?refresh=1' : ''),")
replace("fetch('/dsh-whale/api-models.json', opts)", "fetch('/dsh-whale/api-models.json' + (apiModelsNetworkForce ? '?refresh=1' : ''), opts)")
replace('  apiModelsFetch(3)', '  apiModelsFetch(3); apiModelsNetworkForce = false')
replace("    apiModelsError = ''\n    var settled = false", "    apiModelsError = ''; apiModelsNetworkForce = true\n    var settled = false")
replace('        apiModelsFlushWaiters()\n        return', '        refreshLiveValues(); apiModelsFlushWaiters()\n        return')
replace("function registerIfCountdown(blk) {", `function registerIfCountdown(blk) {
    if (parentEl === textBox && ['balance', 'today', 'quota'].includes(blk.mod.type)) liveValues.set(blk.tx, blk.mod)`)
replace('  // 注意:不在泡泡显示期间整泡重绘', `  refreshLiveValues()
  // 注意:不在泡泡显示期间整泡重绘`)
replace('    amountEl.textContent = fmt(val, currency)', '    shown = val; refreshLiveValues()\n    amountEl.textContent = fmt(val, currency)')
replace('amountEl.textContent = fmt(to, currency)', 'amountEl.textContent = fmt(to, currency); refreshLiveValues()')
replace("text: '¥{below}'", "text: '{below}'")
replace("text: '¥{amount}'", "text: '{amount}'")
replace("state.message = ''\n        state.todayUsage", "state.message = ''\n        root.title = data.stale ? '显示最近成功获取的余额，网络恢复后将更新' : 'DeepSeek API 余额（不代表网页会员额度）'\n        state.todayUsage")
// Exclude event-matching and token pricing controls from the standalone UI.
if (!body.includes('    apiModelMaskEl = mask')) throw new Error('Model panel boundary changed')
body = body.replace('    apiModelMaskEl = mask', `    ;[matchRow, tip, pTip, pHit.parentNode, pMiss.parentNode, pOut.parentNode, pCur.parentNode, pRate.parentNode].forEach(function (el) { if (el) el.style.display = 'none' })
    Array.from(card.querySelectorAll('.dshwv-bubsec')).forEach(function (el) { if (el.textContent.indexOf('单价') >= 0) el.style.display = 'none' })
    if (m && m.builtin) {
      ;[nameInp, keyRefInp, curSel, balUrl, authInp, jRem, jTot, jUse, jSca, uUrl, uUse, uSca].forEach(function (el) { el.disabled = true })
      baseRow.style.display = 'none'
      advToggle.style.display = 'none'
      Array.from(btns.querySelectorAll('button')).forEach(function (el) { if (el.textContent === '删除模型') el.remove() })
    }
    apiModelMaskEl = mask`)

const generated = `// Derived from MeteorNOX/DeepSeek-Balance-Whale-Widget, MIT.
// Upstream commit: 40cebc2937aea674247a0d0e03e16c154f7b9864
// Upstream SHA-256: ${createHash('sha256').update(source).digest('hex')}
export function createWidget(bridge) {
const { document, window, storage: localStorage, fetch, Audio, setInterval, clearInterval, setTimeout, clearTimeout } = bridge;
const liveValues = new Map();
var apiModelsNetworkForce = false;
function refreshLiveValues() {
  liveValues.forEach(function (mod, el) {
    if (!el.isConnected) liveValues.delete(el)
    else el.textContent = bubbleRowContentOf(mod).txt
  })
}
${body}
row7.remove();
turnCostOn = false;
bridge.ready({
  menu: menuBox, root: root,
  refresh: function () { refresh(true); apiModelsNetworkForce = true; loadApiModels(null, true) },
  openSettings: function () { loadApiModels(function () { openApiModelPanel('deepseek') }, true) },
  openMenu: function () { if (!menuOpen) toggleMenu() },
});
}
`
await writeFile(new URL('../src/widget.generated.js', import.meta.url), generated)

const files = ['DSniang1.png', 'Ya1.mp3', 'Ya2.mp3', 'D1.mp3', 'D2.mp3', 'minecraft-exp-orb.wav', 'task-end-a.wav', 'bubble-petpet.gif', 'bubble-money1.gif']
const revision = '40cebc2937aea674247a0d0e03e16c154f7b9864'
const header = `// ==UserScript==
// @name         DeepSeek-Balance-Whale-Widget-UserJS
// @namespace    https://github.com/Sonic853
// @version      1.0.0
// @description  小鲸鱼 DeepSeek API 余额挂件：默认仅在 DeepSeek 显示，可开启全网站或本站显示，支持气泡编辑、角色及音效
// @author       MeteorNOX (original), Sonic853 (userscript port)
// @license      MIT
// @match        http://*/*
// @match        https://*/*
// @noframes
// @run-at       document-idle
// @require      https://update.greasyfork.org/scripts/595862/1932539/HTTPSend%202.js
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_getResourceURL
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @connect      api.deepseek.com
// @connect      *
${files.map(file => `// @resource     ${file.replaceAll('.', '_').replaceAll('-', '_')} https://raw.githubusercontent.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/${revision}/assets/${file}`).join('\n')}
// ==/UserScript==

/*
${await readFile(new URL('../LICENSE', import.meta.url), 'utf8')}
*/

// Terminate the preceding @require file before esbuild's opening IIFE.
;
`
await build({ entryPoints: ['src/main.js'], outfile: 'DeepSeek-Balance-Whale-Widget.user.js',
  bundle: true, format: 'iife', target: ['es2022'], charset: 'utf8', legalComments: 'inline',
  banner: { js: header }, minify: false, sourcemap: false })
console.log(`Built userscript; adapted ${imageAssignments} image assignments, removed DSH-only boot/polling.`)
