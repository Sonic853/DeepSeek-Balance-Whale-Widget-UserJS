export function displayKeys(hostname) {
  return { global: 'display:global', site: `display:site:${hostname}`, deepseek: 'display:deepseek' }
}

export function displaySettings(store, hostname) {
  const keys = displayKeys(hostname)
  const global = store.get(keys.global, false) === true
  const site = store.get(keys.site, false) === true
  const deepseek = store.get(keys.deepseek, true) === true
  const isDeepSeek = hostname === 'deepseek.com' || hostname.endsWith('.deepseek.com')
  const sources = [global && '全网站', site && '本站', deepseek && isDeepSeek && 'DeepSeek 网站'].filter(Boolean)
  return { global, site, deepseek, isDeepSeek, enabled: sources.length > 0, sources }
}

export const displayLabels = { global: '全网站显示', site: '本站显示', deepseek: 'DeepSeek 网站显示' }
