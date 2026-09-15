/**
 * HTTPSend 2.0.0 — standalone userscript HTTP library.
 * Source: https://github.com/Sonic853/Static_library
 * Documentation and migration notes: docs/HTTPSend.md
 * Loading this file performs no requests. No build step or dependencies required.
 */
/* global GM_xmlhttpRequest, GM */
// Top-level var bindings also work inside a userscript manager's @require wrapper.
var HTTPSend = (function () {
  'use strict'

  class HSRequest {
    constructor(options = {}) {
      if (!options || typeof options !== 'object') {
        throw new TypeError('Request options must be an object')
      }
      Object.assign(this, options)
      this.mode = options.mode ?? 'GM'
      this.url = options.url ?? ''
      this.method = options.method ?? options.requestInit?.method ?? 'GET'
      this.headers = copyHeaders(options.headers)
      this.responseType = options.responseType ?? 'text'
      this.timeout = options.timeout ?? 0
      this.debug = options.debug ?? false
      if (options.requestInit) this.requestInit = { ...options.requestInit }
    }

    set successHandler(handler) { this.onload = handler }
    get successHandler() { return this.onload }
    set errorHandler(handler) { this.onerror = handler }
    get errorHandler() { return this.onerror }
  }

  class HTTPError extends Error {
    constructor(message, code, options, response, cause) {
      super(message)
      this.name = 'HTTPError'
      this.code = code
      this.status = Number(response?.status) || 0
      this.url = options?.url ?? ''
      this.mode = options?.mode ?? ''
      this.response = response
      if (cause !== undefined) this.cause = cause
    }
  }

  function copyHeaders(headers) {
    if (headers == null) return {}
    if (typeof headers.entries === 'function' && !Array.isArray(headers)) {
      return Object.fromEntries(headers.entries())
    }
    return Array.isArray(headers) ? Object.fromEntries(headers) : { ...headers }
  }

  function gmTransport() {
    // Grants may be lexical bindings, so do not look them up on unsafeWindow.
    if (typeof GM_xmlhttpRequest === 'function') return details => GM_xmlhttpRequest(details)
    if (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function') {
      return details => GM.xmlHttpRequest(details)
    }
    return null
  }

  /**
   * @param {HSRequest|object} options
   * @param {boolean} [stringOnly=false] Return the decoded body instead of the native response.
   * @returns {Promise<any> & {abort(reason?: any): void}}
   */
  function HTTPSend(options, stringOnly = false) {
    let request, resolvePromise, rejectPromise, timer, transportAbort
    let settled = false
    let stopRequested = false
    let nativeResponse
    const listeners = []
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve
      rejectPromise = reject
    })

    const makeError = (code, message, response, cause) =>
      new HTTPError(message, code, request, response, cause)

    function cleanup() {
      clearTimeout(timer)
      for (const [signal, listener] of listeners) signal.removeEventListener('abort', listener)
      listeners.length = 0
    }

    function stopTransport() {
      stopRequested = true
      try { transportAbort?.() } catch (_) { /* The promise is already settled. */ }
    }

    function finish(error, value, callback, args) {
      if (settled) return
      settled = true
      cleanup()
      try {
        // Callback exceptions reject the same promise, without firing onerror again.
        if (typeof callback === 'function') callback.apply(request, args)
      } catch (cause) {
        rejectPromise(makeError('CALLBACK_ERROR', 'Request callback threw an exception', nativeResponse, cause))
        return
      }
      if (error) rejectPromise(error)
      else resolvePromise(value)
    }

    function fail(code, message, response, cause, callback = request?.onerror, event) {
      const error = makeError(code, message, response, cause)
      finish(error, undefined, callback, [response ?? error, event])
    }

    function cancel(code, reason) {
      if (settled) return
      const timeout = code === 'TIMEOUT'
      fail(code, timeout ? 'Request timed out' : 'Request aborted', nativeResponse, reason,
        (timeout ? request?.ontimeout : request?.onabort) ?? null)
      stopTransport()
    }

    function notify(callback, args) {
      if (settled || typeof callback !== 'function') return
      try { callback.apply(request, args) } catch (cause) {
        finish(makeError('CALLBACK_ERROR', 'Request callback threw an exception', nativeResponse, cause))
        stopTransport()
      }
    }

    function accepts(response, event) {
      if (settled) return false
      nativeResponse = response
      let valid
      try { valid = request.validateStatus(response.status) } catch (cause) {
        fail('CONFIG_ERROR', 'validateStatus threw an exception', response, cause)
        return false
      }
      if (!valid) {
        fail('HTTP_ERROR', `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
          response, undefined, request.onerror, event)
      }
      return !!valid
    }

    function loaded(response, event) {
      if (!accepts(response, event)) return
      const value = stringOnly ? (response.response !== undefined ? response.response : response.responseText) : response
      finish(null, value, request.onload, [value, event])
    }

    Object.defineProperty(promise, 'abort', { value: reason => cancel('ABORTED', reason) })

    try {
      request = new HSRequest(options)
      request.mode = String(request.mode).toUpperCase()
      request.method = String(request.method).toUpperCase()
      request.validateStatus = request.validateStatus ?? (status => status >= 200 && status < 300)
      if (!['GM', 'XHR', 'FETCH'].includes(request.mode)) throw new TypeError('Unknown request mode')
      if (typeof request.validateStatus !== 'function') throw new TypeError('validateStatus must be a function')
      if (!Number.isFinite(request.timeout) || request.timeout < 0 || request.timeout > 2147483647) {
        throw new TypeError('timeout must be between 0 and 2147483647 milliseconds')
      }
      if (!request.url || !String(request.url).trim()) throw new TypeError('A request URL is required')
      const base = typeof location !== 'undefined' ? location.href : undefined
      request.url = new URL(String(request.url), base).href

      const gm = gmTransport()
      if (request.mode === 'GM' && !gm) {
        request.mode = typeof XMLHttpRequest === 'function' ? 'XHR' : 'FETCH'
      }
      if (request.synchronous && request.mode !== 'XHR') {
        throw new TypeError('synchronous is only supported in XHR mode')
      }
      if (request.synchronous && request.timeout) throw new TypeError('Synchronous XHR does not support timeout')

      const signals = new Set([request.signal, request.mode === 'FETCH' ? request.requestInit?.signal : null])
      for (const signal of signals) {
        if (!signal) continue
        if (typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function') {
          throw new TypeError('signal must be an AbortSignal')
        }
        if (signal.aborted) {
          cancel('ABORTED', signal.reason)
          return promise
        }
        const listener = () => cancel('ABORTED', signal.reason)
        signal.addEventListener('abort', listener, { once: true })
        listeners.push([signal, listener])
      }
      if (request.timeout > 0) timer = setTimeout(() => cancel('TIMEOUT'), request.timeout)
      if (request.debug) console.debug(`[HTTPSend] ${request.mode} ${request.method} ${request.url}`)

      const body = ['GET', 'HEAD'].includes(request.method) ? undefined
        : request.data !== undefined ? request.data
          : request.body !== undefined ? request.body : request.requestInit?.body

      if (request.mode === 'GM') {
        const details = { url: request.url, method: request.method, headers: request.headers }
        const keys = ['binary', 'context', 'overrideMimeType', 'user', 'password', 'responseType',
          'timeout', 'anonymous', 'cookie', 'cookiePartition', 'fetch', 'redirect', 'nocache', 'revalidate']
        for (const key of keys) if (request[key] !== undefined) details[key] = request[key]
        if (body !== undefined) details.data = body
        if (request.anonymous === undefined && request.credentials === 'omit') details.anonymous = true
        if (request.upload) {
          details.upload = {}
          for (const key of ['onabort', 'onerror', 'onload', 'onprogress']) {
            if (typeof request.upload[key] === 'function') {
              details.upload[key] = response => notify(request.upload[key], [response])
            }
          }
        }
        details.onload = loaded
        details.onerror = response => fail('NETWORK_ERROR', 'Network request failed', response)
        details.onabort = response => fail('ABORTED', 'Request aborted', response, undefined, request.onabort ?? null)
        details.ontimeout = response => fail('TIMEOUT', 'Request timed out', response, undefined, request.ontimeout ?? null)
        for (const key of ['onloadstart', 'onprogress', 'onreadystatechange']) {
          details[key] = response => notify(request[key], [response])
        }
        const handle = gm(details)
        transportAbort = () => handle?.abort?.()
        // Modern GM can resolve/reject a promise as well as invoke callbacks.
        // Consume that promise; the shared settlement guard prevents duplicates.
        if (typeof handle?.then === 'function') {
          Promise.resolve(handle).then(response => loaded(response), cause => {
            const code = cause?.name === 'AbortError' ? 'ABORTED'
              : cause?.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR'
            const callback = code === 'ABORTED' ? request.onabort
              : code === 'TIMEOUT' ? request.ontimeout : request.onerror
            fail(code, 'GM request failed', cause?.status !== undefined ? cause : undefined, cause, callback ?? null)
          }).catch(cause => fail('NETWORK_ERROR', 'GM response handling failed', nativeResponse, cause))
        }
        // A manager may invoke a callback before returning its handle.
        if (stopRequested) stopTransport()
      } else if (request.mode === 'XHR') {
        if (typeof XMLHttpRequest !== 'function') throw new TypeError('XMLHttpRequest is unavailable')
        const xhr = new XMLHttpRequest()
        nativeResponse = xhr
        transportAbort = () => xhr.abort()
        xhr.open(request.method, request.url, !request.synchronous, request.user, request.password)
        if (request.withCredentials !== undefined) xhr.withCredentials = request.withCredentials
        else if (request.credentials !== undefined) xhr.withCredentials = request.credentials === 'include'
        if (request.responseType && !(request.synchronous && request.responseType === 'text')) {
          xhr.responseType = request.responseType
        }
        if (request.timeout) xhr.timeout = request.timeout
        if (request.overrideMimeType) xhr.overrideMimeType(request.overrideMimeType)
        for (const [key, value] of Object.entries(request.headers)) xhr.setRequestHeader(key, value)
        xhr.onload = event => loaded(xhr, event)
        xhr.onerror = event => fail('NETWORK_ERROR', 'Network request failed', xhr, event, request.onerror, event)
        xhr.onabort = event => fail('ABORTED', 'Request aborted', xhr, event, request.onabort ?? null, event)
        xhr.ontimeout = event => fail('TIMEOUT', 'Request timed out', xhr, event, request.ontimeout ?? null, event)
        for (const key of ['onloadstart', 'onprogress', 'onreadystatechange']) {
          xhr[key] = event => notify(request[key], [xhr, event])
        }
        if (request.upload && xhr.upload) {
          for (const key of ['onabort', 'onerror', 'onload', 'onprogress']) {
            xhr.upload[key] = event => notify(request.upload[key], [xhr, event])
          }
        }
        xhr.send(body)
        if (request.synchronous && xhr.readyState === 4) loaded(xhr)
      } else {
        if (typeof fetch !== 'function') throw new TypeError('fetch is unavailable')
        if (request.user !== undefined || request.password !== undefined) {
          throw new TypeError('FETCH authentication requires an Authorization header')
        }
        if (!['', 'text', 'json', 'blob', 'arraybuffer', 'document', 'stream'].includes(request.responseType)) {
          throw new TypeError('Unsupported FETCH responseType')
        }
        const controller = new AbortController()
        transportAbort = () => controller.abort()
        const init = { ...request.requestInit, method: request.method, signal: controller.signal }
        const headers = new Headers(init.headers)
        for (const [key, value] of Object.entries(request.headers)) headers.set(key, value)
        init.headers = headers
        if (request.credentials !== undefined) init.credentials = request.credentials
        else if (request.withCredentials !== undefined) init.credentials = request.withCredentials ? 'include' : 'same-origin'
        if (body === undefined) delete init.body
        else init.body = body
        Promise.resolve(fetch(request.url, init)).then(async response => {
          if (!accepts(response)) return
          let value = response
          if (stringOnly) {
            try {
              switch (request.responseType) {
                case 'json': {
                  const text = await response.text()
                  value = text === '' ? null : JSON.parse(text)
                  break
                }
                case 'arraybuffer': value = await response.arrayBuffer(); break
                case 'blob': value = await response.blob(); break
                case 'stream': value = response.body; break
                case 'document': {
                  const mime = (request.overrideMimeType || response.headers.get('content-type') || 'text/html').split(';')[0].trim()
                  value = new DOMParser().parseFromString(await response.text(), mime)
                  break
                }
                default: value = await response.text()
              }
            } catch (cause) {
              fail('PARSE_ERROR', 'Could not read or decode the response body', response, cause)
              return
            }
          }
          finish(null, value, request.onload, [value])
        }).catch(cause => fail(cause?.name === 'AbortError' ? 'ABORTED' : 'NETWORK_ERROR',
          'Fetch request failed', nativeResponse, cause,
          (cause?.name === 'AbortError' ? request.onabort : request.onerror) ?? null))
      }
    } catch (cause) {
      fail('CONFIG_ERROR', cause.message || 'Could not start request', nativeResponse, cause)
      stopTransport()
    }
    return promise
  }

  return Object.freeze(Object.assign(HTTPSend, { version: '2.0.0', HSRequest, HTTPError }))
})()

// Request options constructor for @require consumers.
var HSRequest = HTTPSend.HSRequest
if (typeof module === 'object' && module.exports) module.exports = HTTPSend
