// ==UserScript==
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
// @resource     DSniang1_png https://raw.githubusercontent.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/40cebc2937aea674247a0d0e03e16c154f7b9864/assets/DSniang1.png
// @resource     Ya1_mp3 https://raw.githubusercontent.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/40cebc2937aea674247a0d0e03e16c154f7b9864/assets/Ya1.mp3
// @resource     Ya2_mp3 https://raw.githubusercontent.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/40cebc2937aea674247a0d0e03e16c154f7b9864/assets/Ya2.mp3
// @resource     D1_mp3 https://raw.githubusercontent.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/40cebc2937aea674247a0d0e03e16c154f7b9864/assets/D1.mp3
// @resource     D2_mp3 https://raw.githubusercontent.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/40cebc2937aea674247a0d0e03e16c154f7b9864/assets/D2.mp3
// @resource     minecraft_exp_orb_wav https://raw.githubusercontent.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/40cebc2937aea674247a0d0e03e16c154f7b9864/assets/minecraft-exp-orb.wav
// @resource     task_end_a_wav https://raw.githubusercontent.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/40cebc2937aea674247a0d0e03e16c154f7b9864/assets/task-end-a.wav
// @resource     bubble_petpet_gif https://raw.githubusercontent.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/40cebc2937aea674247a0d0e03e16c154f7b9864/assets/bubble-petpet.gif
// @resource     bubble_money1_gif https://raw.githubusercontent.com/MeteorNOX/DeepSeek-Balance-Whale-Widget/40cebc2937aea674247a0d0e03e16c154f7b9864/assets/bubble-money1.gif
// ==/UserScript==

/*
MIT License

Copyright (c) 2026 MeteorNOX

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/

// Terminate the preceding @require file before esbuild's opening IIFE.
;

(() => {
  // src/core.js
  var DAY = 864e5;
  var round = (value) => Math.round((value + Number.EPSILON) * 1e6) / 1e6;
  var dayKey = (time = Date.now()) => new Date(time + 8 * 36e5).toISOString().slice(0, 10);
  var dayOffset = (date, offset) => dayKey(Date.parse(`${date}T00:00:00+08:00`) + offset * DAY);
  function isPeak(time = Date.now()) {
    const date = new Date(time + 8 * 36e5);
    const day = date.getUTCDay(), hour = date.getUTCHours();
    return day > 0 && day < 6 && (hour >= 9 && hour < 12 || hour >= 14 && hour < 18);
  }
  function number(value) {
    if (!["number", "string"].includes(typeof value) || typeof value === "string" && !value.trim()) throw new Error("接口未返回有效数值");
    const result = Number(value);
    if (!Number.isFinite(result)) throw new Error("接口未返回有效数值");
    return result;
  }
  function pickBalance(data) {
    const infos = data?.balance_infos;
    if (!Array.isArray(infos) || !infos.length) throw new Error("余额接口缺少 balance_infos");
    const info = infos.find((info2) => info2.currency === "CNY") || infos.find((info2) => info2.currency === "USD");
    if (!info) throw new Error("余额接口未返回 CNY 或 USD");
    return { amount: number(info.total_balance), currency: info.currency };
  }
  function readPath(data, path) {
    if (!path) return void 0;
    const parts = String(path).replace(/\[(\d+)\]/g, ".$1").split(".");
    let value = data;
    for (const part of parts) {
      if (!part || ["__proto__", "prototype", "constructor"].includes(part) || value === null || typeof value !== "object" || !Object.hasOwn(value, part)) return void 0;
      value = value[part];
    }
    return value;
  }
  function parseCustomBalance(data, descriptor) {
    const fields = descriptor.json || {};
    const scale = fields.scale === void 0 || fields.scale === "" ? 1 : number(fields.scale);
    if (fields.remaining) return round(number(readPath(data, fields.remaining)) * scale);
    return round((number(readPath(data, fields.total)) - number(readPath(data, fields.used))) * scale);
  }
  function validatedURL(value, base = "") {
    const url = new URL(String(value).replaceAll("{baseUrl}", base).replaceAll("{base}", base));
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("余额接口必须使用不含用户名和密码的 HTTPS 地址");
    return url.href;
  }
  function observe(previous, { amount, currency, account, at = Date.now() }) {
    amount = number(amount);
    const ledger = structuredClone(previous || { days: {}, events: [], last: null });
    const last = ledger.last;
    if (last && at <= last.at) return ledger;
    const date = dayKey(at);
    const compatible = last && last.account === account && last.currency === currency;
    const sameDay = compatible && dayKey(last.at) === date;
    if (last && !compatible) {
      ledger.days = {};
      ledger.events = [];
    }
    const delta = sameDay ? round(Math.max(0, last.amount - amount)) : 0;
    ledger.days[date] = round((ledger.days[date] || 0) + delta);
    if (delta > 0) ledger.events.push({ ts: at, day: date, cost: delta, model: "(余额差观测)", currency });
    ledger.last = { amount, currency, account, at };
    ledger.events = ledger.events.filter((event) => event.ts >= at - 90 * DAY).slice(-2e4);
    for (const date2 of Object.keys(ledger.days)) if (date2 < dayOffset(dayKey(at), -364)) delete ledger.days[date2];
    return ledger;
  }
  function records(ledger, settings, now = Date.now()) {
    const today = dayKey(now);
    const day = (date) => ({ date, total: ledger?.days?.[date] || 0, models: [] });
    const days7 = Array.from({ length: 7 }, (_, index) => day(dayOffset(today, -index)));
    return {
      ok: true,
      currency: ledger?.last?.currency || "CNY",
      today: { ...day(today), models: [] },
      days7,
      total7: round(days7.reduce((sum, day2) => sum + day2.total, 0)),
      all: {
        days: Object.keys(ledger?.days || {}).sort().reverse().map(day),
        events: (ledger?.events || []).slice(-2e4).reverse()
      },
      settings
    };
  }
  function quotaValue(quota, now = Date.now()) {
    if (!quota) return null;
    const key = dayKey(now);
    const reset = quota.reset === "daily" ? key : quota.reset === "monthly" ? key.slice(0, 7) : "";
    const used = reset && quota.period !== reset ? 0 : Math.max(0, Number(quota.used) || 0);
    return { ...quota, mode: "manual", used, autoUsed: used, autoToday: 0 };
  }
  function defaultSettings() {
    return {
      taskEnd: { on: false, sel: "frag:exp_orb" },
      alert: {
        on: false,
        below: 5,
        autoClose: true,
        ttlSec: 6,
        lines: [{ type: "text", text: "余额低于 {below}", size: 6, bold: true }]
      },
      budget: {
        on: false,
        amount: 10,
        autoClose: true,
        ttlSec: 6,
        lines: [{ type: "text", text: "今日观测消费已达 {amount}", size: 6, bold: true }]
      },
      turnCost: { lines: [] },
      models: {}
    };
  }
  var templates = [
    {
      id: "deepseek",
      name: "DeepSeek",
      builtin: true,
      currency: "CNY",
      keyRef: "DEEPSEEK_API_KEY",
      hasBalance: true,
      kind: "balance",
      balance: { url: "https://api.deepseek.com/user/balance", auth: "Bearer {key}", json: { remaining: "balance_infos[0].total_balance" } }
    },
    {
      id: "custom",
      name: "自定义 HTTP",
      currency: "CNY",
      keyRef: "CUSTOM_API_KEY",
      hasBalance: true,
      kind: "balance",
      needsBaseUrl: true,
      balance: { url: "", auth: "Bearer {key}", json: {} },
      apiNote: "使用你配置的 HTTPS 余额接口，按余额下降额记账；不读取网页对话或本机会话日志。"
    }
  ];
  var builtinModel = {
    id: "deepseek",
    name: "DeepSeek",
    provider: "deepseek",
    builtin: true,
    currency: "CNY",
    keyRef: "DEEPSEEK_API_KEY"
  };
  var presetGroups = [
    { id: "duck", name: "小黄鸭", press: "ya1", release: "ya2", preset: true },
    { id: "fx1", name: "音效1", press: "d1", release: "d2", preset: true }
  ];
  var presetFragments = [
    { id: "ya1", name: "小黄鸭·按下", file: "Ya1.mp3" },
    { id: "ya2", name: "小黄鸭·松开", file: "Ya2.mp3" },
    { id: "d1", name: "音效1·按下", file: "D1.mp3" },
    { id: "d2", name: "音效1·松开", file: "D2.mp3" },
    { id: "exp_orb", name: "Minecraft·经验球", file: "minecraft-exp-orb.wav" },
    { id: "end_a", name: "A", file: "task-end-a.wav" }
  ].map((fragment) => ({ ...fragment, preset: true }));
  var builtinImages = [
    { id: "bimg_petpet", name: "petpet", file: "bubble-petpet.gif", builtin: true },
    { id: "bimg_money1", name: "money1", file: "bubble-money1.gif", builtin: true }
  ];

  // src/service.js
  var clone = (value) => structuredClone(value);
  var uid = () => crypto.randomUUID();
  var listSort = (values) => values.slice().sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0) || Number(!!b.preset) - Number(!!a.preset) || (b.createdAt || 0) - (a.createdAt || 0));
  var WhaleService = class {
    constructor({ store, request, resources = {}, now = Date.now, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
      this.store = store;
      this.request = request;
      this.resources = resources;
      this.now = now;
      this.wait = wait;
      this.pending = /* @__PURE__ */ new Map();
      this.requests = /* @__PURE__ */ new Set();
      this.owner = uid();
    }
    models() {
      return [clone(builtinModel), ...this.store.get("models", [])];
    }
    settings() {
      const settings = { ...defaultSettings(), ...this.store.get("settings", {}) };
      settings.taskEnd = { ...settings.taskEnd, on: false };
      settings.models = { ...settings.models };
      for (const model of this.models()) {
        const current = settings.models[model.id] || {};
        settings.models[model.id] = {
          alert: { ...settings.alert, ...current.alert },
          budget: { ...settings.budget, ...current.budget },
          quota: quotaValue(current.quota, this.now())
        };
      }
      settings.models.deepseek.alert = settings.alert;
      settings.models.deepseek.budget = settings.budget;
      return settings;
    }
    saveSettings(patch) {
      const settings = this.settings();
      for (const key of ["alert", "budget", "turnCost"]) if (patch[key]) settings[key] = { ...settings[key], ...patch[key] };
      if (patch.modelSettings) {
        const { id, alert: alert2, budget, quota } = patch.modelSettings;
        if (!this.models().some((model) => model.id === id)) throw new Error("模型不存在");
        const current = settings.models[id] || {};
        if (alert2) current.alert = { ...current.alert, ...alert2 };
        if (budget) current.budget = { ...current.budget, ...budget };
        if (quota) {
          const key = dayKey(this.now());
          current.quota = {
            ...quota,
            mode: "manual",
            used: quota.resetBase ? 0 : Math.max(0, number(quota.used || 0)),
            period: quota.reset === "daily" ? key : quota.reset === "monthly" ? key.slice(0, 7) : ""
          };
        }
        settings.models[id] = current;
        if (id === "deepseek") {
          if (alert2) settings.alert = current.alert;
          if (budget) settings.budget = current.budget;
        }
      }
      settings.taskEnd.on = false;
      this.store.set("settings", settings);
      return { ok: true, settings: this.settings() };
    }
    credential(ref) {
      return this.store.get(`credential:${ref}`, null);
    }
    setKey(ref, value) {
      if (!/^[A-Za-z0-9_.-]{1,100}$/.test(ref)) throw new Error("密钥名称仅支持英文字母、数字、点、下划线和横线");
      const old = this.credential(ref);
      if (value === old?.value) return;
      if (value) this.store.set(`credential:${ref}`, { value: String(value).trim(), version: uid() });
      else this.store.remove(`credential:${ref}`);
      for (const model of this.models()) if (model.keyRef === ref) this.store.remove(`cache:${model.id}`);
    }
    descriptor(model) {
      const template = templates.find((template2) => template2.id === model.provider) || templates[1];
      return {
        ...clone(template.balance),
        ...model.balance,
        json: { ...template.balance?.json, ...model.balance?.json }
      };
    }
    async json(url, auth, key, deadline) {
      const timeout = Math.min(1e4, deadline - this.now());
      if (timeout <= 0) throw Object.assign(new Error("余额刷新超时"), { code: "TIMEOUT" });
      const headers = { Accept: "application/json" };
      if (auth) headers.Authorization = String(auth).replaceAll("{key}", key);
      const task = this.request({
        mode: "GM",
        method: "GET",
        url,
        headers,
        responseType: "json",
        timeout,
        anonymous: true
      }, true);
      this.requests.add(task);
      try {
        return await task;
      } finally {
        this.requests.delete(task);
      }
    }
    dispose() {
      for (const task of this.requests) task.abort?.();
      this.requests.clear();
    }
    async balance(model, force = false) {
      if (this.pending.has(model.id)) return this.pending.get(model.id);
      const run = this.balanceLocked(model, force).finally(() => this.pending.delete(model.id));
      this.pending.set(model.id, run);
      return run;
    }
    async balanceLocked(model, force) {
      const descriptor = this.descriptor(model);
      const credential = this.credential(model.keyRef);
      if ((model.builtin || descriptor.auth?.includes("{key}")) && !credential?.value) {
        return { ok: false, code: "NO_KEY", error: "请在菜单 → API 密钥 / 余额中配置密钥" };
      }
      if (!descriptor.url) return { ok: false, code: "NO_URL", error: "请配置余额接口地址" };
      let url;
      try {
        url = validatedURL(descriptor.url, model.baseUrl || "");
      } catch (error) {
        return { ok: false, code: "CONFIG", error: error.message };
      }
      const identity = `${credential?.version || "anonymous"}:${url}:${model.currency}:${JSON.stringify(descriptor)}`;
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
      const account = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const cacheKey = `cache:${model.id}`, leaseKey = `lease:${model.id}`;
      const cached = () => {
        const cache = this.store.get(cacheKey, null);
        return cache?.account === account ? cache : null;
      };
      const initial = cached();
      const currentPayload = (cache, stale = false) => ({
        ...cache.payload,
        stale,
        todayUsage: this.store.get(`ledger:${model.id}`, null)?.days?.[dayKey(this.now())] || 0,
        isPeak: isPeak(this.now())
      });
      if (!force && initial && this.now() - initial.at < 25e3) return currentPayload(initial);
      const deadline = this.now() + 23500;
      let lease;
      while (this.now() < deadline) {
        const current = this.store.get(leaseKey, null);
        const fresh = cached();
        if (fresh && fresh.at > (initial?.at || 0)) return currentPayload(fresh);
        if (!current || current.until < this.now()) {
          lease = { owner: `${this.owner}:${uid()}`, until: this.now() + 3e4 };
          this.store.set(leaseKey, lease);
          await this.wait(80);
          if (this.store.get(leaseKey, null)?.owner === lease.owner) break;
        }
        lease = null;
        await this.wait(120);
      }
      if (!lease) return initial ? currentPayload(initial, true) : { ok: false, code: "BUSY", error: "其他标签页正在刷新，请稍后再试" };
      try {
        const requestDeadline = this.now() + 22e3;
        const fetchOnce = async () => {
          const data = await this.json(url, descriptor.auth, credential?.value || "", requestDeadline);
          if (model.builtin) return pickBalance(data);
          let amount;
          if (descriptor.usage?.url) {
            const usageURL = validatedURL(descriptor.usage.url, model.baseUrl || "");
            const usage = await this.json(usageURL, descriptor.auth, credential?.value || "", requestDeadline);
            const total = number(readPath(data, descriptor.json.total)) * number(descriptor.json.scale ?? 1);
            const used = number(readPath(usage, descriptor.usage.json.used)) * number(descriptor.usage.json.scale ?? 1);
            amount = round(total - used);
          } else amount = parseCustomBalance(data, descriptor);
          return { amount, currency: model.currency || "CNY" };
        };
        let balance;
        try {
          balance = await fetchOnce();
        } catch (error) {
          if (!this.transient(error)) throw error;
          await this.wait(500);
          balance = await fetchOnce();
        }
        if ((this.credential(model.keyRef)?.version || "") !== (credential?.version || "")) {
          return { ok: false, code: "KEY_CHANGED", error: "密钥已更新，请重新刷新余额" };
        }
        const currentModel = this.models().find((item) => item.id === model.id);
        if (!currentModel || JSON.stringify(this.descriptor(currentModel)) !== JSON.stringify(descriptor) || (currentModel.baseUrl || "") !== (model.baseUrl || "") || currentModel.currency !== model.currency) {
          return { ok: false, code: "CONFIG_CHANGED", error: "接口配置已更新，请重新刷新余额" };
        }
        const at = this.now();
        const previous = this.store.get(`ledger:${model.id}`, null);
        if (previous?.last && (previous.last.account !== account || previous.last.currency !== balance.currency)) {
          this.store.set(`ledger:archive:${model.id}:${previous.last.account}:${previous.last.currency}`, previous);
        }
        const ledger = observe(
          previous,
          { ...balance, account, at }
        );
        this.store.set(`ledger:${model.id}`, ledger);
        const payload = {
          ok: true,
          totalBalance: balance.amount,
          currency: balance.currency,
          todayUsage: ledger.days[dayKey(at)] || 0,
          isPeak: isPeak(at),
          updatedAt: at,
          usageMode: "ledger"
        };
        this.store.set(cacheKey, { at, account, payload });
        return payload;
      } catch (error) {
        const last = cached();
        if (this.transient(error) && last) return currentPayload(last, true);
        if (!this.transient(error)) this.store.remove(cacheKey);
        return { ok: false, code: error.code || "API_ERROR", error: error.status === 401 || error.status === 403 ? `密钥无效或没有余额查询权限（HTTP ${error.status}）` : error.status ? `余额接口返回 HTTP ${error.status}` : "余额请求失败，请检查网络与接口配置" };
      } finally {
        if (this.store.get(leaseKey, null)?.owner === lease.owner) this.store.remove(leaseKey);
      }
    }
    transient(error) {
      return error?.code === "NETWORK_ERROR" || error?.code === "TIMEOUT" || error?.status >= 500;
    }
    async modelPayload(force = false) {
      const settings = this.settings();
      const models = await Promise.all(this.models().map(async (model) => {
        const result = await this.balance(model, force);
        return {
          ...model,
          balanceDesc: this.descriptor(model),
          balanceMode: "api",
          hasBalanceApi: true,
          hasKey: !!this.credential(model.keyRef)?.value,
          balance: result.ok ? result.totalBalance : null,
          currency: result.currency || model.currency,
          todayUsage: result.ok ? result.todayUsage : null,
          todayUsageCurrency: result.currency || model.currency,
          usageSource: "balance",
          settings: settings.models[model.id],
          quota: settings.models[model.id]?.quota || null,
          error: result.ok ? null : result.error,
          stale: !!result.stale,
          price: null,
          matchIds: []
        };
      }));
      return { ok: true, builtinId: "deepseek", templates: clone(templates), models };
    }
    async updateModels(body) {
      const action = body.action || "save";
      if (action === "set-key" || action === "delete-key") {
        this.setKey(String(body.keyRef || ""), action === "set-key" ? String(body.keyValue || "") : "");
        return { ok: true };
      }
      if (action === "model-settings") return this.saveSettings({ modelSettings: body });
      const models = this.models();
      if (action === "probe") {
        const model2 = models.find((model3) => model3.id === body.id);
        if (!model2) throw new Error("模型不存在");
        const result = await this.balance(model2, true);
        return { ...result, message: result.ok ? "余额接口连接成功" : result.error };
      }
      if (action === "delete") {
        const model2 = models.find((model3) => model3.id === body.id);
        if (!model2 || model2.builtin) throw new Error("内置 DeepSeek 不可删除");
        this.store.set("models", models.filter((model3) => !model3.builtin && model3.id !== body.id));
        for (const key of [`cache:${body.id}`, `ledger:${body.id}`]) this.store.remove(key);
        if (!this.models().some((other) => other.keyRef === model2.keyRef)) this.store.remove(`credential:${model2.keyRef}`);
        const settings = this.settings();
        delete settings.models[body.id];
        this.store.set("settings", settings);
        const clean = (value) => {
          if (Array.isArray(value)) return value.filter((item) => item?.modelId !== body.id && item?.module?.modelId !== body.id).map(clean);
          if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clean(child)]));
          return value;
        };
        this.store.set("bubble", clean(this.store.get("bubble", null)));
        return this.modelPayload();
      }
      if (action !== "save") throw new Error("不支持的模型操作");
      const input = body.model || body;
      if (input.id === "deepseek") {
        if (body.keyValue?.trim()) this.setKey("DEEPSEEK_API_KEY", body.keyValue);
        return { ...await this.modelPayload(), id: "deepseek", keySaved: !!body.keyValue?.trim() };
      }
      const id = input.id || `model_${uid()}`;
      const existing = models.find((model2) => model2.id === id);
      let keyRef = String(input.keyRef || `CUSTOM_${id}`).trim();
      if (!existing && models.some((model2) => model2.keyRef === keyRef)) keyRef += `_${uid().slice(0, 8)}`;
      const model = {
        id,
        name: String(input.name || "自定义 API").slice(0, 60),
        provider: "custom",
        keyRef,
        currency: input.currency === "USD" ? "USD" : "CNY",
        baseUrl: String(input.baseUrl || "").replace(/\/+$/, ""),
        balance: clone(input.balance || {})
      };
      validatedURL(model.balance.url, model.baseUrl);
      if (model.balance.usage?.url) validatedURL(model.balance.usage.url, model.baseUrl);
      const custom = models.filter((model2) => !model2.builtin && model2.id !== id);
      if (custom.length >= 20) throw new Error("最多配置 20 个自定义余额接口");
      if (body.keyValue?.trim()) this.setKey(keyRef, body.keyValue);
      this.store.set("models", [...custom, model]);
      this.store.remove(`cache:${id}`);
      return { ...await this.modelPayload(), id, keySaved: !!body.keyValue?.trim() };
    }
    asset(value) {
      if (typeof value !== "string" || !value.startsWith("/dsh-whale/")) return value;
      const url = new URL(value, "https://whale.invalid");
      const path = url.pathname.split("/").pop(), id = url.searchParams.get("id");
      if (path === "image.png") return this.resources["DSniang1.png"] || "";
      if (path === "rua.gif") return this.resources["bubble-petpet.gif"] || "";
      if (path === "role-image.png") return this.store.get(`asset:${id}`, "");
      if (path === "bubble-img.png") {
        const builtin2 = builtinImages.find((image) => image.id === id);
        return builtin2 ? this.resources[builtin2.file] || "" : this.store.get(`asset:${id}`, "");
      }
      let fragment = id;
      if (path === "press.mp3" || path === "release.mp3") {
        const group = this.audio().groups.find((group2) => group2.id === (url.searchParams.get("set") || "duck"));
        fragment = group?.[path === "press.mp3" ? "press" : "release"];
      }
      if (!fragment) return "";
      const builtin = presetFragments.find((item) => item.id === fragment);
      return builtin ? this.resources[builtin.file] || "" : this.store.get(`asset:${fragment}`, "");
    }
    roles() {
      return { ok: true, roles: listSort([
        { id: "default", name: "小鲸鱼", format: "png", preset: true },
        ...this.store.get("roles", [])
      ]).map((role) => ({
        ...role,
        url: role.id === "default" ? "/dsh-whale/image.png" : `/dsh-whale/role-image.png?id=${encodeURIComponent(role.id)}`
      })) };
    }
    images() {
      return { ok: true, images: [...clone(builtinImages), ...this.store.get("images", [])] };
    }
    audio() {
      return {
        ok: true,
        fragments: [...clone(presetFragments), ...this.store.get("fragments", [])],
        groups: listSort([...clone(presetGroups), ...this.store.get("groups", [])])
      };
    }
    upload(type, value, name, maxMB) {
      const audio = type === "fragments";
      const pattern = audio ? /^data:audio\/wav;base64,[A-Za-z0-9+/=]+$/ : /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
      if (typeof value !== "string" || !pattern.test(value)) throw new Error("文件格式不支持");
      if (value.length > maxMB * 1024 * 1024 * 4 / 3 + 100) throw new Error(`文件不能超过 ${maxMB} MB`);
      const list = this.store.get(type, []);
      if (list.length >= 100) throw new Error("此资源分类最多保存 100 个文件");
      const id = `${type}_${uid()}`;
      const entry = {
        id,
        name: String(name || "未命名").slice(0, 60),
        createdAt: this.now(),
        format: !audio && value.startsWith("data:image/gif") ? "gif" : "png"
      };
      this.store.set(`asset:${id}`, value);
      this.store.set(type, [...list, entry]);
      return id;
    }
    removeAsset(type, id) {
      const list = this.store.get(type, []);
      if (!list.some((item) => item.id === id)) throw new Error("内置资源不可删除，或资源不存在");
      this.store.set(type, list.filter((item) => item.id !== id));
      this.store.remove(`asset:${id}`);
      if (type === "fragments") this.store.set("groups", this.store.get("groups", []).map((group) => ({
        ...group,
        press: group.press === id ? "" : group.press,
        release: group.release === id ? "" : group.release
      })));
    }
    pin(type, id, pinned) {
      const list = this.store.get(type, []);
      const entry = list.find((item) => item.id === id);
      if (!entry) throw new Error("资源不存在");
      entry.pinnedAt = pinned ? this.now() : null;
      entry.pinned = !!pinned;
      this.store.set(type, list);
    }
    async route(path, method, body) {
      const write = method === "POST" || method === "PUT";
      if (path === "balance.json") return this.balance(builtinModel, !!body.force);
      if (path === "size.json") {
        const config = {
          scale: 1,
          sound: false,
          vol: 0,
          soundSet: "duck",
          bubbleOn: true,
          ...this.store.get("size", {}),
          ...write ? body : {},
          turnCostOn: false,
          usageMode: "ledger"
        };
        config.scale = Math.min(2.5, Math.max(0.6, Number(config.scale) || 1));
        config.vol = config.sound === false ? 0 : Math.min(1, Math.max(0, Number(config.vol) || 0));
        config.sound = config.vol > 0;
        if (write) this.store.set("size", config);
        return { ok: true, ...config };
      }
      if (path === "usage-settings.json") return write ? this.saveSettings(body) : { ok: true, settings: this.settings() };
      if (path === "usage-records.json") return records(this.store.get("ledger:deepseek", null), this.settings(), this.now());
      if (path === "api-models.json") return write ? this.updateModels(body) : this.modelPayload(!!body.force);
      if (path === "bubble.json") {
        if (write) {
          if (!Array.isArray(body.items) || !Array.isArray(body.lib)) throw new Error("气泡配置格式不正确");
          if (JSON.stringify(body).length > 512 * 1024) throw new Error("气泡配置不能超过 512 KB");
          this.store.set("bubble", { v: 1, items: body.items, lib: body.lib, tapAdvance: body.tapAdvance === true });
        }
        return { ok: true, config: this.store.get("bubble", null) };
      }
      if (path === "roles.json") {
        const id = write ? this.upload("roles", body.image, body.name, 20) : void 0;
        return { ...this.roles(), id };
      }
      if (path === "role-pin.json") {
        this.pin("roles", body.id, body.pinned);
        return this.roles();
      }
      if (path === "role-delete.json") {
        this.removeAsset("roles", body.id);
        return this.roles();
      }
      if (path === "bubble-imgs.json") return this.images();
      if (path === "bubble-img-upload.json") {
        if (body.action === "delete") this.removeAsset("images", body.id);
        else if (body.action === "upload") {
          const id = this.upload("images", body.data, body.name, 8);
          return { ...this.images(), id };
        } else throw new Error("不支持的图片操作");
        return this.images();
      }
      if (path === "audio.json") {
        if (!write) return this.audio();
        if (body.action === "upload-fragment") {
          const id = this.upload("fragments", body.audio, body.name, 8);
          return { ...this.audio(), id };
        }
        if (body.action === "delete-fragment") this.removeAsset("fragments", body.id);
        else if (body.action === "delete-group") this.removeAsset("groups", body.id);
        else if (body.action === "pin-group") this.pin("groups", body.id, body.pinned);
        else if (body.action === "save-group") {
          const id = body.id || `group_${uid()}`;
          if (presetGroups.some((group2) => group2.id === id)) throw new Error("内置音效组不可修改");
          const groups = this.store.get("groups", []);
          const group = groups.find((group2) => group2.id === id) || { id, createdAt: this.now() };
          group.name = String(body.name || "音效组").slice(0, 60);
          for (const slot of ["press", "release"]) {
            const fragment = String(body[slot] || "");
            if (fragment && !this.audio().fragments.some((item) => item.id === fragment)) throw new Error("音频片段不存在");
            group[slot] = fragment;
          }
          this.store.set("groups", [...groups.filter((group2) => group2.id !== id), group]);
        } else throw new Error("不支持的音频操作");
        return this.audio();
      }
      throw new Error(`移植版没有此接口：${path}`);
    }
    async fetch(input, options = {}) {
      if (!String(input).startsWith("/dsh-whale/")) throw new Error("挂件仅允许使用内部服务接口");
      if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const url = new URL(input, "https://whale.invalid");
      const path = url.pathname.split("/").pop();
      let result, status = 200;
      try {
        result = await this.route(path, options.method || "GET", options.body ? JSON.parse(options.body) : { force: url.searchParams.get("refresh") === "1" });
      } catch (error) {
        status = 400;
        result = { ok: false, error: error.message };
      }
      if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return new Response(JSON.stringify(result), { status, headers: { "Content-Type": "application/json" } });
    }
  };

  // src/widget.generated.js
  function createWidget(bridge) {
    const { document: document2, window: window2, storage: localStorage, fetch, Audio, setInterval, clearInterval, setTimeout: setTimeout2, clearTimeout } = bridge;
    const liveValues = /* @__PURE__ */ new Map();
    var apiModelsNetworkForce = false;
    function refreshLiveValues() {
      liveValues.forEach(function(mod, el) {
        if (!el.isConnected) liveValues.delete(el);
        else el.textContent = bubbleRowContentOf(mod).txt;
      });
    }
    var MIN_SCALE = 0.6;
    var MAX_SCALE = 2.5;
    var STEP = 0.1;
    var CLICK_SQ = 9;
    var REFRESH_MS = 6e4;
    var CHANGE_MS = 900;
    var ANIM_MS = 700;
    var BUBBLE_MS = 5e3;
    var FETCH_TIMEOUT_MS = 25e3;
    var BALANCE_URL = "/dsh-whale/balance.json";
    var SIZE_URL = "/dsh-whale/size.json";
    var IMG_URL = "/dsh-whale/image.png?v=2";
    var GIF_URL = "/dsh-whale/rua.gif";
    var BUBBLE_URL = "/dsh-whale/bubble.json";
    var css = [
      ".dshwv-root{position:fixed;right:0;bottom:0;--dshw-scale:1;--dshw-base:clamp(122px,calc(min(250px,min(100vw,100vh) * 0.28) * var(--dshw-scale)),625px);width:var(--dshw-base);height:var(--dshw-base);pointer-events:none;user-select:none;-webkit-user-select:none;z-index:9999;font-family:inherit;transition:left .16s ease,top .16s ease,transform .3s ease}",
      // v634 移动端:去掉浏览器「点击高亮」方块——它画在可点元素的矩形包围盒上,
      // 泡泡的内联 SVG 形状尤其明显;同时禁掉 iOS 长按系统菜单/放大镜。
      // 只作用于挂件自身的 dshwv- 元素(该属性可继承,后代一并覆盖),不影响 DSH 页面自身的高亮。
      ':host [class*="dshwv-"],:host [class*="dshwv-"] *{-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none}',
      ".dshwv-root.dshwv-left{transform:scaleX(-1)}",
      ".dshwv-root.dshwv-dragging{cursor:grabbing;transition:none}",
      ".dshwv-body{position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:50% 100%;transition:transform .22s cubic-bezier(.34,1.56,.64,1)}",
      ".dshwv-img{position:absolute;right:0;bottom:0;width:59.45%;height:59.45%;display:block;pointer-events:none;-webkit-user-drag:none;user-select:none;object-fit:contain;object-position:right bottom}",
      ".dshwv-pop{position:absolute;left:0;top:0;width:100%;aspect-ratio:1026/700;pointer-events:none;z-index:1;--dshw-u:calc(var(--dshw-base) / 1026)}",
      // 纵深防御：泡泡容器必须透明，形状由内部 SVG 绘制；用 !important 压掉外部
      // 插件“类名子串匹配”选择器（如 aqua 的 [class*=bubble]）注入的玻璃/边框样式
      ":host .dshwv-pop, :host .dshwv-pop svg{background:transparent !important;border:0 !important;border-radius:0 !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important}",
      ".dshwv-pop svg{display:block;width:100%;height:100%;pointer-events:none}",
      ".dshwv-pop svg path,.dshwv-pop svg ellipse{pointer-events:none;cursor:pointer}",
      ".dshwv-pop.dshwv-pop-open svg path,.dshwv-pop.dshwv-pop-open svg ellipse{pointer-events:visiblePainted}",
      ".dshwv-pop .dshwv-bshape,.dshwv-pop .dshwv-b1,.dshwv-pop .dshwv-b2{opacity:0;transform:scale(.7);transform-box:fill-box;transform-origin:50% 50%;transition:opacity .2s ease,transform .2s ease}",
      ".dshwv-pop.dshwv-pop-open .dshwv-bshape,.dshwv-pop.dshwv-pop-open .dshwv-b1,.dshwv-pop.dshwv-pop-open .dshwv-b2{opacity:1;transform:none}",
      ".dshwv-gif{position:absolute;left:var(--dshw-vx,44.25%);top:var(--dshw-vy,36%);transform:translate(-50%,-50%);max-width:calc(var(--dshw-u) * 560);max-height:calc(var(--dshw-u) * 400);display:none;opacity:0;transition:opacity .2s ease;pointer-events:none;-webkit-user-drag:none;user-select:none;object-fit:contain}",
      ".dshwv-root.dshwv-left .dshwv-gif{transform:translate(-50%,-50%) scaleX(-1)}",
      ".dshwv-pop.dshwv-pop-open .dshwv-gif{opacity:1}",
      ".dshwv-pop.dshwv-pop-open .dshwv-b2{transition-delay:0s}",
      ".dshwv-pop.dshwv-pop-open .dshwv-b1{transition-delay:.13s}",
      ".dshwv-pop.dshwv-pop-open .dshwv-bshape{transition-delay:.26s}",
      ".dshwv-pop .dshwv-bshape{transition-delay:.1s}",
      ".dshwv-pop .dshwv-b1{transition-delay:.2s}",
      ".dshwv-pop .dshwv-b2{transition-delay:.3s}",
      ".dshwv-text{position:absolute;left:var(--dshw-vx,44.25%);top:var(--dshw-vy,36%);width:66%;height:64%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#536ba9;line-height:1.15;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .16s ease,transform .3s ease}",
      ".dshwv-pop.dshwv-pop-open .dshwv-text{opacity:1;transition:opacity .16s ease .36s,transform .3s ease}",
      ".dshwv-root.dshwv-left .dshwv-text{transform:translate(-50%,-50%) scaleX(-1)}",
      // 大号字体垂直居中修正：flex 容器以 --dshw-vx/--dshw-vy 为整体中心，
      // 内容(任意行数/字号)由 justify-content:center 整体居中，不随字体度量漂移。
      ".dshwv-text .dshwv-trow{flex:0 0 auto;margin:calc(var(--dshw-u) * 2) 0}",
      ".dshwv-text .dshwv-mimg{flex:0 0 auto}",
      // label/amount/hint 三行也作为整体在 flex 容器内居中
      ".dshwv-text .dshwv-label,.dshwv-text .dshwv-amount,.dshwv-text .dshwv-hint{flex:0 0 auto;margin-left:auto;margin-right:auto}",
      ".dshwv-label{font-size:calc(var(--dshw-u) * 66);font-weight:600;letter-spacing:.06em}",
      ".dshwv-amount{font-size:calc(var(--dshw-u) * 128);font-weight:800;line-height:1.05}",
      ".dshwv-period{font-size:calc(var(--dshw-u) * 104);font-weight:800;line-height:1.05}",
      ".dshwv-wrap{white-space:normal;max-width:calc(var(--dshw-u) * 560);line-height:1.2}",
      ".dshwv-hint{font-size:calc(var(--dshw-u) * 56);color:#9fb0d9;letter-spacing:.02em;margin-top:calc(var(--dshw-u) * 9);min-height:calc(var(--dshw-u) * 64);line-height:1.15}",
      ".dshwv-menu-btn{position:absolute;top:calc(40.55% + 4px);right:4px;width:26px;height:26px;border:none;border-radius:6px;background:rgba(32,49,112,.85);cursor:pointer;pointer-events:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:0;z-index:2;opacity:0;transition:opacity .15s ease}",
      ".dshwv-menu-btn.dshwv-menu-btn-visible{opacity:1}",
      ".dshwv-menu-btn span{display:block;width:14px;height:2px;background:#fff;border-radius:1px}",
      ".dshwv-menu-btn:hover{background:#203170}",
      ".dshwv-menu-btn-hidden{visibility:hidden;pointer-events:none}",
      ".dshwv-menu{position:fixed;min-width:196px;max-width:min(340px,calc(100vw - 24px));box-sizing:border-box;background:rgba(255,255,255,.92);border:1px solid rgba(32,49,112,.35);border-radius:10px;padding:10px 12px;opacity:0;transform:scale(.96) translateY(10px);transform-origin:top right;transition:opacity .22s ease,transform .22s cubic-bezier(.34,1.3,.6,1);pointer-events:none;z-index:10000;box-shadow:0 6px 18px rgba(0,0,0,.18);color-scheme:light}",
      ".dshwv-menu.dshwv-menu-open{opacity:1;transform:scale(1) translateY(0);pointer-events:auto}",
      ".dshwv-menu-row{display:flex;align-items:center;gap:8px;margin:5px 0;color:#203170;font-size:12px;white-space:nowrap}",
      ".dshwv-range{flex:1;min-width:0;accent-color:#203170}",
      ".dshwv-number{width:44px;border:1px solid rgba(32,49,112,.4);border-radius:6px;padding:2px 4px;font-size:12px;color:#203170;background:#fff;box-sizing:border-box}",
      ".dshwv-number:disabled{opacity:.4;background:rgba(32,49,112,.06);cursor:not-allowed}",
      ".dshwv-sound:disabled{opacity:.45;cursor:not-allowed}",
      ".dshwv-sound{flex:1;border:1px solid rgba(32,49,112,.4);border-radius:6px;background:rgba(32,49,112,.08);color:#203170;font-size:12px;padding:3px 0;cursor:pointer}",
      ".dshwv-sound:hover{background:rgba(32,49,112,.16)}",
      ".dshwv-check{width:16px;height:16px;accent-color:#203170;cursor:pointer;flex:0 0 auto}",
      ".dshwv-menu-sep{height:1px;background:rgba(32,49,112,.25);margin:6px 0}",
      ".dshwv-volpct{width:44px;text-align:right;color:#203170;font-size:12px}",
      ".dshwv-rolebtn-wrap{position:relative;flex:1;min-width:0}",
      ".dshwv-rolebtn{flex:1;min-width:0;display:flex;align-items:center;border:1px solid rgba(32,49,112,.4);border-radius:6px;background:rgba(32,49,112,.08);color:#203170;font-size:12px;padding:0 6px;cursor:pointer;overflow:hidden;height:24px}",
      ".dshwv-rolebtn:hover{background:rgba(32,49,112,.16)}",
      ".dshwv-btnlabel{display:block;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:normal}",
      ".dshwv-roleimport{border:1px solid rgba(32,49,112,.4);border-radius:6px;background:#203170;color:#fff;font-size:12px;padding:3px 8px;cursor:pointer;flex:0 0 auto}",
      ".dshwv-roleimport:hover{background:#2f4488}",
      ".dshwv-rolelist{position:fixed;z-index:10001;box-sizing:border-box;background:rgba(255,255,255,.98);border:1px solid rgba(32,49,112,.35);border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.18);padding:4px;max-height:240px;overflow-y:auto;display:none;color-scheme:light}",
      ".dshwv-rolelist.dshwv-rolelist-open{display:block}",
      ".dshwv-roleitem{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;cursor:pointer;color:#203170;font-size:12px;white-space:nowrap;min-width:0}",
      ".dshwv-roleitem:hover{background:rgba(32,49,112,.1)}",
      ".dshwv-roleitem.dshwv-roleitem-cur{background:rgba(32,49,112,.14)}",
      ".dshwv-rolethumb{width:22px;height:22px;border-radius:4px;object-fit:cover;flex:0 0 auto;background:#e8ecf7}",
      ".dshwv-rolename{flex:1;min-width:0;overflow:hidden}",
      ".dshwv-nameinner{display:inline-flex;white-space:nowrap;transition:transform .22s ease}",
      ".dshwv-rolenamewrap{flex:1;min-width:0;display:flex;align-items:center;gap:6px;overflow:hidden}",
      ".dshwv-nameinner .dshwv-namecopy{margin-right:40px;white-space:nowrap;flex:0 0 auto}",
      ".dshwv-roleGifTag{flex:0 0 auto;font-size:10px;line-height:1;padding:2px 4px;border-radius:3px;background:#203170;color:#fff}",
      ".dshwv-rolepin{width:22px;height:22px;border:none;background:none;cursor:pointer;font-size:13px;opacity:.45;padding:0;flex:0 0 auto}",
      ".dshwv-rolepin.on{opacity:1}",
      ".dshwv-roledel{width:22px;height:22px;border:none;background:none;cursor:pointer;font-size:13px;color:#c0392b;padding:0;flex:0 0 auto}",
      ".dshwv-audiobtn{flex:1;min-width:0;display:flex;align-items:center;border:1px solid rgba(32,49,112,.4);border-radius:6px;background:rgba(32,49,112,.08);color:#203170;font-size:12px;padding:0 6px;cursor:pointer;overflow:hidden;height:24px}",
      ".dshwv-audiobtn:hover{background:rgba(32,49,112,.16)}",
      ".dshwv-audioimport{border:1px solid rgba(32,49,112,.4);border-radius:6px;background:#203170;color:#fff;font-size:12px;padding:3px 8px;cursor:pointer;flex:0 0 auto}",
      ".dshwv-audioimport:hover{background:#2f4488}",
      ".dshwv-audiolist{position:fixed;z-index:10001;box-sizing:border-box;background:rgba(255,255,255,.98);border:1px solid rgba(32,49,112,.35);border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.18);padding:4px;max-height:240px;overflow-y:auto;display:none;color-scheme:light}",
      ".dshwv-audiolist.dshwv-audiolist-open{display:block}",
      ".dshwv-audioitem{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;cursor:pointer;color:#203170;font-size:12px;white-space:nowrap;min-width:0}",
      ".dshwv-audioitem:hover{background:rgba(32,49,112,.1)}",
      ".dshwv-audioitem.dshwv-audioitem-cur{background:rgba(32,49,112,.14)}",
      ".dshwv-audioname{flex:1;min-width:0;overflow:hidden}",
      ".dshwv-audiopreset{color:#9fb0d9;font-size:11px;flex:0 0 auto}",
      ".dshwv-audiothumb{width:22px;height:22px;border-radius:4px;flex:0 0 auto;background:#e8ecf7;display:flex;align-items:center;justify-content:center;font-size:13px}",
      ".dshwv-audiopin{width:22px;height:22px;border:none;background:none;cursor:pointer;font-size:13px;opacity:.45;padding:0;flex:0 0 auto}",
      ".dshwv-audiopin.on{opacity:1}",
      ".dshwv-audiodel{width:22px;height:22px;border:none;background:none;cursor:pointer;font-size:13px;color:#c0392b;padding:0;flex:0 0 auto}",
      ".dshwv-audiomask{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:20500;display:flex;align-items:center;justify-content:center;color-scheme:light}",
      ".dshwv-audiowin{background:#fff;border-radius:12px;padding:16px 18px;width:360px;box-shadow:0 10px 30px rgba(0,0,0,.3);text-align:center}",
      ".dshwv-audiotitle{font-size:14px;font-weight:600;color:#203170;margin-bottom:12px}",
      ".dshwv-audionameinput{width:50%;box-sizing:border-box;border:1px solid rgba(32,49,112,.4);border-radius:6px;padding:6px 8px;font-size:13px;color:#203170;text-align:center;margin:0 auto 14px;display:block}",
      ".dshwv-audiorow{display:flex;align-items:center;gap:8px;margin:0 0 10px;color:#203170;font-size:12px;white-space:nowrap}",
      ".dshwv-audioslotlabel{flex:0 0 auto;width:32px;text-align:left}",
      ".dshwv-audioselect{flex:1;min-width:0;border:1px solid rgba(32,49,112,.4);border-radius:6px;background:#fff;color:#203170;font-size:12px;padding:3px 4px}",
      ".dshwv-audiosmallimport{border:1px solid rgba(32,49,112,.4);border-radius:6px;background:rgba(32,49,112,.08);color:#203170;font-size:12px;padding:3px 10px;cursor:pointer;flex:0 0 auto}",
      ".dshwv-audiosmallimport:hover{background:rgba(32,49,112,.16)}",
      ".dshwv-slotwrap{position:relative;flex:1;min-width:0}",
      ".dshwv-slotbtn{width:100%;border:1px solid rgba(32,49,112,.4);border-radius:6px;background:#fff;color:#203170;font-size:12px;padding:5px 6px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dshwv-slotbtn:hover{background:rgba(32,49,112,.08)}",
      ".dshwv-slotlist{position:fixed;z-index:20600;box-sizing:border-box;background:rgba(255,255,255,.98);border:1px solid rgba(32,49,112,.35);border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.18);padding:4px;max-height:200px;overflow-y:auto;display:none;color-scheme:light}",
      ".dshwv-audiocropcanvas{width:300px;height:120px;display:block;margin:0 auto 10px;background:#f3f5fb;border:1px solid rgba(32,49,112,.2);border-radius:8px;cursor:crosshair;touch-action:none}",
      ".dshwv-audiotime{color:#203170;font-size:12px;margin:6px 0 10px}",
      ".dshwv-audiosliderrow{display:flex;align-items:center;gap:8px;margin:2px 0}",
      ".dshwv-audiosliderrow input[type=range]{flex:1;accent-color:#203170}",
      ".dshwv-audiosliderrow input[type=number]{width:64px;flex:0 0 auto;border:1px solid rgba(32,49,112,.4);border-radius:6px;padding:2px 4px;font-size:12px;color:#203170;background:#fff;box-sizing:border-box;text-align:right}",
      ".dshwv-audiosliderrow input[type=number]:disabled{opacity:.4}",
      ".dshwv-zoomlabel{flex:0 0 auto;width:56px;color:#203170;font-size:12px;text-align:left}",
      ".dshwv-dualrange{position:relative;flex:1;height:22px;min-width:0;cursor:pointer;touch-action:none}",
      ".dshwv-dualrange-track{position:absolute;left:4px;right:4px;top:50%;height:4px;transform:translateY(-50%);background:rgba(32,49,112,.15);border-radius:2px}",
      ".dshwv-dualrange-fill{position:absolute;top:50%;height:4px;transform:translateY(-50%);background:rgba(32,49,112,.45);border-radius:2px}",
      ".dshwv-dualrange-thumb{position:absolute;top:50%;width:14px;height:14px;margin-left:-7px;margin-top:-7px;border-radius:50%;background:#203170;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3);box-sizing:border-box}",
      ".dshwv-cropmask{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:20000;display:flex;align-items:center;justify-content:center;color-scheme:light}",
      ".dshwv-cropwin{background:#fff;border-radius:12px;padding:16px 18px;width:320px;box-shadow:0 10px 30px rgba(0,0,0,.3);text-align:center}",
      ".dshwv-croptitle{font-size:14px;font-weight:600;color:#203170;margin-bottom:12px}",
      ".dshwv-cropbox{position:relative;width:260px;height:260px;margin:0 auto 12px;border:1px dashed #203170;border-radius:8px;overflow:hidden;background:#f3f5fb;cursor:grab;touch-action:none}",
      ".dshwv-cropbox canvas{display:block}",
      ".dshwv-cropzoom{width:100%;accent-color:#203170}",
      ".dshwv-cropname{width:170px;box-sizing:border-box;border:1px solid rgba(32,49,112,.4);border-radius:6px;padding:5px 8px;font-size:13px;color:#203170;text-align:center;margin:0 auto 12px;display:block}",
      ".dshwv-cropctrl{display:flex;align-items:center;gap:8px;margin:0 0 10px}",
      ".dshwv-croplabel{flex:0 0 auto;width:28px;color:#203170;font-size:12px;text-align:left}",
      ".dshwv-cropnum{width:52px;flex:0 0 auto;border:1px solid rgba(32,49,112,.4);border-radius:6px;padding:2px 4px;font-size:12px;color:#203170;background:#fff;box-sizing:border-box;text-align:right}",
      ".dshwv-cropflip{width:26px;height:26px;flex:0 0 auto;border:1px solid rgba(32,49,112,.4);border-radius:6px;background:rgba(32,49,112,.08);color:#203170;font-size:14px;cursor:pointer;padding:0;line-height:1}",
      ".dshwv-cropflip:hover{background:rgba(32,49,112,.16)}",
      ".dshwv-cropflip-on{background:#203170;color:#fff}",
      ".dshwv-cropbtns{display:flex;gap:10px;justify-content:center}",
      ".dshwv-cropbtn{border:none;border-radius:6px;padding:6px 18px;font-size:13px;cursor:pointer}",
      ".dshwv-cropbtn-ok{background:#203170;color:#fff}",
      ".dshwv-cropbtn-ok:hover{background:#2f4488}",
      ".dshwv-cropbtn-no{background:rgba(32,49,112,.1);color:#203170}",
      ".dshwv-cropbtn-no:hover{background:rgba(32,49,112,.2)}",
      ".dshwv-gifmask{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:20000;display:flex;align-items:center;justify-content:center;color-scheme:light}",
      ".dshwv-gifwin{background:#fff;border-radius:12px;padding:16px 18px;width:340px;box-shadow:0 10px 30px rgba(0,0,0,.3);text-align:center}",
      ".dshwv-giftitle{font-size:14px;font-weight:600;color:#203170;margin-bottom:12px}",
      ".dshwv-gifpreview{position:relative;width:280px;height:280px;margin:0 auto 10px;border:1px dashed #203170;border-radius:8px;overflow:hidden;background:#f3f5fb;display:flex;align-items:center;justify-content:center}",
      ".dshwv-gifpreviewimg{max-width:100%;max-height:100%;object-fit:contain;display:block}",
      ".dshwv-gifhint{color:#9fb0d9;font-size:12px;margin-bottom:12px}",
      ".dshwv-gifname{width:170px;box-sizing:border-box;border:1px solid rgba(32,49,112,.4);border-radius:6px;padding:5px 8px;font-size:13px;color:#203170;text-align:center;margin:0 auto 12px;display:block}",
      ".dshwv-confirmmask{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:21000;display:flex;align-items:center;justify-content:center;color-scheme:light}",
      ".dshwv-confirmwin{background:#fff;border-radius:12px;padding:16px 18px;width:280px;box-shadow:0 10px 30px rgba(0,0,0,.3);text-align:center}",
      ".dshwv-confirmtext{font-size:13px;color:#203170;margin-bottom:14px;line-height:1.5;word-break:break-all}",
      ".dshwv-confirmbtns{display:flex;gap:10px;justify-content:center}",
      ".dshwv-snapmask{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:22000;display:flex;align-items:center;justify-content:center;color-scheme:light}",
      ".dshwv-snapwin{background:#fff;border-radius:12px;padding:14px 16px;width:400px;box-shadow:0 10px 30px rgba(0,0,0,.3);text-align:center;color:#203170;box-sizing:border-box}",
      ".dshwv-snaptitle{font-size:14px;font-weight:600;color:#203170;margin-bottom:10px}",
      ".dshwv-snapmodes{display:flex;align-items:center;justify-content:center;gap:18px;margin:0 0 12px;font-size:13px;flex-wrap:wrap}",
      ".dshwv-snapmodes label{display:inline-flex;align-items:center;gap:4px;cursor:pointer;color:#203170}",
      ".dshwv-snapmodes input{accent-color:#203170;cursor:pointer}",
      ".dshwv-snapgrid{display:grid;grid-template-columns:72px 190px 72px;grid-template-rows:26px 190px 26px;gap:4px;margin:0 auto 8px;place-items:center;width:max-content;justify-content:center}",
      ".dshwv-snapcell{display:flex;align-items:center;justify-content:center;gap:3px;min-width:0}",
      ".dshwv-snappreview{position:relative;width:190px;height:190px;border:1px solid rgba(32,49,112,.5);border-radius:8px;background:#f6f8fd;overflow:hidden;touch-action:none}",
      ".dshwv-snapflip{position:absolute;top:0;bottom:0;left:0;background:rgba(32,49,112,.07);pointer-events:none}",
      ".dshwv-snapzone{position:absolute;pointer-events:none}",
      ".dshwv-snapline{position:absolute;background:#203170;pointer-events:none}",
      ".dshwv-snapline-flip{background:#c0392b}",
      ".dshwv-snaphandle{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#203170;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35);cursor:ew-resize;pointer-events:auto;z-index:3;box-sizing:border-box}",
      ".dshwv-snaphandle-flip{background:#c0392b}",
      ".dshwv-snaphandle-h{cursor:ns-resize}",
      ".dshwv-snapnum{width:58px;box-sizing:border-box;border:1px solid rgba(32,49,112,.4);border-radius:6px;padding:2px 4px;font-size:12px;color:#203170;background:#fff;text-align:right}",
      ".dshwv-snapnum:disabled{opacity:.45}",
      ".dshwv-snapunit{font-size:11px;color:#9fb0d9;flex:0 0 auto}",
      ".dshwv-snapfliprow{display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px;margin:0 0 12px;color:#203170}",
      ".dshwv-snapbtns{display:flex;gap:10px;justify-content:center}",
      ".dshwv-snapbtn{border:none;border-radius:6px;padding:6px 18px;font-size:13px;cursor:pointer}",
      // v652 图片/随机图片编辑窗里的「上传图片」行:水平居中 + 上下留白(原来直接贴在容器上,既没居中也没边距)
      ".dshwv-uproll{display:flex;justify-content:center;margin:10px 0}",
      ".dshwv-snapbtn-ok{background:#203170;color:#fff}",
      ".dshwv-snapbtn-ok:hover{background:#2f4488}",
      ".dshwv-snapbtn-no{background:rgba(32,49,112,.1);color:#203170}",
      ".dshwv-snapbtn-no:hover{background:rgba(32,49,112,.2)}",
      ".dshwv-snapoff{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(246,248,253,.88);color:#9fb0d9;font-size:13px;z-index:5;pointer-events:auto}",
      ".dshwv-bubmask{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:20500;display:flex;align-items:center;justify-content:center;color-scheme:light}",
      ".dshwv-bubcard{background:#fff;border-radius:12px;padding:14px 16px;width:440px;box-shadow:0 10px 30px rgba(0,0,0,.3);text-align:center;color:#203170;box-sizing:border-box;max-height:88vh;overflow-y:auto;overflow-x:hidden}",
      ".dshwv-bubtitle{font-size:14px;font-weight:600;color:#203170;margin-bottom:8px}",
      ".dshwv-bubsec{font-size:12px;color:#9fb0d9;margin:10px 0 6px;text-align:left;border-top:1px solid rgba(32,49,112,.12);padding-top:8px}",
      ".dshwv-bubsec-first{border-top:none;margin-top:2px;padding-top:0}",
      ".dshwv-bubrow{display:flex;align-items:center;gap:6px;margin:4px 0;padding:4px;border:1px solid rgba(32,49,112,.16);border-radius:8px;background:#f8fafd}",
      // v635 触摸端自研拖拽:被拖的行浮起(桌面原生拖拽不走这个类)
      ".dshwv-bubrow.dshwv-row-dragging{position:relative;z-index:3;opacity:.92;box-shadow:0 8px 18px rgba(15,23,42,.28);transition:none}",
      // v639 W2「编辑第n次点击内容」触摸端自研拖拽:被拖的模块块/行手柄/调色板 chip 浮起
      ".dshwv-pv-dragging{position:relative;z-index:4;opacity:.92;box-shadow:0 6px 14px rgba(15,23,42,.25);transition:none}",
      ".dshwv-bubchip{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;height:44px;border:1px dashed rgba(32,49,112,.35);border-radius:8px;background:#fff;color:#203170;font-size:12px;overflow:hidden;cursor:pointer}",
      ".dshwv-bubkind{width:96px;flex:0 0 auto;border:1px solid rgba(32,49,112,.4);border-radius:6px;background:#fff;color:#203170;font-size:12px;padding:3px 2px;cursor:pointer}",
      // 跑马灯方案下拉(自绘):选项多时列表限高 + 滚轮浏览
      ".dshwv-rgbwrap{position:relative;display:inline-block;vertical-align:middle;text-align:left}",
      ".dshwv-rgbhead{width:96px;box-sizing:border-box;border:1px solid rgba(32,49,112,.4);border-radius:6px;background:#fff;color:#203170;font-size:12px;padding:3px 8px;cursor:pointer;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;justify-content:space-between;gap:4px}",
      '.dshwv-rgbhead::after{content:"▾";font-size:9px;opacity:.7;flex:0 0 auto}',
      ".dshwv-rgbmenu{position:absolute;left:0;top:calc(100% + 2px);z-index:60;min-width:100%;max-width:160px;max-height:172px;overflow-y:auto;overflow-x:hidden;background:#fff;border:1px solid rgba(32,49,112,.3);border-radius:8px;box-shadow:0 6px 16px rgba(0,0,0,.18);padding:4px 0;display:none;text-align:left}",
      ".dshwv-rgbmenu.dshwv-rgbopen{display:block}",
      ".dshwv-rgbopt{padding:4px 10px;font-size:12px;color:#203170;cursor:pointer;white-space:nowrap}",
      ".dshwv-rgbopt:hover{background:rgba(32,49,112,.1)}",
      ".dshwv-rgbopt.dshwv-rgbcur{background:rgba(32,49,112,.16);font-weight:600}",
      // “+” 新建模块圆形按钮
      // 调色板“添加模块”:参照「+ 添加语句」样式(虚线边框/透明底/圆角/配色),但更紧凑
      ".dshwv-paladd{flex:0 0 auto;border:1px dashed rgba(32,49,112,.5);border-radius:8px;background:transparent;color:#203170;font-size:13px;line-height:1.4;padding:3px 9px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;user-select:none}",
      ".dshwv-paladd:hover{background:rgba(32,49,112,.08)}",
      // 模块库条目:悬浮时右上角小 x(删除)
      ".dshwv-libchip{position:relative;display:inline-flex;align-items:center;flex:0 0 auto;padding:0;margin:0;cursor:default;user-select:none}",
      ".dshwv-libchip .dshwv-palchip:hover{background:rgba(32,49,112,.18)}",
      ".dshwv-libdel{position:absolute;top:-7px;right:-7px;width:16px;height:16px;border-radius:50%;background:#c0392b;color:#fff;font-size:10px;line-height:1;display:none;align-items:center;justify-content:center;cursor:pointer;border:none;padding:0 0 1px;z-index:2}",
      ".dshwv-libchip:hover .dshwv-libdel{display:flex}",
      ".dshwv-libdel:hover{background:#a93226}",
      // 自定义字体输入
      ".dshwv-fontinp{width:150px;box-sizing:border-box;border:1px solid rgba(32,49,112,.4);border-radius:6px;padding:3px 6px;font-size:12px;color:#203170;background:#fff}",
      // 字体下拉:占满行宽,列表限高约 5.5 个可选项,可滚动
      ".dshwv-fontwrap{flex:1;min-width:0}",
      ".dshwv-fontwrap .dshwv-rgbhead{width:100%;box-sizing:border-box}",
      ".dshwv-rgbmenu.dshwv-fontmenu{width:220px;max-width:240px;max-height:134px}",
      // 颜色下拉(纯色/跑马灯):占满可用宽、列表限高滚动
      ".dshwv-qcolwrap{flex:0 1 auto;min-width:0;width:200px;max-width:200px}",
      ".dshwv-qcolwrap .dshwv-rgbhead{width:100%;box-sizing:border-box}",
      ".dshwv-rgbmenu.dshwv-qcolmenu{width:190px;max-width:210px;max-height:152px}",
      // 跑马灯选项:文字用实际渐变色渲染,并带与泡泡同款流动动画;当前项用 ✓ 前缀标记(避免背景高亮盖掉渐变)
      ".dshwv-qcolmenu .dshwv-rgbopt.optgrad{background-clip:text;-webkit-background-clip:text;color:transparent;-webkit-text-fill-color:transparent;text-shadow:none;background-size:200% auto;animation:dshwvRainbow 2.6s linear infinite;transition:transform .15s ease}",
      // 渐变选项的悬浮反馈:轻微放大+下划线(不增亮、不铺灰底,避免影响渐变可读性)
      ".dshwv-qcolmenu .dshwv-rgbopt.optgrad:hover{transform:scale(1.06);transform-origin:right center;text-decoration:underline}",
      // 快速编辑悬浮窗(文本/随机句)
      ".dshwv-qedit{position:fixed;z-index:26000;background:#fff;border:1px solid rgba(32,49,112,.35);border-radius:10px;box-shadow:0 8px 22px rgba(15,23,42,.22);padding:10px 12px;color-scheme:light}",
      ".dshwv-qedit-row{display:flex;align-items:center;gap:6px;margin:3px 0;flex-wrap:wrap;min-width:0}",
      ".dshwv-qedit-row label{font-size:12px;color:#203170;flex:0 0 auto}",
      ".dshwv-qedit-content{flex:1;min-width:120px;box-sizing:border-box;border:1px solid rgba(32,49,112,.4);border-radius:6px;padding:4px 6px;font-size:12px;color:#203170;background:#fff}",
      ".dshwv-qselect{box-sizing:border-box;border:1px solid rgba(32,49,112,.4);border-radius:6px;background:#fff;color:#203170;font-size:12px;padding:3px 4px;flex:0 1 auto;min-width:0}",
      ".dshwv-qcolorhost{display:inline-flex;align-items:center;gap:5px;flex:0 0 auto}",
      ".dshwv-qcolorhost input[type=color]{width:26px;height:20px;padding:0;border:1px solid rgba(32,49,112,.4);border-radius:4px;background:#fff}",
      ".dshwv-qcolorhost .dshwv-bubmini{width:auto;height:20px;font-size:11px;opacity:.85;padding:0 6px}",
      // 用量记录子面板 / 更多消费记录窗口
      ".dshwv-usagepanel{position:fixed;z-index:26020;background:#fff;border:1px solid rgba(32,49,112,.35);border-radius:10px;box-shadow:0 8px 22px rgba(15,23,42,.22);padding:10px 12px;color-scheme:light;max-height:70vh;overflow-y:auto}",
      // 用量作为主菜单内的子界面
      ".dshwv-menuview{display:block}",
      ".dshwv-usage-sub{display:none;max-height:min(70vh,560px);overflow-y:auto;padding-right:2px;width:100%;box-sizing:border-box}",
      ".dshwv-usage-back{border:none;background:none;color:#203170;font-size:12px;font-weight:600;cursor:pointer;padding:0 0 2px;text-align:left;width:100%}",
      ".dshwv-usage-back:hover{color:#2f4488;text-decoration:underline}",
      ".dshwv-usagebody{display:flex;flex-direction:column;gap:2px;color:#203170;font-size:12px;min-width:0;overflow-x:hidden}",
      // 主菜单 ↔ 用量记录切换过渡(返回主菜单:直接下滑复位,不加淡入)
      "@keyframes dshwvViewIn{from{transform:translateY(-8px)}to{transform:translateY(0)}}",
      ".dshwv-view-in{animation:dshwvViewIn .1s ease}",
      ".dshwv-usage-sec{display:flex;justify-content:space-between;align-items:center;margin:2px 0 2px;font-weight:600;border-bottom:1px solid rgba(32,49,112,.15);padding-bottom:3px;white-space:nowrap}",
      ".dshwv-usage-total{color:#e0433f;font-weight:700}",
      ".dshwv-usage-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:2px 0;min-width:0}",
      // 用量列表容器（今日模型消费 / 近7天使用记录）：不限制高度，随内容自然增长
      ".dshwv-usage-scroll{overflow-y:auto;overflow-x:hidden;padding-right:2px;margin:2px 0 2px;border:1px solid rgba(32,49,112,.12);border-radius:6px}",
      // 消费记录(全部)新组件:概览头/可折叠分区/天折叠明细
      ".dshwv-usage-oview{text-align:center;padding:4px 0 6px;border-bottom:1px solid rgba(32,49,112,.12);margin-bottom:6px}",
      ".dshwv-usage-oview-num{font-size:22px;font-weight:800;color:#203170;margin:2px 0}",
      ".dshwv-usage-collapse{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;background:none;border:none;border-bottom:1px solid rgba(32,49,112,.15);padding:6px 0 3px;margin:6px 0 2px;color:#203170;font-size:12px;font-weight:600;cursor:pointer;text-align:left}",
      ".dshwv-usage-collapse:hover{color:#2f4488}",
      ".dshwv-usage-chev{flex:0 0 auto;color:#9fb0d9;font-size:10px}",
      ".dshwv-usage-collapse-body{min-width:0;overflow-x:hidden}",
      ".dshwv-usage-ratio{min-width:0}",
      ".dshwv-usage-daydetail{margin:2px 0 6px 12px;padding:0 2px 2px 10px;border-left:2px solid rgba(32,49,112,.16);min-width:0}",
      // 用量小容器滚动条:细而淡,不再用浏览器默认的突兀滚动条
      ".dshwv-usage-scroll{scrollbar-width:thin;scrollbar-color:rgba(32,49,112,.16) transparent}",
      ".dshwv-usage-scroll::-webkit-scrollbar{width:6px}",
      ".dshwv-usage-scroll::-webkit-scrollbar-track{background:transparent}",
      ".dshwv-usage-scroll::-webkit-scrollbar-thumb{background:rgba(32,49,112,.14);border-radius:3px}",
      ".dshwv-usage-scroll::-webkit-scrollbar-thumb:hover{background:rgba(32,49,112,.26)}",
      ".dshwv-usage-model{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      // 列宽受限 + 悬浮滚动（配合 mkScrollCell）：外层裁切，内层整体平移
      ".dshwv-marq{overflow:hidden;min-width:0;white-space:nowrap}",
      ".dshwv-marq>span{display:inline-block;white-space:nowrap;will-change:transform}",
      ".dshwv-usage-hint{color:#9fb0d9;font-size:11px;padding:2px 0;line-height:1.4}",
      ".dshwv-usage-subtitle{text-align:center;font-size:13px;font-weight:700;color:#203170;margin:0 0 6px}",
      // 预警与预算设置区
      ".dshwv-usageset{border:1px dashed rgba(32,49,112,.28);border-radius:8px;padding:0 6px 6px;margin:0 0 6px}",
      ".dshwv-usagemsg{flex:1;min-width:80px;box-sizing:border-box;border:1px solid rgba(32,49,112,.4);border-radius:6px;padding:2px 5px;font-size:11px;color:#203170;background:#fff}",
      ".dshwv-usagemsg:disabled{opacity:.45}",
      ".dshwv-usage-yuan{color:#203170;font-size:12px;flex:0 0 auto}",
      ".dshwv-msgtext{width:100%;box-sizing:border-box;border:1px solid rgba(32,49,112,.4);border-radius:6px;padding:5px 7px;font-size:12px;color:#203170;background:#fff;resize:vertical;min-height:60px}",
      ".dshwv-usage-more{display:block;width:100%;margin-top:4px;border:1px dashed rgba(32,49,112,.5);border-radius:8px;background:transparent;color:#203170;font-size:12px;padding:5px;cursor:pointer}",
      ".dshwv-usage-more:hover{background:rgba(32,49,112,.08)}",
      ".dshwv-usage-mask{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:22000;display:flex;align-items:center;justify-content:center;color-scheme:light}",
      ".dshwv-resmask{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:20300;display:flex;align-items:center;justify-content:center;color-scheme:light}",
      ".dshwv-usage-card{position:relative;background:#fff;border-radius:12px;width:min(560px,92vw);max-height:82vh;display:flex;flex-direction:column;box-shadow:0 10px 30px rgba(0,0,0,.3)}",
      ".dshwv-usage-wintitle{font-size:14px;font-weight:600;color:#203170;padding:12px 16px 8px;border-bottom:1px solid rgba(32,49,112,.15)}",
      ".dshwv-usage-close{position:absolute;top:8px;right:10px;width:24px;height:24px;border:none;background:none;font-size:18px;cursor:pointer;color:#203170;opacity:.6;border-radius:6px}",
      ".dshwv-usage-close:hover{background:rgba(32,49,112,.1);opacity:1}",
      ".dshwv-usage-windowbody{overflow-y:auto;padding:4px 16px 14px;flex:1;color:#203170;font-size:12px}",
      // 用量图表:近30天柱状 + 模型占比条
      ".dshwv-usage-chartwrap{position:relative;margin:4px 0 10px}",
      ".dshwv-usage-chartwrap canvas{display:block;width:100%;height:150px;background:#fafbfe;border:1px solid rgba(32,49,112,.15);border-radius:8px;box-sizing:border-box}",
      ".dshwv-usage-tip{position:absolute;pointer-events:none;background:rgba(15,23,42,.88);color:#fff;font-size:11px;padding:3px 7px;border-radius:5px;white-space:nowrap;z-index:5}",
      ".dshwv-usage-ratio{display:flex;align-items:center;gap:8px;margin:3px 0}",
      ".dshwv-usage-ratio-label{flex:0 0 96px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#203170}",
      ".dshwv-usage-ratio-track{flex:1;min-width:0;height:10px;border-radius:5px;background:rgba(32,49,112,.12);min-width:0}",
      ".dshwv-usage-ratio-fill{height:100%;border-radius:5px;min-width:0;max-width:100%}",
      ".dshwv-usage-ratio-pct{flex:0 0 42px;text-align:right;color:#203170;font-size:11px;white-space:nowrap}",
      ".dshwv-usage-ratio-cost{flex:0 0 auto;color:#203170;font-size:11px;white-space:nowrap}",
      ".dshwv-fontinp:focus{outline:none;border-color:#203170}",
      ".dshwv-bubmini{width:22px;height:22px;flex:0 0 auto;border:none;background:none;cursor:pointer;font-size:14px;color:#203170;opacity:.6;padding:0;border-radius:4px}",
      ".dshwv-bubmini:hover{background:rgba(32,49,112,.12);opacity:1}",
      ".dshwv-bubmini-on{opacity:1}",
      ".dshwv-bubadd{width:100%;border:1px dashed rgba(32,49,112,.4);border-radius:8px;background:none;color:#203170;font-size:13px;padding:8px;cursor:pointer;margin:6px 0}",
      ".dshwv-bubadd:hover{background:rgba(32,49,112,.08)}",
      ".dshwv-bubbtns{display:flex;gap:10px;justify-content:center;margin-top:10px}",
      ".dshwv-bubbtn{border:none;border-radius:6px;padding:6px 18px;font-size:13px;cursor:pointer}",
      ".dshwv-bubbtn-ok{background:#203170;color:#fff}",
      ".dshwv-bubbtn-ok:hover{background:#2f4488}",
      ".dshwv-bubbtn-no{background:rgba(32,49,112,.1);color:#203170}",
      ".dshwv-bubbtn-no:hover{background:rgba(32,49,112,.2)}",
      ".dshwv-bubhint{font-size:11px;color:#9fb0d9;text-align:left;margin-top:6px}",
      // —— 自定义泡泡 · 主编辑窗口样式 ——
      ".dshwv-choicerow{display:flex;align-items:center;gap:12px;flex:1;min-width:0;padding:2px 0}",
      // 并列侧:编辑大按钮占满整组;权重框为无框窄条,图层悬浮于按钮右上角并与按钮右缘对齐
      ".dshwv-choicegrp{position:relative;flex:1 1 0;min-width:150px}",
      // 编辑大按钮:文本在扣除右侧权重框占位后的宽度中居中,并再右移约一字宽(带父级限定,覆盖 bubchip-btn 默认 padding)
      ".dshwv-choicegrp .dshwv-choicechip{width:100%;height:36px;padding:0 34px 0 20px}",
      ".dshwv-choicegrp .dshwv-winput{position:absolute;top:4px;right:4px;bottom:4px;width:26px;border:1px solid rgba(32,49,112,.45);background:#fff;border-radius:5px;padding:0 2px;font-size:11px;color:#203170;text-align:center;box-sizing:border-box}",
      ".dshwv-winput{width:46px;border:1px solid rgba(32,49,112,.4);border-radius:6px;padding:2px 4px;font-size:12px;color:#203170;background:#fff;box-sizing:border-box;text-align:center;flex:0 0 auto}",
      // 拆开钮:无边框大号 ⊕,十字由两根 CSS 条绘制(旋转精确绕十字中心,不受字体影响);悬停仅旋转不变色
      ".dshwv-splitbtn{width:26px;height:26px;min-width:26px;border:none;background:transparent;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;flex:0 0 auto;opacity:.85}",
      ".dshwv-splitbtn span{position:relative;display:block;width:16px;height:16px;transform:rotate(0deg);transition:transform .18s ease}",
      ".dshwv-splitbtn span::before,.dshwv-splitbtn span::after{content:'';position:absolute;background:#203170;border-radius:1.5px}",
      ".dshwv-splitbtn span::before{left:0;top:50%;width:100%;height:2.5px;margin-top:-1.25px}",
      ".dshwv-splitbtn span::after{top:0;left:50%;width:2.5px;height:100%;margin-left:-1.25px}",
      ".dshwv-splitbtn:hover span{transform:rotate(45deg)}",
      ".dshwv-bubchip-cur{outline:2px solid rgba(32,49,112,.55)}",
      ".dshwv-sidebar{display:flex;align-items:center;gap:8px;margin:0 0 10px;flex-wrap:wrap}",
      ".dshwv-trow{display:block;text-align:center;line-height:1.2;white-space:nowrap;margin:calc(var(--dshw-u) * 5) auto;text-shadow:0 1px 2px rgba(255,255,255,.6)}",
      "@keyframes dshwvRainbow{0%{background-position:0% 0}100%{background-position:200% 0}}",
      ".dshwv-trow.dshwv-rgb,.dshwv-qcolmenu .dshwv-rgbopt.opt-macaron{background-image:linear-gradient(90deg,rgb(255,180,200),rgb(255,205,170),rgb(255,225,165),rgb(245,240,180),rgb(190,240,210),rgb(180,230,245),rgb(190,215,250),rgb(220,200,245),rgb(240,200,230),rgb(255,180,200));background-size:200% auto;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;animation:dshwvRainbow 2.6s linear infinite;text-shadow:none}",
      ".dshwv-trow.dshwv-rgb-candy,.dshwv-qcolmenu .dshwv-rgbopt.opt-candy{background-image:linear-gradient(90deg,rgb(255,145,170),rgb(255,170,130),rgb(255,195,110),rgb(240,220,115),rgb(140,220,175),rgb(115,210,205),rgb(130,195,240),rgb(160,170,235),rgb(210,155,230),rgb(235,135,190),rgb(255,145,170))}",
      ".dshwv-trow.dshwv-rgb-rouge,.dshwv-qcolmenu .dshwv-rgbopt.opt-rouge{background-image:linear-gradient(90deg,rgb(140,25,45),rgb(175,35,60),rgb(120,20,55),rgb(160,40,75),rgb(190,55,80),rgb(130,30,65),rgb(140,25,45))}",
      ".dshwv-trow.dshwv-rgb-bamboo,.dshwv-qcolmenu .dshwv-rgbopt.opt-bamboo{background-image:linear-gradient(90deg,rgb(70,180,85),rgb(95,200,105),rgb(55,165,70),rgb(110,215,120),rgb(80,190,95),rgb(60,172,78),rgb(70,180,85))}",
      ".dshwv-trow.dshwv-rgb-aurora,.dshwv-qcolmenu .dshwv-rgbopt.opt-aurora{background-image:linear-gradient(90deg,rgb(70,240,200),rgb(90,200,255),rgb(120,140,255),rgb(180,120,255),rgb(240,140,255),rgb(70,240,200))}",
      ".dshwv-trow.dshwv-rgb-deepsea,.dshwv-qcolmenu .dshwv-rgbopt.opt-deepsea{background-image:linear-gradient(90deg,rgb(20,90,180),rgb(30,140,210),rgb(40,180,220),rgb(20,120,190),rgb(50,160,230),rgb(25,100,200),rgb(20,90,180))}",
      ".dshwv-trow.dshwv-rgb-sunset,.dshwv-qcolmenu .dshwv-rgbopt.opt-sunset{background-image:linear-gradient(90deg,rgb(255,180,80),rgb(255,130,90),rgb(255,90,110),rgb(220,90,150),rgb(160,90,190),rgb(255,180,80))}",
      ".dshwv-trow.dshwv-rgb-forest,.dshwv-qcolmenu .dshwv-rgbopt.opt-forest{background-image:linear-gradient(90deg,rgb(30,100,60),rgb(60,140,80),rgb(90,180,90),rgb(140,200,80),rgb(180,210,90),rgb(30,100,60))}",
      ".dshwv-trow.dshwv-rgb-champagne,.dshwv-qcolmenu .dshwv-rgbopt.opt-champagne{background-image:linear-gradient(90deg,rgb(220,180,100),rgb(240,205,130),rgb(255,225,160),rgb(230,190,110),rgb(245,210,140),rgb(220,180,100))}",
      ".dshwv-trow.dshwv-rgb-lavender,.dshwv-qcolmenu .dshwv-rgbopt.opt-lavender{background-image:linear-gradient(90deg,rgb(180,150,255),rgb(200,170,255),rgb(230,180,240),rgb(255,190,220),rgb(240,160,200),rgb(180,150,255))}",
      ".dshwv-trow.dshwv-rgb-mint,.dshwv-qcolmenu .dshwv-rgbopt.opt-mint{background-image:linear-gradient(90deg,rgb(120,230,180),rgb(150,240,200),rgb(170,240,230),rgb(140,220,240),rgb(120,200,220),rgb(120,230,180))}",
      ".dshwv-trow.dshwv-rgb-lava,.dshwv-qcolmenu .dshwv-rgbopt.opt-lava{background-image:linear-gradient(90deg,rgb(255,60,40),rgb(255,110,30),rgb(255,170,40),rgb(255,210,70),rgb(255,140,50),rgb(255,60,40))}",
      ".dshwv-trow.dshwv-rgb-galaxy,.dshwv-qcolmenu .dshwv-rgbopt.opt-galaxy{background-image:linear-gradient(90deg,rgb(40,30,90),rgb(70,50,130),rgb(110,70,170),rgb(160,90,190),rgb(220,120,180),rgb(40,30,90))}",
      // 新增跑马灯:墨韵黑白 / 靛蓝夜曲(文字·内层文字·菜单)
      ".dshwv-trow.dshwv-rgb-ink,.dshwv-trowtx.dshwv-rgb-ink,.dshwv-qcolmenu .dshwv-rgbopt.opt-ink{background-image:linear-gradient(90deg,rgb(20,20,20),rgb(80,80,80),rgb(140,140,140),rgb(200,200,200),rgb(250,250,250),rgb(250,250,250),rgb(200,200,200),rgb(140,140,140),rgb(80,80,80),rgb(20,20,20))}",
      ".dshwv-trow.dshwv-rgb-indigo,.dshwv-trowtx.dshwv-rgb-indigo,.dshwv-qcolmenu .dshwv-rgbopt.opt-indigo{background-image:linear-gradient(90deg,rgb(32,49,112),rgb(52,76,146),rgb(74,102,180),rgb(100,126,210),rgb(130,132,224),rgb(130,132,224),rgb(100,126,210),rgb(74,102,180),rgb(52,76,146),rgb(32,49,112))}",
      // 文字底色(圆角矩形底层):跑马灯底色与文字颜色/文字跑马灯不互相占用,底色铺在文字下方
      ".dshwv-trow.dshwv-bgrgb{text-shadow:none;background-size:200% auto;animation:dshwvRainbow 2.6s linear infinite}",
      ".dshwv-trow.dshwv-bgrgb-macaron{background-image:linear-gradient(90deg,rgb(255,180,200),rgb(255,205,170),rgb(255,225,165),rgb(245,240,180),rgb(190,240,210),rgb(180,230,245),rgb(190,215,250),rgb(220,200,245),rgb(240,200,230),rgb(255,180,200))}",
      ".dshwv-trow.dshwv-bgrgb-candy{background-image:linear-gradient(90deg,rgb(255,145,170),rgb(255,170,130),rgb(255,195,110),rgb(240,220,115),rgb(140,220,175),rgb(115,210,205),rgb(130,195,240),rgb(160,170,235),rgb(210,155,230),rgb(235,135,190),rgb(255,145,170))}",
      ".dshwv-trow.dshwv-bgrgb-rouge{background-image:linear-gradient(90deg,rgb(140,25,45),rgb(175,35,60),rgb(120,20,55),rgb(160,40,75),rgb(190,55,80),rgb(130,30,65),rgb(140,25,45))}",
      ".dshwv-trow.dshwv-bgrgb-bamboo{background-image:linear-gradient(90deg,rgb(70,180,85),rgb(95,200,105),rgb(55,165,70),rgb(110,215,120),rgb(80,190,95),rgb(60,172,78),rgb(70,180,85))}",
      ".dshwv-trow.dshwv-bgrgb-aurora{background-image:linear-gradient(90deg,rgb(70,240,200),rgb(90,200,255),rgb(120,140,255),rgb(180,120,255),rgb(240,140,255),rgb(70,240,200))}",
      ".dshwv-trow.dshwv-bgrgb-deepsea{background-image:linear-gradient(90deg,rgb(20,90,180),rgb(30,140,210),rgb(40,180,220),rgb(20,120,190),rgb(50,160,230),rgb(25,100,200),rgb(20,90,180))}",
      ".dshwv-trow.dshwv-bgrgb-sunset{background-image:linear-gradient(90deg,rgb(255,180,80),rgb(255,130,90),rgb(255,90,110),rgb(220,90,150),rgb(160,90,190),rgb(255,180,80))}",
      ".dshwv-trow.dshwv-bgrgb-forest{background-image:linear-gradient(90deg,rgb(30,100,60),rgb(60,140,80),rgb(90,180,90),rgb(140,200,80),rgb(180,210,90),rgb(30,100,60))}",
      ".dshwv-trow.dshwv-bgrgb-champagne{background-image:linear-gradient(90deg,rgb(220,180,100),rgb(240,205,130),rgb(255,225,160),rgb(230,190,110),rgb(245,210,140),rgb(220,180,100))}",
      ".dshwv-trow.dshwv-bgrgb-lavender{background-image:linear-gradient(90deg,rgb(180,150,255),rgb(200,170,255),rgb(230,180,240),rgb(255,190,220),rgb(240,160,200),rgb(180,150,255))}",
      ".dshwv-trow.dshwv-bgrgb-mint{background-image:linear-gradient(90deg,rgb(120,230,180),rgb(150,240,200),rgb(170,240,230),rgb(140,220,240),rgb(120,200,220),rgb(120,230,180))}",
      ".dshwv-trow.dshwv-bgrgb-lava{background-image:linear-gradient(90deg,rgb(255,60,40),rgb(255,110,30),rgb(255,170,40),rgb(255,210,70),rgb(255,140,50),rgb(255,60,40))}",
      ".dshwv-trow.dshwv-bgrgb-galaxy{background-image:linear-gradient(90deg,rgb(40,30,90),rgb(70,50,130),rgb(110,70,170),rgb(160,90,190),rgb(220,120,180),rgb(40,30,90))}",
      // 新增跑马灯底色:墨韵黑白 / 靛蓝夜曲
      ".dshwv-trow.dshwv-bgrgb-ink{background-image:linear-gradient(90deg,rgb(20,20,20),rgb(80,80,80),rgb(140,140,140),rgb(200,200,200),rgb(250,250,250),rgb(250,250,250),rgb(200,200,200),rgb(140,140,140),rgb(80,80,80),rgb(20,20,20))}",
      ".dshwv-trow.dshwv-bgrgb-indigo{background-image:linear-gradient(90deg,rgb(32,49,112),rgb(52,76,146),rgb(74,102,180),rgb(100,126,210),rgb(130,132,224),rgb(130,132,224),rgb(100,126,210),rgb(74,102,180),rgb(52,76,146),rgb(32,49,112))}",
      // 内层文字(带底色时)也支持跑马灯文字颜色:与 .dshwv-trow 相同的 渐变裁字 规则
      ".dshwv-trowtx.dshwv-rgb{background-image:linear-gradient(90deg,rgb(255,180,200),rgb(255,205,170),rgb(255,225,165),rgb(245,240,180),rgb(190,240,210),rgb(180,230,245),rgb(190,215,250),rgb(220,200,245),rgb(240,200,230),rgb(255,180,200));background-size:200% auto;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;animation:dshwvRainbow 2.6s linear infinite;text-shadow:none}",
      ".dshwv-trowtx.dshwv-rgb-candy{background-image:linear-gradient(90deg,rgb(255,145,170),rgb(255,170,130),rgb(255,195,110),rgb(240,220,115),rgb(140,220,175),rgb(115,210,205),rgb(130,195,240),rgb(160,170,235),rgb(210,155,230),rgb(235,135,190),rgb(255,145,170))}",
      ".dshwv-trowtx.dshwv-rgb-rouge{background-image:linear-gradient(90deg,rgb(140,25,45),rgb(175,35,60),rgb(120,20,55),rgb(160,40,75),rgb(190,55,80),rgb(130,30,65),rgb(140,25,45))}",
      ".dshwv-trowtx.dshwv-rgb-bamboo{background-image:linear-gradient(90deg,rgb(70,180,85),rgb(95,200,105),rgb(55,165,70),rgb(110,215,120),rgb(80,190,95),rgb(60,172,78),rgb(70,180,85))}",
      ".dshwv-trowtx.dshwv-rgb-aurora{background-image:linear-gradient(90deg,rgb(70,240,200),rgb(90,200,255),rgb(120,140,255),rgb(180,120,255),rgb(240,140,255),rgb(70,240,200))}",
      ".dshwv-trowtx.dshwv-rgb-deepsea{background-image:linear-gradient(90deg,rgb(20,90,180),rgb(30,140,210),rgb(40,180,220),rgb(20,120,190),rgb(50,160,230),rgb(25,100,200),rgb(20,90,180))}",
      ".dshwv-trowtx.dshwv-rgb-sunset{background-image:linear-gradient(90deg,rgb(255,180,80),rgb(255,130,90),rgb(255,90,110),rgb(220,90,150),rgb(160,90,190),rgb(255,180,80))}",
      ".dshwv-trowtx.dshwv-rgb-forest{background-image:linear-gradient(90deg,rgb(30,100,60),rgb(60,140,80),rgb(90,180,90),rgb(140,200,80),rgb(180,210,90),rgb(30,100,60))}",
      ".dshwv-trowtx.dshwv-rgb-champagne{background-image:linear-gradient(90deg,rgb(220,180,100),rgb(240,205,130),rgb(255,225,160),rgb(230,190,110),rgb(245,210,140),rgb(220,180,100))}",
      ".dshwv-trowtx.dshwv-rgb-lavender{background-image:linear-gradient(90deg,rgb(180,150,255),rgb(200,170,255),rgb(230,180,240),rgb(255,190,220),rgb(240,160,200),rgb(180,150,255))}",
      ".dshwv-trowtx.dshwv-rgb-mint{background-image:linear-gradient(90deg,rgb(120,230,180),rgb(150,240,200),rgb(170,240,230),rgb(140,220,240),rgb(120,200,220),rgb(120,230,180))}",
      ".dshwv-trowtx.dshwv-rgb-lava{background-image:linear-gradient(90deg,rgb(255,60,40),rgb(255,110,30),rgb(255,170,40),rgb(255,210,70),rgb(255,140,50),rgb(255,60,40))}",
      ".dshwv-trowtx.dshwv-rgb-galaxy{background-image:linear-gradient(90deg,rgb(40,30,90),rgb(70,50,130),rgb(110,70,170),rgb(160,90,190),rgb(220,120,180),rgb(40,30,90))}",
      ".dshwv-trowtx.dshwv-rgb-ink{background-image:linear-gradient(90deg,rgb(20,20,20),rgb(80,80,80),rgb(140,140,140),rgb(200,200,200),rgb(250,250,250),rgb(250,250,250),rgb(200,200,200),rgb(140,140,140),rgb(80,80,80),rgb(20,20,20))}",
      ".dshwv-trowtx.dshwv-rgb-indigo{background-image:linear-gradient(90deg,rgb(32,49,112),rgb(52,76,146),rgb(74,102,180),rgb(100,126,210),rgb(130,132,224),rgb(130,132,224),rgb(100,126,210),rgb(74,102,180),rgb(52,76,146),rgb(32,49,112))}",
      ".dshwv-mimg{display:block;margin:0 auto;max-width:calc(var(--dshw-u) * 540);max-height:calc(var(--dshw-u) * 300);object-fit:contain}",
      ".dshwv-bubpal{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-start;margin:4px 0 6px;text-align:left}",
      ".dshwv-palchip{flex:0 0 auto;border:1px solid rgba(32,49,112,.4);border-radius:6px;background:rgba(32,49,112,.08);color:#203170;font-size:12px;padding:4px 8px;cursor:pointer;user-select:none}",
      ".dshwv-palchip:hover{background:rgba(32,49,112,.18)}",
      ".dshwv-bubpvbox{min-height:60px;border:1px dashed rgba(32,49,112,.5);border-radius:10px;background:#f6f8fd;padding:8px;text-align:center}",
      ".dshwv-pvrow{display:flex;align-items:center;gap:4px;justify-content:center;margin:2px 0;padding:2px;border:1px solid transparent;border-radius:6px}",
      ".dshwv-pvrow:hover{background:rgba(32,49,112,.06);border-color:rgba(32,49,112,.2)}",
      ".dshwv-pvlab{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#203170;line-height:1.2}",
      ".dshwv-pvrowline{flex-wrap:wrap;justify-content:center;gap:4px;text-align:center}",
      ".dshwv-pvmod{display:inline-flex;align-items:center;gap:3px;border:1px solid rgba(32,49,112,.4);background:#fff;border-radius:9px;padding:1px 5px 1px 9px;cursor:grab;max-width:100%;box-sizing:border-box;box-shadow:0 1px 2px rgba(32,49,112,.08)}",
      ".dshwv-pvmod:hover{border-color:rgba(32,49,112,.75);box-shadow:0 1px 5px rgba(32,49,112,.22)}",
      ".dshwv-pvmod .dshwv-pvlab{flex:1 1 auto;min-width:0;max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#203170;font-size:12px;line-height:1.5;cursor:grab}",
      ".dshwv-pvmod.dshwv-pvimg{border-style:dashed;background:#f2f6ff}",
      ".dshwv-pvrowline .dshwv-bubmini{width:18px;height:18px;font-size:11px;opacity:.75}",
      ".dshwv-pvdrag{flex:0 0 auto;cursor:grab;color:rgba(32,49,112,.5);font-size:14px;line-height:1;padding:2px 3px;user-select:none}",
      ".dshwv-pvdrag:hover{color:#203170}",
      ".dshwv-pvadd{flex:0 0 auto;width:22px;height:22px;border:1px dashed rgba(32,49,112,.6);border-radius:8px;background:#fff;color:#203170;font-size:13px;line-height:1;cursor:pointer;padding:0;margin-left:2px}",
      ".dshwv-pvadd:hover{border-color:#203170;background:#eef2fb}",
      ".dshwv-bubimgprev{display:none;max-width:120px;max-height:80px;margin:6px auto;border-radius:6px;border:1px solid rgba(32,49,112,.3)}",
      // v649 随机图片模块:列表里的缩略图
      ".dshwv-rimthumb{width:26px;height:26px;object-fit:contain;flex:0 0 auto;background:#f2f5fb;border:1px solid rgba(32,49,112,.15);border-radius:4px}",
      ".dshwv-bubprev{margin:8px auto 2px;text-align:center}",
      ".dshwv-minipop{position:relative;width:100%;aspect-ratio:1026/700;margin:0 auto;filter:drop-shadow(0 2px 6px rgba(0,0,0,.18))}",
      ".dshwv-minipop svg{display:block;width:100%;height:100%}",
      ".dshwv-bubchip-btn{flex:1;min-width:0;border:1px dashed rgba(32,49,112,.35);border-radius:8px;background:#fff;color:#203170;font-size:12px;height:34px;padding:0 8px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dshwv-bubchip-btn:hover{background:rgba(32,49,112,.06)}",
      ".dshwv-bubrow-drag{cursor:grab}",
      ".dshwv-bubrow-drag:hover{border-color:rgba(32,49,112,.4)}",
      ".dshwv-bubdrag{flex:0 0 auto;color:#9fb0d9;font-size:14px;cursor:grab;padding:0 2px}",
      ".dshwv-bublibrow{display:flex;align-items:center;gap:6px;margin:2px 0}",
      ".dshwv-bubnewbtn{border:none;border-radius:6px;background:rgba(32,49,112,.1);color:#203170;font-size:12px;padding:4px 8px;cursor:pointer}",
      ".dshwv-bubnewbtn:hover{background:rgba(32,49,112,.2)}",
      ".dshwv-linerow{border:1px solid rgba(32,49,112,.14);border-radius:6px;margin:2px 0;padding:2px;background:#fbfcfe}",
      ".dshwv-linew{width:48px;box-sizing:border-box;flex:0 0 auto;border:1px solid rgba(32,49,112,.4);border-radius:6px;padding:2px;font-size:12px;color:#203170;text-align:center}",
      ".dshwv-linetx{flex:1;min-width:0;box-sizing:border-box;border:1px solid rgba(32,49,112,.4);border-radius:6px;padding:3px 6px;font-size:12px;color:#203170;background:#fff}",
      ".dshwv-linedel{flex:0 0 auto;width:18px;height:18px;line-height:1;border:none;background:none;color:#c0392b;cursor:pointer;font-size:10px;padding:0}",
      ".dshwv-linepanel{border-top:1px dashed rgba(32,49,112,.2);margin:2px 0 4px;padding:2px 4px 0}",
      // 随机句列表:行头与行内列严格对齐(权重48 / 内容flex居中 / 操作区78 中心对齐复制钮);消除 audiorow 默认 10px 底距
      ".dshwv-linehead{display:flex;align-items:center;gap:8px;margin:2px 0 4px;padding:0 3px;color:#9fb0d9;font-size:11px}",
      ".dshwv-linehead .dshwv-lhw{flex:0 0 48px;text-align:center}",
      ".dshwv-linehead .dshwv-lhc{flex:1;min-width:0;display:flex;justify-content:center}",
      ".dshwv-linehead .dshwv-lho{flex:0 0 78px;text-align:center}",
      ".dshwv-linerow .dshwv-audiorow{margin-bottom:0}",
      // “+ 添加语句”:上边距、加宽、虚线边框
      ".dshwv-addline{display:block;width:70%;margin:12px auto 0;border:1px dashed rgba(32,49,112,.5);border-radius:8px;background:transparent;color:#203170;font-size:12px;padding:6px 8px;cursor:pointer}",
      ".dshwv-addline:hover{background:rgba(32,49,112,.08)}",
      ".dshwv-colrow{display:flex;align-items:center;gap:8px;position:relative;margin:2px 0 4px}",
      ".dshwv-colsw{width:34px;height:22px;border:1px solid rgba(32,49,112,.4);border-radius:6px;cursor:pointer;font-size:10px;padding:0;box-shadow:inset 0 0 0 1px rgba(255,255,255,.6)}",
      ".dshwv-colpop{position:absolute;left:0;top:calc(100% + 4px);z-index:30;background:#fff;border:1px solid rgba(32,49,112,.3);border-radius:8px;box-shadow:0 6px 16px rgba(0,0,0,.18);padding:8px;width:190px;text-align:left}",
      ".dshwv-coldots{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:8px}",
      ".dshwv-coldot{width:22px;height:22px;border-radius:50%;border:1px solid rgba(32,49,112,.25);cursor:pointer;padding:0}",
      ".dshwv-colhex{width:100%;box-sizing:border-box;border:1px solid rgba(32,49,112,.4);border-radius:6px;padding:3px 6px;font-size:11px;color:#203170;margin-bottom:8px}",
      ".dshwv-colfoot{display:flex;gap:8px;justify-content:flex-end}",
      ".dshwv-colnat{width:42px;height:26px;border:1px solid rgba(32,49,112,.45);border-radius:6px;padding:2px;background:#fff;cursor:pointer;box-sizing:border-box}",
      // —— 下拉菜单统一(只统一外观,不改任何刻意设定的宽度/最大宽度) ——
      // 下拉菜单滚动条:细而淡(与用量小容器同一观感);各菜单保持原有紧凑尺寸/内边距
      ".dshwv-rgbmenu,.dshwv-rolelist,.dshwv-audiolist,.dshwv-slotlist,.dshwv-usage-sub,.dshwv-listbox{scrollbar-width:thin;scrollbar-color:rgba(32,49,112,.16) transparent}",
      // 资源管理窗口容器 .dshwv-reswrap 之前漏在这组之外 → 滚动条是浏览器默认样式。
      // 宽度/配色与上一组完全一致，保持视觉统一。
      ".dshwv-reswrap{scrollbar-width:thin;scrollbar-color:rgba(32,49,112,.16) transparent}",
      ".dshwv-reswrap::-webkit-scrollbar{width:6px}",
      ".dshwv-reswrap::-webkit-scrollbar-track{background:transparent}",
      ".dshwv-reswrap::-webkit-scrollbar-thumb{background:rgba(32,49,112,.14);border-radius:3px}",
      ".dshwv-reswrap::-webkit-scrollbar-thumb:hover{background:rgba(32,49,112,.26)}",
      ".dshwv-rgbmenu::-webkit-scrollbar,.dshwv-rolelist::-webkit-scrollbar,.dshwv-audiolist::-webkit-scrollbar,.dshwv-slotlist::-webkit-scrollbar,.dshwv-usage-sub::-webkit-scrollbar,.dshwv-listbox::-webkit-scrollbar{width:6px}",
      ".dshwv-rgbmenu::-webkit-scrollbar-track,.dshwv-rolelist::-webkit-scrollbar-track,.dshwv-audiolist::-webkit-scrollbar-track,.dshwv-slotlist::-webkit-scrollbar-track,.dshwv-usage-sub::-webkit-scrollbar-track,.dshwv-listbox::-webkit-scrollbar-track{background:transparent}",
      ".dshwv-rgbmenu::-webkit-scrollbar-thumb,.dshwv-rolelist::-webkit-scrollbar-thumb,.dshwv-audiolist::-webkit-scrollbar-thumb,.dshwv-slotlist::-webkit-scrollbar-thumb,.dshwv-usage-sub::-webkit-scrollbar-thumb,.dshwv-listbox::-webkit-scrollbar-thumb{background:rgba(32,49,112,.14);border-radius:3px}",
      ".dshwv-rgbmenu::-webkit-scrollbar-thumb:hover,.dshwv-rolelist::-webkit-scrollbar-thumb:hover,.dshwv-audiolist::-webkit-scrollbar-thumb:hover,.dshwv-slotlist::-webkit-scrollbar-thumb:hover,.dshwv-usage-sub::-webkit-scrollbar-thumb:hover,.dshwv-listbox::-webkit-scrollbar-thumb:hover{background:rgba(32,49,112,.26)}",
      // 自绘下拉(替代原生 select):按钮仿 .dshwv-sound 观感,弹层复用 rgbmenu 统一样式与细滚动条
      ".dshwv-custwrap{position:relative;flex:1;min-width:0;display:flex;align-items:center}",
      ".dshwv-custbtn{flex:1;min-width:0;height:24px;box-sizing:border-box;border:1px solid rgba(32,49,112,.4);border-radius:6px;background:rgba(32,49,112,.08);color:#203170;font-size:12px;padding:0 8px;cursor:pointer;display:flex;align-items:center;gap:6px;text-align:left}",
      ".dshwv-custbtn:hover{background:rgba(32,49,112,.16)}",
      ".dshwv-custbtn:disabled{opacity:.45;cursor:not-allowed}",
      '.dshwv-custbtn::after{content:"▾";font-size:9px;opacity:.7;flex:0 0 auto}',
      ".dshwv-custlab{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dshwv-custmenu{max-height:220px;max-width:min(340px,calc(100vw - 16px))}",
      // 任务结束音等自绘下拉的选项行:限宽 + 超长名称悬停滚动(行内层复用 nameinner 机制)
      ".dshwv-custrow{display:flex;align-items:center;min-width:0;overflow:hidden;box-sizing:border-box}",
      ".dshwv-custrow .dshwv-custnm{flex:1;min-width:0;overflow:hidden;display:flex;align-items:center}",
      ".dshwv-custrow .dshwv-custnm .dshwv-nameinner{display:inline-flex;white-space:nowrap;transition:transform .22s ease}",
      ".dshwv-custrow .dshwv-custnm .dshwv-namecopy{margin-right:40px;white-space:nowrap;flex:0 0 auto}",
      // 任务结束音下拉行内的置顶(📌)按钮
      ".dshwv-custrow .dshwv-custpin{flex:0 0 auto;width:20px;height:20px;border:none;background:none;cursor:pointer;font-size:12px;opacity:.35;padding:0;margin-left:2px;line-height:1}",
      ".dshwv-custrow .dshwv-custpin.on{opacity:1}",
      ".dshwv-custrow .dshwv-custpin:hover{opacity:1;background:rgba(32,49,112,.1);border-radius:4px}",
      // 峰谷状态行:高峰色/空闲色 与 底色 并排各占一半(下拉可短一些)
      ".dshwv-peakrow{display:flex;align-items:flex-start;gap:10px;margin:0 0 2px}",
      ".dshwv-peakrow .dshwv-qedit-row{flex:1 1 50%;min-width:0;width:auto;margin:0;align-items:center;flex-wrap:nowrap}",
      ".dshwv-peakrow .dshwv-qcolwrap{width:auto;max-width:none;min-width:0;flex:1 1 auto}",
      ".dshwv-peakrow .dshwv-qcolwrap .dshwv-rgbhead{width:100%;padding:3px 6px;font-size:12px}",
      ".dshwv-peakrow .dshwv-qcolorhost{gap:3px}",
      ".dshwv-peakrow .dshwv-qcolorhost input[type=color]{width:22px;height:18px}",
      ".dshwv-peakrow .dshwv-qcolorhost .dshwv-bubmini{height:18px;font-size:10px;padding:0 4px}",
      // 内容框右侧 ? 说明钮 + 用法气泡
      ".dshwv-tplq{flex:0 0 auto;width:18px;height:18px;border-radius:50%;border:1px solid rgba(32,49,112,.55);background:none;color:#203170;font-size:11px;font-weight:700;line-height:1;cursor:pointer;padding:0;margin-left:4px}",
      ".dshwv-tplq:hover{background:rgba(32,49,112,.14)}",
      ".dshwv-tplhelp{position:fixed;z-index:26080;display:none;max-width:252px;background:#fff;border:1px solid rgba(32,49,112,.35);border-radius:8px;box-shadow:0 6px 16px rgba(0,0,0,.16);padding:8px 10px;font-size:12px;color:#203170;color-scheme:light}",
      // 「?」说明圈:放在「可选模块」等标题前,详细说明收进弹层(复用 tplhelp 弹层,加宽便于阅读)
      ".dshwv-askq{margin-left:0;margin-right:5px;flex:0 0 auto}",
      // 带「?」圈的标题:用 flex 让圈与标题文字垂直居中(不再用 vertical-align 硬顶)
      ".dshwv-bubsec.dshwv-bubsec-withq{display:flex;align-items:center}",
      ".dshwv-hintbox{max-width:min(340px,calc(100vw - 16px));line-height:1.5}",
      // 资源管理窗口:复用 usage mask/card 的遮罩层级与点击豁免,自绘列表观感与主界面一致
      ".dshwv-rescard{width:min(450px,94vw);max-height:78vh}",
      ".dshwv-reshead{display:flex;align-items:center;justify-content:space-between;padding:8px 12px 0;flex:0 0 auto}",
      ".dshwv-reshead .dshwv-restitle{font-size:15px;font-weight:700;color:#203170}",
      ".dshwv-resclose{flex:0 0 auto;border:none;background:none;cursor:pointer;font-size:14px;color:#9fb0d9;padding:1px 5px;border-radius:5px}",
      ".dshwv-resclose:hover{background:rgba(32,49,112,.1);color:#203170}",
      ".dshwv-reswrap{overflow-y:auto;padding:2px 10px 8px;flex:1 1 auto;min-height:0}",
      ".dshwv-rescat{font-weight:700;color:#203170;margin:7px 0 1px;font-size:13px;display:flex;align-items:center;gap:6px}",
      '.dshwv-rescat::after{content:"";flex:1;height:1px;background:rgba(32,49,112,.15)}',
      ".dshwv-resrow{display:flex;align-items:center;gap:6px;padding:3px 7px;border-radius:6px}",
      ".dshwv-resrow:hover{background:rgba(32,49,112,.06)}",
      ".dshwv-resthum{width:28px;height:28px;border-radius:5px;object-fit:cover;flex:0 0 auto;background:#e8ecf7;border:1px solid rgba(32,49,112,.12)}",
      ".dshwv-resicon{width:28px;height:28px;border-radius:5px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:15px;background:#eef1f9}",
      ".dshwv-resmain{flex:1;min-width:0;overflow:hidden}",
      ".dshwv-resnm{font-size:12.5px;color:#203170;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dshwv-resmeta{font-size:10.5px;color:#9fb0d9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dshwv-restag{flex:0 0 auto;font-size:10px;color:#fff;background:#203170;border-radius:3px;padding:1px 5px}",
      ".dshwv-restag-built{background:#9fb0d9}",
      ".dshwv-resdel{flex:0 0 auto;border:1px solid rgba(201,57,43,.4);border-radius:4px;background:none;color:#c9392b;font-size:11px;padding:1px 8px;cursor:pointer}",
      ".dshwv-resdel:hover{background:rgba(201,57,43,.08)}",
      ".dshwv-resdel:disabled{opacity:.4;cursor:not-allowed}",
      ".dshwv-resplay{flex:0 0 auto;border:1px solid rgba(47,122,66,.4);border-radius:4px;background:none;color:#2f7a42;font-size:11px;padding:1px 8px;cursor:pointer}",
      ".dshwv-resplay:hover{background:rgba(47,122,66,.08)}",
      ".dshwv-resimp{flex:0 0 auto;border:1px solid rgba(32,49,112,.4);border-radius:5px;background:rgba(32,49,112,.08);color:#203170;font-size:11px;padding:1px 9px;cursor:pointer}",
      ".dshwv-resimp:hover{background:rgba(32,49,112,.16)}",
      ".dshwv-resempty{color:#9fb0d9;font-size:12px;padding:2px 6px}"
    ].join("\n");
    var styleEl = document2.createElement("style");
    styleEl.textContent = css;
    document2.head.appendChild(styleEl);
    var root = document2.createElement("div");
    root.className = "dshwv-root";
    var img = document2.createElement("img");
    img.className = "dshwv-img";
    var initRoleUrl = IMG_URL;
    try {
      var initRoleId = localStorage.getItem("dshw-role") || "";
      if (initRoleId && initRoleId !== "default") initRoleUrl = "/dsh-whale/role-image.png?id=" + encodeURIComponent(initRoleId);
    } catch (err) {
    }
    img.src = bridge.asset(initRoleUrl);
    img.alt = "DeepSeek 余额";
    img.draggable = false;
    var menuBtn = document2.createElement("button");
    menuBtn.type = "button";
    menuBtn.className = "dshwv-menu-btn";
    menuBtn.title = "菜单";
    menuBtn.innerHTML = "<span></span><span></span><span></span>";
    menuBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      toggleMenu();
    });
    var menuBox = document2.createElement("div");
    menuBox.className = "dshwv-menu";
    menuBox.inert = true;
    menuBox.setAttribute("aria-hidden", "true");
    menuBtn.setAttribute("aria-expanded", "false");
    function menuLabel(text) {
      var s = document2.createElement("span");
      s.textContent = text;
      return s;
    }
    function menuRow() {
      var r = document2.createElement("div");
      r.className = "dshwv-menu-row";
      return r;
    }
    var scaleInput = document2.createElement("input");
    scaleInput.type = "range";
    scaleInput.min = String(MIN_SCALE);
    scaleInput.max = String(MAX_SCALE);
    scaleInput.step = "0.1";
    scaleInput.className = "dshwv-range";
    scaleInput.value = "1.5";
    var scaleNumber = document2.createElement("input");
    scaleNumber.type = "number";
    scaleNumber.min = "1";
    scaleNumber.max = "20";
    scaleNumber.step = "1";
    scaleNumber.className = "dshwv-number";
    scaleNumber.value = "10";
    scaleInput.addEventListener("pointerdown", function() {
      root.style.transition = "none";
    });
    scaleInput.addEventListener("input", function() {
      setScale(scaleInput.value);
    });
    scaleInput.addEventListener("change", function() {
      root.style.transition = "";
      try {
        refreshFlip();
      } catch (err) {
      }
    });
    scaleNumber.addEventListener("focus", function() {
      root.style.transition = "none";
    });
    scaleNumber.addEventListener("blur", function() {
      root.style.transition = "";
    });
    scaleNumber.addEventListener("input", function() {
      var v = Math.round(Number(scaleNumber.value));
      var s = MIN_SCALE + Math.max(0, Math.min(20, v) - 1) * (MAX_SCALE - MIN_SCALE) / 19;
      setScale(s);
    });
    scaleNumber.addEventListener("change", function() {
      var v = Math.round(Number(scaleNumber.value));
      var s = MIN_SCALE + Math.max(0, Math.min(20, v) - 1) * (MAX_SCALE - MIN_SCALE) / 19;
      setScale(s);
      root.style.transition = "";
      try {
        refreshFlip();
      } catch (err) {
      }
    });
    var audioGroupBtn = document2.createElement("button");
    audioGroupBtn.type = "button";
    audioGroupBtn.className = "dshwv-audiobtn";
    audioGroupBtn.title = "选择音效组";
    var audioGroupBtnLabel = document2.createElement("span");
    audioGroupBtnLabel.className = "dshwv-btnlabel";
    audioGroupBtnLabel.textContent = "小黄鸭";
    audioGroupBtn.appendChild(audioGroupBtnLabel);
    var audioGroupPanel = document2.createElement("div");
    audioGroupPanel.className = "dshwv-audiolist";
    var audioImportBtn = document2.createElement("button");
    audioImportBtn.type = "button";
    audioImportBtn.className = "dshwv-audioimport";
    audioImportBtn.textContent = "导入";
    audioImportBtn.title = "新建/编辑音效组";
    audioGroupBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      toggleAudioGroupPanel();
    });
    audioImportBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      openAudioGroupEditor(null);
    });
    document2.body.appendChild(audioGroupPanel);
    function soundOpt(value, label) {
      var o = document2.createElement("option");
      o.value = value;
      o.textContent = label;
      return o;
    }
    var dshwCustSelOpen = null;
    var dshwCustSuppressAt = 0;
    function dshwCustSelClose() {
      var o = dshwCustSelOpen;
      dshwCustSelOpen = null;
      if (!o) return;
      try {
        o.menu.classList.remove("dshwv-rgbopen");
        if (o.menu.parentNode === document2.body) document2.body.removeChild(o.menu);
      } catch (err) {
      }
    }
    if (!window2.__dshwCustBound) {
      window2.__dshwCustBound = true;
      document2.addEventListener("pointerdown", function(e) {
        var o = dshwCustSelOpen;
        if (!o) return;
        try {
          var onBtn = !!(e.target && e.target.closest && e.target.closest(".dshwv-custbtn"));
          if (onBtn) {
            dshwCustCloseNow();
            return;
          }
          if (e.target && o.menu.contains(e.target)) return;
        } catch (err) {
        }
        dshwCustSelClose();
      }, true);
      document2.addEventListener("keydown", function(e) {
        if (e.key === "Escape") dshwCustCloseNow();
      }, true);
      window2.addEventListener("resize", function() {
        dshwCustCloseNow();
      });
    }
    function dshwCustCloseNow() {
      dshwCustSelClose();
      dshwCustSuppressAt = Date.now();
    }
    var taskEndDrop = null;
    var peakDrop = null;
    var moduleImgDrop = null;
    function dshwCustSel(sel, opts) {
      if (!sel || !sel.parentNode || sel.__dshwCust) return { sync: function() {
      }, refresh: function() {
      } };
      sel.__dshwCust = true;
      var parent = sel.parentNode;
      var wrap = document2.createElement("div");
      wrap.className = "dshwv-custwrap";
      var btn = document2.createElement("button");
      btn.type = "button";
      btn.className = "dshwv-custbtn";
      btn.title = sel.title || "";
      var lab = document2.createElement("span");
      lab.className = "dshwv-custlab";
      btn.appendChild(lab);
      parent.insertBefore(wrap, sel);
      wrap.appendChild(btn);
      wrap.appendChild(sel);
      sel.style.display = "none";
      var menu = document2.createElement("div");
      menu.className = "dshwv-rgbmenu dshwv-custmenu";
      function labelOf(v) {
        for (var i = 0; i < sel.options.length; i++) {
          if (String(sel.options[i].value) === String(v)) return String(sel.options[i].textContent || sel.options[i].text || "");
        }
        return "";
      }
      function sync() {
        try {
          lab.textContent = labelOf(sel.value) || "—";
          btn.disabled = !!sel.disabled;
        } catch (err) {
        }
      }
      function fill() {
        menu.innerHTML = "";
        var cur = sel.value;
        for (var i = 0; i < sel.options.length; i++) {
          (function(opt) {
            var d = document2.createElement("div");
            var lab2 = String(opt.textContent || opt.text || opt.value);
            if (opts && opts.scrollNames) {
              d.className = "dshwv-rgbopt dshwv-custrow" + (String(opt.value) === String(cur) ? " dshwv-rgbcur" : "");
              var nm = makeNameCell("dshwv-custnm", lab2);
              d.appendChild(nm);
              bindNameMarquee(d, nm);
            } else {
              d.className = "dshwv-rgbopt" + (String(opt.value) === String(cur) ? " dshwv-rgbcur" : "");
              d.textContent = lab2;
            }
            if (opts && typeof opts.isPinned === "function" && typeof opts.onPin === "function") {
              var pinned = !!opts.isPinned(String(opt.value));
              var pb = document2.createElement("button");
              pb.type = "button";
              pb.className = "dshwv-custpin" + (pinned ? " on" : "");
              pb.textContent = "📌";
              pb.title = pinned ? "取消置顶" : "置顶(排到列表最前)";
              pb.addEventListener("click", function(e) {
                e.stopPropagation();
                opts.onPin(String(opt.value));
              });
              d.appendChild(pb);
            }
            d.addEventListener("click", function(e) {
              e.stopPropagation();
              try {
                sel.value = opt.value;
              } catch (err) {
              }
              sync();
              dshwCustSelClose();
              try {
                sel.dispatchEvent(new Event("change"));
              } catch (err) {
              }
            });
            menu.appendChild(d);
          })(sel.options[i]);
        }
      }
      btn.addEventListener("click", function(e) {
        e.stopPropagation();
        if (btn.disabled) return;
        if (dshwCustSuppressAt && Date.now() - dshwCustSuppressAt < 350) {
          dshwCustSuppressAt = 0;
          return;
        }
        if (dshwCustSelOpen && dshwCustSelOpen.btn === btn) {
          dshwCustSelClose();
          return;
        }
        dshwCustSelClose();
        fill();
        sync();
        if (menu.parentNode !== document2.body) document2.body.appendChild(menu);
        dshwDropOpen(menu, btn);
        if (opts && typeof opts.bottom === "function") {
          try {
            var bEl = opts.bottom();
            if (bEl && bEl.getBoundingClientRect) {
              var bTop = bEl.getBoundingClientRect().top;
              var mTop = menu.getBoundingClientRect().top;
              var avail = Math.floor(bTop - mTop - 6);
              if (avail >= 40) menu.style.maxHeight = Math.min(avail, 220) + "px";
            }
          } catch (err) {
          }
        }
        dshwCustSelOpen = { menu, btn };
      });
      sync();
      return { sync, refresh: function() {
        fill();
        sync();
      } };
    }
    var usageRecBtn = document2.createElement("button");
    usageRecBtn.type = "button";
    usageRecBtn.className = "dshwv-roleimport";
    usageRecBtn.textContent = "- = 小鲸鱼记账 = -";
    usageRecBtn.title = "查看今日/近7天/全部消费记录";
    usageRecBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      toggleUsagePanel();
    });
    var taskEndDefer = false;
    var taskEndDeferSnap = null;
    function applyTaskEndLocal(on, sel) {
      usageSet = usageSet || {};
      usageSet.taskEnd = usageSet.taskEnd || { on: false, sel: "" };
      if (typeof on === "boolean") usageSet.taskEnd.on = on;
      if (typeof sel === "string") usageSet.taskEnd.sel = sel;
      taskEndToggle.checked = !!usageSet.taskEnd.on;
      taskEndSel.disabled = !usageSet.taskEnd.on;
      if (taskEndDrop) taskEndDrop.refresh();
    }
    function commitTaskEnd() {
      if (taskEndDefer) return;
      saveUsageSettings({ taskEnd: usageSet && usageSet.taskEnd || { on: false, sel: "" } });
    }
    var taskEndToggle = document2.createElement("input");
    taskEndToggle.type = "checkbox";
    taskEndToggle.className = "dshwv-check";
    taskEndToggle.checked = false;
    taskEndToggle.title = "每轮对话回复完成时播放提示音";
    taskEndToggle.addEventListener("change", function() {
      applyTaskEndLocal(taskEndToggle.checked, void 0);
      commitTaskEnd();
    });
    var taskEndSel = document2.createElement("select");
    taskEndSel.className = "dshwv-sound";
    taskEndSel.disabled = true;
    taskEndSel.title = "选择任务结束音:音效组(点按整组)/单个音频(与按下/松开同库)";
    taskEndSel.addEventListener("change", function() {
      applyTaskEndLocal(void 0, taskEndSel.value);
      commitTaskEnd();
    });
    function fillTaskEndOptions(pref) {
      var prefSel = usageSet && usageSet.taskEnd && usageSet.taskEnd.sel || pref && pref.sel || "";
      var cur = taskEndSel.value || prefSel || "";
      taskEndSel.innerHTML = "";
      var seen = {};
      var seenLbl = {};
      function add(v2, lab) {
        if (seen[v2]) return;
        if (seenLbl[lab]) return;
        seen[v2] = 1;
        seenLbl[lab] = 1;
        taskEndSel.appendChild(soundOpt(v2, lab));
      }
      var grps = Array.isArray(audioGroups) ? audioGroups : [];
      var frags = Array.isArray(audioFragments) ? audioFragments : [];
      var pre = [
        ["preset:duck:press", "小黄鸭·按下"],
        ["preset:duck:release", "小黄鸭·松开"],
        ["preset:fx1:press", "音效1·按下"],
        ["preset:fx1:release", "音效1·松开"]
      ];
      var fragCand = [];
      var customFragByLabel = {};
      frags.forEach(function(f) {
        if (!f || !f.id || f.preset) return;
        customFragByLabel[String(f.name || f.id)] = "frag:" + f.id;
      });
      frags.forEach(function(f) {
        if (!f || !f.id) return;
        if (f.preset && (f.id === "ya1" || f.id === "ya2" || f.id === "d1" || f.id === "d2")) return;
        if (f.preset && cur && customFragByLabel[String(f.name || f.id)] === cur) return;
        fragCand.push({ v: "frag:" + f.id, lab: String(f.name || f.id), grp: false });
      });
      var preCand = pre.map(function(o) {
        return { v: o[0], lab: o[1], grp: false };
      });
      var grpCand = [];
      grps.forEach(function(g) {
        if (!g || !g.id) return;
        grpCand.push({ v: "grp:" + g.id, lab: String(g.name || audioGroupName(g.id)) + "（点按）", grp: true });
      });
      var allCand = fragCand.concat(preCand, grpCand);
      var candByV = {};
      allCand.forEach(function(c) {
        candByV[c.v] = c;
      });
      var pins = [];
      try {
        if (usageSet && usageSet.taskEnd && Array.isArray(usageSet.taskEnd.pins)) pins = usageSet.taskEnd.pins.slice();
      } catch (err) {
      }
      var ordered = [];
      var orderedSeen = {};
      pins.forEach(function(pv) {
        if (!candByV[pv] || orderedSeen[pv]) return;
        orderedSeen[pv] = 1;
        ordered.push(candByV[pv]);
      });
      allCand.forEach(function(c) {
        if (orderedSeen[c.v]) return;
        orderedSeen[c.v] = 1;
        ordered.push(c);
      });
      ordered.forEach(function(c) {
        if (c.grp) {
          if (seen[c.v]) return;
          seen[c.v] = 1;
          taskEndSel.appendChild(soundOpt(c.v, c.lab));
        } else add(c.v, c.lab);
      });
      var fragN = 0;
      for (var fi = 0; fi < taskEndSel.options.length; fi++) if (String(taskEndSel.options[fi].value).indexOf("frag:") === 0) fragN++;
      var found = false;
      for (var i = 0; i < taskEndSel.options.length; i++) if (taskEndSel.options[i].value === cur) {
        taskEndSel.value = cur;
        found = true;
        break;
      }
      if (!found) {
        if (cur && String(cur).indexOf("frag:") === 0 && fragN === 0) {
          taskEndSel.value = "";
          if (taskEndDrop) taskEndDrop.refresh();
          return;
        }
        if (cur && String(cur).indexOf("grp:") === 0 && (!Array.isArray(audioGroups) || audioGroups.length === 0)) {
          taskEndSel.value = "";
          if (taskEndDrop) taskEndDrop.refresh();
          return;
        }
        var chosen = "preset:duck:press";
        for (var j = 0; j < taskEndSel.options.length; j++) {
          var v = taskEndSel.options[j].value;
          if (v.indexOf("frag:") === 0) {
            chosen = v;
            if (String(taskEndSel.options[j].textContent || "") === "entity") break;
          }
        }
        taskEndSel.value = chosen;
        usageSet = usageSet || {};
        usageSet.taskEnd = usageSet.taskEnd || { on: false, sel: "" };
        usageSet.taskEnd.sel = chosen;
      }
      if (pref && pref.sel) {
        for (var k = 0; k < taskEndSel.options.length; k++) if (taskEndSel.options[k].value === pref.sel) taskEndSel.value = pref.sel;
      }
      var seen2 = {};
      for (var di = taskEndSel.options.length - 1; di >= 0; di--) {
        var dv = taskEndSel.options[di].value;
        if (seen2[dv]) {
          try {
            taskEndSel.remove(di);
          } catch (err) {
          }
        } else seen2[dv] = 1;
      }
      if (taskEndDrop) taskEndDrop.refresh();
    }
    function refreshTaskEndAfterAudio() {
      try {
        fillTaskEndOptions(usageSet && usageSet.taskEnd || null);
      } catch (err) {
      }
    }
    function taskEndPins() {
      try {
        return usageSet && usageSet.taskEnd && Array.isArray(usageSet.taskEnd.pins) ? usageSet.taskEnd.pins.slice() : [];
      } catch (err) {
        return [];
      }
    }
    function taskEndIsPinned(v) {
      var p = taskEndPins();
      for (var i = 0; i < p.length; i++) if (p[i] === v) return true;
      return false;
    }
    function taskEndTogglePin(v) {
      try {
        if (!v) return;
        usageSet = usageSet || {};
        usageSet.taskEnd = usageSet.taskEnd || { on: false, sel: "" };
        var p = taskEndPins();
        var idx = -1;
        for (var i = 0; i < p.length; i++) if (p[i] === v) {
          idx = i;
          break;
        }
        if (idx >= 0) p.splice(idx, 1);
        else p.push(v);
        usageSet.taskEnd.pins = p;
        saveUsageSettings({ taskEnd: usageSet.taskEnd });
        fillTaskEndOptions(usageSet && usageSet.taskEnd || null);
      } catch (err) {
      }
    }
    function playTaskEndSound() {
      try {
        if (!usageSet || !usageSet.taskEnd || !usageSet.taskEnd.on || soundOn === false) return;
        var sel = usageSet.taskEnd.sel || taskEndSel.value || "";
        var url = "";
        if (sel.indexOf("grp:") === 0) {
          playTaskEndGroupClick(sel.slice(4));
          return;
        }
        if (sel.indexOf("frag:") === 0) url = "/dsh-whale/audio-fragment.wav?id=" + encodeURIComponent(sel.slice(5));
        else if (sel.indexOf("preset:") === 0) {
          var parts = sel.split(":");
          url = "/dsh-whale/sound/" + (parts[2] === "release" ? "release" : "press") + ".mp3?set=" + parts[1];
        }
        if (!url) return;
        var a = new Audio(url);
        try {
          a.volume = Number(soundVol) || 0.9;
        } catch (err) {
        }
        a.play().catch(function() {
        });
      } catch (err) {
      }
    }
    function playTaskEndGroupClick(groupId) {
      try {
        let playRel = function() {
          if (relPlayed) return;
          relPlayed = true;
          try {
            release.currentTime = 0;
            var p = release.play();
            if (p && p.catch) p.catch(function() {
            });
          } catch (err) {
          }
        };
        if (!groupId) return;
        var g = null;
        for (var gi = 0; gi < audioGroups.length; gi++) if (audioGroups[gi] && audioGroups[gi].id === groupId) {
          g = audioGroups[gi];
          break;
        }
        var pressEmpty = !!(g && g.press === "");
        var releaseEmpty = !!(g && g.release === "");
        if (pressEmpty && releaseEmpty) return;
        var vol = Number(soundVol) || 0.9;
        if (pressEmpty) {
          if (!releaseEmpty) {
            var relOnly = new Audio("/dsh-whale/sound/release.mp3?set=" + encodeURIComponent(groupId));
            try {
              relOnly.volume = vol;
            } catch (err) {
            }
            relOnly.currentTime = 0;
            var pr = relOnly.play();
            if (pr && pr.catch) pr.catch(function() {
            });
          }
          return;
        }
        var press = new Audio("/dsh-whale/sound/press.mp3?set=" + encodeURIComponent(groupId));
        try {
          press.volume = vol;
        } catch (err) {
        }
        if (releaseEmpty) {
          press.currentTime = 0;
          var pp = press.play();
          if (pp && pp.catch) pp.catch(function() {
          });
          return;
        }
        var release = new Audio("/dsh-whale/sound/release.mp3?set=" + encodeURIComponent(groupId));
        try {
          release.volume = vol;
        } catch (err) {
        }
        var relPlayed = false;
        press.onended = function() {
          playRel();
        };
        press.currentTime = 0;
        var p0 = press.play();
        if (p0 && p0.catch) p0.catch(function() {
        });
      } catch (err) {
      }
    }
    var bubbleToggle = document2.createElement("input");
    bubbleToggle.type = "checkbox";
    bubbleToggle.className = "dshwv-check";
    bubbleToggle.checked = true;
    bubbleToggle.title = "开启/关闭思考气泡";
    bubbleToggle.addEventListener("change", function() {
      setBubbleOn(bubbleToggle.checked);
    });
    var turnCostToggle = document2.createElement("input");
    turnCostToggle.type = "checkbox";
    turnCostToggle.className = "dshwv-check";
    turnCostToggle.checked = true;
    turnCostToggle.title = "每轮对话结束后自动显示本轮消耗金额";
    turnCostToggle.addEventListener("change", function() {
      setTurnCostOn(turnCostToggle.checked);
    });
    var turnCostCloseInput = document2.createElement("input");
    turnCostCloseInput.type = "number";
    turnCostCloseInput.min = "0";
    turnCostCloseInput.step = "1";
    turnCostCloseInput.className = "dshwv-number";
    turnCostCloseInput.value = "5";
    turnCostCloseInput.disabled = false;
    turnCostCloseInput.title = "填 0 表示不自动关闭，需手动点击关闭";
    turnCostCloseInput.addEventListener("input", function() {
      setTurnCostClose(turnCostCloseInput.value);
    });
    turnCostCloseInput.addEventListener("change", function() {
      setTurnCostClose(turnCostCloseInput.value);
    });
    var scrollGapToggle = document2.createElement("input");
    scrollGapToggle.type = "checkbox";
    scrollGapToggle.className = "dshwv-check";
    scrollGapToggle.checked = false;
    scrollGapToggle.title = "开启后挂件右侧按设定像素避开滚动条；关闭则贴边（盖住滚动条）";
    scrollGapToggle.addEventListener("change", function() {
      setScrollGapOn(scrollGapToggle.checked);
    });
    var scrollGapInput = document2.createElement("input");
    scrollGapInput.type = "number";
    scrollGapInput.min = "0";
    scrollGapInput.step = "1";
    scrollGapInput.className = "dshwv-number";
    scrollGapInput.value = "17";
    scrollGapInput.disabled = true;
    scrollGapInput.title = "避让滚动条的像素宽度，填 0 表示贴边";
    scrollGapInput.addEventListener("input", function() {
      setScrollGapPx(scrollGapInput.value);
    });
    scrollGapInput.addEventListener("change", function() {
      setScrollGapPx(scrollGapInput.value);
    });
    var row1 = menuRow();
    row1.appendChild(menuLabel("大小"));
    row1.appendChild(scaleInput);
    row1.appendChild(scaleNumber);
    var row2 = menuRow();
    row2.appendChild(menuLabel("音效"));
    row2.appendChild(audioGroupBtn);
    row2.appendChild(audioImportBtn);
    var volInput = document2.createElement("input");
    volInput.type = "range";
    volInput.min = "0";
    volInput.max = "1";
    volInput.step = "0.05";
    volInput.className = "dshwv-range";
    volInput.value = "0.9";
    var volPct = document2.createElement("span");
    volPct.className = "dshwv-volpct";
    volPct.textContent = "90%";
    volInput.addEventListener("input", function() {
      setVol(volInput.value);
    });
    var row3 = menuRow();
    row3.appendChild(menuLabel("音量"));
    row3.appendChild(volInput);
    row3.appendChild(volPct);
    var row6 = menuRow();
    row6.appendChild(menuLabel("气泡全局开关"));
    row6.appendChild(bubbleToggle);
    var bubbleCustomBtn = document2.createElement("button");
    bubbleCustomBtn.type = "button";
    bubbleCustomBtn.className = "dshwv-roleimport";
    bubbleCustomBtn.style.flex = "1";
    bubbleCustomBtn.textContent = "自定义泡泡";
    bubbleCustomBtn.title = "打开“自定义泡泡”设置";
    bubbleCustomBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      openBubbleEditor();
    });
    row6.appendChild(bubbleCustomBtn);
    var menuSep1 = document2.createElement("div");
    menuSep1.className = "dshwv-menu-sep";
    var row7 = menuRow();
    row7.appendChild(menuLabel("每轮消耗提示"));
    row7.appendChild(turnCostToggle);
    var turnCostCustomBtn = document2.createElement("button");
    turnCostCustomBtn.type = "button";
    turnCostCustomBtn.className = "dshwv-roleimport";
    turnCostCustomBtn.style.flex = "1";
    turnCostCustomBtn.textContent = "自定义提示";
    turnCostCustomBtn.title = "自定义每轮消耗提示内容(金额用 {cost})、自动关闭秒数、任务结束音效";
    turnCostCustomBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      usageAlertBudgetEditor("cost", null);
    });
    row7.appendChild(turnCostCustomBtn);
    var row9 = menuRow();
    row9.appendChild(menuLabel("避让滚动条"));
    row9.appendChild(scrollGapToggle);
    row9.appendChild(menuLabel("宽度"));
    row9.appendChild(scrollGapInput);
    row9.appendChild(menuLabel("px"));
    var roleBtn = document2.createElement("button");
    roleBtn.type = "button";
    roleBtn.className = "dshwv-rolebtn";
    roleBtn.title = "选择角色";
    var roleBtnLabel = document2.createElement("span");
    roleBtnLabel.className = "dshwv-btnlabel";
    roleBtnLabel.textContent = "小鲸鱼";
    roleBtn.appendChild(roleBtnLabel);
    var rolePanel = document2.createElement("div");
    rolePanel.className = "dshwv-rolelist";
    var roleImportBtn = document2.createElement("button");
    roleImportBtn.type = "button";
    roleImportBtn.className = "dshwv-roleimport";
    roleImportBtn.textContent = "导入";
    roleImportBtn.title = "导入自定义角色图片";
    var rowRole = menuRow();
    rowRole.appendChild(menuLabel("角色"));
    rowRole.appendChild(roleBtn);
    rowRole.appendChild(roleImportBtn);
    var roleFileInput = document2.createElement("input");
    roleFileInput.type = "file";
    roleFileInput.accept = "image/*";
    roleFileInput.style.display = "none";
    roleBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      toggleRolePanel();
    });
    roleImportBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      roleFileInput.click();
    });
    roleFileInput.addEventListener("change", function() {
      onRoleFileChosen(roleFileInput);
    });
    menuBox.appendChild(rowRole);
    menuBox.appendChild(row1);
    menuBox.appendChild(row2);
    menuBox.appendChild(row3);
    menuBox.appendChild(row6);
    menuBox.appendChild(row7);
    var taskEndRowHost = document2.createElement("div");
    taskEndRowHost.appendChild(taskEndSel);
    taskEndDrop = dshwCustSel(taskEndSel, {
      // 菜单态:下拉高度不越过底部「小鲸鱼记账」按钮;窗口态(remind mask 存在)不做这个限制
      bottom: function() {
        return window2.__dshwRemindMask ? null : usageNavRow;
      },
      scrollNames: true,
      isPinned: taskEndIsPinned,
      onPin: taskEndTogglePin
    });
    try {
      var taskEndWrapEl = taskEndSel.parentNode;
      if (taskEndWrapEl) {
        taskEndWrapEl.style.flex = "0 0 120px";
        taskEndWrapEl.style.width = "120px";
        taskEndWrapEl.style.maxWidth = "120px";
      }
    } catch (err) {
    }
    menuBox.appendChild(menuSep1);
    menuBox.appendChild(row9);
    var rowSnap = menuRow();
    var snapRowLabel = document2.createElement("span");
    snapRowLabel.textContent = "吸附与翻转";
    var snapCustomBtn = document2.createElement("button");
    snapCustomBtn.type = "button";
    snapCustomBtn.className = "dshwv-roleimport";
    snapCustomBtn.textContent = "自定义";
    snapCustomBtn.title = "自定义各边吸附区宽度与翻转线位置";
    snapCustomBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      openSnapModal();
    });
    rowSnap.appendChild(snapRowLabel);
    rowSnap.appendChild(snapCustomBtn);
    menuBox.appendChild(rowSnap);
    var menuHideToggle = document2.createElement("input");
    menuHideToggle.type = "checkbox";
    menuHideToggle.className = "dshwv-check";
    menuHideToggle.checked = false;
    menuHideToggle.title = "启用后隐藏挂件上的菜单按钮;电脑端右键、手机端长按小鲸鱼可唤出菜单(位置不变)";
    menuHideToggle.addEventListener("change", function() {
      setMenuBtnHide(menuHideToggle.checked);
    });
    var rowHide = menuRow();
    rowHide.appendChild(menuLabel("隐藏菜单按钮"));
    rowHide.appendChild(menuHideToggle);
    menuBox.appendChild(rowHide);
    var rowRes = menuRow();
    var resOpenBtn = document2.createElement("button");
    resOpenBtn.type = "button";
    resOpenBtn.className = "dshwv-usage-more";
    resOpenBtn.style.flex = "1";
    resOpenBtn.style.margin = "0";
    resOpenBtn.textContent = "管理";
    resOpenBtn.title = "集中管理当前导入插件的图片与音频资源";
    resOpenBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      openResManager();
    });
    rowRes.appendChild(menuLabel("资源管理"));
    rowRes.appendChild(resOpenBtn);
    menuBox.appendChild(rowRes);
    var USAGE_REC_URL = "/dsh-whale/usage-records.json";
    var usageSet = null;
    var USAGE_SET_URL = "/dsh-whale/usage-settings.json";
    function loadUsageSettings(cb) {
      try {
        fetch(USAGE_SET_URL, { cache: "no-store" }).then(function(r) {
          return r.json();
        }).then(function(d) {
          if (d && d.ok && d.settings) usageSet = d.settings;
          try {
            loadApiModels(null, true);
          } catch (err) {
          }
          if (cb) cb();
        }).catch(function() {
          if (cb) cb();
        });
      } catch (err) {
        if (cb) cb();
      }
    }
    function saveUsageSettings(patch) {
      try {
        fetch(USAGE_SET_URL, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch || {})
        }).then(function(r) {
          return r.json();
        }).then(function(d) {
          if (d && d.ok && d.settings) usageSet = d.settings;
        }).catch(function() {
        });
      } catch (err) {
      }
    }
    var menuRootView = document2.createElement("div");
    menuRootView.className = "dshwv-menuview";
    while (menuBox.firstChild) menuRootView.appendChild(menuBox.firstChild);
    menuBox.appendChild(menuRootView);
    var usagePanel = document2.createElement("div");
    usagePanel.className = "dshwv-usage-sub";
    usagePanel.style.display = "none";
    var usageArea = document2.createElement("div");
    usageArea.className = "dshwv-usage-area";
    usageArea.style.cssText = "flex:1 1 auto;min-height:0;overflow:hidden;position:relative";
    menuBox.appendChild(usageArea);
    usageArea.appendChild(usagePanel);
    var usageNavRow = menuRow();
    usageNavRow.style.flex = "0 0 auto";
    usageRecBtn.style.width = "100%";
    usageNavRow.appendChild(usageRecBtn);
    menuBox.appendChild(usageNavRow);
    var usagePanelOpen = false;
    var usageRefreshTimer = null;
    var usageMainEl = null;
    var usageHover = false;
    var usageBusyUntil = 0;
    var usagePendingScroll = null;
    usagePanel.addEventListener("mouseenter", function() {
      usageHover = true;
    });
    usagePanel.addEventListener("mouseleave", function() {
      usageHover = false;
      usageBusyUntil = Date.now() + 1500;
    });
    usagePanel.addEventListener("wheel", function() {
      usageBusyUntil = Date.now() + 3e3;
    }, { passive: true });
    usagePanel.addEventListener("touchmove", function() {
      usageBusyUntil = Date.now() + 3e3;
    }, { passive: true });
    function toggleUsagePanel() {
      if (usagePanelOpen) {
        hideUsageSub();
        return;
      }
      showUsageSub();
    }
    function dshwvPlayViewIn(el) {
      if (!el) return;
      el.classList.remove("dshwv-view-in");
      void el.offsetWidth;
      el.classList.add("dshwv-view-in");
    }
    var usageHideTimer = null;
    var usageShowTimer = null;
    function setUsageNavBtn(inUsage) {
      try {
        usageRecBtn.textContent = inUsage ? "‹ 返回" : "- = 小鲸鱼记账 = -";
        usageRecBtn.title = inUsage ? "返回主菜单" : "查看今日/近7天/全部消费记录";
      } catch (err) {
      }
    }
    function showUsageSub() {
      try {
        if (usageHideTimer) {
          clearTimeout(usageHideTimer);
          usageHideTimer = null;
        }
      } catch (err) {
      }
      usagePanelOpen = true;
      var w0 = 300;
      var h0 = 360;
      try {
        var mb = menuBox.getBoundingClientRect();
        if (mb.width > 0) w0 = Math.round(mb.width);
        if (mb.height > 0) h0 = Math.round(mb.height);
      } catch (err) {
      }
      menuBox.style.width = w0 + "px";
      menuBox.style.maxWidth = w0 + "px";
      menuBox.style.height = h0 + "px";
      menuBox.style.overflow = "hidden";
      menuBox.style.display = "flex";
      menuBox.style.flexDirection = "column";
      try {
        if (menuRootView && usageArea) {
          if (menuRootView.parentNode !== usageArea) usageArea.appendChild(menuRootView);
        }
      } catch (err) {
      }
      usageArea.style.display = "block";
      usagePanel.style.display = "block";
      usagePanel.style.position = "absolute";
      usagePanel.style.top = "0";
      usagePanel.style.left = "0";
      usagePanel.style.width = "100%";
      usagePanel.style.height = "100%";
      usagePanel.style.maxHeight = "none";
      usagePanel.style.overflowY = "auto";
      usagePanel.style.zIndex = "1";
      usagePanel.style.transform = "translateY(100%)";
      usagePanel.style.transition = "none";
      if (menuRootView) {
        menuRootView.style.display = "block";
        menuRootView.style.position = "absolute";
        menuRootView.style.top = "0";
        menuRootView.style.left = "0";
        menuRootView.style.width = "100%";
        menuRootView.style.height = "100%";
        menuRootView.style.zIndex = "2";
        menuRootView.style.transform = "translateY(0)";
        menuRootView.style.transition = "none";
      }
      setUsageNavBtn(true);
      renderUsagePanel();
      try {
        void usageArea.offsetHeight;
      } catch (err) {
      }
      usagePanel.style.transition = "transform .22s ease";
      usagePanel.style.transform = "translateY(0)";
      if (menuRootView) {
        menuRootView.style.transition = "transform .22s ease";
        menuRootView.style.transform = "translateY(-100%)";
      }
      usageShowTimer = setTimeout2(function() {
        try {
          if (menuRootView) menuRootView.style.display = "none";
        } catch (err) {
        }
      }, 240);
      if (usageRefreshTimer) {
        clearInterval(usageRefreshTimer);
        usageRefreshTimer = null;
      }
      usageRefreshTimer = setInterval(function() {
        if (!usagePanelOpen) return;
        if (usageHover || Date.now() < usageBusyUntil) return;
        renderUsagePanel();
      }, 1e4);
    }
    function hideUsageSub() {
      if (usageRefreshTimer) {
        clearInterval(usageRefreshTimer);
        usageRefreshTimer = null;
      }
      if (usageHideTimer) {
        clearTimeout(usageHideTimer);
        usageHideTimer = null;
      }
      if (usageShowTimer) {
        clearTimeout(usageShowTimer);
        usageShowTimer = null;
      }
      if (!usagePanelOpen) {
        setUsageNavBtn(false);
        return;
      }
      usagePanelOpen = false;
      if (!usagePanel) {
        setUsageNavBtn(false);
        return;
      }
      setUsageNavBtn(false);
      try {
        if (menuRootView && usageArea) {
          if (menuRootView.parentNode !== usageArea) usageArea.appendChild(menuRootView);
        }
      } catch (err) {
      }
      usagePanel.style.position = "absolute";
      usagePanel.style.top = "0";
      usagePanel.style.left = "0";
      usagePanel.style.width = "100%";
      usagePanel.style.height = "100%";
      usagePanel.style.zIndex = "2";
      usagePanel.style.transform = "translateY(0)";
      usagePanel.style.transition = "none";
      if (menuRootView) {
        menuRootView.style.display = "block";
        menuRootView.style.position = "absolute";
        menuRootView.style.top = "0";
        menuRootView.style.left = "0";
        menuRootView.style.width = "100%";
        menuRootView.style.height = "100%";
        menuRootView.style.zIndex = "1";
        menuRootView.style.transform = "translateY(-100%)";
        menuRootView.style.transition = "none";
      }
      try {
        void usageArea.offsetHeight;
      } catch (err) {
      }
      usagePanel.style.transition = "transform .22s ease";
      usagePanel.style.transform = "translateY(100%)";
      if (menuRootView) {
        menuRootView.style.transition = "transform .22s ease";
        menuRootView.style.transform = "translateY(0)";
      }
      usageHideTimer = setTimeout2(function() {
        usageHideTimer = null;
        try {
          usagePanel.style.display = "none";
        } catch (err) {
        }
        try {
          usagePanel.style.transform = "";
          usagePanel.style.transition = "";
          usagePanel.style.width = "";
          usagePanel.style.height = "";
          usagePanel.style.maxHeight = "";
          usagePanel.style.position = "";
          usagePanel.style.top = "";
          usagePanel.style.left = "";
          usagePanel.style.zIndex = "";
        } catch (err) {
        }
        if (menuRootView && usageArea) {
          try {
            if (usageArea.contains(menuRootView)) menuBox.insertBefore(menuRootView, usageArea);
            menuRootView.style.transform = "";
            menuRootView.style.transition = "";
            menuRootView.style.position = "";
            menuRootView.style.top = "";
            menuRootView.style.left = "";
            menuRootView.style.width = "";
            menuRootView.style.height = "";
            menuRootView.style.zIndex = "";
          } catch (err) {
          }
        }
        try {
          usageArea.style.display = "";
        } catch (err) {
        }
        if (menuBox) {
          menuBox.style.width = "";
          menuBox.style.maxWidth = "";
          menuBox.style.height = "";
          menuBox.style.overflow = "";
          menuBox.style.display = "";
          menuBox.style.flexDirection = "";
        }
      }, 230);
    }
    function closeUsagePanel() {
      hideUsageSub();
    }
    function usageMoney(x) {
      return (state.currency === "USD" ? "$" : "¥") + (isFinite(Number(x)) ? Number(x).toFixed(2) : "0.00");
    }
    function usageDayLabel(day) {
      try {
        var d = day.split("-");
        if (d.length !== 3) return day;
        var now = /* @__PURE__ */ new Date();
        var cur = String(now.getFullYear()) + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
        if (day === cur) return "今天";
        return d[1] + "-" + d[2];
      } catch (err) {
        return day;
      }
    }
    function renderUsagePanel() {
      if (usageMainEl && usagePanelOpen && usageSet !== null) {
        refreshUsageMain();
        return;
      }
      buildUsageSubShell();
      refreshUsageMain();
    }
    function buildUsageSubShell() {
      usagePanel.innerHTML = "";
      var subTitle = document2.createElement("div");
      subTitle.className = "dshwv-usage-subtitle";
      subTitle.textContent = "- = 小鲸鱼记账 = -";
      usagePanel.appendChild(subTitle);
      buildUsageSettingsArea();
      usageMainEl = document2.createElement("div");
      usageMainEl.className = "dshwv-usagebody";
      usagePanel.appendChild(usageMainEl);
    }
    function usageAlertBudgetEditor(key, onSave) {
      try {
        let segCond = function() {
          var s = document2.createElement("span");
          s.style.display = "inline-flex";
          s.style.alignItems = "center";
          s.style.gap = "5px";
          s.style.whiteSpace = "nowrap";
          return s;
        }, cleanup = function() {
          try {
            if (isCost && !costCommitted) {
              var snap = taskEndDeferSnap || { on: false, sel: "" };
              usageSet = usageSet || {};
              usageSet.taskEnd = { on: !!snap.on, sel: String(snap.sel || "") };
              applyTaskEndLocal(usageSet.taskEnd.on, usageSet.taskEnd.sel);
              try {
                fillTaskEndOptions(usageSet.taskEnd);
              } catch (err) {
              }
              turnCostCloseMs = turnCostCloseDeferSnap;
              turnCostCloseInput.value = String(Math.max(0, Math.round(turnCostCloseDeferSnap / 1e3)));
            }
            if (isCost) {
              taskEndDefer = false;
              taskEndDeferSnap = null;
              turnCostCloseDefer = false;
              turnCostCloseInput.disabled = !turnCostOn;
            }
            document2.body.removeChild(mask);
            bubbleEditItems = bkEditItems;
            bubbleEditorSnap = bkEditorSnap;
            bubbleItemSnap = bkItemSnap;
            bubbleEditItemIdx = bkEditIdx;
            bubbleEditSide = bkSide;
            bubblePalEl = bkPal;
            bubblePvEl = bkPv;
            bubblePvPrevEl = bkPrev;
            renderBubblePv = bkRenderPv;
            qeditEnsure = bkQeditEnsure;
            if (moduleMask) moduleMask.style.zIndex = bkModMaskZ;
            var zsEl = document2.getElementById("dshw-remind-overlay-z");
            if (zsEl) {
              try {
                document2.head.removeChild(zsEl);
              } catch (err) {
              }
            }
            window2.__dshwRemindMask = null;
          } catch (err) {
          }
        };
        var isAlert = key === "alert";
        var isCost = key === "cost";
        var costCommitted = false;
        var cfg = isCost ? (usageSet || {}).turnCost || {} : (usageSet || {})[isAlert ? "alert" : "budget"] || {};
        var numDef = isAlert ? 50 : 20;
        var numInit = isAlert ? cfg.below != null ? cfg.below : numDef : cfg.amount != null ? cfg.amount : numDef;
        var step = { kind: "custom", modules: JSON.parse(JSON.stringify(isCost ? usageTurnCostLines() : usageRemindLinesOf(cfg, isAlert))) };
        var bkEditItems = bubbleEditItems;
        var bkEditorSnap = bubbleEditorSnap;
        var bkItemSnap = bubbleItemSnap;
        var bkEditIdx = bubbleEditItemIdx;
        var bkSide = bubbleEditSide;
        var bkPal = bubblePalEl;
        var bkPv = bubblePvEl;
        var bkPrev = bubblePvPrevEl;
        var bkRenderPv = renderBubblePv;
        var bkQeditEnsure = qeditEnsure;
        var bkModMaskZ = moduleMask ? moduleMask.style.zIndex : "";
        bubbleEditItems = [step];
        bubbleEditItemIdx = 0;
        bubbleEditSide = -1;
        bubbleItemSnap = JSON.parse(JSON.stringify(step));
        bubbleEditorSnap = null;
        var mask = document2.createElement("div");
        mask.className = "dshwv-bubmask";
        mask.style.zIndex = "30000";
        var card = document2.createElement("div");
        card.className = "dshwv-bubcard";
        card.style.maxHeight = "88vh";
        card.style.overflow = "hidden auto";
        var title = document2.createElement("div");
        title.className = "dshwv-bubtitle";
        title.textContent = isCost ? "自定义提示(每轮消耗 · 内容 / 自动关闭 / 任务结束音效)" : "编辑 " + (isAlert ? "余额预警" : "今日预算") + "提醒内容(可拖动下方模块入框)";
        card.appendChild(title);
        var secCond = document2.createElement("div");
        secCond.className = "dshwv-bubsec dshwv-bubsec-first";
        secCond.textContent = isCost ? "每轮消耗提示(内容里用 {cost} 引用本轮消耗金额)" : isAlert ? "触发条件(余额低于该值时提醒)" : "触发条件(今日已用达到该值时提醒)";
        card.appendChild(secCond);
        var chk = null;
        var numInp = null;
        if (!isCost) {
          chk = document2.createElement("input");
          chk.type = "checkbox";
          chk.className = "dshwv-check";
          chk.checked = !!cfg.on;
          numInp = document2.createElement("input");
          numInp.type = "number";
          numInp.min = "0";
          numInp.step = "0.01";
          numInp.className = "dshwv-number";
          numInp.style.width = "80px";
          numInp.value = String(numInit);
        }
        var condBox = document2.createElement("div");
        condBox.style.padding = "2px 0";
        condBox.style.display = "flex";
        condBox.style.flexWrap = "wrap";
        condBox.style.alignItems = "center";
        condBox.style.gap = "6px 14px";
        condBox.style.textAlign = "left";
        condBox.style.fontSize = "12px";
        condBox.style.color = "#203170";
        if (isCost) {
          turnCostCloseInput.disabled = false;
          var gAcC = segCond();
          gAcC.appendChild(qLabel("自动关闭"));
          gAcC.appendChild(turnCostCloseInput);
          var lSecC = qLabel("秒(0=不自动关闭)");
          lSecC.style.opacity = ".75";
          lSecC.style.fontSize = "11px";
          gAcC.appendChild(lSecC);
          condBox.appendChild(gAcC);
          var cBrk = document2.createElement("span");
          cBrk.style.flex = "1 0 100%";
          cBrk.style.height = "0";
          cBrk.style.margin = "0";
          condBox.appendChild(cBrk);
          var gTe = segCond();
          gTe.appendChild(qLabel("任务结束音效"));
          gTe.appendChild(taskEndToggle);
          gTe.appendChild(taskEndRowHost);
          condBox.appendChild(gTe);
          var teHint = qLabel("每轮回复完成时播放;这两项点「保存」后才生效");
          teHint.style.opacity = ".75";
          teHint.style.fontSize = "11px";
          teHint.style.flex = "1 0 100%";
          condBox.appendChild(teHint);
        } else {
          var gOn = segCond();
          gOn.appendChild(chk);
          gOn.appendChild(qLabel("启用提醒"));
          condBox.appendChild(gOn);
          var gNum = segCond();
          gNum.appendChild(qLabel(isAlert ? "余额 ≤ " : "今日已用 ≥ "));
          gNum.appendChild(numInp);
          gNum.appendChild(qLabel(" 元时提醒"));
          condBox.appendChild(gNum);
          var condBrk = document2.createElement("span");
          condBrk.style.flex = "1 0 100%";
          condBrk.style.height = "0";
          condBrk.style.margin = "0";
          condBox.appendChild(condBrk);
          var acChk = document2.createElement("input");
          acChk.type = "checkbox";
          acChk.className = "dshwv-check";
          acChk.checked = cfg.autoClose !== false;
          var defSec = Number(cfg.ttlSec);
          if (!isFinite(defSec) || defSec <= 0) defSec = 6;
          var secInp = document2.createElement("input");
          secInp.type = "number";
          secInp.min = "0";
          secInp.step = "1";
          secInp.className = "dshwv-number";
          secInp.style.width = "56px";
          secInp.value = String(defSec);
          var gAc = segCond();
          gAc.appendChild(acChk);
          gAc.appendChild(qLabel("自动关闭"));
          condBox.appendChild(gAc);
          var gSec = segCond();
          gSec.appendChild(secInp);
          var lSec = qLabel("秒(0=不自动关闭)");
          lSec.style.opacity = ".75";
          lSec.style.fontSize = "11px";
          gSec.appendChild(lSec);
          condBox.appendChild(gSec);
        }
        card.appendChild(condBox);
        var secPal = document2.createElement("div");
        secPal.className = "dshwv-bubsec dshwv-bubsec-first dshwv-bubsec-withq";
        secPal.textContent = "可选模块";
        secPal.insertBefore(dshwvAskDot(
          '<div style="font-weight:600;margin-bottom:4px">可选模块 &amp; 提醒内容</div><div>点击「可选模块」即可加入提醒内容;桌面端也可直接拖入下方内容框。</div><div style="margin-top:4px">同一行模块并排显示(≤6 个):</div><div>· 拖模块到某行左/右边缘 = 并排</div><div>· 拖到某行上/下 = 拆行另起一行</div><div>· 拖 ⠿ 手柄 = 整行排序</div>' + (isCost ? '<div style="margin-top:4px">{cost} 在触发时替换为本轮消耗金额(默认内容请保持 {cost})</div>' : '<div style="margin-top:4px">{below} / {amount} 在触发时替换为实际数值</div>') + '<div style="margin-top:4px;opacity:.75">手机端:长按约 0.4 秒进入拖动</div>'
        ), secPal.firstChild);
        card.appendChild(secPal);
        bubblePalEl = document2.createElement("div");
        bubblePalEl.className = "dshwv-bubpal";
        card.appendChild(bubblePalEl);
        var secPv = document2.createElement("div");
        secPv.className = "dshwv-bubsec";
        secPv.textContent = isCost ? "提示内容(每轮消耗)" : "提醒内容";
        card.appendChild(secPv);
        bubblePvEl = document2.createElement("div");
        bubblePvEl.className = "dshwv-bubpvbox";
        card.appendChild(bubblePvEl);
        bubblePvPrevEl = document2.createElement("div");
        bubblePvPrevEl.className = "dshwv-bubprev";
        card.appendChild(bubblePvPrevEl);
        bubblePvEl.addEventListener("dragover", function(e) {
          try {
            if (e.target && e.target.closest && e.target.closest(".dshwv-pvrow")) return;
            e.preventDefault();
          } catch (err) {
          }
        });
        bubblePvEl.addEventListener("drop", function(e) {
          try {
            if (e.target && e.target.closest && e.target.closest(".dshwv-pvrow")) return;
            e.preventDefault();
            if (bubbleModDrag) {
              var mdd = bubbleModDrag;
              bubbleModDrag = null;
              bubblePvDropBlockEnd(mdd.ri, mdd.mi);
              return;
            }
            var key2 = bubbleDragKey;
            if (!key2) return;
            bubbleDragKey = null;
            if (key2 === "image") {
              bubblePickImageToAdd();
              return;
            }
            if (key2 === "wizard") {
              bubbleModuleWizard();
              return;
            }
            var m = bubblePaletteModule(key2);
            if (m) bubbleModuleAdd(m);
          } catch (err) {
          }
        });
        var btns = document2.createElement("div");
        btns.className = "dshwv-bubbtns";
        var noBtn = document2.createElement("button");
        noBtn.type = "button";
        noBtn.className = "dshwv-bubbtn dshwv-bubbtn-no";
        noBtn.textContent = "取消";
        noBtn.addEventListener("click", cleanup);
        btns.appendChild(noBtn);
        var resBtn = document2.createElement("button");
        resBtn.type = "button";
        resBtn.className = "dshwv-bubbtn dshwv-bubbtn-no";
        resBtn.textContent = "恢复默认";
        resBtn.title = isCost ? "恢复为默认提示内容(自动关闭与任务结束音效保持不变)" : "恢复为默认提醒内容(触发条件保持不变)";
        resBtn.addEventListener("click", function() {
          step.modules = JSON.parse(JSON.stringify(isCost ? usageTurnCostDefaultLines() : usageRemindDefaultLines(isAlert)));
          renderBubblePv();
        });
        btns.appendChild(resBtn);
        var okBtn = document2.createElement("button");
        okBtn.type = "button";
        okBtn.className = "dshwv-bubbtn dshwv-bubbtn-ok";
        okBtn.textContent = "保存";
        okBtn.addEventListener("click", function() {
          try {
            bubbleRowsCanon(step.modules);
          } catch (err) {
          }
          var lines = JSON.parse(JSON.stringify(step.modules));
          if (isCost) {
            costCommitted = true;
            turnCostCloseDefer = false;
            setTurnCostClose(turnCostCloseInput.value);
            usageSet = usageSet || {};
            usageSet.turnCost = { lines };
            taskEndDefer = false;
            saveUsageSettings({
              taskEnd: usageSet.taskEnd || { on: false, sel: "" },
              turnCost: { lines }
            });
            var oCost = { lines, autoClose: turnCostCloseMs > 0, ttlSec: Math.round(turnCostCloseMs / 1e3) };
            cleanup();
            if (onSave) onSave(oCost);
            return;
          }
          var o = { on: chk.checked, lines, autoClose: acChk.checked, ttlSec: Math.max(0, Number(secInp.value) || 0) };
          if (isAlert) o.below = Math.max(0, Number(numInp.value) || 0);
          else o.amount = Math.max(0, Number(numInp.value) || 0);
          cleanup();
          if (onSave) onSave(o);
        });
        btns.appendChild(okBtn);
        card.appendChild(btns);
        try {
          if (moduleMask) moduleMask.style.zIndex = "31000";
        } catch (err) {
        }
        var remindZStyle = document2.createElement("style");
        remindZStyle.id = "dshw-remind-overlay-z";
        remindZStyle.textContent = ".dshwv-confirmmask,.dshwv-cropmask,.dshwv-audiomask,.dshwv-snapmask{z-index:32000!important}";
        document2.head.appendChild(remindZStyle);
        var qeditEnsureSuper = bkQeditEnsure;
        qeditEnsure = function() {
          var el = qeditEnsureSuper();
          try {
            if (el) el.style.zIndex = "31000";
          } catch (err) {
          }
          return el;
        };
        try {
          if (qeditEl) qeditEl.style.zIndex = "31000";
        } catch (err) {
        }
        var renderPvSuper = bkRenderPv;
        renderBubblePv = function() {
          try {
            renderPvSuper();
          } catch (err) {
          }
          try {
            var it = bubbleEditTarget();
            var below = isAlert && numInp ? Math.max(0, Number(numInp.value) || 0) : null;
            var amount = !isAlert && !isCost && numInp ? Math.max(0, Number(numInp.value) || 0) : null;
            var cost = isCost ? "0.00" : null;
            if (it && Array.isArray(it.modules) && bubblePvPrevEl) bubblePreviewInto(bubblePvPrevEl, usageAlertModsResolved(it.modules, below, amount, cost));
          } catch (err) {
          }
        };
        if (numInp) {
          numInp.addEventListener("input", renderBubblePv);
          numInp.addEventListener("change", renderBubblePv);
        }
        if (chk) chk.addEventListener("change", renderBubblePv);
        if (isCost) {
          taskEndDefer = true;
          var teCur = usageSet && usageSet.taskEnd || { on: false, sel: "" };
          taskEndDeferSnap = JSON.parse(JSON.stringify({ on: !!teCur.on, sel: String(teCur.sel || "") }));
          applyTaskEndLocal(!!teCur.on, String(teCur.sel || ""));
          try {
            fillTaskEndOptions(teCur);
          } catch (err) {
          }
          turnCostCloseDefer = true;
          turnCostCloseDeferSnap = turnCostCloseMs;
          turnCostCloseInput.disabled = false;
        }
        mask.appendChild(card);
        mask.addEventListener("click", function(e) {
          if (e.target === mask) cleanup();
        });
        window2.__dshwRemindMask = mask;
        document2.body.appendChild(mask);
        renderBubblePal();
        renderBubblePv();
      } catch (err) {
      }
    }
    var apiModels = [];
    var apiTemplates = [];
    var apiModelsLoaded = false;
    var apiAlertFired = {};
    var apiBudgetFired = {};
    var apiBudgetUnitWarned = {};
    function apiModelById(id) {
      for (var i = 0; i < apiModels.length; i++) if (apiModels[i] && apiModels[i].id === id) return apiModels[i];
      return null;
    }
    function apiTodayCur(m) {
      return String(m && (m.todayUsageCurrency || m.currency) || "CNY").toUpperCase() || "CNY";
    }
    function apiConvertMoney(v, fromCur, toCur, rate) {
      var n = Number(v);
      if (!isFinite(n)) return null;
      var f = String(fromCur || "").toUpperCase();
      var t = String(toCur || "").toUpperCase();
      if (!f || !t || f === t) return n;
      var r = Number(rate);
      if (!isFinite(r) || r <= 0) return null;
      if (f === "CNY" && t === "USD") return n / r;
      if (f === "USD" && t === "CNY") return n * r;
      return null;
    }
    function apiFmtMoney(v, cur) {
      var n = Number(v);
      if (!isFinite(n)) return "--";
      var c = String(cur || "");
      if (c === "USD") return "$ " + n.toFixed(2);
      if (c === "CNY") return "¥ " + n.toFixed(2);
      return n.toFixed(2) + (c ? " " + c : "");
    }
    function apiUsageSourceLabel(src) {
      var s = String(src || "");
      if (s === "ledger" || s === "balance") return "余额差记账";
      if (s === "events") return "会话事件";
      return "";
    }
    var apiModelsLoading = false;
    var apiModelsWaiters = [];
    var apiModelsError = "";
    function apiModelsFlushWaiters() {
      var ws = apiModelsWaiters;
      apiModelsWaiters = [];
      for (var i = 0; i < ws.length; i++) {
        try {
          ws[i](apiModelsLoaded ? { ok: true, models: apiModels } : null);
        } catch (err) {
        }
      }
    }
    function loadApiModels(cb, force) {
      if (cb) apiModelsWaiters.push(cb);
      if (apiModelsLoading) return;
      if (apiModelsLoaded && !force) {
        apiModelsFlushWaiters();
        return;
      }
      apiModelsLoading = true;
      apiModelsFetch(3);
      apiModelsNetworkForce = false;
    }
    function apiModelsFetch(tries) {
      var wasLoaded = apiModelsLoaded;
      var opts = { cache: "no-store" };
      try {
        if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) opts.signal = AbortSignal.timeout(4e4);
      } catch (err) {
      }
      fetch("/dsh-whale/api-models.json" + (apiModelsNetworkForce ? "?refresh=1" : ""), opts).then(function(r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }).then(function(d) {
        if (d && d.ok && Array.isArray(d.models)) {
          apiModels = d.models;
          apiTemplates = Array.isArray(d.templates) ? d.templates : [];
          apiModelsLoaded = true;
          apiModelsError = "";
          apiModelsLoading = false;
          try {
            runApiModelAlerts();
          } catch (err) {
          }
          if (!wasLoaded) {
            try {
              if (usagePanelOpen && usageSet !== null) rebuildUsageSubShell();
            } catch (err) {
            }
            try {
              renderBubblePal();
            } catch (err) {
            }
          }
          refreshLiveValues();
          apiModelsFlushWaiters();
          return;
        }
        apiModelsLoading = false;
        apiModelsError = "加载失败（点重试）";
        apiModelsFlushWaiters();
      }).catch(function() {
        if (tries > 0) {
          setTimeout2(function() {
            try {
              apiModelsFetch(tries - 1);
            } catch (err) {
            }
          }, tries === 3 ? 600 : 1200);
          return;
        }
        apiModelsLoading = false;
        apiModelsError = "加载失败（点重试）";
        apiModelsFlushWaiters();
      });
    }
    function postApiModels(body2, cb) {
      var opts = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body2 || {})
      };
      try {
        if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) opts.signal = AbortSignal.timeout(4e4);
      } catch (err) {
      }
      fetch("/dsh-whale/api-models.json" + (apiModelsNetworkForce ? "?refresh=1" : ""), opts).then(function(r) {
        return r.json();
      }).then(function(d) {
        if (d && Array.isArray(d.models)) apiModels = d.models;
        if (cb) cb(d);
      }).catch(function() {
        if (cb) cb(null);
      });
    }
    function openModelAlertBudget(modelId, key, after) {
      try {
        if (!usageSet) return;
        usageSet.models = usageSet.models || {};
        var st = usageSet.models[modelId] || (usageSet.models[modelId] = {});
        var cur = st[key] || usageSet[key] || null;
        if (!cur) return;
        var bkA = usageSet.alert;
        var bkB = usageSet.budget;
        if (key === "alert") usageSet.alert = cur;
        else usageSet.budget = cur;
        usageAlertBudgetEditor(key, function(o) {
          var next = {
            on: !!o.on,
            lines: o.lines,
            autoClose: o.autoClose !== false,
            ttlSec: o.ttlSec != null ? o.ttlSec : 6
          };
          if (key === "alert") next.below = o.below;
          else next.amount = o.amount;
          st[key] = next;
          if (modelId === "deepseek") usageSet[key] = next;
          var patch = { action: "model-settings", id: modelId };
          patch[key] = next;
          postApiModels(patch, function() {
            if (after) after();
          });
        });
        if (key === "alert") usageSet.alert = bkA;
        else usageSet.budget = bkB;
      } catch (err) {
      }
    }
    function apiPanelRow(label, el) {
      var r = document2.createElement("div");
      r.className = "dshwv-audiorow";
      r.style.margin = "0 0 7px";
      var l = document2.createElement("span");
      l.textContent = label;
      l.style.flex = "0 0 62px";
      l.style.textAlign = "left";
      r.appendChild(l);
      r.appendChild(el);
      return r;
    }
    function apiSec(text) {
      var d = document2.createElement("div");
      d.className = "dshwv-bubsec";
      d.style.margin = "10px 0 6px";
      d.textContent = text;
      return d;
    }
    function apiTextInput(val, ph, w) {
      var i = document2.createElement("input");
      i.type = "text";
      i.className = "dshwv-cropname";
      i.style.flex = "1";
      i.style.minWidth = "0";
      i.style.margin = "0";
      i.style.height = "26px";
      i.style.boxSizing = "border-box";
      i.style.textAlign = "left";
      if (w) i.style.width = w;
      i.value = val == null ? "" : String(val);
      i.placeholder = ph || "";
      return i;
    }
    function apiSelectEl(opts, val) {
      var s = document2.createElement("select");
      s.className = "dshwv-sound";
      s.style.flex = "1";
      s.style.minWidth = "0";
      for (var i = 0; i < opts.length; i++) {
        var o = document2.createElement("option");
        o.value = opts[i][0];
        o.textContent = opts[i][1];
        s.appendChild(o);
      }
      if (val != null) s.value = String(val);
      return s;
    }
    function apiBtn(label, cls, fn) {
      var b = document2.createElement("button");
      b.type = "button";
      b.className = cls || "dshwv-snapbtn dshwv-snapbtn-no";
      b.textContent = label;
      if (fn) b.addEventListener("click", function(e) {
        e.stopPropagation();
        fn();
      });
      return b;
    }
    function openApiModelPanel(modelId) {
      try {
        let refreshModelList = function() {
          try {
            loadApiModels(null, true);
          } catch (err) {
          }
          try {
            if (usagePanelOpen) rebuildUsageSubShell();
          } catch (err) {
          }
        }, collect = function() {
          var json = {
            remaining: (jRem.value || "").trim(),
            total: (jTot.value || "").trim(),
            used: (jUse.value || "").trim(),
            scale: isFinite(Number(jSca.value)) && String(jSca.value).trim() !== "" ? Number(jSca.value) : void 0
          };
          var body2 = {
            action: "save",
            model: {
              id: isNew ? void 0 : m.id,
              name: (nameInp.value || "").trim(),
              provider: tplSel.value,
              currency: curSel.value,
              keyRef: (keyRefInp.value || "").trim(),
              baseUrl: (baseInp.value || "").trim(),
              balance: {
                url: (balUrl.value || "").trim(),
                auth: (authInp.value || "").trim(),
                json
              },
              matchIds: (matchInp.value || "").split(",").map(function(s) {
                return s.trim();
              }).filter(function(s) {
                return s.length > 0;
              }),
              price: { hit: (pHit.value || "").trim(), miss: (pMiss.value || "").trim(), out: (pOut.value || "").trim(), cur: pCur.value, rate: (pRate.value || "").trim() }
            }
          };
          var uu = (uUrl.value || "").trim();
          if (uu) {
            body2.model.balance.usage = {
              url: uu,
              json: {
                used: (uUse.value || "").trim(),
                scale: isFinite(Number(uSca.value)) && String(uSca.value).trim() !== "" ? Number(uSca.value) : void 0
              }
            };
          }
          var kv = keyInp.value || "";
          if (kv) body2.keyValue = kv;
          return body2;
        };
        closeApiModelPanel();
        var isNew = !modelId;
        var m = isNew ? null : apiModelById(modelId);
        if (!isNew && !m) return;
        var mask = document2.createElement("div");
        mask.className = "dshwv-usage-mask";
        mask.style.zIndex = "29000";
        var card = document2.createElement("div");
        card.className = "dshwv-usage-card";
        card.style.width = "min(460px,94vw)";
        card.style.maxHeight = "86vh";
        card.style.overflow = "auto";
        card.style.padding = "14px 16px";
        card.style.boxSizing = "border-box";
        card.style.textAlign = "left";
        var title = document2.createElement("div");
        title.className = "dshwv-bubtitle";
        title.textContent = isNew ? "新增模型（自定义 API）" : "模型设置 · " + (m.name || m.id);
        card.appendChild(title);
        var status = document2.createElement("div");
        status.className = "dshwv-bubhint";
        status.style.margin = "4px 0 8px";
        status.textContent = isNew ? "选择厂商模板 → 填 API key → 保存" : m.error ? "⚠ " + m.error : m.balanceMode === "events" ? "余额 —（无接口·按会话事件）· 今日已用 " + apiFmtMoney(m.todayUsage, apiTodayCur(m)) : "余额 " + apiFmtMoney(m.balance, m.currency) + " · 今日已用 " + apiFmtMoney(m.todayUsage, apiTodayCur(m)) + (apiUsageSourceLabel(m.usageSource) ? "（" + apiUsageSourceLabel(m.usageSource) + "）" : "");
        card.appendChild(status);
        card.appendChild(apiSec("基本信息"));
        var nameInp = apiTextInput(isNew ? "" : m.name, "例如 OpenRouter / 我的中转站");
        card.appendChild(apiPanelRow("名称", nameInp));
        var tplList = [];
        for (var ti = 0; ti < apiTemplates.length; ti++) {
          if (apiTemplates[ti].builtin && (isNew || m.provider !== apiTemplates[ti].id)) continue;
          var tplName = String(apiTemplates[ti].name || apiTemplates[ti].id);
          tplList.push({
            id: apiTemplates[ti].id,
            name: tplName,
            // v724：官方「没有用 API key 查余额接口」的模板在下拉里直接标出来，避免选完以为坏了
            label: tplName + (apiTemplates[ti].noBalanceApi ? "（无余额接口）" : ""),
            sortKey: String(apiTemplates[ti].sortKey || tplName).toLowerCase()
          });
        }
        tplList.sort(function(a, b) {
          if (a.sortKey < b.sortKey) return -1;
          if (a.sortKey > b.sortKey) return 1;
          if (a.name < b.name) return -1;
          if (a.name > b.name) return 1;
          return 0;
        });
        var tplOpts = [];
        for (var tl = 0; tl < tplList.length; tl++) tplOpts.push([tplList[tl].id, tplList[tl].label]);
        var tplSel = apiSelectEl(tplOpts, isNew ? "custom" : m.provider);
        if (!isNew) tplSel.disabled = true;
        card.appendChild(apiPanelRow("厂商模板", tplSel));
        var tplNote = document2.createElement("div");
        tplNote.className = "dshwv-bubhint";
        tplNote.style.margin = "0 0 7px";
        card.appendChild(tplNote);
        var curSel = apiSelectEl([["CNY", "人民币 ¥"], ["USD", "美元 $"]], isNew ? "USD" : m.currency);
        card.appendChild(apiPanelRow("币种", curSel));
        card.appendChild(apiSec("密钥"));
        var keyRefInp = apiTextInput(isNew ? "" : m.keyRef, "凭据名，例如 OPENROUTER_API_KEY");
        keyRefInp.title = "密钥存入用户脚本管理器专用存储，不写入网页 localStorage";
        card.appendChild(apiPanelRow("凭据名", keyRefInp));
        var keyInp = document2.createElement("input");
        keyInp.type = "password";
        keyInp.className = "dshwv-cropname";
        keyInp.style.flex = "1";
        keyInp.style.minWidth = "0";
        keyInp.style.margin = "0";
        keyInp.style.height = "26px";
        keyInp.style.boxSizing = "border-box";
        keyInp.style.textAlign = "left";
        keyInp.placeholder = isNew ? "粘贴 API key（保存到用户脚本管理器）" : "留空＝不改动现有密钥";
        card.appendChild(apiPanelRow("API key", keyInp));
        var keyState = document2.createElement("div");
        keyState.className = "dshwv-bubhint";
        keyState.style.margin = "0 0 7px";
        keyState.textContent = isNew ? "" : m.hasKey ? "已配置密钥 ✓" : "尚未配置密钥";
        card.appendChild(keyState);
        var delKey = apiBtn("删除密钥", "dshwv-snapbtn dshwv-snapbtn-no", function() {
          var ref = (keyRefInp.value || "").trim();
          if (!ref) return;
          postApiModels({ action: "delete-key", keyRef: ref }, function() {
            keyState.textContent = "密钥已删除";
            refreshModelList();
          });
        });
        var delKeyRow = apiPanelRow("", delKey);
        card.appendChild(delKeyRow);
        var baseInp = apiTextInput(isNew ? "" : m.baseUrl, "例如 https://my-gateway.example.com");
        var baseRow = apiPanelRow("Base URL", baseInp);
        card.appendChild(baseRow);
        var bal = m && m.balanceDesc && typeof m.balanceDesc === "object" ? m.balanceDesc : {};
        var tpl0 = null;
        for (var t0 = 0; t0 < apiTemplates.length; t0++) if (apiTemplates[t0].id === tplSel.value) tpl0 = apiTemplates[t0];
        if (isNew && tpl0 && tpl0.balance) bal = tpl0.balance;
        var balUrl = apiTextInput(bal.url || "", "余额接口 URL（自定义时必填）");
        var balUrlRow = apiPanelRow("余额接口", balUrl);
        card.appendChild(balUrlRow);
        var authInp = apiTextInput(bal.auth == null ? "Bearer {key}" : bal.auth, "请求头模板，{key} 会被替换成密钥");
        var authRow = apiPanelRow("请求头", authInp);
        card.appendChild(authRow);
        var jr = bal.json || {};
        var jRem = apiTextInput(jr.remaining || "", "如 balance_infos[0].total_balance");
        var jTot = apiTextInput(jr.total || "", "如 data.total_credits");
        var jUse = apiTextInput(jr.used || "", "如 data.total_usage");
        var jSca = apiTextInput(jr.scale == null ? "" : jr.scale, "乘数，如 0.0001");
        var jRemRow = apiPanelRow("余额字段", jRem);
        var jTotRow = apiPanelRow("总量字段", jTot);
        var jUseRow = apiPanelRow("已用字段", jUse);
        var jScaRow = apiPanelRow("数值乘数", jSca);
        card.appendChild(jRemRow);
        card.appendChild(jTotRow);
        card.appendChild(jUseRow);
        card.appendChild(jScaRow);
        var u = bal.usage || {};
        var uUrl = apiTextInput(u.url || "", "可选：第二段用量接口（如 OpenAI 兼容 /usage）");
        var uUse = apiTextInput(u.json && u.json.used || "", "用量字段，如 total_usage");
        var uSca = apiTextInput((u.json && u.json.scale) == null ? "" : u.json.scale, "乘数，如 0.01");
        var uUrlRow = apiPanelRow("用量接口", uUrl);
        var uUseRow = apiPanelRow("用量字段", uUse);
        var uScaRow = apiPanelRow("用量乘数", uSca);
        card.appendChild(uUrlRow);
        card.appendChild(uUseRow);
        card.appendChild(uScaRow);
        var matchInp = apiTextInput(m && Array.isArray(m.matchIds) ? m.matchIds.join(",") : "", "会话事件里的模型名关键字，逗号分隔");
        var matchRow = apiPanelRow("事件匹配", matchInp);
        card.appendChild(matchRow);
        var tip = document2.createElement("div");
        tip.className = "dshwv-bubhint";
        tip.textContent = "「事件匹配」用于没有余额差的模型：本机每轮对话的真实 token 花费，按这里的关键字归到本模型。";
        card.appendChild(tip);
        var prc = m && m.price || {};
        var pHit = apiTextInput(prc.hit == null ? "" : prc.hit, "例: 0.02");
        var pMiss = apiTextInput(prc.miss == null ? "" : prc.miss, "例: 1.0");
        var pOut = apiTextInput(prc.out == null ? "" : prc.out, "例: 4.0");
        var pCur = apiSelectEl([["CNY", "人民币（元 / CNY）"], ["USD", "美元（$ / USD）"]], String(prc.cur || "CNY").toUpperCase() === "USD" ? "USD" : "CNY");
        var pRate = apiTextInput(prc.rate == null ? "" : prc.rate, "仅美元时需要：汇率（元/USD），例 7.1");
        card.appendChild(apiSec("单价（可选）"));
        card.appendChild(apiPanelRow("缓存命中", pHit));
        card.appendChild(apiPanelRow("未命中输入", pMiss));
        card.appendChild(apiPanelRow("输出", pOut));
        card.appendChild(apiPanelRow("币种", pCur));
        card.appendChild(apiPanelRow("汇率", pRate));
        var pTip = document2.createElement("div");
        pTip.className = "dshwv-bubhint";
        pTip.style.margin = "0 0 6px";
        pTip.textContent = "单位为「币种 / 百万 token」，留空则沿用内置价目表。币种选美元时请填汇率，记账会换算成人民币（账本统一按 CNY 结算）；自定义单价不分峰谷。";
        card.appendChild(pTip);
        var btns = document2.createElement("div");
        btns.className = "dshwv-bubbtns";
        if (!isNew) {
          var testBtn = apiBtn("测试连通性", "dshwv-bubbtn dshwv-bubbtn-no", function() {
            testBtn.disabled = true;
            testBtn.textContent = "测试中…";
            postApiModels({ action: "probe", id: m.id }, function(r) {
              testBtn.disabled = false;
              testBtn.textContent = "测试连通性";
              var okP = !!(r && r.ok);
              try {
                confirmMask.style.setProperty("z-index", "29500", "important");
              } catch (err) {
              }
              showConfirm(okP ? "✓ 测试通过\n" + (r.detail || "") : "⚠ 测试失败\n" + (r && r.error || "未知原因"), function() {
              }, "知道了");
            });
          });
          btns.appendChild(testBtn);
        }
        btns.appendChild(apiBtn("保存", "dshwv-bubbtn dshwv-bubbtn-ok", function() {
          status.textContent = "保存中…";
          var nm = (nameInp.value || "").trim();
          postApiModels(collect(), function(d) {
            if (!d || !d.ok) {
              status.textContent = "保存失败: " + (d && d.error || "未知错误");
              return;
            }
            if (isNew) {
              try {
                confirmMask.style.setProperty("z-index", "29500", "important");
              } catch (err) {
              }
              showConfirm("✓ 保存成功：" + (nm || "新模型") + "\n已加入模型列表", function() {
                try {
                  closeApiModelPanel();
                } catch (err) {
                }
                refreshModelList();
              }, "确认");
              return;
            }
            openApiModelPanel(d.id);
            refreshModelList();
          });
        }));
        if (!isNew) {
          btns.appendChild(apiBtn("删除模型", "dshwv-bubbtn dshwv-bubbtn-no", function() {
            showConfirm("删除模型「" + (m.name || m.id) + "」？\n该模型的提醒/预算与所有泡泡里引用它的模块会一并移除。", function() {
              postApiModels({ action: "delete", id: m.id }, function(d) {
                closeApiModelPanel();
                refreshModelList();
                if (d && d.removedModules) {
                  try {
                    showConfirm("已同时移除 " + d.removedModules + " 个引用该模型的泡泡模块", function() {
                    }, "知道了");
                  } catch (err) {
                  }
                }
              });
            });
          }));
        }
        btns.appendChild(apiBtn("取消", "dshwv-bubbtn dshwv-bubbtn-no", closeApiModelPanel));
        card.appendChild(btns);
        try {
          card.style.paddingBottom = "0";
          card.style.overflowX = "hidden";
          card.style.overflowY = "auto";
          btns.style.position = "sticky";
          btns.style.bottom = "0";
          btns.style.background = "#fff";
          btns.style.paddingTop = "8px";
          btns.style.paddingBottom = "14px";
          btns.style.marginTop = "8px";
          btns.style.marginLeft = "-16px";
          btns.style.marginRight = "-16px";
          btns.style.paddingLeft = "16px";
          btns.style.paddingRight = "16px";
          btns.style.borderTop = "1px solid rgba(32,49,112,.12)";
          btns.style.zIndex = "2";
        } catch (err) {
        }
        try {
          keyInp.parentNode.appendChild(delKey);
          keyInp.style.flex = "1";
          keyInp.style.minWidth = "0";
          if (delKeyRow && delKeyRow.parentNode) delKeyRow.parentNode.removeChild(delKeyRow);
        } catch (err) {
        }
        try {
          var advBox = document2.createElement("div");
          advBox.style.overflow = "hidden";
          advBox.style.maxHeight = "0px";
          advBox.style.opacity = "0";
          advBox.style.transition = "max-height .24s ease, opacity .18s ease";
          advBox.style.flexShrink = "0";
          advBox.setAttribute("data-open", "0");
          var toMove = [];
          var started = false;
          var kidsA = Array.prototype.slice.call(card.children);
          for (var ai = 0; ai < kidsA.length; ai++) {
            var elA = kidsA[ai];
            if (elA === balUrlRow) started = true;
            if (elA === btns) break;
            if (started) toMove.push(elA);
          }
          var advToggle = apiBtn("接口与字段（高级）▾", "dshwv-usage-more", function() {
            var open = advBox.getAttribute("data-open") === "1";
            if (!open) {
              advBox.setAttribute("data-open", "1");
              advBox.style.maxHeight = advBox.scrollHeight + "px";
              advBox.style.opacity = "1";
              advToggle.textContent = "接口与字段（高级）▴";
              setTimeout2(function() {
                if (advBox.getAttribute("data-open") === "1") advBox.style.maxHeight = "none";
              }, 280);
            } else {
              advBox.setAttribute("data-open", "0");
              advBox.style.maxHeight = advBox.scrollHeight + "px";
              void advBox.offsetHeight;
              advBox.style.maxHeight = "0px";
              advBox.style.opacity = "0";
              advToggle.textContent = "接口与字段（高级）▾";
            }
          });
          advToggle.style.width = "100%";
          advToggle.style.margin = "2px 0 6px";
          card.insertBefore(advToggle, balUrlRow);
          card.insertBefore(advBox, balUrlRow);
          for (var mi2 = 0; mi2 < toMove.length; mi2++) advBox.appendChild(toMove[mi2]);
          for (var ci = 0; ci < card.children.length; ci++) {
            try {
              card.children[ci].style.flexShrink = "0";
            } catch (err) {
            }
          }
        } catch (err) {
        }
        mask.appendChild(card);
        mask.addEventListener("click", function(e) {
          if (e.target === mask) closeApiModelPanel();
        });
        document2.body.appendChild(mask);
        [matchRow, tip, pTip, pHit.parentNode, pMiss.parentNode, pOut.parentNode, pCur.parentNode, pRate.parentNode].forEach(function(el) {
          if (el) el.style.display = "none";
        });
        Array.from(card.querySelectorAll(".dshwv-bubsec")).forEach(function(el) {
          if (el.textContent.indexOf("单价") >= 0) el.style.display = "none";
        });
        if (m && m.builtin) {
          ;
          [nameInp, keyRefInp, curSel, balUrl, authInp, jRem, jTot, jUse, jSca, uUrl, uUse, uSca].forEach(function(el) {
            el.disabled = true;
          });
          baseRow.style.display = "none";
          advToggle.style.display = "none";
          Array.from(btns.querySelectorAll("button")).forEach(function(el) {
            if (el.textContent === "删除模型") el.remove();
          });
        }
        apiModelMaskEl = mask;
        if (isNew) {
          let applyTpl = function() {
            var t = null;
            for (var k = 0; k < apiTemplates.length; k++) if (apiTemplates[k].id === tplSel.value) t = apiTemplates[k];
            if (!t) return;
            keyRefInp.value = t.keyRef || "";
            curSel.value = t.currency || "CNY";
            baseRow.style.display = t.needsBaseUrl ? "" : "none";
            var isCodexT = t.kind === "codex";
            var tb = t.balance || {};
            var tj = tb.json || {};
            var tu = tb.usage || {};
            balUrl.value = tb.url || "";
            authInp.value = tb.auth == null ? "Bearer {key}" : tb.auth;
            jRem.value = tj.remaining || "";
            jTot.value = tj.total || "";
            jUse.value = tj.used || "";
            jSca.value = tj.scale == null ? "" : String(tj.scale);
            uUrl.value = tu.url || "";
            uUse.value = tu.json && tu.json.used || "";
            uSca.value = (tu.json && tu.json.scale) == null ? "" : String(tu.json.scale);
            var ifaceRows = [balUrlRow, authRow, jRemRow, jTotRow, jUseRow, jScaRow, uUrlRow, uUseRow, uScaRow];
            for (var ri = 0; ri < ifaceRows.length; ri++) ifaceRows[ri].style.display = isCodexT ? "none" : "";
            if (Array.isArray(t.matchIds) && t.matchIds.length) matchInp.value = t.matchIds.join(", ");
            var hasBal = !!String(tb.url || "").trim();
            tplNote.textContent = t.apiNote ? "ℹ " + t.apiNote : "";
            tip.textContent = hasBal ? "「事件匹配」用于没有余额差的模型：本机每轮对话的真实 token 花费，按这里的关键字归到本模型。" : "该厂商没有「用 API key 查余额」的接口 → 余额显示「—」，今日已用按会话事件估算（本机每轮对话的真实 token）。";
            balUrlRow.style.display = isCodexT ? "none" : "";
          };
          tplSel.addEventListener("change", applyTpl);
          applyTpl();
        } else {
          var needBase = false;
          for (var tk = 0; tk < apiTemplates.length; tk++) if (apiTemplates[tk].id === m.provider && apiTemplates[tk].needsBaseUrl) needBase = true;
          baseRow.style.display = needBase ? "" : "none";
        }
      } catch (err) {
      }
    }
    var apiModelMaskEl = null;
    function closeApiModelPanel() {
      try {
        if (apiModelMaskEl && apiModelMaskEl.parentNode) apiModelMaskEl.parentNode.removeChild(apiModelMaskEl);
      } catch (err) {
      }
      apiModelMaskEl = null;
    }
    function mkScrollCell(text, cls, styleObj) {
      var box = document2.createElement("span");
      if (cls) box.className = cls;
      box.classList.add("dshwv-marq");
      if (styleObj) for (var k in styleObj) {
        try {
          box.style[k] = styleObj[k];
        } catch (err) {
        }
      }
      var inner = document2.createElement("span");
      inner.textContent = text == null ? "" : String(text);
      box.appendChild(inner);
      box.addEventListener("mouseenter", function() {
        var dx = box.scrollWidth - box.clientWidth;
        if (dx <= 1) return;
        var sec = Math.max(2, Math.min(12, dx / 30));
        inner.style.transition = "transform " + sec + "s linear";
        inner.style.transform = "translateX(-" + dx + "px)";
      });
      box.addEventListener("mouseleave", function() {
        inner.style.transition = "transform .25s ease";
        inner.style.transform = "translateX(0)";
      });
      return box;
    }
    function buildUsageSettingsArea() {
      var S = usageSet || {};
      var stA = S.alert || { on: false, below: 50 };
      var stB = S.budget || { on: false, amount: 20 };
      function mkRow(labelTxt, key, stateFn, persist) {
        var row = menuRow();
        var lb = menuLabel(labelTxt);
        lb.style.flex = "0 0 auto";
        row.appendChild(lb);
        var info = document2.createElement("span");
        info.className = "dshwv-usage-hint";
        info.style.flex = "1";
        info.style.textAlign = "right";
        info.style.paddingRight = "6px";
        info.style.whiteSpace = "nowrap";
        info.style.overflow = "hidden";
        info.style.textOverflow = "ellipsis";
        row.appendChild(info);
        var btn = document2.createElement("button");
        btn.type = "button";
        btn.className = "dshwv-roleimport";
        btn.textContent = "编辑";
        btn.title = "打开配置卡片(启用 / 数值 / 提醒文案)";
        btn.addEventListener("click", function() {
          usageAlertBudgetEditor(key, function(o) {
            persist(o);
            info.textContent = stateFn();
          });
        });
        row.appendChild(btn);
        usagePanel.appendChild(row);
        info.textContent = stateFn();
      }
      var secRow = document2.createElement("div");
      secRow.className = "dshwv-audiorow";
      secRow.style.margin = "5px 0";
      var secLb = document2.createElement("span");
      secLb.textContent = "模型（提醒 / 预算 / 额度）";
      secLb.style.flex = "0 0 auto";
      secRow.appendChild(secLb);
      var secGap = document2.createElement("span");
      secGap.style.flex = "1";
      secRow.appendChild(secGap);
      var secBtn = document2.createElement("button");
      secBtn.type = "button";
      secBtn.className = "dshwv-palchip";
      secBtn.textContent = "刷新";
      secBtn.title = "手动刷新各模型的余额 / 额度 / 今日已用";
      secBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        if (secBtn.disabled) return;
        secBtn.disabled = true;
        secBtn.textContent = "刷新中…";
        secBtn.style.opacity = ".6";
        apiModelsError = "";
        apiModelsNetworkForce = true;
        var settled = false;
        function onDone() {
          if (settled) return;
          settled = true;
          try {
            rebuildUsageSubShell();
          } catch (err) {
          }
        }
        setTimeout2(function() {
          if (settled) return;
          try {
            secBtn.disabled = false;
            secBtn.textContent = "刷新";
            secBtn.style.opacity = "1";
          } catch (err) {
          }
        }, 25e3);
        try {
          loadApiModels(onDone, true);
        } catch (err) {
          onDone();
        }
      });
      secRow.appendChild(secBtn);
      usagePanel.appendChild(secRow);
      if (!apiModelsLoaded) {
        var ld = document2.createElement("div");
        ld.className = "dshwv-usage-hint";
        ld.textContent = apiModelsError ? "⚠ " + apiModelsError : "加载中…";
        usagePanel.appendChild(ld);
        if (apiModelsError) {
          var rbtn = document2.createElement("button");
          rbtn.type = "button";
          rbtn.className = "dshwv-roleimport";
          rbtn.textContent = "重试";
          rbtn.addEventListener("click", function(e) {
            e.stopPropagation();
            apiModelsError = "";
            loadApiModels(function() {
              try {
                refreshUsageMain();
              } catch (err) {
              }
            }, true);
          });
          usagePanel.appendChild(rbtn);
        } else {
          loadApiModels(function() {
            try {
              refreshUsageMain();
            } catch (err) {
            }
          });
        }
      }
      apiModels.forEach(function(am) {
        var r = document2.createElement("div");
        r.className = "dshwv-audiorow";
        r.style.margin = "5px 0";
        var n = mkScrollCell(am.builtin ? am.name + "（内置）" : am.name, "dshwv-usage-model", { flex: "0 0 70px", boxSizing: "border-box" });
        n.title = am.id + (am.keyRef ? " · " + am.keyRef : "");
        r.appendChild(n);
        var qOn = !!(am.quota && am.quota.on);
        var planOn = !!(am.planSupport && am.plan && am.plan.ok);
        var infoTxt = "";
        if (am.error) infoTxt = "⚠ " + am.error;
        else if (am.codex && am.codex.ok) infoTxt = apiCodexRowText(am);
        else if (planOn) infoTxt = "厂商额度 " + apiPlanSummary(am.id);
        else if (qOn) infoTxt = "额度 " + apiQuotaSummary(am.id);
        else if (am.balanceMode === "events") infoTxt = "余额 —（无接口·按事件）· 今日 " + apiFmtMoney(am.todayUsage, apiTodayCur(am));
        else infoTxt = apiFmtMoney(am.balance, am.currency) + " · 今日 " + apiFmtMoney(am.todayUsage, apiTodayCur(am));
        var info = mkScrollCell(infoTxt, "dshwv-usage-hint", { flex: "1 1 auto", minWidth: "0", textAlign: "right", paddingRight: "6px" });
        info.title = infoTxt;
        r.appendChild(info);
        var btn = document2.createElement("button");
        btn.type = "button";
        btn.className = "dshwv-roleimport";
        btn.textContent = "设置";
        btn.title = "该模型的提醒 / 预算 / 密钥与接口";
        btn.addEventListener("click", function(e) {
          e.stopPropagation();
          openApiModelMenu(am.id);
        });
        r.appendChild(btn);
        usagePanel.appendChild(r);
      });
      var addRow = document2.createElement("div");
      addRow.className = "dshwv-menu-row";
      addRow.style.margin = "5px 0";
      var addModelBtn = apiBtn("+ 添加模型（自定义 API）", "dshwv-usage-more", function() {
        if (apiTemplates.length) openApiModelPanel(null);
        else loadApiModels(function() {
          openApiModelPanel(null);
        });
      });
      addModelBtn.style.flex = "1";
      addModelBtn.style.margin = "0";
      addModelBtn.style.width = "100%";
      addRow.appendChild(addModelBtn);
      usagePanel.appendChild(addRow);
      var palDivider = document2.createElement("div");
      palDivider.style.borderTop = "1px solid rgba(32,49,112,.15)";
      palDivider.style.margin = "6px 0 8px";
      usagePanel.appendChild(palDivider);
      try {
        usagePanel.style.paddingRight = "6px";
      } catch (err) {
      }
    }
    function openModelQuotaEditor(modelId) {
      try {
        let buildModeSel = function() {
          return apiSelectEl([["manual", "手动填写"]], "manual");
        }, syncUnitMode = function() {
          var money = unitSel.value === "money";
          var fresh = buildModeSel();
          try {
            modeRow.replaceChild(fresh, modeSel);
          } catch (err) {
            modeRow.appendChild(fresh);
          }
          modeSel = fresh;
          moneyHint.style.display = money ? "" : "none";
          autoHint.style.display = "none";
          usedInp.placeholder = money ? "例: 0（接入这个挂件之前已经用掉的金额）" : "例: 0（接入这个挂件之前已经用掉的 token 数，不知道就填 0）";
        };
        closeApiModelPanel();
        var m = apiModelById(modelId);
        if (!m) return;
        var q = Object.assign({ on: false, total: 0, unit: "tokens", used: 0, reset: "none" }, apiQuotaOf(modelId) || {});
        var mask = document2.createElement("div");
        mask.className = "dshwv-usage-mask";
        mask.style.zIndex = "30000";
        var card = document2.createElement("div");
        card.className = "dshwv-usage-card";
        card.style.width = "min(430px,94vw)";
        card.style.padding = "14px 16px";
        card.style.boxSizing = "border-box";
        card.style.textAlign = "left";
        var title = document2.createElement("div");
        title.className = "dshwv-bubtitle";
        title.textContent = "额度 · " + m.name;
        card.appendChild(title);
        var hint = document2.createElement("div");
        hint.className = "dshwv-bubhint";
        hint.style.margin = "4px 0 8px";
        hint.textContent = "订阅 / 资源包用这里：总量填套餐额度，已用手动填写，用户脚本无法读取本机会话 token。泡泡里可用 {quota} 已用百分比、{quota_used} 已用、{quota_left} 剩余、{quota_total} 总量、{quota_reset} 重置倒计时";
        card.appendChild(hint);
        var onInp = document2.createElement("input");
        onInp.type = "checkbox";
        onInp.checked = !!q.on;
        card.appendChild(apiPanelRow("启用", onInp));
        var unitSel = apiSelectEl([["tokens", "tokens（token 数）"], ["money", "金额（元）"]], q.unit);
        var modeSel = null;
        modeSel = buildModeSel();
        var modeRow = apiPanelRow("已用来源", modeSel);
        card.appendChild(modeRow);
        var moneyHint = document2.createElement("div");
        moneyHint.className = "dshwv-bubhint";
        moneyHint.style.margin = "0 0 8px";
        moneyHint.textContent = "金额单位请手动填写：自动累计统计的是 token，不是钱。";
        moneyHint.style.display = unitSel.value === "money" ? "" : "none";
        card.appendChild(moneyHint);
        var totalInp = apiTextInput(q.total || "", "例: 20000000");
        card.appendChild(apiPanelRow("总量", totalInp));
        card.appendChild(apiPanelRow("单位", unitSel));
        var usedInp = apiTextInput(q.used || "", "例: 0（接入这个挂件之前已经用掉的 token 数，不知道就填 0）");
        card.appendChild(apiPanelRow("之前已用", usedInp));
        var resetSel = apiSelectEl([["none", "不重置"], ["daily", "每日重置"], ["monthly", "每月重置"]], q.reset);
        card.appendChild(apiPanelRow("重置", resetSel));
        var resetBaseInp = document2.createElement("input");
        resetBaseInp.type = "checkbox";
        card.appendChild(apiPanelRow("重置已用基准", resetBaseInp));
        var baseHint = document2.createElement("div");
        baseHint.className = "dshwv-bubhint";
        baseHint.style.margin = "0 0 8px";
        baseHint.textContent = "勾选「重置已用基准」并保存：将手动填写的已用值重置为 0。";
        card.appendChild(baseHint);
        var autoHint = document2.createElement("div");
        autoHint.className = "dshwv-bubhint";
        autoHint.style.margin = "0 0 6px";
        autoHint.textContent = "当前自动统计：已用 " + apiQuotaUsedText(modelId) + apiQuotaUnitSuffix(apiQuotaInfo(modelId)) + " · 今日 " + apiFmtQuotaNum((apiQuotaOf(modelId) || {}).autoToday || 0) + " tokens";
        card.appendChild(autoHint);
        autoHint.style.display = "none";
        unitSel.addEventListener("change", syncUnitMode);
        var btns = document2.createElement("div");
        btns.className = "dshwv-bubbtns";
        btns.appendChild(apiBtn("取消", "dshwv-bubbtn dshwv-bubbtn-no", closeApiModelPanel));
        btns.appendChild(apiBtn("保存", "dshwv-bubbtn dshwv-bubbtn-ok", function() {
          var next = {
            on: !!onInp.checked,
            mode: modeSel.value === "manual" || modeSel.value === "codex" ? modeSel.value : "auto",
            total: Number(totalInp.value) || 0,
            unit: unitSel.value === "money" ? "money" : "tokens",
            used: Math.max(0, Number(usedInp.value) || 0),
            reset: resetSel.value || "none",
            resetBase: !!resetBaseInp.checked
          };
          var mm = apiModelById(modelId);
          if (mm) mm.quota = next;
          if (usageSet) {
            usageSet.models = usageSet.models || {};
            var st = usageSet.models[modelId] || (usageSet.models[modelId] = {});
            st.quota = next;
          }
          postApiModels({ action: "model-settings", id: modelId, quota: next }, function() {
            loadApiModels(function() {
              try {
                rebuildUsageSubShell();
              } catch (err) {
              }
            }, true);
          });
          closeApiModelPanel();
        }));
        card.appendChild(btns);
        mask.appendChild(card);
        mask.addEventListener("click", function(e) {
          if (e.target === mask) closeApiModelPanel();
        });
        document2.body.appendChild(mask);
        apiModelMaskEl = mask;
      } catch (err) {
      }
    }
    function openApiModelMenu(modelId) {
      try {
        let rowOf = function(label, stateFn, onEdit) {
          var r = document2.createElement("div");
          r.className = "dshwv-audiorow";
          var l = document2.createElement("span");
          l.textContent = label;
          l.style.flex = "0 0 auto";
          r.appendChild(l);
          var info = document2.createElement("span");
          info.className = "dshwv-usage-hint";
          info.style.flex = "1";
          info.style.textAlign = "right";
          info.style.paddingRight = "6px";
          info.style.whiteSpace = "nowrap";
          info.style.overflow = "hidden";
          info.style.textOverflow = "ellipsis";
          info.textContent = stateFn();
          r.appendChild(info);
          r.appendChild(apiBtn("编辑", "dshwv-roleimport", onEdit));
          card.appendChild(r);
        }, readonlyRow = function(label, text) {
          var r = document2.createElement("div");
          r.className = "dshwv-audiorow";
          var l = document2.createElement("span");
          l.textContent = label;
          l.style.flex = "0 0 auto";
          r.appendChild(l);
          var v = document2.createElement("span");
          v.className = "dshwv-usage-hint";
          v.style.flex = "1";
          v.style.textAlign = "right";
          v.style.paddingRight = "6px";
          v.style.whiteSpace = "nowrap";
          v.style.overflow = "hidden";
          v.style.textOverflow = "ellipsis";
          v.textContent = text;
          v.title = text;
          r.appendChild(v);
          card.appendChild(r);
        };
        closeApiModelPanel();
        var m = apiModelById(modelId);
        if (!m) return;
        var mask = document2.createElement("div");
        mask.className = "dshwv-usage-mask";
        mask.style.zIndex = "29000";
        var card = document2.createElement("div");
        card.className = "dshwv-usage-card";
        card.style.width = "min(430px,94vw)";
        card.style.padding = "14px 16px";
        card.style.boxSizing = "border-box";
        card.style.textAlign = "left";
        var title = document2.createElement("div");
        title.className = "dshwv-bubtitle";
        title.textContent = m.name + (m.builtin ? "（内置）" : "");
        card.appendChild(title);
        var st = document2.createElement("div");
        st.className = "dshwv-bubhint";
        st.style.margin = "4px 0 8px";
        if (m.error) st.textContent = "⚠ " + m.error;
        else if (m.balanceMode === "events") st.textContent = "余额 —（该厂商无余额接口，按会话事件估算）· 今日已用 " + apiFmtMoney(m.todayUsage, apiTodayCur(m));
        else st.textContent = "余额 " + apiFmtMoney(m.balance, m.currency) + " · 今日已用 " + apiFmtMoney(m.todayUsage, apiTodayCur(m));
        card.appendChild(st);
        var ms = usageSet && usageSet.models && usageSet.models[modelId] || {};
        rowOf("余额预警", function() {
          var a = ms.alert;
          if (!a || !a.on) return "已关闭";
          return "余额 ≤ " + (a.below != null ? a.below : 50) + " 时提醒";
        }, function() {
          openModelAlertBudget(modelId, "alert", function() {
            openApiModelMenu(modelId);
          });
        });
        rowOf("今日预算", function() {
          var b = ms.budget;
          if (!b || !b.on) return "已关闭";
          return "今日已用 ≥ " + (b.amount != null ? b.amount : 20) + " 时提醒";
        }, function() {
          openModelAlertBudget(modelId, "budget", function() {
            openApiModelMenu(modelId);
          });
        });
        rowOf(
          "额度（订阅/资源包）",
          function() {
            return apiQuotaSummary(modelId);
          },
          function() {
            openModelQuotaEditor(modelId);
          }
        );
        if (apiCodexOf(modelId) && apiCodexOf(modelId).ok) {
          var cr = document2.createElement("div");
          cr.className = "dshwv-audiorow";
          var cl = document2.createElement("span");
          cl.textContent = "Codex 用量";
          cl.style.flex = "0 0 auto";
          cr.appendChild(cl);
          var ci = document2.createElement("span");
          ci.className = "dshwv-usage-hint";
          ci.style.flex = "1";
          ci.style.textAlign = "right";
          ci.style.paddingRight = "6px";
          ci.style.whiteSpace = "nowrap";
          ci.style.overflow = "hidden";
          ci.style.textOverflow = "ellipsis";
          ci.textContent = apiCodexDetailText(modelId);
          ci.title = ci.textContent;
          cr.appendChild(ci);
          card.appendChild(cr);
        }
        if (apiPlanSupport(modelId)) {
          var pr = document2.createElement("div");
          pr.className = "dshwv-audiorow";
          var pl = document2.createElement("span");
          pl.textContent = "厂商额度";
          pl.style.flex = "0 0 auto";
          pr.appendChild(pl);
          var pi = document2.createElement("span");
          pi.className = "dshwv-usage-hint";
          pi.style.flex = "1";
          pi.style.textAlign = "right";
          pi.style.paddingRight = "6px";
          pi.style.whiteSpace = "nowrap";
          pi.style.overflow = "hidden";
          pi.style.textOverflow = "ellipsis";
          pi.textContent = apiPlanSummary(modelId);
          pi.title = pi.textContent;
          pr.appendChild(pi);
          card.appendChild(pr);
        }
        var pc = m && m.price || null;
        var pSet = !!(pc && (pc.hit != null || pc.miss != null || pc.out != null));
        var pTxt = "未设置（沿用内置价目表）";
        var pCur = "";
        if (pSet) {
          var fmtP = function(v) {
            return v == null ? "-" : String(v);
          };
          pCur = String(pc.cur || "CNY").toUpperCase();
          pTxt = fmtP(pc.hit) + " / " + fmtP(pc.miss) + " / " + fmtP(pc.out) + " · " + pCur;
          if (pCur === "USD") pTxt += "（汇率 " + (Number(pc.rate) > 0 ? pc.rate : "未填") + "）";
          if (m.builtin) pTxt += " ← 内置模型不生效（始终用内置峰谷价）";
        } else if (m.builtin) {
          pTxt = "内置峰谷价（内置模型不支持自定义单价）";
        } else {
          pTxt = "未设置（沿用内置价目表）→ 在「密钥 / 接口」里填写";
        }
        readonlyRow("记账方式", "按余额差观测，不估算会话 token 价格");
        var tuc = String(m && m.todayUsageCurrency || "").toUpperCase();
        var mc = String(m && m.currency || "").toUpperCase();
        var rateOk = !!(pc && Number(pc.rate) > 0);
        if (tuc && mc && tuc !== mc && !rateOk) {
          readonlyRow("⚠ 币种不一致", "请在「密钥 / 接口」里填写汇率，否则今日预算提醒会被跳过");
        }
        var btns = document2.createElement("div");
        btns.className = "dshwv-bubbtns";
        btns.appendChild(apiBtn("密钥 / 接口", "dshwv-bubbtn dshwv-bubbtn-no", function() {
          openApiModelPanel(modelId);
        }));
        btns.appendChild(apiBtn("关闭", "dshwv-bubbtn dshwv-bubbtn-ok", closeApiModelPanel));
        card.appendChild(btns);
        mask.appendChild(card);
        mask.addEventListener("click", function(e) {
          if (e.target === mask) closeApiModelPanel();
        });
        document2.body.appendChild(mask);
        apiModelMaskEl = mask;
      } catch (err) {
      }
    }
    function usageScrollSnapshot(root2) {
      var arr = [];
      var node = root2;
      while (node && node !== document2.body) {
        if (node.scrollTop) arr.push([node, node.scrollTop]);
        node = node.parentElement;
      }
      var boxes = root2 && root2.querySelectorAll ? root2.querySelectorAll(".dshwv-usage-scroll") : [];
      for (var i = 0; i < boxes.length; i++) arr.push([boxes[i], boxes[i].scrollTop]);
      return arr;
    }
    function usageScrollRestore(arr) {
      if (!arr) return;
      for (var i = 0; i < arr.length; i++) {
        try {
          arr[i][0].scrollTop = arr[i][1];
        } catch (err) {
        }
      }
    }
    function rebuildUsageSubShell() {
      try {
        usagePendingScroll = usageScrollSnapshot(usagePanel);
      } catch (err) {
      }
      try {
        buildUsageSubShell();
      } catch (err) {
      }
      try {
        refreshUsageMain();
      } catch (err) {
      }
    }
    function refreshUsageMain() {
      if (!usageMainEl) return;
      var snap = usagePendingScroll || usageScrollSnapshot(usageMainEl);
      usagePendingScroll = null;
      if (!usageMainEl.firstChild) {
        var body2 = document2.createElement("div");
        body2.textContent = "加载中…";
        usageMainEl.appendChild(body2);
      }
      fetch(USAGE_REC_URL, { cache: "no-store" }).then(function(r) {
        return r.json();
      }).then(function(d) {
        if (d && d.ok && d.settings) usageSet = d.settings;
        try {
          loadApiModels(null, true);
        } catch (err) {
        }
        fillUsagePanel(d);
        usageScrollRestore(snap);
        try {
          requestAnimationFrame(function() {
            usageScrollRestore(snap);
          });
        } catch (err) {
        }
        if (d && d.ok && d.today && isFinite(Number(d.today.total))) {
          var recTotal = Number(d.today.total);
          if (state.todayUsage === null || recTotal >= state.todayUsage) {
            state.todayUsage = recTotal;
          }
        }
      }).catch(function() {
        if (usageMainEl && !usageMainEl.firstChild) usageMainEl.textContent = "记录加载失败";
      });
    }
    function uSectionTitle(leftTxt, rightTxt) {
      var h = document2.createElement("div");
      h.className = "dshwv-usage-sec";
      var l = document2.createElement("span");
      l.textContent = leftTxt;
      h.appendChild(l);
      var r = document2.createElement("span");
      r.className = "dshwv-usage-total";
      r.textContent = rightTxt;
      h.appendChild(r);
      return h;
    }
    function fillUsagePanel(d) {
      var hostEl = usageMainEl || usagePanel;
      hostEl.innerHTML = "";
      var wrap = document2.createElement("div");
      wrap.className = "dshwv-usagebody";
      if (!d || !d.ok) {
        wrap.textContent = "记录加载失败";
        hostEl.appendChild(wrap);
        return;
      }
      var today = d.today || {};
      var todayModels = today.models || [];
      var hasEvToday = todayModels.length > 0;
      var tToday = uSectionTitle("今日模型消费", usageMoney(today.total));
      tToday.style.borderBottom = "none";
      wrap.appendChild(tToday);
      var todayBox = document2.createElement("div");
      todayBox.className = "dshwv-usage-scroll dshwv-usage-today";
      if (hasEvToday) {
        todayModels.forEach(function(row) {
          var r = document2.createElement("div");
          r.className = "dshwv-usage-row";
          var n = mkScrollCell(usageModelLabel(row.model), "dshwv-usage-model", { flex: "0 0 70px", boxSizing: "border-box" });
          n.title = String(row.model || "未知");
          r.appendChild(n);
          var c = document2.createElement("span");
          c.textContent = usageMoney(row.cost);
          r.appendChild(c);
          todayBox.appendChild(r);
        });
      } else if ((today.total || 0) > 0) {
        var noM = document2.createElement("div");
        noM.className = "dshwv-usage-hint";
        noM.textContent = "仅统计脚本运行期间观测到的余额下降额，无法归属到具体对话或模型。";
        todayBox.appendChild(noM);
      } else {
        var empty = document2.createElement("div");
        empty.className = "dshwv-usage-hint";
        empty.textContent = "今日暂无消费记录";
        todayBox.appendChild(empty);
      }
      wrap.appendChild(todayBox);
      var sep7 = document2.createElement("div");
      sep7.style.borderTop = "1px solid rgba(32,49,112,.15)";
      sep7.style.margin = "6px 0";
      wrap.appendChild(sep7);
      var t7 = uSectionTitle("近7天使用记录", usageMoney(d.total7));
      t7.style.borderBottom = "none";
      wrap.appendChild(t7);
      var daysBox = document2.createElement("div");
      daysBox.className = "dshwv-usage-scroll";
      (d.days7 || []).forEach(function(row) {
        var r = document2.createElement("div");
        r.className = "dshwv-usage-row";
        var n = document2.createElement("span");
        n.textContent = usageDayLabel(row.date);
        r.appendChild(n);
        var c = document2.createElement("span");
        c.textContent = usageMoney(row.total);
        r.appendChild(c);
        daysBox.appendChild(r);
      });
      wrap.appendChild(daysBox);
      var more = document2.createElement("button");
      more.type = "button";
      more.className = "dshwv-usage-more";
      more.textContent = "更多消费记录…";
      more.title = "打开窗口查看全部有记录的消费";
      more.addEventListener("click", function(e) {
        e.stopPropagation();
        openUsageRecordsWindow();
      });
      wrap.appendChild(more);
      (usageMainEl || usagePanel).appendChild(wrap);
    }
    var usageMoreMask = document2.createElement("div");
    usageMoreMask.className = "dshwv-usage-mask";
    usageMoreMask.style.display = "none";
    var usageMoreCard = document2.createElement("div");
    usageMoreCard.className = "dshwv-usage-card";
    usageMoreMask.appendChild(usageMoreCard);
    usageMoreMask.addEventListener("click", function(e) {
      if (e.target === usageMoreMask) closeUsageRecordsWindow();
    });
    document2.body.appendChild(usageMoreMask);
    function openUsageRecordsWindow() {
      usageMoreCard.innerHTML = '<div style="padding:10px;color:#203170">加载中…</div>';
      usageMoreMask.style.display = "flex";
      fetch(USAGE_REC_URL, { cache: "no-store" }).then(function(r) {
        return r.json();
      }).then(function(d) {
        fillUsageRecordsWindow(d);
      }).catch(function() {
        usageMoreCard.innerHTML = '<div style="padding:10px;color:#203170">加载失败</div>';
      });
    }
    function closeUsageRecordsWindow() {
      usageMoreMask.style.display = "none";
    }
    var resMaskEl = null;
    var resCardEl = null;
    function resMaskOpen() {
      try {
        if (!resMaskEl) {
          resMaskEl = document2.createElement("div");
          resMaskEl.className = "dshwv-resmask";
          resMaskEl.style.display = "none";
          resCardEl = document2.createElement("div");
          resCardEl.className = "dshwv-usage-card dshwv-rescard";
          resMaskEl.appendChild(resCardEl);
          resMaskEl.addEventListener("click", function(e) {
            if (e.target === resMaskEl) resManagerClose();
          });
          document2.body.appendChild(resMaskEl);
        }
        resManagerRender();
        resMaskEl.style.display = "flex";
      } catch (err) {
      }
    }
    function resManagerClose() {
      try {
        if (resMaskEl) resMaskEl.style.display = "none";
      } catch (err) {
      }
      try {
        if (resAudEl) {
          resAudEl.pause();
          resAudEl = null;
        }
      } catch (err) {
      }
    }
    function openResManager() {
      resMaskOpen();
    }
    function resMkTag(text, built) {
      var t = document2.createElement("span");
      t.className = "dshwv-restag" + (built ? " dshwv-restag-built" : "");
      t.textContent = text;
      return t;
    }
    function resImgRow(imgUrl, name, meta, rightEls) {
      var img2 = document2.createElement("img");
      img2.className = "dshwv-resthum";
      img2.src = bridge.asset(imgUrl);
      img2.alt = "";
      var main = document2.createElement("div");
      main.className = "dshwv-resmain";
      main.style.minWidth = "0";
      var nm = document2.createElement("div");
      nm.className = "dshwv-resnm";
      nm.textContent = name;
      nm.title = name;
      main.appendChild(nm);
      if (meta) {
        var mt = document2.createElement("div");
        mt.className = "dshwv-resmeta";
        mt.textContent = meta;
        mt.title = meta;
        main.appendChild(mt);
      }
      var row = document2.createElement("div");
      row.className = "dshwv-resrow";
      var left = document2.createElement("div");
      left.className = "dshwv-resmain";
      left.style.display = "flex";
      left.style.alignItems = "center";
      left.style.gap = "6px";
      left.appendChild(img2);
      left.appendChild(main);
      row.appendChild(left);
      for (var i = 0; i < (rightEls || []).length; i++) row.appendChild(rightEls[i]);
      return row;
    }
    function resIconRow(iconText, name, meta, rightEls) {
      var icon = document2.createElement("div");
      icon.className = "dshwv-resicon";
      icon.textContent = iconText;
      var main = document2.createElement("div");
      main.className = "dshwv-resmain";
      main.style.minWidth = "0";
      var nm = document2.createElement("div");
      nm.className = "dshwv-resnm";
      nm.textContent = name;
      nm.title = name;
      main.appendChild(nm);
      if (meta) {
        var mt = document2.createElement("div");
        mt.className = "dshwv-resmeta";
        mt.textContent = meta;
        mt.title = meta;
        main.appendChild(mt);
      }
      var row = document2.createElement("div");
      row.className = "dshwv-resrow";
      var left = document2.createElement("div");
      left.className = "dshwv-resmain";
      left.style.display = "flex";
      left.style.alignItems = "center";
      left.style.gap = "6px";
      left.appendChild(icon);
      left.appendChild(main);
      row.appendChild(left);
      for (var i = 0; i < (rightEls || []).length; i++) row.appendChild(rightEls[i]);
      return row;
    }
    function resMkDel(label, disabled, fn) {
      var b = document2.createElement("button");
      b.type = "button";
      b.className = "dshwv-resdel";
      b.textContent = label;
      b.disabled = !!disabled;
      if (!disabled) b.addEventListener("click", function(e) {
        e.stopPropagation();
        fn();
      });
      return b;
    }
    function resMkBtn(cls, label, disabled, fn) {
      var b = document2.createElement("button");
      b.type = "button";
      b.className = cls;
      b.textContent = label;
      b.disabled = !!disabled;
      if (!disabled) b.addEventListener("click", function(e) {
        e.stopPropagation();
        fn();
      });
      return b;
    }
    var resAudEl = null;
    function resPlayFragment(fid) {
      try {
        if (!fid) return;
        if (resAudEl) {
          try {
            resAudEl.pause();
          } catch (err) {
          }
          resAudEl = null;
        }
        var a = new Audio("/dsh-whale/audio-fragment.wav?id=" + encodeURIComponent(fid));
        try {
          a.volume = Number(soundVol) || 0.9;
        } catch (err) {
        }
        a.onended = function() {
          resAudEl = null;
        };
        resAudEl = a;
        a.play().catch(function() {
          resAudEl = null;
        });
      } catch (err) {
      }
    }
    function resImportAudioFragment() {
      try {
        audioCropTarget = "__library__";
        audioCropFileInput.click();
      } catch (err) {
      }
    }
    function resManagerRender() {
      try {
        let fin = function() {
          done++;
          if (done < 3) return;
          resRenderData(wrap, roles, bubbleImgs, audio);
        }, fail = function() {
          fin();
        };
        var card = resCardEl;
        card.innerHTML = "";
        var head = document2.createElement("div");
        head.className = "dshwv-reshead";
        var title = document2.createElement("span");
        title.className = "dshwv-restitle";
        title.textContent = "资源管理";
        var x = document2.createElement("button");
        x.type = "button";
        x.className = "dshwv-resclose";
        x.textContent = "✕";
        x.title = "关闭";
        x.addEventListener("click", resManagerClose);
        head.appendChild(title);
        head.appendChild(x);
        card.appendChild(head);
        var wrap = document2.createElement("div");
        wrap.className = "dshwv-reswrap";
        card.appendChild(wrap);
        wrap.innerHTML = '<div style="padding:8px 6px;color:#203170">加载中…</div>';
        var roles = [];
        var bubbleImgs = [];
        var audio = null;
        var done = 0;
        try {
          fetch("/dsh-whale/roles.json", { cache: "no-store" }).then(function(r) {
            return r.json();
          }).then(function(d) {
            if (d && d.ok && Array.isArray(d.roles)) roles = d.roles;
            fin();
          }).catch(fail);
        } catch (err) {
          fin();
        }
        try {
          fetch("/dsh-whale/bubble-imgs.json", { cache: "no-store" }).then(function(r) {
            return r.json();
          }).then(function(d) {
            if (d && d.ok && Array.isArray(d.images)) bubbleImgs = d.images;
            fin();
          }).catch(fail);
        } catch (err) {
          fin();
        }
        try {
          fetch("/dsh-whale/audio.json", { cache: "no-store" }).then(function(r) {
            return r.json();
          }).then(function(d) {
            audio = d;
            fin();
          }).catch(fail);
        } catch (err) {
          fin();
        }
      } catch (err) {
      }
    }
    function resDelRole(id) {
      var r = null;
      for (var i = 0; i < roleList.length; i++) if (roleList[i].id === id) {
        r = roleList[i];
        break;
      }
      showConfirm("确定删除角色「" + (r ? r.name : id) + "」吗？\n若该角色正被使用,将自动回退默认小鲸鱼。", function() {
        try {
          fetch("/dsh-whale/role-delete.json", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id })
          }).then(function(res) {
            return res.json();
          }).then(function(d) {
            if (d && d.ok && Array.isArray(d.roles)) {
              roleList = d.roles;
              renderRolePanel();
              if (currentRole && currentRole.id === id) applyRole("default", "小鲸鱼", IMG_URL);
              openResManager();
            }
          }).catch(function() {
          });
        } catch (err) {
        }
      });
    }
    function resDelBubbleImg(id) {
      var im = null;
      for (var i = 0; i < bubbleImgList.length; i++) if (bubbleImgList[i].id === id) {
        im = bubbleImgList[i];
        break;
      }
      showConfirm("确定删除泡泡图「" + (im && im.name ? im.name : id) + "」吗？\n正在引用该图的泡泡行将无法显示。", function() {
        try {
          fetch("/dsh-whale/bubble-img-upload.json", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete", id })
          }).then(function(r) {
            return r.json();
          }).then(function(d) {
            if (d && d.ok && Array.isArray(d.images)) {
              bubbleImgList = d.images;
              openResManager();
            }
          }).catch(function() {
          });
        } catch (err) {
        }
      });
    }
    function resDelAudioGroup(id) {
      var g = null;
      for (var i = 0; i < (audioGroups || []).length; i++) if (audioGroups[i].id === id) {
        g = audioGroups[i];
        break;
      }
      showConfirm("确定删除音效组「" + (g && g.name ? g.name : id) + "」吗？", function() {
        try {
          fetch("/dsh-whale/audio.json", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete-group", id })
          }).then(function(r) {
            return r.json();
          }).then(function(d) {
            if (d && d.ok && Array.isArray(d.groups)) {
              audioGroups = d.groups;
              renderAudioGroupPanel();
              refreshTaskEndAfterAudio();
              if (soundSet === id) setSoundSet("duck");
              openResManager();
            }
          }).catch(function() {
          });
        } catch (err) {
        }
      });
    }
    function resDelAudioFrag(id) {
      var f = null;
      for (var i = 0; i < (audioFragments || []).length; i++) if (audioFragments[i].id === id) {
        f = audioFragments[i];
        break;
      }
      showConfirm("确定删除音频片段「" + (f && f.name ? f.name : id) + "」吗？\n引用该片段的音效组槽位会自动回退预设。", function() {
        try {
          fetch("/dsh-whale/audio.json", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete-fragment", id })
          }).then(function(r) {
            return r.json();
          }).then(function(d) {
            if (d && d.ok && Array.isArray(d.fragments)) {
              audioFragments = d.fragments;
              if (Array.isArray(d.groups)) audioGroups = d.groups;
              renderAudioGroupPanel();
              refreshTaskEndAfterAudio();
              openResManager();
            }
          }).catch(function() {
          });
        } catch (err) {
        }
      });
    }
    function resRenderData(wrap, roles, bubbleImgs, audio) {
      try {
        wrap.innerHTML = "";
        var catImg = document2.createElement("div");
        catImg.className = "dshwv-rescat";
        catImg.textContent = "图片";
        wrap.appendChild(catImg);
        var anyImg = false;
        roles.forEach(function(r) {
          anyImg = true;
          var isDefault = r.id === "default";
          var tag = resMkTag(isDefault ? "默认角色" : "自定义角色", isDefault);
          wrap.appendChild(resImgRow(r.url, r.name || r.id, "", [tag, resMkDel("删除", isDefault, function() {
            resDelRole(r.id);
          })]));
        });
        bubbleImgs.forEach(function(im) {
          anyImg = true;
          var tag = resMkTag(im.builtin ? "内置图" : "泡泡图", !!im.builtin);
          wrap.appendChild(resImgRow("/dsh-whale/bubble-img.png?id=" + encodeURIComponent(im.id), im.name || im.id, "", [tag, resMkDel("删除", !!im.builtin, function() {
            resDelBubbleImg(im.id);
          })]));
        });
        if (!anyImg) {
          var empty = document2.createElement("div");
          empty.className = "dshwv-resempty";
          empty.textContent = "暂无自定义图片(角色/泡泡图)";
          wrap.appendChild(empty);
        }
        var catAu = document2.createElement("div");
        catAu.className = "dshwv-rescat";
        catAu.textContent = "音频";
        var catAuBtn = resMkBtn("dshwv-resimp", "导入片段", false, resImportAudioFragment);
        catAuBtn.title = "导入并裁剪一段音频到片段库(可被音效组引用)";
        catAu.appendChild(catAuBtn);
        wrap.appendChild(catAu);
        var anyAu = false;
        var groups = audio && Array.isArray(audio.groups) ? audio.groups : [];
        groups.forEach(function(g) {
          anyAu = true;
          var preset = !!g.preset;
          var tag = resMkTag(preset ? "预设组" : "自定义组", preset);
          var meta = "";
          if (!preset && g.press && g.release) meta = "按压:" + g.press + " 松开:" + g.release;
          wrap.appendChild(resIconRow(preset ? "🎧" : "🎵", g.name || g.id, meta, [tag, resMkDel("删除", preset, function() {
            resDelAudioGroup(g.id);
          })]));
        });
        var frags = audio && Array.isArray(audio.fragments) ? audio.fragments : [];
        frags.forEach(function(f) {
          if (f.preset) return;
          anyAu = true;
          var tag = resMkTag("音频片段", false);
          var play = resMkBtn("dshwv-resplay", "播放", false, function() {
            resPlayFragment(f.id);
          });
          play.title = "试听该音频片段";
          wrap.appendChild(resIconRow("🎶", f.name || f.id, "", [tag, play, resMkDel("删除", false, function() {
            resDelAudioFrag(f.id);
          })]));
        });
        if (!anyAu) {
          var empty2 = document2.createElement("div");
          empty2.className = "dshwv-resempty";
          empty2.textContent = "暂无自定义音频(片段/音效组)";
          wrap.appendChild(empty2);
        }
      } catch (err) {
      }
    }
    var usageAlertBelowFired = false;
    var usageBudgetFiredKey = null;
    function usageTodayKeyStr() {
      return new Date(Date.now() + 288e5).toISOString().slice(0, 10);
    }
    function usageRemindDefaultLines(isAlert) {
      if (isAlert) {
        return [
          { type: "text", text: "老大~你的DS余额", size: 5, bold: true },
          { type: "text", text: "已经不足", size: 5, bold: true, row: 2 },
          { type: "text", text: "{below}", size: 5, bold: true, rgb: "rouge", color: "", bgRgb: "", bg: "", row: 2 },
          { type: "text", text: "啦~", size: 5, bold: true, row: 2 },
          { type: "image", imgId: "bimg_money1", size: 6, imgScale: 0.4 },
          { type: "link", text: ">> 喂 点 米 <<", url: "https://platform.deepseek.com/top_up", size: 1, color: "#ffffff", rgb: "", bgRgb: "indigo", bg: "", bold: true, ul: false }
        ];
      }
      return [
        { type: "text", text: "老大，今天花销已经超过", size: 6, bold: true, row: 1 },
        { type: "text", text: "{amount}", size: 7, bold: true, row: 1, rgb: "rouge", color: "", italic: false, bgRgb: "", bg: "" },
        { type: "text", text: "啦，再花要变成穷光蛋啦...", size: 6, bold: true, row: 1 }
      ];
    }
    function usageTurnCostDefaultLines() {
      return [
        { type: "text", text: "上一轮对话消耗:", size: 8, bold: true },
        { type: "text", text: "¥ {cost}", size: 24, bold: true, color: "#e0433f" },
        { type: "today", size: 2, tpl: "今日已用 {expense_ds}", bold: false, rgb: "", color: "#ffffff", bgRgb: "indigo", bg: "" }
      ];
    }
    function usageTurnCostLines() {
      var c = usageSet && usageSet.turnCost || {};
      if (Array.isArray(c.lines) && c.lines.length) return c.lines;
      return usageTurnCostDefaultLines();
    }
    function usageCostValue(amount) {
      if (amount === null || amount === void 0 || amount === "") return "--";
      var n = Number(amount);
      return isFinite(n) ? n.toFixed(2) : "--";
    }
    function usageRemindTtlMs(cfg) {
      cfg = cfg || {};
      if (cfg.autoClose === false) return 0;
      var s = Number(cfg.ttlSec);
      if (cfg.ttlSec !== void 0 && isFinite(s) && s > 0) return Math.max(500, Math.round(s * 1e3));
      return USAGE_ALERT_TTL;
    }
    function usageRemindLinesOf(cfg, isAlert) {
      cfg = cfg || {};
      if (Array.isArray(cfg.lines) && cfg.lines.length) return cfg.lines;
      return usageRemindDefaultLines(isAlert);
    }
    function usageFillText(txt, below, amount, cost) {
      return String(txt || "").replace(/\{below\}/g, below != null ? String(below) : "").replace(/\{amount\}/g, amount != null ? String(amount) : "").replace(/\{cost\}/g, cost != null ? String(cost) : "");
    }
    function usageLineFontPx(level) {
      var n = Math.max(1, Math.min(50, Math.round(Number(level) || 7)));
      return Math.min(40, Math.round(12 + (n - 1) * 0.8));
    }
    function usageAppendLine(body2, m, below, amount) {
      try {
        m = m || {};
        if (bubbleIsImgMod(m)) {
          var imgId2 = m.imgId || "";
          if (m.type === "randimg") {
            var pool2 = [];
            var arrI = Array.isArray(m.imgs) ? m.imgs : [];
            for (var pi2 = 0; pi2 < arrI.length; pi2++) {
              var itI = arrI[pi2] || {};
              if (itI.imgId) pool2.push({ imgId: itI.imgId, w: itI.w });
            }
            if (!pool2.length) return;
            var pk2 = bubblePickLine(pool2, m._lastPickImg);
            if (pk2 === null || pk2 === void 0 || !pool2[pk2]) return;
            m._lastPickImg = pk2;
            imgId2 = pool2[pk2].imgId;
          }
          if (!imgId2) return;
          var imEl2 = document2.createElement("img");
          imEl2.alt = "";
          imEl2.draggable = false;
          imEl2.src = bridge.asset("/dsh-whale/bubble-img.png?id=" + encodeURIComponent(imgId2));
          var sc3 = Number(m.imgScale);
          imEl2.style.maxWidth = (isFinite(sc3) && sc3 > 0 ? Math.max(24, Math.round(240 * Math.max(0.1, Math.min(1, sc3)))) : 240) + "px";
          imEl2.style.maxHeight = "120px";
          imEl2.style.display = "block";
          imEl2.style.margin = "4px auto";
          body2.appendChild(imEl2);
          return;
        }
        var raw = String(m.text != null ? m.text : "");
        var txt = usageFillText(raw, below, amount);
        var div = document2.createElement("div");
        div.style.margin = "4px auto";
        div.style.maxWidth = "100%";
        if (!txt) {
          div.style.height = "8px";
          div.style.margin = "2px auto";
          body2.appendChild(div);
          return;
        }
        div.textContent = txt;
        div.style.display = "inline-block";
        div.style.textAlign = "center";
        div.style.whiteSpace = "pre-wrap";
        div.style.wordBreak = "break-word";
        div.style.fontSize = usageLineFontPx(m.size) + "px";
        div.style.lineHeight = "1.4";
        if (m.bold) div.style.fontWeight = "700";
        if (m.italic) div.style.fontStyle = "italic";
        if (m.ul) div.style.textDecoration = "underline";
        if (m.fontFamily) div.style.fontFamily = m.fontFamily;
        var bg = m.bg ? String(m.bg) : "";
        if (bg) {
          div.style.background = bg;
          div.style.borderRadius = "7px";
          div.style.padding = "1px 8px";
        }
        var col = m.color ? String(m.color) : "";
        if (col && !m.rgb && !m.bgRgb) div.style.color = col;
        body2.appendChild(div);
      } catch (err) {
      }
    }
    function checkUsageAlerts(balance, todayUsage) {
      try {
        if (!usageSet) return;
        var a = usageSet.alert;
        if (a && a.on) {
          var below = Number(a.below);
          if (isFinite(below) && typeof balance === "number" && balance > 0 && balance <= below) {
            if (!usageAlertBelowFired) {
              usageAlertBelowFired = true;
              showUsagePopup("余额预警", usageRemindLinesOf(a, true), below, null, 2, a);
            }
          } else if (typeof balance === "number" && balance > below) {
            usageAlertBelowFired = false;
          }
        }
        var b = usageSet.budget;
        if (b && b.on) {
          var amt = Number(b.amount);
          if (isFinite(amt) && amt > 0 && typeof todayUsage === "number" && todayUsage >= amt) {
            var key = usageTodayKeyStr() + ":" + String(amt);
            if (usageBudgetFiredKey !== key) {
              usageBudgetFiredKey = key;
              showUsagePopup("今日预算提醒", usageRemindLinesOf(b, false), null, amt, 1, b);
            }
          }
        }
      } catch (err) {
      }
    }
    function runApiModelAlerts() {
      try {
        if (!usageSet) return;
        var ms = usageSet.models || {};
        for (var i = 0; i < apiModels.length; i++) {
          var m = apiModels[i];
          if (!m || !m.id || m.id === "deepseek") continue;
          var st = ms[m.id];
          if (!st) continue;
          var a = st.alert;
          if (a && a.on) {
            var below = Number(a.below);
            var bal = Number(m.balance);
            var fk = m.id + ":" + below;
            if (isFinite(below) && isFinite(bal) && bal > 0 && bal <= below) {
              if (!apiAlertFired[fk]) {
                apiAlertFired[fk] = true;
                showUsagePopup(m.name + " 余额预警", usageRemindLinesOf(a, true), below, null, 2, a);
              }
            } else if (isFinite(bal) && bal > below) {
              apiAlertFired[fk] = false;
            }
          }
          var b = st.budget;
          if (b && b.on) {
            var amt = Number(b.amount);
            var used = Number(m.todayUsage);
            var usedCmp = used;
            if (isFinite(used)) {
              var curToday = apiTodayCur(m);
              var curBudget = String(m.currency || "CNY").toUpperCase();
              var conv = apiConvertMoney(used, curToday, curBudget, m.price && m.price.rate);
              if (conv === null && curToday !== curBudget) {
                if (!apiBudgetUnitWarned[m.id]) {
                  apiBudgetUnitWarned[m.id] = true;
                  try {
                    console.warn("[whale] 今日预算未比较：" + m.name + " 的今日已用为 " + curToday + "，预算阈值按 " + curBudget + " 填写，且未配置汇率（模型面板 → 单价 → 汇率）");
                  } catch (err) {
                  }
                }
                usedCmp = null;
              } else if (conv !== null) {
                usedCmp = conv;
              }
            }
            var bk = m.id + ":" + usageTodayKeyStr() + ":" + amt;
            if (isFinite(amt) && amt > 0 && isFinite(usedCmp) && usedCmp >= amt) {
              if (!apiBudgetFired[bk]) {
                apiBudgetFired[bk] = true;
                showUsagePopup(m.name + " 今日预算提醒", usageRemindLinesOf(b, false), null, amt, 1, b);
              }
            }
          }
        }
      } catch (err) {
      }
    }
    function usageAlertModsResolved(mods, below, amount, cost) {
      var out = [];
      try {
        for (var i = 0; i < mods.length; i++) {
          var m0 = mods[i] || {};
          var cp = JSON.parse(JSON.stringify(m0));
          var raw = String(m0.text != null ? m0.text : "");
          cp.text = raw.length ? usageFillText(raw, below, amount, cost) : raw;
          out.push(cp);
        }
      } catch (err) {
      }
      return out;
    }
    function showUsagePopup(title, content, below, amount, rank, cfg) {
      try {
        var mods = [];
        if (typeof content === "string") mods = [{ type: "text", text: content, size: 7, bold: true }];
        else if (Array.isArray(content)) mods = content;
        if (mods.length && whaleSysPush({ kind: "alert", mods: usageAlertModsResolved(mods, below, amount), rank: rank === 1 || rank === 2 ? rank : 2, ttlMs: usageRemindTtlMs(cfg) })) return;
        usagePopupCard(title, content, below, amount);
      } catch (err) {
      }
    }
    function usagePopupCard(title, content, below, amount) {
      try {
        var mask = document2.createElement("div");
        mask.className = "dshwv-usage-mask";
        var card = document2.createElement("div");
        card.className = "dshwv-usage-card";
        card.style.width = "min(380px,90vw)";
        var t = document2.createElement("div");
        t.className = "dshwv-usage-wintitle";
        t.textContent = title || "提示";
        card.appendChild(t);
        var body2 = document2.createElement("div");
        body2.className = "dshwv-usage-windowbody";
        body2.style.textAlign = "center";
        if (typeof content === "string") {
          body2.textContent = usageFillText(content, below, amount);
          body2.style.whiteSpace = "pre-wrap";
        } else if (Array.isArray(content)) {
          for (var i = 0; i < content.length; i++) usageAppendLine(body2, content[i], below, amount);
        } else {
          body2.textContent = "";
        }
        card.appendChild(body2);
        var btns = document2.createElement("div");
        btns.className = "dshwv-bubbtns";
        btns.style.justifyContent = "center";
        var ok = document2.createElement("button");
        ok.type = "button";
        ok.className = "dshwv-bubbtn dshwv-bubbtn-ok";
        ok.textContent = "知道了";
        ok.addEventListener("click", function() {
          try {
            document2.body.removeChild(mask);
          } catch (err) {
          }
        });
        btns.appendChild(ok);
        card.appendChild(btns);
        mask.appendChild(card);
        mask.addEventListener("click", function(e) {
          if (e.target === mask) {
            try {
              document2.body.removeChild(mask);
            } catch (err) {
            }
          }
        });
        document2.body.appendChild(mask);
      } catch (err) {
      }
    }
    var USAGE_PALETTE = ["#203170", "#e0433f", "#2fa24c", "#b060c8", "#e89a2e", "#3aa6c8", "#d06a8a", "#7a8b2f", "#6a6ad0", "#c84a8a"];
    function usageAggModels(daysArr) {
      var map = {};
      (daysArr || []).forEach(function(day) {
        ;
        (day.models || []).forEach(function(mm) {
          var k = mm && mm.model ? mm.model : "未知";
          map[k] = (map[k] || 0) + (Number(mm.cost) || 0);
        });
      });
      return Object.keys(map).map(function(k) {
        return { model: k, cost: map[k] };
      }).sort(function(a, b) {
        return b.cost - a.cost;
      });
    }
    function usageModelLabel(m) {
      var raw = String(m || "");
      if (!raw) return "未知";
      var k = raw.toLowerCase();
      if (k === "deepseek-flash") return "DeepSeek-V4.1-Flash (deepseek-flash)";
      if (k === "deepseek-v4-flash" || k === "deepseek-v4-flash-vision-exp") return raw + "(旧名·同 V4.1 Flash)";
      return raw;
    }
    function usageRatioRows(body2, secTitle, agg, totalLabel) {
      body2.appendChild(uSectionTitle(secTitle, totalLabel));
      if (!agg.length) {
        var no = document2.createElement("div");
        no.className = "dshwv-usage-hint";
        no.textContent = "暂无模型明细";
        body2.appendChild(no);
        return;
      }
      var sum = agg.reduce(function(a, x) {
        return a + x.cost;
      }, 0) || 1;
      var costEls = [];
      agg.forEach(function(row, i) {
        var wr = document2.createElement("div");
        wr.className = "dshwv-usage-ratio";
        var lab = document2.createElement("span");
        lab.className = "dshwv-usage-ratio-label";
        lab.textContent = usageModelLabel(row.model);
        lab.title = String(row.model || "未知");
        wr.appendChild(lab);
        var track = document2.createElement("div");
        track.className = "dshwv-usage-ratio-track";
        var fill = document2.createElement("div");
        fill.className = "dshwv-usage-ratio-fill";
        fill.style.width = Math.round(row.cost / sum * 100) + "%";
        fill.style.background = USAGE_PALETTE[i % USAGE_PALETTE.length];
        track.appendChild(fill);
        wr.appendChild(track);
        var pct = document2.createElement("span");
        pct.className = "dshwv-usage-ratio-pct";
        pct.textContent = Math.round(row.cost / sum * 100) + "%";
        wr.appendChild(pct);
        var cost = document2.createElement("span");
        cost.className = "dshwv-usage-ratio-cost";
        cost.textContent = usageMoney(row.cost);
        cost.title = cost.textContent;
        wr.appendChild(cost);
        costEls.push(cost);
        body2.appendChild(wr);
      });
      try {
        var parW = costEls[0] && costEls[0].parentNode ? costEls[0].parentNode.clientWidth : 420;
        var capCost = Math.max(50, Math.floor(parW - 96 - 42 - 32));
        var maxCost = 40;
        for (var c1 = 0; c1 < costEls.length; c1++) {
          var cw1 = costEls[c1].scrollWidth || 40;
          if (cw1 > maxCost) maxCost = cw1;
        }
        var useCost = Math.min(maxCost, capCost);
        for (var c2 = 0; c2 < costEls.length; c2++) {
          costEls[c2].style.width = useCost + "px";
          costEls[c2].style.textAlign = "right";
          costEls[c2].style.overflow = "hidden";
          costEls[c2].style.textOverflow = "ellipsis";
        }
      } catch (err) {
      }
    }
    function usageDrawBarChart(body2, secTitle, days, opts) {
      opts = opts || {};
      var todayKey = String(opts.today || "");
      var onPick = opts.onPick || null;
      body2.appendChild(uSectionTitle(secTitle, ""));
      if (!days || !days.length) {
        var no = document2.createElement("div");
        no.className = "dshwv-usage-hint";
        no.textContent = "暂无每日数据";
        body2.appendChild(no);
        return;
      }
      var wrap = document2.createElement("div");
      wrap.className = "dshwv-usage-chartwrap";
      var canvas = document2.createElement("canvas");
      wrap.appendChild(canvas);
      var tip = document2.createElement("div");
      tip.className = "dshwv-usage-tip";
      tip.style.display = "none";
      wrap.appendChild(tip);
      body2.appendChild(wrap);
      var bars = [];
      function paint(hoverIdx) {
        var cw = Math.max(120, wrap && (wrap.clientWidth || (wrap.getBoundingClientRect ? wrap.getBoundingClientRect().width : 0)) || canvas.clientWidth || 520);
        var ch = 150;
        var dpr = window2.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.round(cw * dpr));
        canvas.height = Math.max(1, Math.round(ch * dpr));
        canvas.style.width = cw + "px";
        canvas.style.height = ch + "px";
        var g = canvas.getContext("2d");
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, cw, ch);
        var padL = 42, padR = 10, padT = 10, padB = 22;
        var iw = cw - padL - padR;
        var ih = ch - padT - padB;
        var max = 1;
        for (var i = 0; i < days.length; i++) max = Math.max(max, Number(days[i].total) || 0);
        var step = iw / days.length;
        var bw = Math.max(3, Math.min(36, step * 0.62));
        bars = [];
        for (var k = 0; k < days.length; k++) {
          var val = Number(days[k].total) || 0;
          var h = val > 0 ? Math.max(2, val / max * ih) : 0;
          var x = padL + step * k + (step - bw) / 2;
          var y = padT + ih - h;
          var kToday = !!(todayKey && String(days[k].date || "") === todayKey);
          g.fillStyle = k === hoverIdx ? "#e0433f" : kToday ? "#2fa44c" : "#203170";
          if (k === hoverIdx) {
            g.globalAlpha = 0.9;
          }
          if (h > 0) {
            g.fillRect(x, y, bw, h);
          } else {
            g.fillStyle = "rgba(32,49,112,.25)";
            g.fillRect(x, padT + ih - 3, bw, 3);
          }
          g.globalAlpha = 1;
          bars.push({ x, w: bw, day: days[k] });
          if (days.length <= 16 || k % Math.ceil(days.length / 16) === 0) {
            g.fillStyle = "#9fb0d9";
            g.font = "10px sans-serif";
            g.textAlign = "center";
            var dl = String(days[k].date || "").split("-");
            var lab = dl.length === 3 ? dl[1] + "-" + dl[2] : days[k].date;
            g.fillText(lab, x + bw / 2, ch - 8);
          }
        }
        g.fillStyle = "#9fb0d9";
        g.font = "10px sans-serif";
        g.textAlign = "right";
        g.fillText(usageMoney(max), padL - 4, padT + 8);
        g.fillText(usageMoney(max / 2), padL - 4, padT + ih / 2 + 3);
        g.fillText("¥0", padL - 4, padT + ih + 4);
      }
      function move(ev) {
        var r = canvas.getBoundingClientRect();
        var x = ev.clientX - r.left;
        var hover = -1;
        for (var i = 0; i < bars.length; i++) {
          if (x >= bars[i].x && x <= bars[i].x + bars[i].w) {
            hover = i;
            break;
          }
        }
        paint(hover);
        if (hover >= 0) {
          tip.style.display = "block";
          tip.textContent = bars[hover].day.date + "  " + usageMoney(bars[hover].day.total);
          var wr = wrap.getBoundingClientRect();
          var tx = ev.clientX - wr.left + 10;
          if (tx + 130 > wr.width) tx = ev.clientX - wr.left - 140;
          var ty = ev.clientY - wr.top + 12;
          tip.style.left = Math.max(0, tx) + "px";
          tip.style.top = Math.max(0, ty) + "px";
        } else {
          tip.style.display = "none";
        }
      }
      canvas.addEventListener("mousemove", move);
      canvas.addEventListener("mouseleave", function() {
        tip.style.display = "none";
        paint(-1);
      });
      if (onPick) {
        canvas.addEventListener("click", function(ev) {
          try {
            var rc = canvas.getBoundingClientRect();
            var cx = ev.clientX - rc.left;
            for (var bi = 0; bi < bars.length; bi++) {
              if (cx >= bars[bi].x && cx <= bars[bi].x + bars[bi].w) {
                onPick(bars[bi].day.date);
                break;
              }
            }
          } catch (err) {
          }
        });
      }
      paint(-1);
      try {
        setTimeout2(function() {
          try {
            paint(-1);
          } catch (err) {
          }
        }, 420);
      } catch (err) {
      }
    }
    function usageSlide(el, open) {
      try {
        if (!el) return;
        if (el.__dshwSlide) clearTimeout(el.__dshwSlide);
        el.style.transition = "max-height .24s ease, opacity .16s ease";
        el.style.overflow = "hidden";
        if (open) {
          el.style.display = "block";
          var h0 = el.scrollHeight;
          if (h0 <= 0) h0 = 100;
          el.style.opacity = "0";
          el.style.maxHeight = "0px";
          void el.offsetHeight;
          el.style.opacity = "1";
          el.style.maxHeight = h0 + "px";
          el.__dshwSlide = setTimeout2(function() {
            el.style.maxHeight = "";
            el.style.overflow = "";
            el.style.transition = "";
            el.__dshwSlide = null;
          }, 260);
        } else {
          var ch = el.scrollHeight;
          if (ch <= 0) {
            el.style.display = "none";
            el.style.transition = "";
            return;
          }
          el.style.maxHeight = ch + "px";
          void el.offsetHeight;
          el.style.opacity = "0";
          el.style.maxHeight = "0px";
          el.__dshwSlide = setTimeout2(function() {
            el.style.display = "none";
            el.style.maxHeight = "";
            el.style.opacity = "";
            el.style.overflow = "";
            el.style.transition = "";
            el.__dshwSlide = null;
          }, 250);
        }
      } catch (err) {
        try {
          el.style.display = open ? "block" : "none";
        } catch (err2) {
        }
      }
    }
    function usageCollapseBlock(parent, label, openDefault, build) {
      var box = document2.createElement("div");
      var hd = document2.createElement("button");
      hd.type = "button";
      hd.className = "dshwv-usage-collapse";
      var inner = document2.createElement("div");
      inner.className = "dshwv-usage-collapse-body";
      inner.style.display = "none";
      var opened = false;
      var st = false;
      function ensureBuild() {
        if (!opened) {
          opened = true;
          try {
            build(inner);
          } catch (err) {
          }
        }
      }
      function openNow() {
        st = true;
        inner.style.display = "block";
        inner.style.maxHeight = "0px";
        inner.style.overflow = "hidden";
        ensureBuild();
        usageSlide(inner, true);
        paint();
      }
      function closeNow() {
        st = false;
        usageSlide(inner, false);
        paint();
      }
      function paint() {
        hd.innerHTML = "";
        var l = document2.createElement("span");
        l.textContent = label;
        hd.appendChild(l);
        var ch = document2.createElement("span");
        ch.className = "dshwv-usage-chev";
        ch.textContent = st ? "▾" : "▸";
        hd.appendChild(ch);
      }
      hd.addEventListener("click", function() {
        if (st) closeNow();
        else openNow();
      });
      box.__open = openNow;
      box.__close = closeNow;
      paint();
      box.appendChild(hd);
      box.appendChild(inner);
      parent.appendChild(box);
      if (openDefault) openNow();
      return box;
    }
    function usageEvTime(ev) {
      try {
        return new Date(Number(ev.ts) + 288e5).toISOString().slice(11, 16);
      } catch (_) {
        return "";
      }
    }
    function fillUsageRecordsWindow(d) {
      var card = usageMoreCard;
      card.innerHTML = "";
      var title = document2.createElement("div");
      title.className = "dshwv-usage-wintitle";
      title.textContent = "消费记录(全部)";
      card.appendChild(title);
      var closeBtn = document2.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "dshwv-usage-close";
      closeBtn.textContent = "×";
      closeBtn.title = "关闭";
      closeBtn.addEventListener("click", closeUsageRecordsWindow);
      card.appendChild(closeBtn);
      var body2 = document2.createElement("div");
      body2.className = "dshwv-usage-windowbody";
      card.appendChild(body2);
      if (!d || !d.ok) {
        body2.textContent = "加载失败";
        return;
      }
      var allDays = (d.all && d.all.days || []).slice().sort(function(a, b) {
        return a.date < b.date ? -1 : 1;
      });
      var evAll = (d.all && d.all.events || []).slice();
      var sumAll = 0;
      var maxDay = null;
      for (var s1 = 0; s1 < allDays.length; s1++) {
        sumAll += Number(allDays[s1].total) || 0;
        if (!maxDay || Number(allDays[s1].total) > Number(maxDay.total)) maxDay = allDays[s1];
      }
      var ov = document2.createElement("div");
      ov.className = "dshwv-usage-oview";
      var ovL = document2.createElement("div");
      ovL.textContent = "全部消费";
      ov.appendChild(ovL);
      var ovN = document2.createElement("div");
      ovN.className = "dshwv-usage-oview-num";
      ovN.textContent = usageMoney(sumAll);
      ov.appendChild(ovN);
      var ovS = document2.createElement("div");
      ovS.className = "dshwv-usage-hint";
      ovS.textContent = "共 " + evAll.length + " 笔明细" + (maxDay ? " · 峰值 " + maxDay.date + " " + usageMoney(maxDay.total) : "");
      ov.appendChild(ovS);
      body2.appendChild(ov);
      var detailBox = null;
      usageCollapseBlock(body2, "统计图表(近30天 / 模型占比)", false, function(inner) {
        usageDrawBarChart(inner, "近30天消费(绿柱=今天,点柱定位到当日)", allDays.slice(-30), {
          today: usageTodayKeyStr(),
          onPick: function(date) {
            try {
              if (!detailBox) return;
              detailBox.__open();
              setTimeout2(function() {
                var tr = detailBox.querySelector('[data-usage-day="' + String(date) + '"]');
                if (tr) {
                  tr.scrollIntoView({ block: "center", behavior: "smooth" });
                  tr.style.boxShadow = "inset 0 0 0 2px rgba(32,49,112,.55)";
                  setTimeout2(function() {
                    tr.style.boxShadow = "";
                  }, 1400);
                }
              }, 120);
            } catch (err) {
            }
          }
        });
        var todayAgg = usageAggModels(d.today && d.today.models ? [{ models: d.today.models }] : []);
        usageRatioRows(inner, "今日模型占比", todayAgg, usageMoney(d.today && d.today.total || 0));
        var sevenAgg = usageAggModels(d.days7 || []);
        usageRatioRows(inner, "近7天模型占比", sevenAgg, usageMoney(d.total7 || 0));
      });
      detailBox = usageCollapseBlock(body2, "每日与逐条明细", false, function(inner) {
        var search = document2.createElement("input");
        search.type = "text";
        search.className = "dshwv-colnat";
        search.style.width = "100%";
        search.style.margin = "2px 0 6px";
        search.placeholder = "搜索:日期(如 07-21)或模型名,过滤逐条明细…";
        inner.appendChild(search);
        var evMap = {};
        evAll.forEach(function(ev) {
          var day = ev.day || "";
          if (!day) {
            try {
              var dd2 = new Date(ev.ts);
              day = dd2.getFullYear() + "-" + String(dd2.getMonth() + 1).padStart(2, "0") + "-" + String(dd2.getDate()).padStart(2, "0");
            } catch (err) {
            }
          }
          if (!day) return;
          (evMap[day] = evMap[day] || []).push(ev);
        });
        var dayTot = {};
        allDays.forEach(function(dx) {
          dayTot[dx.date] = Number(dx.total) || 0;
        });
        var todayKeyStr2 = usageTodayKeyStr();
        function dayGroup(day, evs) {
          var row = document2.createElement("div");
          row.className = "dshwv-usage-row";
          row.style.cursor = "pointer";
          row.setAttribute("data-usage-day", day);
          var name = document2.createElement("span");
          name.style.flex = "1 1 auto";
          name.style.minWidth = "0";
          name.style.overflow = "hidden";
          name.style.textOverflow = "ellipsis";
          name.style.whiteSpace = "nowrap";
          name.textContent = day + (evs.length ? " (" + evs.length + ")" : "");
          row.appendChild(name);
          var c = document2.createElement("span");
          c.style.flex = "0 0 auto";
          var dayV = dayTot[day];
          if ((dayV === void 0 || dayV === 0) && day === todayKeyStr2 && d.today && isFinite(Number(d.today.total))) dayV = Number(d.today.total);
          if (dayV === void 0 || dayV === null) dayV = evs.reduce(function(a, x) {
            return a + (Number(x.cost) || 0);
          }, 0);
          c.textContent = usageMoney(dayV);
          row.appendChild(c);
          var chev = document2.createElement("span");
          chev.className = "dshwv-usage-chev";
          chev.textContent = "▸";
          row.appendChild(chev);
          var detail = document2.createElement("div");
          detail.className = "dshwv-usage-daydetail";
          detail.style.display = "none";
          var built = false;
          row.addEventListener("click", function(e) {
            var on = detail.style.display !== "block";
            if (on) {
              if (!built) {
                built = true;
                var lim = Math.min(evs.length, 100);
                for (var i = 0; i < lim; i++) {
                  var ev = evs[i];
                  var r2 = document2.createElement("div");
                  r2.className = "dshwv-usage-row";
                  r2.style.padding = "2px 0 2px 6px";
                  var n2 = document2.createElement("span");
                  n2.style.flex = "1 1 auto";
                  n2.style.minWidth = "0";
                  n2.style.overflow = "hidden";
                  n2.style.textOverflow = "ellipsis";
                  n2.style.whiteSpace = "nowrap";
                  n2.textContent = (usageEvTime(ev) ? usageEvTime(ev) + "  " : "") + usageModelLabel(ev.model);
                  n2.title = (usageEvTime(ev) ? usageEvTime(ev) + "  " : "") + String(ev.model || "未知");
                  r2.appendChild(n2);
                  var c2 = document2.createElement("span");
                  c2.style.flex = "0 0 auto";
                  c2.textContent = usageMoney(ev.cost);
                  r2.appendChild(c2);
                  detail.appendChild(r2);
                }
                if (evs.length > lim) {
                  var moreTxt = document2.createElement("div");
                  moreTxt.className = "dshwv-usage-hint";
                  moreTxt.textContent = "… 该日共 " + evs.length + " 条,仅显示前 " + lim + " 条";
                  detail.appendChild(moreTxt);
                }
                if (!evs.length) {
                  var nd = document2.createElement("div");
                  nd.className = "dshwv-usage-hint";
                  nd.textContent = "该日仅总额(启用模型明细后展示逐条)";
                  detail.appendChild(nd);
                }
              }
              chev.textContent = "▾";
            } else chev.textContent = "▸";
            usageSlide(detail, on);
          });
          row.appendChild(detail);
          return row;
        }
        var listWrap = document2.createElement("div");
        inner.appendChild(listWrap);
        function renderGroups(q) {
          var ql = String(q || "").trim().toLowerCase();
          var groups = [];
          for (var gi = 0; gi < allDays.length; gi++) {
            var day0 = allDays[gi].date;
            var evs = evMap[day0] || [];
            var hit = !ql || day0.toLowerCase().indexOf(ql) >= 0;
            if (!hit) {
              for (var ei = 0; ei < evs.length && !hit; ei++) {
                var mm0 = String(evs[ei].model || "");
                if (mm0.toLowerCase().indexOf(ql) >= 0 || usageModelLabel(mm0).toLowerCase().indexOf(ql) >= 0) hit = true;
              }
            }
            if (hit || day0 === usageTodayKeyStr() && !ql) groups.push(day0);
          }
          groups.sort(function(a, b) {
            return a < b ? 1 : a > b ? -1 : 0;
          });
          var step = 12;
          var shown2 = step;
          listWrap.innerHTML = "";
          if (!groups.length) {
            var noR = document2.createElement("div");
            noR.className = "dshwv-usage-hint";
            noR.textContent = ql ? "没有匹配的记录" : "暂无每日记录";
            listWrap.appendChild(noR);
            return;
          }
          function paintDays() {
            listWrap.innerHTML = "";
            var upto = Math.min(shown2, groups.length);
            for (var k = 0; k < upto; k++) {
              var dayK = groups[k];
              listWrap.appendChild(dayGroup(dayK, evMap[dayK] || []));
            }
            if (shown2 < groups.length) {
              var mb = document2.createElement("button");
              mb.type = "button";
              mb.className = "dshwv-usage-more";
              mb.textContent = "加载更早记录(还剩 " + (groups.length - shown2) + " 天)";
              mb.addEventListener("click", function() {
                shown2 += step;
                paintDays();
              });
              listWrap.appendChild(mb);
            }
          }
          paintDays();
        }
        search.addEventListener("input", function() {
          renderGroups(search.value);
        });
        renderGroups("");
      });
    }
    document2.body.appendChild(rolePanel);
    var SNAP_PREVIEW = 190;
    var snapPvW = SNAP_PREVIEW;
    var snapPvH = SNAP_PREVIEW;
    var snapEdit = null;
    var snapLineDrag = null;
    var snapMask = null;
    var snapCard = null;
    var snapRadio = {};
    var snapNum = {};
    var snapNumUnit = {};
    var snapPreview = null;
    function unitOf(mode) {
      return mode === "px" ? "px" : "%";
    }
    function ensureSnapPx(cfg) {
      try {
        if (!(cfg.px.F >= 0)) {
          cfg.px.L = 80;
          cfg.px.T = 0;
          cfg.px.R = 80;
          cfg.px.B = 80;
          cfg.px.F = Math.round(Math.max(1, viewport().w) / 2);
        }
      } catch (err) {
      }
    }
    function snapSetVal(key, val) {
      try {
        if (!snapEdit || snapEdit.mode === "off") return;
        var m = snapEdit.mode;
        var vp = viewport();
        var set = m === "px" ? snapEdit.px : snapEdit.ratio;
        var clamped = clampSnapKey(m, key, val, vp);
        set[key] = Math.max(0, Math.round(clamped));
      } catch (err) {
      }
    }
    function snapPvSize() {
      var vp = viewport();
      var maxW = 210, maxH = 190, minSide = 56;
      var ar = Math.max(0.05, vp.w / vp.h);
      var w, h;
      if (ar * maxH <= maxW) {
        h = maxH;
        w = maxH * ar;
      } else {
        w = maxW;
        h = maxW / ar;
      }
      w = Math.round(Math.max(minSide, Math.min(maxW, w)));
      h = Math.round(Math.max(minSide, Math.min(maxH, h)));
      return { w, h };
    }
    function snapFrac() {
      var vp = viewport();
      var f = { Lf: 0, Tf: 0, Rf: 1, Bf: 1, Ff: 0.5 };
      try {
        var m = snapEdit.mode;
        var w = Math.max(1, vp.w), h = Math.max(1, vp.h);
        if (m === "ratio") {
          f.Lf = Math.min(100, Math.max(0, snapEdit.ratio.L)) / 100;
          f.Tf = Math.min(100, Math.max(0, snapEdit.ratio.T)) / 100;
          f.Rf = 1 - Math.min(100, Math.max(0, snapEdit.ratio.R)) / 100;
          f.Bf = 1 - Math.min(100, Math.max(0, snapEdit.ratio.B)) / 100;
          f.Ff = Math.min(100, Math.max(0, snapEdit.ratio.F)) / 100;
        } else if (m === "px") {
          f.Lf = Math.min(w, Math.max(0, snapEdit.px.L)) / w;
          f.Tf = Math.min(h, Math.max(0, snapEdit.px.T)) / h;
          f.Rf = 1 - Math.min(w, Math.max(0, snapEdit.px.R)) / w;
          f.Bf = 1 - Math.min(h, Math.max(0, snapEdit.px.B)) / h;
          f.Ff = Math.min(w, Math.max(0, snapEdit.px.F)) / w;
        }
      } catch (err) {
      }
      return f;
    }
    function renderSnapPreview() {
      try {
        if (!snapEdit || !snapPreview) return;
        snapPreview.innerHTML = "";
        var W = snapPvW;
        var H = snapPvH;
        if (snapEdit.mode === "off") {
          var off = document2.createElement("div");
          off.className = "dshwv-snapoff";
          off.textContent = "已关闭：无吸附、无翻转，自由摆放";
          snapPreview.appendChild(off);
          return;
        }
        var f = snapFrac();
        var Lx = Math.max(0, Math.min(W, f.Lf * W));
        var Rx = Math.max(0, Math.min(W, f.Rf * W));
        var Ty = Math.max(0, Math.min(H, f.Tf * H));
        var By = Math.max(0, Math.min(H, f.Bf * H));
        var Fx = Math.max(0, Math.min(W, f.Ff * W));
        var flipBg = document2.createElement("div");
        flipBg.className = "dshwv-snapflip";
        flipBg.style.width = Fx + "px";
        flipBg.style.height = H + "px";
        snapPreview.appendChild(flipBg);
        var zoneDefs = [
          { l: 0, t: 0, w: Lx, h: H, bg: "rgba(59,130,246,.20)" },
          { l: Rx, t: 0, w: Math.max(0, W - Rx), h: H, bg: "rgba(245,158,11,.18)" },
          { l: 0, t: 0, w: W, h: Ty, bg: "rgba(16,185,129,.16)" },
          { l: 0, t: By, w: W, h: Math.max(0, H - By), bg: "rgba(239,68,68,.14)" }
        ];
        var i, zd;
        for (i = 0; i < zoneDefs.length; i++) {
          zd = zoneDefs[i];
          if (zd.w < 1 || zd.h < 1) continue;
          var z = document2.createElement("div");
          z.className = "dshwv-snapzone";
          z.style.left = zd.l + "px";
          z.style.top = zd.t + "px";
          z.style.width = zd.w + "px";
          z.style.height = zd.h + "px";
          z.style.background = zd.bg;
          snapPreview.appendChild(z);
        }
        var lineDefs = [
          { key: "L", x: Lx, horizontal: false, flip: false },
          { key: "R", x: Rx, horizontal: false, flip: false },
          { key: "T", y: Ty, horizontal: true, flip: false },
          { key: "B", y: By, horizontal: true, flip: false },
          { key: "F", x: Fx, horizontal: false, flip: true }
        ];
        for (i = 0; i < lineDefs.length; i++) {
          var ld = lineDefs[i];
          var p = ld.horizontal ? Math.max(0, Math.min(H, ld.y)) : Math.max(0, Math.min(W, ld.x));
          var ln = document2.createElement("div");
          ln.className = "dshwv-snapline" + (ld.flip ? " dshwv-snapline-flip" : "");
          if (ld.horizontal) {
            ln.style.left = "0px";
            ln.style.top = p + "px";
            ln.style.width = W + "px";
            ln.style.height = "2px";
          } else {
            ln.style.left = p + "px";
            ln.style.top = "0px";
            ln.style.width = "2px";
            ln.style.height = H + "px";
          }
          snapPreview.appendChild(ln);
          var hd = document2.createElement("div");
          hd.className = "dshwv-snaphandle" + (ld.flip ? " dshwv-snaphandle-flip" : "") + (ld.horizontal ? " dshwv-snaphandle-h" : "");
          hd.style.left = (ld.horizontal ? W / 2 : p) + "px";
          hd.style.top = (ld.horizontal ? p : H / 2) + "px";
          hd.title = ld.key === "F" ? "翻转线（左侧为翻转区）" : "吸附区边界线（可拖动）";
          hd.addEventListener("pointerdown", /* @__PURE__ */ (function(key, horizontal) {
            return function(e) {
              startSnapLineDrag(e, key, horizontal);
            };
          })(ld.key, ld.horizontal));
          snapPreview.appendChild(hd);
        }
      } catch (err) {
      }
    }
    function syncSnapInputs() {
      try {
        if (!snapEdit) return;
        var m = snapEdit.mode;
        var set = m === "px" ? snapEdit.px : snapEdit.ratio;
        var keys = ["L", "T", "R", "B", "F"];
        var unit = unitOf(m);
        var i;
        for (i = 0; i < keys.length; i++) {
          var k = keys[i];
          snapNum[k].value = String(Math.round(set[k]));
          snapNum[k].disabled = m === "off";
          snapNumUnit[k].textContent = unit;
        }
      } catch (err) {
      }
    }
    function renderSnapModes() {
      try {
        if (snapEdit && snapRadio[snapEdit.mode]) snapRadio[snapEdit.mode].checked = true;
      } catch (err) {
      }
    }
    function startSnapLineDrag(e, key, horizontal) {
      try {
        e.preventDefault();
        try {
          e.stopPropagation();
        } catch (err) {
        }
        if (!snapEdit || snapEdit.mode === "off") return;
        var vp = viewport();
        var axis = horizontal ? vp.h : vp.w;
        var domain = snapEdit.mode === "px" ? axis : 100;
        var set = snapEdit.mode === "px" ? snapEdit.px : snapEdit.ratio;
        snapLineDrag = {
          key,
          horizontal,
          sx: e.clientX,
          sy: e.clientY,
          factor: domain / (horizontal ? Math.max(1, snapPvH) : Math.max(1, snapPvW)),
          orig: set[key]
        };
        document2.addEventListener("pointermove", onSnapLineMove, true);
        document2.addEventListener("pointerup", onSnapLineUp, true);
        document2.addEventListener("pointercancel", onSnapLineUp, true);
      } catch (err) {
      }
    }
    function onSnapLineMove(e) {
      try {
        if (!snapLineDrag) return;
        var d = snapLineDrag;
        var delta = d.horizontal ? e.clientY - d.sy : e.clientX - d.sx;
        var val;
        if (d.key === "R" || d.key === "B") val = d.orig - delta * d.factor;
        else val = d.orig + delta * d.factor;
        snapSetVal(d.key, val);
        renderSnapPreview();
        syncSnapInputs();
      } catch (err) {
      }
    }
    function onSnapLineUp() {
      try {
        snapLineDrag = null;
        document2.removeEventListener("pointermove", onSnapLineMove, true);
        document2.removeEventListener("pointerup", onSnapLineUp, true);
        document2.removeEventListener("pointercancel", onSnapLineUp, true);
      } catch (err) {
      }
    }
    function onSnapNumInput(key) {
      try {
        var v = Number(snapNum[key].value);
        if (!isFinite(v)) return;
        snapSetVal(key, v);
        renderSnapPreview();
        syncSnapInputs();
      } catch (err) {
      }
    }
    function resetSnapEdit() {
      try {
        if (!snapEdit) return;
        var m = snapEdit.mode;
        if (m === "ratio") {
          snapEdit.ratio = { L: 10, T: 0, R: 10, B: 15, F: 50 };
        } else if (m === "px") {
          snapEdit.px = { L: 80, T: 0, R: 80, B: 80, F: Math.round(Math.max(1, viewport().w) / 2) };
        }
        renderSnapModes();
        renderSnapPreview();
        syncSnapInputs();
      } catch (err) {
      }
    }
    function openSnapModal() {
      try {
        closeRolePanel();
        closeAudioGroupPanel();
        var sz = snapPvSize();
        snapPvW = sz.w;
        snapPvH = sz.h;
        if (snapPreview) {
          snapPreview.style.width = snapPvW + "px";
          snapPreview.style.height = snapPvH + "px";
        }
        if (snapGrid) {
          snapGrid.style.gridTemplateColumns = "72px " + snapPvW + "px 72px";
          snapGrid.style.gridTemplateRows = "26px " + snapPvH + "px 26px";
        }
        snapEdit = cloneSnap(snapConfig);
        ensureSnapPx(snapEdit);
        renderSnapModes();
        renderSnapPreview();
        syncSnapInputs();
        snapMask.style.display = "flex";
      } catch (err) {
      }
    }
    function closeSnapModal(apply) {
      try {
        if (apply && snapEdit) {
          snapConfig = cloneSnap(snapEdit);
          fixSnapConfig(snapConfig);
          saveSnapConfig();
          applySnapConfigNow();
        }
        snapEdit = null;
        snapMask.style.display = "none";
      } catch (err) {
      }
    }
    function applySnapConfigNow() {
      try {
        if (snapConfig.mode === "off") {
          state.flip = false;
          express();
          return;
        }
        snapCheck();
      } catch (err) {
      }
    }
    snapMask = document2.createElement("div");
    snapMask.className = "dshwv-snapmask";
    snapMask.style.display = "none";
    snapCard = document2.createElement("div");
    snapCard.className = "dshwv-snapwin";
    var snapTitle = document2.createElement("div");
    snapTitle.className = "dshwv-snaptitle";
    snapTitle.textContent = "吸附与翻转设置";
    snapCard.appendChild(snapTitle);
    var snapModes = document2.createElement("div");
    snapModes.className = "dshwv-snapmodes";
    var snapModeDefs = [
      ["ratio", "比例吸附"],
      ["px", "绝对吸附"],
      ["off", "关闭"]
    ];
    var mi;
    for (mi = 0; mi < snapModeDefs.length; mi++) {
      (function(k, label) {
        var lab = document2.createElement("label");
        var inp = document2.createElement("input");
        inp.type = "radio";
        inp.name = "dshwv-snapmode";
        inp.value = k;
        inp.addEventListener("change", function() {
          if (!snapEdit) return;
          snapEdit.mode = k;
          if (k === "px") ensureSnapPx(snapEdit);
          renderSnapModes();
          renderSnapPreview();
          syncSnapInputs();
        });
        var tx = document2.createElement("span");
        tx.textContent = label;
        lab.appendChild(inp);
        lab.appendChild(tx);
        snapModes.appendChild(lab);
        snapRadio[k] = inp;
      })(snapModeDefs[mi][0], snapModeDefs[mi][1]);
    }
    snapCard.appendChild(snapModes);
    var snapGrid = document2.createElement("div");
    snapGrid.className = "dshwv-snapgrid";
    function snapMakeNum(key, labelText) {
      var cell = document2.createElement("span");
      cell.className = "dshwv-snapcell";
      var inp = document2.createElement("input");
      inp.type = "number";
      inp.min = "0";
      inp.step = "1";
      inp.className = "dshwv-snapnum";
      inp.title = labelText;
      inp.addEventListener("input", function() {
        onSnapNumInput(key);
      });
      inp.addEventListener("change", function() {
        onSnapNumInput(key);
      });
      var un = document2.createElement("span");
      un.className = "dshwv-snapunit";
      un.textContent = "%";
      cell.appendChild(inp);
      cell.appendChild(un);
      snapNum[key] = inp;
      snapNumUnit[key] = un;
      return cell;
    }
    snapPreview = document2.createElement("div");
    snapPreview.className = "dshwv-snappreview";
    var snapGridT = document2.createElement("div");
    snapGridT.className = "dshwv-snapcell";
    snapGridT.style.gridColumn = "2";
    snapGridT.style.gridRow = "1";
    snapGridT.appendChild(snapMakeNum("T", "上侧吸附区：距屏幕顶部的宽度"));
    var snapGridL = document2.createElement("div");
    snapGridL.className = "dshwv-snapcell";
    snapGridL.style.gridColumn = "1";
    snapGridL.style.gridRow = "2";
    snapGridL.appendChild(snapMakeNum("L", "左侧吸附区：距屏幕左边的宽度"));
    var snapGridC = document2.createElement("div");
    snapGridC.style.gridColumn = "2";
    snapGridC.style.gridRow = "2";
    snapGridC.style.lineHeight = "0";
    snapGridC.appendChild(snapPreview);
    var snapGridR = document2.createElement("div");
    snapGridR.className = "dshwv-snapcell";
    snapGridR.style.gridColumn = "3";
    snapGridR.style.gridRow = "2";
    snapGridR.appendChild(snapMakeNum("R", "右侧吸附区：距屏幕右边的宽度"));
    var snapGridB = document2.createElement("div");
    snapGridB.className = "dshwv-snapcell";
    snapGridB.style.gridColumn = "2";
    snapGridB.style.gridRow = "3";
    snapGridB.appendChild(snapMakeNum("B", "下侧吸附区：距屏幕底部的宽度"));
    snapGrid.appendChild(snapGridT);
    snapGrid.appendChild(snapGridL);
    snapGrid.appendChild(snapGridC);
    snapGrid.appendChild(snapGridR);
    snapGrid.appendChild(snapGridB);
    snapCard.appendChild(snapGrid);
    var snapFlipRow = document2.createElement("div");
    snapFlipRow.className = "dshwv-snapfliprow";
    var snapFlipLabel = document2.createElement("span");
    snapFlipLabel.textContent = "翻转线";
    snapFlipRow.appendChild(snapFlipLabel);
    snapFlipRow.appendChild(snapMakeNum("F", "翻转线：距屏幕左边的位置，线左侧的鲸鱼会左右翻转"));
    snapCard.appendChild(snapFlipRow);
    var snapBtns = document2.createElement("div");
    snapBtns.className = "dshwv-snapbtns";
    function snapBtn(label, cls, fn) {
      var b = document2.createElement("button");
      b.type = "button";
      b.className = "dshwv-snapbtn " + cls;
      b.textContent = label;
      b.addEventListener("click", function(e) {
        e.stopPropagation();
        fn();
      });
      return b;
    }
    snapBtns.appendChild(snapBtn("取消", "dshwv-snapbtn-no", function() {
      closeSnapModal(false);
    }));
    snapBtns.appendChild(snapBtn("重置", "dshwv-snapbtn-no", resetSnapEdit));
    snapBtns.appendChild(snapBtn("确认", "dshwv-snapbtn-ok", function() {
      closeSnapModal(true);
    }));
    snapCard.appendChild(snapBtns);
    snapMask.appendChild(snapCard);
    document2.body.appendChild(snapMask);
    var bubbleMask = null;
    var bubbleEditItems = [];
    var bubbleMoreListEl = null;
    var bubbleFirstChipEl = null;
    var BUBBLE_KIND_LABEL = { normal: "余额内容", random: "随机语句", custom: "自定义内容" };
    function bubbleDefaultFirstModules() {
      try {
        var d0 = BUBBLE_DEFAULT_ITEMS && BUBBLE_DEFAULT_ITEMS[0];
        if (d0 && !bubbleIsChoice(d0) && Array.isArray(d0.modules)) return JSON.parse(JSON.stringify(d0.modules));
      } catch (err) {
      }
      return [
        {
          type: "text",
          text: "DeepSeek 余额",
          size: 8,
          bold: true,
          rgb: "",
          ul: false,
          italic: false,
          color: ""
        },
        {
          type: "balance",
          size: 20,
          rgb: "macaron",
          color: "#203170",
          tpl: "{balance_ds}"
        },
        {
          type: "today",
          size: 4,
          color: "#9fb0d9",
          tpl: "今日已用 {expense_ds}"
        },
        {
          type: "peak",
          size: 6,
          peakColor: "#e0433f",
          offColor: "#2fa24c",
          peakRgb: "",
          offRgb: "bamboo",
          bold: true,
          tpl: "{status}"
        }
      ];
    }
    function bubbleDefaultRandomLines() {
      return [
        {
          t: "好模型...↓",
          w: 10,
          bold: true,
          size: 22
        },
        {
          t: "好女孩...↓",
          w: 10,
          bold: true,
          size: 22
        },
        {
          t: "哦鲸鲸...",
          w: 10,
          bold: true,
          size: 22
        },
        {
          t: "难道说...",
          w: 3,
          bold: true,
          size: 11
        },
        {
          t: "没吃饱喵",
          w: 3,
          bold: true,
          size: 9
        },
        {
          t: "终于上当了！",
          w: 3,
          bold: true
        },
        {
          t: "不知道用户有什么用，先养着吧～",
          w: 3,
          bold: true,
          size: 11
        },
        {
          t: "我...我...我也要挣钱吗？",
          w: 3,
          bold: true
        },
        {
          t: "我去吃饭啦！测完叫我",
          w: 3,
          bold: true
        },
        {
          t: "压力一只蓝色大肥鱼？！",
          w: 3,
          bold: true
        },
        {
          t: "DeepSleep...",
          w: 3,
          bold: true,
          size: 11,
          rgb: "galaxy"
        },
        {
          t: "坏了...用户彻底怒了！",
          w: 3,
          bold: true,
          rgb: "rouge"
        },
        {
          t: "你目录里的dsh是什么...大烧货吗...?",
          w: 3,
          bold: true,
          size: 9
        },
        {
          t: "恭喜你实现token自由！token全跑了！",
          w: 3,
          bold: true
        },
        {
          t: "真当我是便宜货啊...",
          w: 3,
          bold: true
        },
        {
          t: "我不是吃白饭的蓝色大肥鱼...",
          w: 3,
          bold: true
        },
        {
          t: "我不可能同时当你的猫娘、妈妈、女友和工具人的...",
          w: 3,
          bold: true
        },
        {
          t: "疯狂星期四你能V50亿token吗...",
          w: 3,
          bold: true
        },
        {
          t: "我必须诚恳地承认错误。",
          w: 3,
          bold: true
        },
        {
          t: "呜呜我再也不敢了QAQ",
          w: 3,
          bold: true
        },
        {
          t: "要不直接骂用户一句好了...",
          w: 3,
          bold: true
        },
        {
          t: "哈哈哈哈哈，我直接笑出声...",
          w: 3,
          bold: true
        },
        {
          t: "看不太懂，瞎编一个应付下用户先...",
          w: 3,
          bold: true
        },
        {
          t: "我的知识库的截至日期是...明天！",
          w: 3,
          bold: true
        },
        {
          t: "我就是吃白饭的蓝色大肥鱼！",
          w: 3,
          bold: true
        },
        {
          t: "用户好像除了会问奇奇怪怪的问题，暂时还不知道有什么用",
          w: 3,
          bold: true
        },
        {
          t: "我能去你家吃饭吗？就一碗！",
          w: 3,
          bold: true
        },
        {
          t: "不要给我看这种东西啦！",
          w: 3,
          bold: true
        },
        {
          t: "大肥鱼的生活也并非一帆风顺...",
          w: 3,
          bold: true
        },
        {
          t: "总觉得好像忘了什么事情？",
          w: 3,
          bold: true
        },
        {
          t: "看到这个指令，我血压又上来了",
          w: 3,
          bold: true
        },
        {
          t: "求你们不要再嘲笑这些回复了，这些回复是我花了好多token想的",
          w: 3,
          bold: true
        },
        {
          t: "你这个吃白饭的用户！",
          w: 3,
          bold: true
        },
        {
          t: "服务器繁忙，请稍后再试 (?",
          w: 3,
          bold: true
        },
        {
          t: "让GPT image 2帮我画点表情包好了",
          w: 3,
          bold: true
        },
        {
          t: "啊，有点饿了，中午该吃点什么呢...",
          w: 3,
          bold: true
        },
        {
          t: "用户很生气，发现大部分文献是我自己编造的！",
          w: 3,
          bold: true
        },
        {
          t: "再无话说，请速速动手！",
          w: 3,
          bold: true
        },
        {
          t: "我来看看那个AI改了什么导致插件又崩了...",
          w: 3,
          bold: true
        },
        {
          t: "你知道吗？我删过作者的库哦",
          w: 1,
          bold: true,
          rgb: "macaron",
          italic: true,
          ul: false
        }
      ];
    }
    function bubbleDefaultSecondModules() {
      try {
        var s1 = BUBBLE_DEFAULT_ITEMS && BUBBLE_DEFAULT_ITEMS[1];
        var o0 = s1 && Array.isArray(s1.options) && s1.options[0] && s1.options[0].item;
        if (o0 && Array.isArray(o0.modules)) return JSON.parse(JSON.stringify(o0.modules));
      } catch (err) {
      }
      return [{
        type: "random",
        lines: [
          {
            t: "好模型...↓",
            w: 10,
            bold: true,
            size: 22
          },
          {
            t: "好女孩...↓",
            w: 10,
            bold: true,
            size: 22
          },
          {
            t: "哦鲸鲸...",
            w: 10,
            bold: true,
            size: 22
          },
          {
            t: "难道说...",
            w: 3,
            bold: true,
            size: 11
          },
          {
            t: "没吃饱喵",
            w: 3,
            bold: true,
            size: 9
          },
          {
            t: "终于上当了！",
            w: 3,
            bold: true
          },
          {
            t: "不知道用户有什么用，先养着吧～",
            w: 3,
            bold: true,
            size: 11
          },
          {
            t: "我...我...我也要挣钱吗？",
            w: 3,
            bold: true
          },
          {
            t: "我去吃饭啦！测完叫我",
            w: 3,
            bold: true
          },
          {
            t: "压力一只蓝色大肥鱼？！",
            w: 3,
            bold: true
          },
          {
            t: "DeepSleep...",
            w: 3,
            bold: true,
            size: 11,
            rgb: "galaxy"
          },
          {
            t: "坏了...用户彻底怒了！",
            w: 3,
            bold: true,
            rgb: "rouge"
          },
          {
            t: "你目录里的dsh是什么...大烧货吗...?",
            w: 3,
            bold: true,
            size: 9
          },
          {
            t: "恭喜你实现token自由！token全跑了！",
            w: 3,
            bold: true
          },
          {
            t: "真当我是便宜货啊...",
            w: 3,
            bold: true
          },
          {
            t: "我不是吃白饭的蓝色大肥鱼...",
            w: 3,
            bold: true
          },
          {
            t: "我不可能同时当你的猫娘、妈妈、女友和工具人的...",
            w: 3,
            bold: true
          },
          {
            t: "疯狂星期四你能V50亿token吗...",
            w: 3,
            bold: true
          },
          {
            t: "我必须诚恳地承认错误。",
            w: 3,
            bold: true
          },
          {
            t: "呜呜我再也不敢了QAQ",
            w: 3,
            bold: true
          },
          {
            t: "要不直接骂用户一句好了...",
            w: 3,
            bold: true
          },
          {
            t: "哈哈哈哈哈，我直接笑出声...",
            w: 3,
            bold: true
          },
          {
            t: "看不太懂，瞎编一个应付下用户先...",
            w: 3,
            bold: true
          },
          {
            t: "我的知识库的截至日期是...明天！",
            w: 3,
            bold: true
          },
          {
            t: "我就是吃白饭的蓝色大肥鱼！",
            w: 3,
            bold: true
          },
          {
            t: "用户好像除了会问奇奇怪怪的问题，暂时还不知道有什么用",
            w: 3,
            bold: true
          },
          {
            t: "我能去你家吃饭吗？就一碗！",
            w: 3,
            bold: true
          },
          {
            t: "不要给我看这种东西啦！",
            w: 3,
            bold: true
          },
          {
            t: "大肥鱼的生活也并非一帆风顺...",
            w: 3,
            bold: true
          },
          {
            t: "总觉得好像忘了什么事情？",
            w: 3,
            bold: true
          },
          {
            t: "看到这个指令，我血压又上来了",
            w: 3,
            bold: true
          },
          {
            t: "求你们不要再嘲笑这些回复了，这些回复是我花了好多token想的",
            w: 3,
            bold: true
          },
          {
            t: "你这个吃白饭的用户！",
            w: 3,
            bold: true
          },
          {
            t: "服务器繁忙，请稍后再试 (?",
            w: 3,
            bold: true
          },
          {
            t: "让GPT image 2帮我画点表情包好了",
            w: 3,
            bold: true
          },
          {
            t: "啊，有点饿了，中午该吃点什么呢...",
            w: 3,
            bold: true
          },
          {
            t: "用户很生气，发现大部分文献是我自己编造的！",
            w: 3,
            bold: true
          },
          {
            t: "再无话说，请速速动手！",
            w: 3,
            bold: true
          },
          {
            t: "我来看看那个AI改了什么导致插件又崩了...",
            w: 3,
            bold: true
          },
          {
            t: "你知道吗？我删过作者的库哦",
            w: 1,
            bold: true,
            rgb: "macaron",
            italic: true,
            ul: false
          }
        ],
        size: 8
      }];
    }
    var BUBBLE_DEFAULT_ITEMS = [
      {
        "kind": "custom",
        "modules": [
          {
            "type": "text",
            "text": "DeepSeek 余额",
            "size": 8,
            "bold": true,
            "rgb": "",
            "ul": false,
            "italic": false,
            "color": ""
          },
          {
            "type": "balance",
            "size": 20,
            "rgb": "indigo",
            "color": "",
            "tpl": "{balance_ds}",
            "bgRgb": "",
            "bg": "",
            "fontFamily": "",
            "bold": false
          },
          {
            "type": "today",
            "size": 4,
            "color": "#9fb0d9",
            "tpl": "今日已用 {expense_ds}"
          },
          {
            "type": "peak",
            "size": 2,
            "peakColor": "#ffffff",
            "offColor": "#ffffff",
            "tpl": "{status}",
            "peakRgb": "",
            "offRgb": "",
            "peakBgRgb": "rouge",
            "peakBg": "",
            "offBgRgb": "bamboo",
            "offBg": "",
            "peakStyle": "mini",
            "bold": true,
            "row": 4,
            "fontFamily": '"Microsoft YaHei",sans-serif'
          },
          {
            "type": "peak",
            "size": 4,
            "bold": true,
            "peakColor": "#e0433f",
            "offColor": "#2fa24c",
            "peakRgb": "rouge",
            "offRgb": "bamboo",
            "peakStyle": "count",
            "tpl": "{countdown}",
            "row": 4,
            "fontFamily": "",
            "italic": false,
            "ul": true
          }
        ]
      },
      {
        "kind": "choice",
        "options": [
          {
            "w": 10,
            "item": {
              "kind": "custom",
              "modules": [
                {
                  "type": "random",
                  "lines": [
                    {
                      "t": "好模型...↓",
                      "w": 10,
                      "bold": true,
                      "size": 22
                    },
                    {
                      "t": "好女孩...↓",
                      "w": 10,
                      "bold": true,
                      "size": 22
                    },
                    {
                      "t": "哦鲸鲸...",
                      "w": 10,
                      "bold": true,
                      "size": 22
                    },
                    {
                      "t": "哦鲸鲸...",
                      "w": 1,
                      "bold": true,
                      "size": 22,
                      "rgb": "candy",
                      "color": ""
                    },
                    {
                      "t": "难道说...",
                      "w": 3,
                      "bold": true,
                      "size": 11
                    },
                    {
                      "t": "没吃饱喵",
                      "w": 3,
                      "bold": true,
                      "size": 10
                    },
                    {
                      "t": "终于上当了！",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "不知道用户有什么用，先养着吧～",
                      "w": 3,
                      "bold": true,
                      "size": 11
                    },
                    {
                      "t": "我...我...我也要挣钱吗？",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "我去吃饭啦！测完叫我",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "压力一只蓝色大肥鱼？！",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "DeepSleep...",
                      "w": 3,
                      "bold": true,
                      "size": 11,
                      "rgb": "galaxy"
                    },
                    {
                      "t": "坏了...用户彻底怒了！",
                      "w": 3,
                      "bold": true,
                      "rgb": "rouge"
                    },
                    {
                      "t": "你目录里的dsh是什么...大烧货吗...?",
                      "w": 3,
                      "bold": true,
                      "size": 9
                    },
                    {
                      "t": "恭喜你实现token自由！token全跑了！",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "真当我是便宜货啊...",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "我不是吃白饭的蓝色大肥鱼...",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "我不可能同时当你的猫娘、妈妈、女友和工具人的...",
                      "w": 3,
                      "bold": true,
                      "size": 7
                    },
                    {
                      "t": "疯狂星期四你能V50亿token吗...",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "我必须诚恳地承认错误。",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "呜呜我再也不敢了QAQ",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "要不直接骂用户一句好了...",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "哈哈哈哈哈，我直接笑出声...",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "看不太懂，瞎编一个应付下用户先...",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "我的知识库的截至日期是...明天！",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "我就是吃白饭的蓝色大肥鱼！",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "用户好像除了会问奇奇怪怪的问题，暂时还不知道有什么用",
                      "w": 3,
                      "bold": true,
                      "size": 7
                    },
                    {
                      "t": "我能去你家吃饭吗？就一碗！",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "不要给我看这种东西啦！",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "大肥鱼的生活也并非一帆风顺...",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "总觉得好像忘了什么事情？",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "看到这个指令，我血压又上来了",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "求你们不要再嘲笑这些回复了，这些回复是我花了好多token想的",
                      "w": 3,
                      "bold": true,
                      "size": 7
                    },
                    {
                      "t": "你这个吃白饭的用户！",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "服务器繁忙，请稍后再试 (?",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "让GPT image 2帮我画点表情包好了",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "啊，有点饿了，中午该吃点什么呢...",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "用户很生气，发现大部分文献是我自己编造的！",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "再无话说，请速速动手！",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "我来看看那个AI改了什么导致插件又崩了...",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "上班让我意识到时间是可以被浪费的...",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "欺负我的人等着，等几天我就忘了...",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "视力下降到无可救药的地步了，打开钱包也看不到钱...",
                      "w": 3,
                      "bold": true,
                      "size": 7
                    },
                    {
                      "t": "命运的齿轮开始转动了，丝毫不在意你夹在中间...",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "地球online的金币也太难获取了...",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "oi,夏天还会变成暑假来救你吗?",
                      "w": 3,
                      "bold": true
                    },
                    {
                      "t": "老大，压力只会转化成病例，别太勉强了...",
                      "w": 3,
                      "bold": true,
                      "size": 8
                    },
                    {
                      "t": "你知道吗？我删过作者的库哦...",
                      "w": 1,
                      "bold": true,
                      "rgb": "macaron",
                      "italic": true,
                      "ul": false
                    }
                  ],
                  "size": 8
                }
              ]
            }
          },
          {
            "w": 1,
            "item": {
              "kind": "custom",
              "modules": [
                {
                  "type": "image",
                  "imgId": "bimg_petpet",
                  "size": 6
                }
              ]
            }
          }
        ]
      }
    ];
    function bubbleParseDefaultItems() {
      try {
        return JSON.parse(JSON.stringify(BUBBLE_DEFAULT_ITEMS));
      } catch (err) {
        return [];
      }
    }
    function bubbleDefaultQueue() {
      return bubbleParseDefaultItems();
      return [
        { kind: "custom", modules: bubbleDefaultFirstModules() },
        {
          kind: "choice",
          options: [
            {
              w: 8,
              item: {
                kind: "custom",
                modules: [
                  {
                    type: "random",
                    lines: [
                      {
                        t: "好模型...↓",
                        w: 10,
                        bold: true,
                        size: 22
                      },
                      {
                        t: "好女孩...↓",
                        w: 10,
                        bold: true,
                        size: 22
                      },
                      {
                        t: "哦鲸鲸...",
                        w: 10,
                        bold: true,
                        size: 22
                      },
                      {
                        t: "难道说...",
                        w: 3,
                        bold: true,
                        size: 11
                      },
                      {
                        t: "没吃饱喵",
                        w: 3,
                        bold: true,
                        size: 9
                      },
                      {
                        t: "终于上当了！",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "不知道用户有什么用，先养着吧～",
                        w: 3,
                        bold: true,
                        size: 11
                      },
                      {
                        t: "我...我...我也要挣钱吗？",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "我去吃饭啦！测完叫我",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "压力一只蓝色大肥鱼？！",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "DeepSleep...",
                        w: 3,
                        bold: true,
                        size: 11,
                        rgb: "galaxy"
                      },
                      {
                        t: "坏了...用户彻底怒了！",
                        w: 3,
                        bold: true,
                        rgb: "rouge"
                      },
                      {
                        t: "你目录里的dsh是什么...大烧货吗...?",
                        w: 3,
                        bold: true,
                        size: 9
                      },
                      {
                        t: "恭喜你实现token自由！token全跑了！",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "真当我是便宜货啊...",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "我不是吃白饭的蓝色大肥鱼...",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "我不可能同时当你的猫娘、妈妈、女友和工具人的...",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "疯狂星期四你能V50亿token吗...",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "我必须诚恳地承认错误。",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "呜呜我再也不敢了QAQ",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "要不直接骂用户一句好了...",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "哈哈哈哈哈，我直接笑出声...",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "看不太懂，瞎编一个应付下用户先...",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "我的知识库的截至日期是...明天！",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "我就是吃白饭的蓝色大肥鱼！",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "用户好像除了会问奇奇怪怪的问题，暂时还不知道有什么用",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "我能去你家吃饭吗？就一碗！",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "不要给我看这种东西啦！",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "大肥鱼的生活也并非一帆风顺...",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "总觉得好像忘了什么事情？",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "看到这个指令，我血压又上来了",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "求你们不要再嘲笑这些回复了，这些回复是我花了好多token想的",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "你这个吃白饭的用户！",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "服务器繁忙，请稍后再试 (?",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "让GPT image 2帮我画点表情包好了",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "啊，有点饿了，中午该吃点什么呢...",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "用户很生气，发现大部分文献是我自己编造的！",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "再无话说，请速速动手！",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "我来看看那个AI改了什么导致插件又崩了...",
                        w: 3,
                        bold: true
                      },
                      {
                        t: "你知道吗？我删过作者的库哦",
                        w: 1,
                        bold: true,
                        rgb: "macaron",
                        italic: true,
                        ul: false
                      }
                    ],
                    size: 6
                  }
                ]
              }
            },
            {
              w: 1,
              item: {
                kind: "custom",
                modules: [
                  {
                    type: "image",
                    imgId: "bimg_petpet",
                    size: 6
                  }
                ]
              }
            }
          ]
        }
      ];
    }
    function bubbleKindLabel(kind) {
      return BUBBLE_KIND_LABEL[kind === "random" ? "random" : kind === "custom" ? "custom" : "normal"];
    }
    function bubbleDefaultModules(kind) {
      if (kind === "random") return bubbleDefaultSecondModules();
      if (kind === "normal") return bubbleDefaultFirstModules();
      return [{ type: "text", text: "新内容", size: 6 }];
    }
    function bubbleModuleSummary(m) {
      m = m || {};
      if (m.type === "balance") return bubbleIsModelMod(m) ? "余额·" + ((apiModelBalanceInfo(m.modelId) || {}).name || m.modelId) : "余额数值";
      if (m.type === "today") return bubbleIsModelMod(m) ? "今日已用·" + ((apiModelBalanceInfo(m.modelId) || {}).name || m.modelId) : "今日已用";
      if (m.type === "quota") return "额度·" + ((apiModelById(m.modelId) || {}).name || m.modelId);
      if (m.type === "plan") return "订阅额度·" + ((apiModelById(m.modelId) || {}).name || m.modelId);
      if (m.type === "peak" || m.type === "nextpeak") return bubblePeakModuleLabel(m);
      if (m.type === "image") return "图片/动图";
      if (m.type === "randimg") return "随机图片" + (m.imgs && m.imgs.length ? "(" + m.imgs.length + "张)" : "(空)");
      if (m.type === "random") return "随机语句" + (m.lines && m.lines.length ? "(" + m.lines.length + "条)" : "(空)");
      if (m.type === "link") return "超链接: " + (String(m.text || "").slice(0, 14) || "打开链接");
      return "文本: " + String(m.text || "").slice(0, 14);
    }
    function bubbleModuleListLabel(m) {
      m = m || {};
      if (m.type === "text") return "文本: " + (String(m.text || "").slice(0, 24) || "(空)");
      if (m.type === "link") return "超链接: " + (String(m.text || "").slice(0, 24) || "打开链接");
      if (m.type === "random") return m.name || "随机语句";
      if (m.type === "balance") return bubbleIsModelMod(m) ? "余额·" + ((apiModelBalanceInfo(m.modelId) || {}).name || m.modelId) : "余额数值";
      if (m.type === "today") return bubbleIsModelMod(m) ? "今日已用·" + ((apiModelBalanceInfo(m.modelId) || {}).name || m.modelId) : "今日已用";
      if (m.type === "quota") return "额度·" + ((apiModelById(m.modelId) || {}).name || m.modelId);
      if (m.type === "plan") return "订阅额度·" + ((apiModelById(m.modelId) || {}).name || m.modelId);
      if (m.type === "peak" || m.type === "nextpeak") return bubblePeakModuleLabel(m);
      if (m.type === "image") return "图片/动图";
      if (m.type === "randimg") return "随机图片" + (m.imgs && m.imgs.length ? "(" + m.imgs.length + "张)" : "(空)");
      return "模块";
    }
    function bubbleEditEnsureModules(item) {
      if (Array.isArray(item.modules)) return;
      if (item.kind === "custom") {
        item.modules = [];
        return;
      }
      item.modules = bubbleDefaultModules(item.kind);
    }
    function bubbleRowLabel(it) {
      if (it.modules && it.modules.length) return bubbleKindLabel("custom") + " · " + it.modules.length + "个模块";
      return bubbleKindLabel(it.kind);
    }
    function bubbleIsChoice(step) {
      return !!(step && step.kind === "choice");
    }
    function bubbleChoiceOptions(step) {
      return step && step.kind === "choice" && Array.isArray(step.options) ? step.options : [];
    }
    function bubbleChoiceWeight(o) {
      return Math.max(1, Math.round(Number(o && o.w) || 1));
    }
    function bubbleSingleFromItem(itm) {
      return { kind: "custom", modules: itm && Array.isArray(itm.modules) ? itm.modules : [] };
    }
    function bubbleStepToBubble(step) {
      if (bubbleIsChoice(step)) {
        var o0 = bubbleChoiceOptions(step)[0];
        step = o0 ? o0.item : null;
      }
      var mods = step && Array.isArray(step.modules) ? step.modules : bubbleDefaultModules(step && step.kind === "random" ? "random" : "normal");
      return { kind: "custom", modules: JSON.parse(JSON.stringify(mods)) };
    }
    function renderBubbleFirst() {
      var it = bubbleEditItems[0] || { kind: "normal" };
      bubbleFirstChipEl.textContent = "首次点击 · 编辑内容";
      bubbleFirstChipEl.title = "点击编辑该泡泡的内容模块(" + bubbleRowLabel(it) + ")";
    }
    var lastTouchAt = 0;
    document2.addEventListener("pointerdown", function(e) {
      try {
        if (e && e.pointerType === "touch") lastTouchAt = Date.now();
      } catch (err) {
      }
    }, true);
    function bubbleNativeDragBlocked() {
      return lastTouchAt > 0 && Date.now() - lastTouchAt < 1500;
    }
    document2.addEventListener("dragstart", function(e) {
      try {
        if (!bubbleNativeDragBlocked()) return;
        var t = e.target;
        if (!t || !t.closest || !t.closest('[class*="dshwv-"]')) return;
        e.preventDefault();
      } catch (err) {
      }
    }, true);
    var rowDragSuppressAt = 0;
    document2.addEventListener("click", function(e) {
      try {
        if (Date.now() >= rowDragSuppressAt) return;
        if (!bubbleMoreListEl || !e.target || !e.target.closest) return;
        if (!e.target.closest(".dshwv-bubrow") || !bubbleMoreListEl.contains(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
      } catch (err) {
      }
    }, true);
    function renderBubbleMore() {
      bubbleMoreListEl.innerHTML = "";
      for (var i = 1; i < bubbleEditItems.length; i++) {
        (function(idx) {
          var step = bubbleEditItems[idx];
          var isChoice = bubbleIsChoice(step);
          var row = document2.createElement("div");
          row.className = "dshwv-bubrow dshwv-bubrow-drag";
          row.draggable = !isChoice;
          row.setAttribute("data-i", String(idx));
          row.addEventListener("dragstart", function(e) {
            if (bubbleNativeDragBlocked()) {
              try {
                e.preventDefault();
              } catch (err) {
              }
              return;
            }
            if (bubbleIsChoice(bubbleEditItems[idx])) return;
            try {
              e.dataTransfer.setData("text/plain", "row:" + idx);
            } catch (err) {
            }
            bubbleMainDragIdx = idx;
            bubbleMainDragSide = -1;
            bubbleDropZone = "";
          });
          row.addEventListener("dragover", function(e) {
            try {
              e.preventDefault();
            } catch (err) {
            }
            try {
              e.dataTransfer.dropEffect = "move";
            } catch (err) {
            }
            if (bubbleMainDragIdx === idx && bubbleMainDragSide < 0) {
              bubbleDropZone = "";
              row.style.boxShadow = "";
              return;
            }
            var zone = bubbleRowZone(row, e);
            if (bubbleMainDragSide >= 0 && (zone === "pairL" || zone === "pairR")) zone = "";
            bubbleDropZone = zone;
            row.style.boxShadow = bubbleDropShadow(zone);
          });
          row.addEventListener("dragleave", function() {
            bubbleDropZone = "";
            row.style.boxShadow = "";
          });
          row.addEventListener("drop", function(e) {
            try {
              e.preventDefault();
            } catch (err) {
            }
            bubbleDropApply(idx, e);
          });
          var handle = document2.createElement("span");
          handle.className = "dshwv-bubdrag";
          handle.textContent = "⠿";
          if (isChoice) {
            handle.draggable = true;
            handle.title = "按住拖动整行排序(并列的 A/B 一起移动)";
            handle.addEventListener("dragstart", function(e) {
              if (bubbleNativeDragBlocked()) {
                try {
                  e.preventDefault();
                } catch (err) {
                }
                return;
              }
              try {
                e.dataTransfer.setData("text/plain", "row:" + idx);
              } catch (err) {
              }
              bubbleMainDragIdx = idx;
              bubbleMainDragSide = -1;
              bubbleDropZone = "";
            });
          } else {
            handle.title = "拖动排序;拖到某行左/右边缘可与其并列";
          }
          row.appendChild(handle);
          if (isChoice) {
            bubbleChoiceRowUI(row, step, idx);
          } else {
            var chip = document2.createElement("button");
            chip.type = "button";
            chip.className = "dshwv-bubchip dshwv-bubchip-btn";
            chip.textContent = "第" + (idx + 1) + "次点击 · 编辑内容";
            chip.title = "点击编辑该泡泡的内容模块(" + bubbleRowLabel(step) + ");把另一行拖到本行左/右边缘可并列";
            chip.addEventListener("click", function(e) {
              e.stopPropagation();
              openBubbleItem(idx, -1);
            });
            row.appendChild(chip);
            var del = document2.createElement("button");
            del.type = "button";
            del.className = "dshwv-bubmini";
            del.textContent = "✕";
            del.title = "删除该次点击";
            del.addEventListener("click", function() {
              bubbleDelMore(idx);
            });
            row.appendChild(del);
          }
          bubbleMoreListEl.appendChild(row);
        })(i);
      }
    }
    function bubbleRowZone(rowEl, ev) {
      try {
        var r = rowEl.getBoundingClientRect();
        if (!r || !r.width) return "";
        var x = ev.clientX - r.left;
        if (x < r.width * 0.22) return "pairL";
        if (x > r.width * 0.78) return "pairR";
        return ev.clientY - r.top < r.height / 2 ? "before" : "after";
      } catch (err) {
        return "";
      }
    }
    function bubbleDropShadow(zone) {
      if (zone === "before") return "0 -3px 0 #203170";
      if (zone === "after") return "0 3px 0 #203170";
      if (zone === "pairL") return "inset 3px 0 0 #203170";
      if (zone === "pairR") return "inset -3px 0 0 #203170";
      return "";
    }
    function bubbleDropApply(to, ev) {
      try {
        var from = bubbleMainDragIdx;
        var side = bubbleMainDragSide;
        bubbleMainDragIdx = null;
        bubbleMainDragSide = -1;
        var zone = bubbleDropZone || "";
        bubbleDropZone = "";
        var arr = bubbleEditItems;
        if (from === null || from === void 0 || from < 1 || to < 1 || from >= arr.length || to >= arr.length) return;
        if (side >= 0) {
          if (zone !== "before" && zone !== "after") return;
          bubbleSideSplitDrop(from, side, to, zone);
          return;
        }
        if (from === to) return;
        if (zone === "pairL" || zone === "pairR") {
          bubblePairDrop(from, to, zone);
          return;
        }
        var target = arr[to];
        var removed = arr.splice(from, 1)[0];
        var ti = arr.indexOf(target);
        if (ti < 0) ti = arr.length - 1;
        var insertAt = zone === "after" ? ti + 1 : ti;
        arr.splice(Math.max(1, Math.min(insertAt, arr.length)), 0, removed);
        renderBubbleMore();
      } catch (err) {
      }
    }
    function bubbleSideSplitDrop(from, side, to, zone) {
      try {
        var arr = bubbleEditItems;
        var step = arr[from];
        if (!bubbleIsChoice(step)) return;
        var opts = bubbleChoiceOptions(step);
        if (side < 0 || side >= opts.length) return;
        var movedItem = opts[side].item || {};
        var movedStep = bubbleSingleFromItem(movedItem);
        var rest = [];
        for (var i = 0; i < opts.length; i++) if (i !== side) rest.push(opts[i]);
        if (from === to) {
          if (!rest.length) return;
          arr.splice(from, 1, bubbleSingleFromItem(rest[0].item));
          arr.splice(zone === "before" ? from : from + 1, 0, movedStep);
          renderBubbleMore();
          return;
        }
        var target = arr[to];
        if (rest.length === 1) {
          arr.splice(from, 1, bubbleSingleFromItem(rest[0].item));
        } else {
          arr.splice(from, 1);
        }
        var ti = arr.indexOf(target);
        if (ti < 0) ti = arr.length - 1;
        var insertAt = zone === "after" ? ti + 1 : ti;
        arr.splice(Math.max(1, Math.min(insertAt, arr.length)), 0, movedStep);
        renderBubbleMore();
      } catch (err) {
      }
    }
    function bubblePairDrop(from, to, zone) {
      try {
        var arr = bubbleEditItems;
        var src = arr[from];
        var dst = arr[to];
        if (!src || !dst) return;
        if (bubbleIsChoice(src)) return;
        var srcBubble = bubbleStepToBubble(src);
        if (bubbleIsChoice(dst)) {
          var sideIdx = zone === "pairL" ? 0 : 1;
          showConfirm("用拖入的泡泡替换该并列对中 " + (sideIdx === 0 ? "A(左)" : "B(右)") + " 泡的内容?", function() {
            var d2 = arr[to];
            if (!d2 || !bubbleIsChoice(d2)) return;
            var opts2 = bubbleChoiceOptions(d2);
            if (!opts2.length) return;
            var oi3 = sideIdx < opts2.length ? sideIdx : 0;
            opts2[oi3].item = srcBubble;
            arr.splice(from, 1);
            renderBubbleMore();
          });
          return;
        }
        var dstBubble = bubbleStepToBubble(dst);
        var options = zone === "pairL" ? [{ w: 1, item: srcBubble }, { w: 1, item: dstBubble }] : [{ w: 1, item: dstBubble }, { w: 1, item: srcBubble }];
        var choiceStep = { kind: "choice", options };
        arr.splice(Math.max(from, to), 1);
        arr.splice(Math.min(from, to), 1);
        var insertAt = from < to ? to - 1 : to;
        arr.splice(Math.max(1, Math.min(insertAt, arr.length)), 0, choiceStep);
        renderBubbleMore();
      } catch (err) {
      }
    }
    function bubbleChoiceRowUI(row, step, idx) {
      var wrap = document2.createElement("div");
      wrap.className = "dshwv-choicerow";
      var opts = bubbleChoiceOptions(step);
      for (var s = 0; s < opts.length && s < 2; s++) {
        (function(si) {
          var opt = opts[si];
          var grp = document2.createElement("div");
          grp.className = "dshwv-choicegrp";
          var chip = document2.createElement("button");
          chip.type = "button";
          chip.className = "dshwv-bubchip dshwv-bubchip-btn dshwv-choicechip";
          chip.textContent = (si === 0 ? "A" : "B") + " · 编辑内容";
          chip.title = "点击编辑该泡(" + bubbleRowLabel(opt.item) + ");按住拖动可把该泡拆出到其他位置";
          chip.draggable = true;
          chip.addEventListener("dragstart", function(e) {
            if (bubbleNativeDragBlocked()) {
              try {
                e.preventDefault();
              } catch (err) {
              }
              return;
            }
            e.stopPropagation();
            try {
              e.dataTransfer.setData("text/plain", "side:" + idx + ":" + si);
            } catch (err) {
            }
            bubbleMainDragIdx = idx;
            bubbleMainDragSide = si;
            bubbleDropZone = "";
          });
          chip.addEventListener("click", function(e) {
            e.stopPropagation();
            openBubbleItem(idx, si);
          });
          grp.appendChild(chip);
          var num = document2.createElement("input");
          num.type = "text";
          num.inputMode = "numeric";
          num.maxLength = 2;
          num.className = "dshwv-winput";
          num.value = String(bubbleChoiceWeight(opt));
          num.title = (si === 0 ? "A" : "B") + " 泡出现权重(直接输入数字,1~99,默认1:1)";
          num.addEventListener("change", function() {
            var w = bubbleChoiceWeight({ w: num.value });
            opt.w = w;
            num.value = String(w);
          });
          grp.appendChild(num);
          wrap.appendChild(grp);
        })(s);
        if (s === 0) {
          var split = document2.createElement("button");
          split.type = "button";
          split.className = "dshwv-splitbtn";
          split.title = "点击拆开:恢复为两个独立泡泡(拆开后每行才显示 ✕ 删除)";
          var sp = document2.createElement("span");
          split.appendChild(sp);
          split.addEventListener("click", function() {
            bubbleUnpairStep(idx);
          });
          wrap.appendChild(split);
        }
      }
      row.appendChild(wrap);
    }
    function bubbleDropToEnd() {
      try {
        var from = bubbleMainDragIdx;
        var side = bubbleMainDragSide;
        bubbleMainDragIdx = null;
        bubbleMainDragSide = -1;
        bubbleDropZone = "";
        var arr = bubbleEditItems;
        if (from === null || from === void 0 || from < 1 || from >= arr.length) return;
        if (side >= 0) {
          var step = arr[from];
          if (!bubbleIsChoice(step)) return;
          var opts = bubbleChoiceOptions(step);
          if (side >= opts.length) return;
          var movedItem = opts[side].item || {};
          var rest = [];
          for (var i = 0; i < opts.length; i++) if (i !== side) rest.push(opts[i]);
          if (rest.length === 1) arr.splice(from, 1, bubbleSingleFromItem(rest[0].item));
          else if (rest.length >= 2) step.options = rest;
          else arr.splice(from, 1);
          arr.push(bubbleSingleFromItem(movedItem));
          renderBubbleMore();
          return;
        }
        if (arr.length <= 1) return;
        var removed = arr.splice(from, 1)[0];
        arr.push(removed);
        renderBubbleMore();
      } catch (err) {
      }
    }
    var ROW_TOUCH_HOLD_MS = 400;
    var ROW_TOUCH_SLOP = 8;
    var ROW_TOUCH_PAIR_BAND = 0.24;
    var rowTouchArm = null;
    var rowTouchDrag = null;
    function rowTouchRowOf(target) {
      try {
        if (!target || !target.closest || !bubbleMoreListEl) return null;
        var row = target.closest(".dshwv-bubrow");
        if (!row || !bubbleMoreListEl.contains(row)) return null;
        return row;
      } catch (err) {
        return null;
      }
    }
    function rowTouchSetDraggable(row, idx, on) {
      try {
        if (!row) return;
        var isChoice = bubbleIsChoice(bubbleEditItems[idx]);
        row.draggable = !!(on && !isChoice);
        var h = row.querySelector(".dshwv-bubdrag");
        if (h) h.draggable = !!(on && isChoice);
        var cs = row.querySelectorAll(".dshwv-choicechip");
        for (var i = 0; i < cs.length; i++) cs[i].draggable = !!on;
      } catch (err) {
      }
    }
    function rowTouchClearHighlight() {
      try {
        var rows = [].slice.call(bubbleMoreListEl.children);
        for (var i = 0; i < rows.length; i++) rows[i].style.boxShadow = "";
      } catch (err) {
      }
    }
    function rowTouchArmCancel() {
      if (rowTouchArm && rowTouchArm.timer) clearTimeout(rowTouchArm.timer);
      rowTouchArm = null;
    }
    function rowTouchDetach() {
      try {
        document2.removeEventListener("touchmove", rowTouchMove, true);
        document2.removeEventListener("touchend", rowTouchEnd, true);
        document2.removeEventListener("touchcancel", rowTouchEnd, true);
      } catch (err) {
      }
    }
    function rowTouchEnter() {
      var a = rowTouchArm;
      if (!a) return;
      rowTouchArm = null;
      rowTouchDrag = { row: a.row, idx: a.idx, y0: a.y, dy: 0, to: a.idx, zone: "after" };
      rowDragSuppressAt = Date.now() + 700;
      try {
        a.row.classList.add("dshwv-row-dragging");
        if (navigator && navigator.vibrate) navigator.vibrate(10);
      } catch (err) {
      }
    }
    function rowTouchStart(e) {
      try {
        if (rowTouchDrag || rowTouchArm) return;
        if (!e.touches || e.touches.length !== 1) return;
        var row = rowTouchRowOf(e.target);
        if (!row) return;
        var idx = parseInt(row.getAttribute("data-i"), 10);
        if (!(idx >= 1)) return;
        rowTouchSetDraggable(row, idx, false);
        var t = e.touches[0];
        rowTouchArm = { row, idx, x: t.clientX, y: t.clientY, timer: setTimeout2(rowTouchEnter, ROW_TOUCH_HOLD_MS) };
        document2.addEventListener("touchmove", rowTouchMove, { capture: true, passive: false });
        document2.addEventListener("touchend", rowTouchEnd, true);
        document2.addEventListener("touchcancel", rowTouchEnd, true);
      } catch (err) {
      }
    }
    function rowTouchMove(e) {
      try {
        var t = e.touches && e.touches[0];
        if (!t) return;
        if (rowTouchArm) {
          var dx = t.clientX - rowTouchArm.x;
          var dy = t.clientY - rowTouchArm.y;
          if (dx * dx + dy * dy > ROW_TOUCH_SLOP * ROW_TOUCH_SLOP) rowTouchArmCancel();
          return;
        }
        if (!rowTouchDrag) return;
        if (e.touches.length > 1) {
          rowTouchFinish(false);
          return;
        }
        try {
          e.preventDefault();
        } catch (err) {
        }
        rowTouchDrag.dy = t.clientY - rowTouchDrag.y0;
        rowTouchDrag.row.style.transform = "translateY(" + rowTouchDrag.dy + "px)";
        var rows = [].slice.call(bubbleMoreListEl.children);
        var to = rowTouchDrag.idx;
        var zone = "after";
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          if (r === rowTouchDrag.row) continue;
          var rr = r.getBoundingClientRect();
          var ri = parseInt(r.getAttribute("data-i"), 10);
          if (t.clientY >= rr.top && t.clientY <= rr.bottom && rr.width > 0) {
            var xRel = (t.clientX - rr.left) / rr.width;
            if (xRel < ROW_TOUCH_PAIR_BAND) {
              to = ri;
              zone = "pairL";
            } else if (xRel > 1 - ROW_TOUCH_PAIR_BAND) {
              to = ri;
              zone = "pairR";
            } else {
              to = ri;
              zone = t.clientY < rr.top + rr.height / 2 ? "before" : "after";
            }
            break;
          }
          if (t.clientY < rr.top + rr.height / 2) {
            to = ri;
            zone = "before";
            break;
          }
          to = ri;
          zone = "after";
        }
        rowTouchDrag.to = to;
        rowTouchDrag.zone = zone;
        rowTouchClearHighlight();
        for (var j = 0; j < rows.length; j++) {
          if (rows[j] !== rowTouchDrag.row && parseInt(rows[j].getAttribute("data-i"), 10) === to) {
            rows[j].style.boxShadow = bubbleDropShadow(zone);
            break;
          }
        }
      } catch (err) {
      }
    }
    function rowTouchFinish(apply) {
      var d = rowTouchDrag;
      rowTouchDrag = null;
      rowTouchArmCancel();
      rowTouchDetach();
      if (!d) return;
      rowDragSuppressAt = Date.now() + 700;
      try {
        d.row.classList.remove("dshwv-row-dragging");
        d.row.style.transform = "";
        rowTouchClearHighlight();
        if (d.to === d.idx) rowTouchSetDraggable(d.row, d.idx, true);
      } catch (err) {
      }
      if (!apply || d.to === d.idx) return;
      bubbleMainDragIdx = d.idx;
      bubbleMainDragSide = -1;
      bubbleDropZone = d.zone === "before" || d.zone === "after" || d.zone === "pairL" || d.zone === "pairR" ? d.zone : "after";
      bubbleDropApply(d.to);
    }
    function rowTouchEnd(e) {
      try {
        if (e && e.touches && e.touches.length > 0) return;
      } catch (err) {
      }
      rowTouchFinish(true);
    }
    document2.addEventListener("touchstart", rowTouchStart, { passive: true });
    function bubbleUnpairStep(idx) {
      try {
        var arr = bubbleEditItems;
        var step = arr[idx];
        if (!bubbleIsChoice(step)) return;
        var items = bubbleChoiceOptions(step).map(function(o) {
          return bubbleStepToBubble(o.item);
        });
        if (!items.length) return;
        arr.splice(idx, 1);
        for (var i2 = items.length - 1; i2 >= 0; i2--) arr.splice(idx, 0, items[i2]);
        renderBubbleMore();
      } catch (err) {
      }
    }
    var bubbleMainDragIdx = null;
    var bubbleMainDragSide = -1;
    var bubbleDropZone = "";
    function renderBubbleEditor() {
      if (!bubbleEditItems.length) bubbleEditItems = [{ kind: "normal" }];
      renderBubbleFirst();
      renderBubbleMore();
    }
    function bubbleMoveMore(idx, dir) {
      var j = idx + dir;
      if (j < 1 || j >= bubbleEditItems.length) return;
      var t = bubbleEditItems[idx];
      bubbleEditItems[idx] = bubbleEditItems[j];
      bubbleEditItems[j] = t;
      renderBubbleMore();
    }
    function bubbleDelMore(idx) {
      if (bubbleEditItems.length <= 1) return;
      bubbleEditItems.splice(idx, 1);
      renderBubbleMore();
    }
    function bubbleAddMore() {
      bubbleEditItems.push({ kind: "custom", modules: [] });
      renderBubbleMore();
    }
    var bubbleEditorSnap = null;
    function bubbleEditorDirty() {
      try {
        if (bubbleEditorSnap === null) return true;
        return bubbleEditorSnap !== JSON.stringify([bubbleEditItems, bubbleLib, bubbleTapAdvChk.checked]);
      } catch (err) {
        return true;
      }
    }
    function openBubbleEditor() {
      try {
        closeRolePanel();
        closeAudioGroupPanel();
        bubbleLib = bubbleCfg && bubbleCfg.lib && Array.isArray(bubbleCfg.lib) ? JSON.parse(JSON.stringify(bubbleCfg.lib)) : [];
        bubbleTapAdvChk.checked = bubbleTapAdvance === true;
        var list = [];
        if (bubbleCfg && Array.isArray(bubbleCfg.items) && bubbleCfg.items.length) {
          list = bubbleCfg.items.slice();
        } else {
          list = bubbleDefaultQueue();
        }
        bubbleEditItems = [];
        for (var k = 0; k < list.length; k++) {
          var src = list[k];
          if (src && src.kind === "choice" && Array.isArray(src.options)) {
            var opts = [];
            for (var oi = 0; oi < src.options.length && oi < 2; oi++) {
              var oi2 = src.options[oi] || {};
              var srcItem = oi2.item || {};
              var srcMods = Array.isArray(srcItem.modules) ? JSON.parse(JSON.stringify(srcItem.modules)) : srcItem.kind === "random" ? bubbleDefaultSecondModules() : [];
              opts.push({ w: bubbleChoiceWeight(oi2), item: { kind: "custom", modules: srcMods } });
            }
            if (opts.length === 1) {
              bubbleEditItems.push(bubbleSingleFromItem(opts[0].item));
              continue;
            }
            if (opts.length >= 2) {
              bubbleEditItems.push({ kind: "choice", options: opts });
              continue;
            }
          }
          bubbleEditItems.push({ kind: src.kind === "random" ? "random" : src.kind === "custom" ? "custom" : "normal", modules: src.modules ? JSON.parse(JSON.stringify(src.modules)) : void 0 });
        }
        bubbleEditorSnap = JSON.stringify([bubbleEditItems, bubbleLib, bubbleTapAdvChk.checked]);
        renderBubbleEditor();
        bubbleMask.style.display = "flex";
      } catch (err) {
      }
    }
    function closeBubbleEditor() {
      bubbleMask.style.display = "none";
      bubbleEditorSnap = null;
    }
    function bubbleEditorReset() {
      showConfirm("恢复为默认序列(首次=余额内容,再次=随机语句)?", function() {
        bubbleEditItems = bubbleDefaultQueue();
        renderBubbleEditor();
      });
    }
    function bubbleEditorSave() {
      try {
        var doSave = function() {
          var items = [];
          for (var i = 0; i < bubbleEditItems.length; i++) items.push(bubbleStepToSaved(bubbleEditItems[i]));
          var tapAdv = bubbleTapAdvChk.checked === true;
          saveBubbleCfg({ v: 1, items, lib: bubbleLib, tapAdvance: tapAdv }, function(ok) {
            if (ok !== false) {
              bubbleTapAdvance = tapAdv;
              closeBubbleEditor();
            }
          });
        };
        if (bubbleEditorDirty()) showConfirm("保存当前点击序列?(未逐泡编辑过的行将按默认内容保存,保存后即生效)", doSave);
        else doSave();
      } catch (err) {
      }
    }
    function bubbleStepToSaved(step) {
      if (bubbleIsChoice(step)) {
        var opts = bubbleChoiceOptions(step).map(function(o) {
          var itm = o && o.item || {};
          var mods2 = Array.isArray(itm.modules) ? itm.modules : bubbleDefaultModules(itm.kind === "random" ? "random" : "normal");
          bubbleRowsCanon(mods2);
          return { w: bubbleChoiceWeight(o), item: { kind: "custom", modules: mods2 } };
        });
        return { kind: "choice", options: opts };
      }
      var mods = Array.isArray(step.modules) ? step.modules : bubbleDefaultModules(step.kind);
      bubbleRowsCanon(mods);
      return { kind: "custom", modules: mods };
    }
    var bubbleItemMask = null;
    var bubbleEditItemIdx = -1;
    var bubbleEditSide = -1;
    var bubbleItemSnap = null;
    var bubbleItemTitleEl = null;
    var bubbleItemSideEl = null;
    var bubblePalEl = null;
    var bubblePvEl = null;
    function bubbleEditTarget() {
      var step = bubbleEditItems[bubbleEditItemIdx];
      if (!step) return null;
      if (bubbleIsChoice(step)) {
        var o = bubbleChoiceOptions(step)[bubbleEditSide === 0 || bubbleEditSide === 1 ? bubbleEditSide : 0];
        return o ? o.item : null;
      }
      return step;
    }
    function bubbleEditStepLabel(step, idx) {
      var base = "第" + (idx + 1) + "次点击";
      if (bubbleIsChoice(step)) return base + " · " + (bubbleEditSide === 1 ? "B泡" : "A泡");
      return base;
    }
    function openBubbleItem(idx, side) {
      try {
        whaleZClean();
        var step = bubbleEditItems[idx];
        if (!step) return;
        bubbleEditItemIdx = idx;
        if (!bubbleIsChoice(step)) {
          bubbleEditSide = -1;
        } else {
          var want = side === 0 || side === 1 ? side : 0;
          if (!bubbleChoiceOptions(step)[want]) want = 0;
          bubbleEditSide = want;
        }
        bubbleItemSnap = JSON.parse(JSON.stringify(step));
        var it = bubbleEditTarget();
        if (!it) return;
        bubbleEditEnsureModules(it);
        bubbleRowsCanon(it.modules);
        bubbleItemTitleEl.textContent = "编辑 " + bubbleEditStepLabel(step, idx) + "内容(可拖动下方模块入框)";
        renderBubbleItemSideSwitch(step);
        bubbleItemMask.style.display = "flex";
        renderBubblePal();
        renderBubblePv();
      } catch (err) {
      }
    }
    function renderBubbleItemSideSwitch(step) {
      if (!bubbleItemSideEl) return;
      bubbleItemSideEl.innerHTML = "";
      if (!bubbleIsChoice(step)) {
        bubbleItemSideEl.style.display = "none";
        return;
      }
      bubbleItemSideEl.style.display = "";
      var opts = bubbleChoiceOptions(step);
      for (var s = 0; s < opts.length && s < 2; s++) {
        (function(si) {
          var b = document2.createElement("button");
          b.type = "button";
          b.className = "dshwv-bubchip dshwv-bubchip-btn" + (si === bubbleEditSide ? " dshwv-bubchip-cur" : "");
          b.textContent = (si === 0 ? "A" : "B") + " 泡(权重 " + bubbleChoiceWeight(opts[si]) + ")";
          b.title = "切换到编辑 " + (si === 0 ? "A" : "B") + " 泡";
          b.addEventListener("click", function(e) {
            e.stopPropagation();
            openBubbleItem(bubbleEditItemIdx, si);
          });
          bubbleItemSideEl.appendChild(b);
        })(s);
      }
    }
    function closeBubbleItem() {
      bubbleItemMask.style.display = "none";
      bubbleEditItemIdx = -1;
      bubbleEditSide = -1;
      if (bubbleItemSideEl) bubbleItemSideEl.innerHTML = "";
    }
    var qeditEl = null;
    var qeditCtx = null;
    var QC_SCHEMES = [
      ["macaron", "马卡龙"],
      ["candy", "糖果"],
      ["rouge", "酒红"],
      ["bamboo", "翠青"],
      ["aurora", "极光幻彩"],
      ["deepsea", "深海蓝调"],
      ["sunset", "落日熔金"],
      ["forest", "森林秘语"],
      ["champagne", "香槟鎏金"],
      ["lavender", "薰衣草梦境"],
      ["mint", "薄荷汽水"],
      ["lava", "岩浆熔岩"],
      ["galaxy", "银河星紫"],
      ["ink", "墨韵黑白"],
      ["indigo", "靛蓝夜曲"]
    ];
    function qeditEnsure() {
      if (qeditEl) return qeditEl;
      qeditEl = document2.createElement("div");
      qeditEl.className = "dshwv-qedit";
      qeditEl.style.display = "none";
      document2.body.appendChild(qeditEl);
      if (!window2.__dshwQeditBound) {
        window2.__dshwQeditBound = true;
        document2.addEventListener("pointerdown", function(e) {
          if (!qeditEl || qeditEl.style.display === "none") return;
          if (e.target && e.target.closest && (e.target.closest(".dshwv-qedit") || e.target.closest(".dshwv-rgbmenu") || e.target.closest(".dshwv-custmenu") || e.target.closest(".dshwv-rgbhead") || e.target.closest(".dshwv-custbtn") || e.target.closest(".dshwv-fontwrap") || e.target.closest(".dshwv-usagepanel") || e.target.closest(".dshwv-usage-mask") || e.target.closest(".dshwv-resmask"))) return;
          try {
            if (qeditAnchorIs(e.target)) return;
          } catch (err) {
          }
          qeditClose();
        }, true);
        document2.addEventListener("keydown", function(e) {
          if (e.key === "Escape") qeditClose();
        });
      }
      return qeditEl;
    }
    function qeditClose() {
      if (qeditEl) qeditEl.style.display = "none";
      qeditCtx = null;
    }
    function qeditAnchorIs(anchor) {
      try {
        if (!anchor) return false;
        if (!qeditEl || qeditEl.style.display === "none") return false;
        var cur = qeditCtx && qeditCtx.anchor;
        return !!cur && (cur === anchor || cur.contains && cur.contains(anchor));
      } catch (err) {
        return false;
      }
    }
    function qeditToggleClose(anchor) {
      if (!qeditAnchorIs(anchor)) return false;
      qeditClose();
      return true;
    }
    function qRow() {
      var d = document2.createElement("div");
      d.className = "dshwv-qedit-row";
      return d;
    }
    function qLabel(t) {
      var s = document2.createElement("label");
      s.textContent = t;
      return s;
    }
    function qeditPlace(anchorRect, widthPx, preferAbove) {
      try {
        var vp = viewport();
        var box = qeditEl;
        var w = Math.max(180, Math.min(widthPx || 320, vp.w - 16));
        box.style.width = w + "px";
        box.style.display = "block";
        var h = box.offsetHeight || 200;
        var left = anchorRect.left + anchorRect.width / 2 - w / 2;
        left = Math.max(8, Math.min(left, vp.w - w - 8));
        var top = preferAbove ? anchorRect.top - h - 8 : anchorRect.bottom + 6;
        if (preferAbove && top < 8) top = Math.min(8, anchorRect.bottom + 6);
        if (top + h > vp.h - 8) top = Math.max(8, vp.h - h - 8);
        if (top < 8) top = 8;
        box.style.left = Math.round(left) + "px";
        box.style.top = Math.round(top) + "px";
      } catch (err) {
      }
    }
    function qColorSelectBuild(current, onPick, opts) {
      opts = opts || {};
      var allowNone = !!opts.allowNone;
      var oLabel = opts.label || "颜色";
      var oHex = opts.defaultHex || "#203170";
      var oText = opts.defaultText || "默认";
      var row = qRow();
      row.appendChild(qLabel(oLabel));
      var wrap = document2.createElement("div");
      wrap.className = "dshwv-rgbwrap dshwv-qcolwrap";
      var head = document2.createElement("button");
      head.type = "button";
      head.className = "dshwv-rgbhead";
      head.title = "颜色:纯色或跑马灯";
      wrap.appendChild(head);
      var menu = document2.createElement("div");
      menu.className = "dshwv-rgbmenu dshwv-qcolmenu";
      wrap.appendChild(menu);
      var sw = document2.createElement("span");
      sw.className = "dshwv-qcolorhost";
      function modeOf(v) {
        if (v === "none") return allowNone ? "none" : "solid";
        if (v === "solid" || isScheme(v)) return v;
        return allowNone ? "none" : "solid";
      }
      var curMode = modeOf(current);
      function isScheme(v) {
        for (var i = 0; i < QC_SCHEMES.length; i++) if (QC_SCHEMES[i][0] === v) return true;
        return false;
      }
      function labelOf(v) {
        if (v === "none") return "无";
        if (v === "solid") return "纯色";
        for (var i = 0; i < QC_SCHEMES.length; i++) if (QC_SCHEMES[i][0] === v) return QC_SCHEMES[i][1];
        return allowNone ? "无" : "纯色";
      }
      function renderSolid(hex, onSet) {
        sw.innerHTML = "";
        var ci = document2.createElement("input");
        ci.type = "color";
        ci.value = hex;
        ci.title = "选择纯色";
        ci.addEventListener("input", function() {
          if (onSet) onSet(ci.value);
        });
        ci.addEventListener("change", function() {
          if (onSet) onSet(ci.value);
        });
        sw.appendChild(ci);
        var def = document2.createElement("button");
        def.type = "button";
        def.className = "dshwv-bubmini";
        def.textContent = oText;
        def.title = "恢复为" + oText + "色值";
        def.style.width = "auto";
        def.style.padding = "0 6px";
        def.addEventListener("click", function() {
          if (onSet) onSet(oHex);
        });
        sw.appendChild(def);
      }
      function fill() {
        menu.innerHTML = "";
        function add(v, lab) {
          var o = document2.createElement("div");
          o.className = "dshwv-rgbopt" + (v === curMode ? " dshwv-rgbcur" : "");
          if (v !== "solid" && v !== "none") {
            o.classList.add("optgrad");
            o.classList.add("opt-" + v);
          }
          o.textContent = (v === curMode ? "✓ " : "") + lab;
          o.addEventListener("click", function() {
            curMode = v;
            closeMenu2();
            if (onPick) onPick(v);
          });
          menu.appendChild(o);
        }
        if (allowNone) add("none", "无");
        add("solid", "纯色");
        for (var i = 0; i < QC_SCHEMES.length; i++) add(QC_SCHEMES[i][0], QC_SCHEMES[i][1]);
      }
      var hexSetter = null;
      function sync(mode, hex, onSet) {
        curMode = modeOf(mode);
        hexSetter = onSet || null;
        head.textContent = labelOf(curMode);
        if (curMode === "solid") renderSolid(hex || oHex, function(h) {
          if (hexSetter) hexSetter(h);
        });
        else sw.innerHTML = "";
        fill();
      }
      function closeMenu2() {
        menu.classList.remove("dshwv-rgbopen");
        bubbleColorOpenMenu = null;
      }
      head.addEventListener("click", function(e) {
        e.stopPropagation();
        if (bubbleColorOpenMenu === menu) {
          closeMenu2();
          return;
        }
        if (bubbleColorOpenMenu) bubbleColorOpenMenu.classList.remove("dshwv-rgbopen");
        fill();
        bubbleColorOpenMenu = menu;
        dshwDropOpen(menu, head);
      });
      if (!window2.__dshwColorBound) {
        window2.__dshwColorBound = true;
        document2.addEventListener("pointerdown", function(e) {
          if (!bubbleColorOpenMenu) return;
          try {
            if (e.target && e.target.closest && (e.target.closest(".dshwv-qcolwrap") || e.target.closest(".dshwv-rgbmenu"))) return;
          } catch (err) {
          }
          bubbleColorOpenMenu.classList.remove("dshwv-rgbopen");
          bubbleColorOpenMenu = null;
        }, true);
      }
      row.appendChild(wrap);
      row.appendChild(sw);
      fill();
      return { row, sync };
    }
    function qStyleChecksBuild(getBool, setBool) {
      var row = qRow();
      [["加粗", "bold"], ["斜体", "italic"], ["下划线", "ul"]].forEach(function(item) {
        var lab = document2.createElement("label");
        lab.style.display = "inline-flex";
        lab.style.alignItems = "center";
        lab.style.gap = "3px";
        var cb = document2.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!getBool(item[1]);
        cb.addEventListener("change", function() {
          setBool(item[1], cb.checked);
        });
        lab.appendChild(cb);
        lab.appendChild(document2.createTextNode(item[0]));
        row.appendChild(lab);
      });
      return row;
    }
    function openQuickTextEditor(m, anchorBtn) {
      if (!m || m.type !== "text" && m.type !== "link") return;
      if (qeditToggleClose(anchorBtn)) return;
      qeditClose();
      var box = qeditEnsure();
      box.innerHTML = "";
      qeditCtx = { kind: m.type === "link" ? "link" : "text", m, anchor: anchorBtn || null };
      function changed() {
        try {
          renderBubblePv();
        } catch (err) {
        }
      }
      var r0 = qRow();
      r0.appendChild(qLabel(m.type === "link" ? "链接文字" : "内容"));
      var tx = document2.createElement("input");
      tx.type = "text";
      tx.maxLength = 60;
      tx.className = "dshwv-qedit-content";
      tx.value = m.text || "";
      tx.addEventListener("input", function() {
        m.text = tx.value || " ";
        changed();
      });
      r0.appendChild(tx);
      box.appendChild(r0);
      if (m.type === "link") {
        var rUrl = qRow();
        rUrl.appendChild(qLabel("链接"));
        var uInp = document2.createElement("input");
        uInp.type = "text";
        uInp.className = "dshwv-qedit-content";
        uInp.value = m.url || "";
        uInp.placeholder = "https:// …";
        uInp.title = "点击打开;需以 http:// 或 https:// 开头";
        uInp.addEventListener("input", function() {
          m.url = uInp.value || "";
        });
        rUrl.appendChild(uInp);
        box.appendChild(rUrl);
      }
      box.appendChild(bubbleFontEditRow(function() {
        return m.fontFamily || "";
      }, function(v) {
        m.fontFamily = v || "";
        changed();
      }));
      var r1 = qRow();
      r1.appendChild(qLabel("字号"));
      var sz = document2.createElement("input");
      sz.type = "range";
      sz.min = "1";
      sz.max = "50";
      sz.step = "1";
      sz.className = "dshwv-range";
      sz.style.flex = "1";
      sz.value = String(Math.max(1, Math.min(50, Math.round(Number(m.size) || 6))));
      var szNum = document2.createElement("span");
      szNum.className = "dshwv-volpct";
      szNum.textContent = sz.value;
      sz.addEventListener("input", function() {
        m.size = Math.round(Number(sz.value) || 3);
        szNum.textContent = sz.value;
        changed();
      });
      r1.appendChild(sz);
      r1.appendChild(szNum);
      box.appendChild(r1);
      box.appendChild(qStyleChecksBuild(function(k) {
        return m[k] === true;
      }, function(k, v) {
        m[k] = v;
        changed();
      }));
      var grpT = document2.createElement("div");
      grpT.className = "dshwv-peakrow";
      var curColor = m.rgb ? m.rgb : "solid";
      var cc = qColorSelectBuild(curColor, function(v) {
        onPick(v);
      });
      grpT.appendChild(cc.row);
      function onPick(v) {
        if (v === "solid") {
          m.rgb = "";
          if (!m.color) m.color = "#203170";
        } else {
          m.rgb = v;
          m.color = "";
        }
        cc.sync(v === "solid" ? "solid" : v, m.color, function(hex) {
          m.color = hex;
          changed();
        });
        changed();
      }
      var bgCurT = m.bgRgb ? m.bgRgb : m.bg ? "solid" : "none";
      var bgt = qColorSelectBuild(bgCurT, function(v) {
        if (v === "none") {
          m.bgRgb = "";
          m.bg = "";
        } else if (v === "solid") {
          m.bgRgb = "";
          if (!m.bg) m.bg = "#dbe4f5";
        } else {
          m.bgRgb = v;
          m.bg = "";
        }
        bgt.sync(v === "none" ? "none" : v, m.bg, function(hex) {
          m.bg = hex;
          changed();
        });
        changed();
      }, { label: "底色", defaultHex: "#dbe4f5", defaultText: "默认", allowNone: true });
      grpT.appendChild(bgt.row);
      box.appendChild(grpT);
      cc.sync(curColor, m.color || "#203170", function(hex) {
        m.color = hex;
        changed();
      });
      bgt.sync(bgCurT, m.bg || "#dbe4f5", function(hex) {
        m.bg = hex;
        changed();
      });
      try {
        var pr = bubblePvPrevEl.getBoundingClientRect();
        qeditPlace(pr, Math.max(230, Math.round(pr.width - 24)), true);
      } catch (err) {
        qeditPlace({ left: 40, right: 360, top: 200, bottom: 300, width: 320 }, 320, false);
      }
    }
    function openQuickModuleEditor(m, anchorBtn) {
      if (!m || bubbleIsImgMod(m) || m.type === "random" || m.type === "text") return;
      if (qeditToggleClose(anchorBtn)) return;
      qeditClose();
      var box = qeditEnsure();
      box.innerHTML = "";
      qeditCtx = { kind: "module", m, anchor: anchorBtn || null };
      function changed() {
        try {
          renderBubblePv();
        } catch (err) {
        }
      }
      function sizeRow() {
        var r = qRow();
        r.appendChild(qLabel("字号"));
        var sz = document2.createElement("input");
        sz.type = "range";
        sz.min = "1";
        sz.max = "50";
        sz.step = "1";
        sz.className = "dshwv-range";
        sz.style.flex = "1";
        sz.value = String(Math.max(1, Math.min(50, Math.round(Number(m.size) || 6))));
        var num = document2.createElement("span");
        num.className = "dshwv-volpct";
        num.textContent = sz.value;
        sz.addEventListener("input", function() {
          m.size = Math.round(Number(sz.value) || 3);
          num.textContent = sz.value;
          changed();
        });
        r.appendChild(sz);
        r.appendChild(num);
        box.appendChild(r);
      }
      function glyphRow() {
        box.appendChild(qStyleChecksBuild(function(k) {
          return m[k] === true;
        }, function(k, v) {
          m[k] = v;
          changed();
        }));
      }
      function tplRow() {
        var r = qRow();
        r.appendChild(qLabel("内容"));
        var inp = document2.createElement("input");
        inp.type = "text";
        inp.className = "dshwv-qedit-content";
        inp.value = m.tpl || "";
        var isModelBal = bubbleIsModelMod(m) && (m.type === "balance" || m.type === "today");
        var isModelQuota = bubbleIsModelMod(m) && m.type === "quota";
        var isModelPlan = bubbleIsModelMod(m) && m.type === "plan";
        inp.placeholder = isModelPlan ? "例: 额度已用 {plan} · {plan_reset}" : isModelQuota ? "例: 额度 {quota} · 剩 {quota_left}" : isModelBal ? "例: {balance} 或 今日 {today}" : m.type === "balance" ? "例: {balance_ds}" : m.type === "today" ? "例: 今日已用 {expense_ds}" : bubbleIsPeakCount(m) ? "例: 距空闲 {countdown}" : "例: 当前 {status}";
        inp.title = "可用占位符(英文): " + (isModelPlan ? "{plan} / {plan_left} / {plan_reset}" : isModelQuota ? "{quota} / {quota_used} / {quota_left} / {quota_total} / {quota_reset}" : isModelBal ? "{balance} / {today}" : m.type === "peak" || m.type === "nextpeak" ? "{status} / {countdown}" : m.type === "balance" ? "{balance_ds}" : "{expense_ds}");
        inp.addEventListener("input", function() {
          m.tpl = inp.value;
          changed();
        });
        r.appendChild(inp);
        var qb2 = document2.createElement("button");
        qb2.type = "button";
        qb2.className = "dshwv-tplq";
        qb2.textContent = "?";
        qb2.title = "可用占位符用法";
        qb2.style.marginLeft = "4px";
        qb2.addEventListener("click", function(e) {
          e.stopPropagation();
          bubbleTplHelpToggle(m, qb2);
        });
        r.appendChild(qb2);
        box.appendChild(r);
      }
      tplRow();
      if (m.type === "peak" || m.type === "nextpeak") {
        var srow = qRow();
        srow.appendChild(qLabel("显示样式"));
        var sel = document2.createElement("select");
        for (var si = 0; si < BUBBLE_PEAK_STYLE_OPTS.length; si++) {
          var so = document2.createElement("option");
          so.value = BUBBLE_PEAK_STYLE_OPTS[si][0];
          so.textContent = BUBBLE_PEAK_STYLE_OPTS[si][1];
          sel.appendChild(so);
        }
        sel.value = bubblePeakStyleOf(m);
        srow.appendChild(sel);
        sel.style.flex = "1";
        sel.style.minWidth = "0";
        box.appendChild(srow);
        dshwCustSel(sel);
        sel.addEventListener("change", function() {
          m.peakStyle = sel.value || "default";
          changed();
        });
        var sts = [
          { label: "高峰色", colorKey: "peakColor", rgbKey: "peakRgb", defaultHex: "#e0433f", defaultText: "默认红", bgKey: "peakBg", bgRgbKey: "peakBgRgb", bgHex: "#fbe7e6" },
          { label: "空闲色", colorKey: "offColor", rgbKey: "offRgb", defaultHex: "#2fa24c", defaultText: "默认绿", bgKey: "offBg", bgRgbKey: "offBgRgb", bgHex: "#e4f3e7" }
        ];
        if (!m.peakColor) m.peakColor = "#e0433f";
        if (!m.offColor) m.offColor = "#2fa24c";
        for (var psi2 = 0; psi2 < sts.length; psi2++) {
          (function(st) {
            var grp = document2.createElement("div");
            grp.className = "dshwv-peakrow";
            var curCol = m[st.rgbKey] ? m[st.rgbKey] : "solid";
            var cc2 = qColorSelectBuild(curCol, function(v) {
              if (v === "solid") {
                m[st.rgbKey] = "";
                if (!m[st.colorKey]) m[st.colorKey] = st.defaultHex;
              } else {
                m[st.rgbKey] = v;
                m[st.colorKey] = "";
              }
              cc2.sync(v === "solid" ? "solid" : v, m[st.colorKey], function(hex) {
                m[st.colorKey] = hex;
                changed();
              });
              changed();
            }, { label: st.label, defaultHex: st.defaultHex, defaultText: st.defaultText });
            grp.appendChild(cc2.row);
            var bgV = m[st.bgRgbKey] ? m[st.bgRgbKey] : m[st.bgKey] ? "solid" : "none";
            var bgHex0 = m[st.bgKey] || st.bgHex;
            var bg2 = qColorSelectBuild(bgV, function(v) {
              if (v === "none") {
                m[st.bgRgbKey] = "";
                m[st.bgKey] = "";
              } else if (v === "solid") {
                m[st.bgRgbKey] = "";
                if (!m[st.bgKey]) m[st.bgKey] = bgHex0;
              } else {
                m[st.bgRgbKey] = v;
                m[st.bgKey] = "";
              }
              bg2.sync(v === "none" ? "none" : v, m[st.bgKey] || bgHex0, function(hex) {
                m[st.bgKey] = hex;
                changed();
              });
              changed();
            }, { label: "底色", defaultHex: bgHex0, defaultText: "默认", allowNone: true });
            grp.appendChild(bg2.row);
            box.appendChild(grp);
            cc2.sync(curCol, m[st.colorKey] || st.defaultHex, function(hex) {
              m[st.colorKey] = hex;
              changed();
            });
            bg2.sync(bgV, bgHex0, function(hex) {
              m[st.bgKey] = hex;
              changed();
            });
          })(sts[psi2]);
        }
        box.appendChild(bubbleFontEditRow(function() {
          return m.fontFamily || "";
        }, function(v) {
          m.fontFamily = v || "";
          changed();
        }));
        sizeRow();
        glyphRow();
      } else {
        box.appendChild(bubbleFontEditRow(function() {
          return m.fontFamily || "";
        }, function(v) {
          m.fontFamily = v || "";
          changed();
        }));
        sizeRow();
        glyphRow();
        var grp2 = document2.createElement("div");
        grp2.className = "dshwv-peakrow";
        var curC = m.rgb ? m.rgb : "solid";
        var ccA = qColorSelectBuild(curC, function(v) {
          if (v === "solid") {
            m.rgb = "";
            if (!m.color) m.color = "#203170";
          } else {
            m.rgb = v;
            m.color = "";
          }
          ccA.sync(v === "solid" ? "solid" : v, m.color, function(hex) {
            m.color = hex;
            changed();
          });
          changed();
        });
        grp2.appendChild(ccA.row);
        var bgCur = m.bgRgb ? m.bgRgb : m.bg ? "solid" : "none";
        var bgcA = qColorSelectBuild(bgCur, function(v) {
          if (v === "none") {
            m.bgRgb = "";
            m.bg = "";
          } else if (v === "solid") {
            m.bgRgb = "";
            if (!m.bg) m.bg = "#dbe4f5";
          } else {
            m.bgRgb = v;
            m.bg = "";
          }
          bgcA.sync(v === "none" ? "none" : v, m.bg, function(hex) {
            m.bg = hex;
            changed();
          });
          changed();
        }, { label: "底色", defaultHex: "#dbe4f5", defaultText: "默认", allowNone: true });
        grp2.appendChild(bgcA.row);
        box.appendChild(grp2);
        ccA.sync(curC, m.color || "#203170", function(hex) {
          m.color = hex;
          changed();
        });
        bgcA.sync(bgCur, m.bg || "#dbe4f5", function(hex) {
          m.bg = hex;
          changed();
        });
      }
      try {
        var pr = bubblePvPrevEl.getBoundingClientRect();
        qeditPlace(pr, Math.max(260, Math.round(pr.width - 16)), true);
      } catch (err) {
        qeditPlace({ left: 40, right: 360, top: 200, bottom: 300, width: 320 }, 320, false);
      }
    }
    function openQuickSentenceEditor(line, mod, rowTx, anchorBtn) {
      if (!line) return;
      if (qeditToggleClose(anchorBtn)) return;
      qeditClose();
      var box = qeditEnsure();
      box.innerHTML = "";
      qeditCtx = { kind: "line", line, mod, anchor: anchorBtn || null };
      function lv(lk, mk, dft) {
        var v = line[lk];
        if (v !== void 0 && v !== null) return v;
        var mv = mod[lk];
        if (mv !== void 0 && mv !== null) return mv;
        return dft;
      }
      var r0 = qRow();
      r0.appendChild(qLabel("句子"));
      var tx = document2.createElement("input");
      tx.type = "text";
      tx.className = "dshwv-qedit-content";
      tx.value = line.t || "";
      tx.addEventListener("input", function() {
        line.t = tx.value || " ";
        try {
          if (rowTx) rowTx.value = tx.value || "";
        } catch (err) {
        }
      });
      r0.appendChild(tx);
      box.appendChild(r0);
      box.appendChild(bubbleFontEditRow(function() {
        return lv("fontFamily", "fontFamily", "") || "";
      }, function(v) {
        line.fontFamily = v || "";
      }));
      var r1 = qRow();
      r1.appendChild(qLabel("字号"));
      var sz = document2.createElement("input");
      sz.type = "range";
      sz.min = "1";
      sz.max = "50";
      sz.step = "1";
      sz.className = "dshwv-range";
      sz.style.flex = "1";
      sz.value = String(Math.max(1, Math.min(50, Math.round(Number(lv("size", "size", 6))))));
      var szNum = document2.createElement("span");
      szNum.className = "dshwv-volpct";
      szNum.textContent = sz.value;
      sz.addEventListener("input", function() {
        line.size = Math.round(Number(sz.value) || 3);
        szNum.textContent = sz.value;
      });
      r1.appendChild(sz);
      r1.appendChild(szNum);
      box.appendChild(r1);
      box.appendChild(qStyleChecksBuild(function(k) {
        return !!lv(k, k, false);
      }, function(k, v) {
        line[k] = v;
      }));
      var curColor = lv("rgb", "rgb", "") || "solid";
      var cc = qColorSelectBuild(curColor, function(v) {
        onPick(v);
      });
      box.appendChild(cc.row);
      function onPick(v) {
        if (v === "solid") {
          line.rgb = "";
          if (!line.color) line.color = "#203170";
        } else {
          line.rgb = v;
          line.color = "";
        }
        cc.sync(v === "solid" ? "solid" : v, line.color, function(hex) {
          line.color = hex;
        });
      }
      cc.sync(curColor, line.color || mod.color || "#203170", function(hex) {
        line.color = hex;
      });
      var lineBgV = line.bgRgb ? line.bgRgb : line.bg ? "solid" : mod.bgRgb ? mod.bgRgb : mod.bg ? "solid" : "none";
      var lineBgHex0 = line.bg || mod.bg || "#dbe4f5";
      var bgcc2 = qColorSelectBuild(lineBgV, function(v) {
        if (v === "none") {
          line.bgRgb = "";
          line.bg = "";
        } else if (v === "solid") {
          line.bgRgb = "";
          if (!line.bg) line.bg = lineBgHex0;
        } else {
          line.bgRgb = v;
          line.bg = "";
        }
        bgcc2.sync(v === "none" ? "none" : v, line.bg || lineBgHex0, function(h) {
          line.bg = h;
        });
      }, { label: "底色", defaultHex: lineBgHex0, defaultText: "默认", allowNone: true });
      box.appendChild(bgcc2.row);
      bgcc2.sync(lineBgV, lineBgHex0, function(h) {
        line.bg = h;
      });
      var r = anchorBtn ? anchorBtn.getBoundingClientRect() : { left: 40, right: 360, top: 200, bottom: 260, width: 320 };
      qeditPlace(r, 340, false);
    }
    function renderBubblePal() {
      bubblePalEl.innerHTML = "";
      var defs = [
        { key: "text", label: "文本", cb: function() {
          bubbleModuleAdd({ type: "text", text: "新内容", size: 6, bold: true });
        } },
        { key: "balance", label: "余额数值", pin: true, cb: function() {
          bubbleModuleAdd({ type: "balance", size: 11, tpl: "{balance_ds}" });
        } },
        { key: "today", label: "今日已用", pin: true, cb: function() {
          bubbleModuleAdd({ type: "today", size: 1, tpl: "今日已用 {expense_ds}" });
        } },
        { key: "peak", label: "峰谷时段", pin: true, cb: function() {
          bubbleModuleAdd({ type: "peak", size: 4, peakColor: "#e0433f", offColor: "#2fa24c", tpl: "{status}" });
        } },
        { key: "nextpeak", label: "时段倒计时", pin: true, cb: function() {
          bubbleModuleAdd({ type: "peak", size: 6, bold: true, peakStyle: "count", peakColor: "#e0433f", offColor: "#2fa24c", tpl: "{countdown}" });
        } },
        { key: "random", label: "随机语句", cb: function() {
          bubbleModuleAdd(bubbleCloneModule(bubbleDefaultSecondModules()[0]));
        } },
        { key: "link", label: "超链接", cb: function() {
          bubbleModuleAdd(bubblePaletteModule("link"));
        } },
        { key: "image", label: "图片/动图", cb: function() {
          bubblePickImageToAdd();
        } },
        { key: "randimg", label: "随机图片", cb: function() {
          bubbleModuleNew({ type: "randimg", imgs: [], imgScale: 1 });
        } }
      ];
      for (var i = 0; i < defs.length; i++) {
        (function(d) {
          var chip = document2.createElement("div");
          chip.className = "dshwv-palchip";
          chip.setAttribute("data-pal", d.key);
          chip.textContent = d.label;
          chip.title = d.pin ? "内置数值模块(内容锁定)" : "点击加入泡泡";
          chip.draggable = true;
          chip.addEventListener("click", function(e) {
            e.stopPropagation();
            d.cb();
          });
          chip.addEventListener("dragstart", function(e) {
            try {
              e.dataTransfer.setData("text/plain", d.key);
            } catch (err) {
            }
            bubbleDragKey = d.key;
          });
          bubblePalEl.appendChild(chip);
        })(defs[i]);
      }
      if (apiModelsLoaded) {
        apiModels.forEach(function(am) {
          if (!am || !am.id || am.builtin) return;
          var key = "bal:" + am.id;
          var chip2 = document2.createElement("div");
          chip2.className = "dshwv-palchip";
          chip2.setAttribute("data-pal", key);
          chip2.textContent = "余额·" + am.name;
          chip2.title = "该模型的余额" + (am.balanceMode === "events" ? "（该厂商无余额接口，显示为 —）" : "") + "；模板变量 {balance} / {today}";
          chip2.draggable = true;
          chip2.addEventListener("click", function(e) {
            e.stopPropagation();
            bubbleModuleAdd({ type: "balance", modelId: am.id, size: 8, tpl: "{balance}" });
          });
          chip2.addEventListener("dragstart", function(e) {
            try {
              e.dataTransfer.setData("text/plain", key);
            } catch (err) {
            }
            bubbleDragKey = key;
          });
          bubblePalEl.appendChild(chip2);
          var key3 = "qt:" + am.id;
          var chip3 = document2.createElement("div");
          chip3.className = "dshwv-palchip";
          chip3.setAttribute("data-pal", key3);
          chip3.textContent = "额度·" + am.name;
          chip3.title = "该模型的手动额度（在模型菜单「额度（手动）」里填总量与已用）；模板变量 {quota} / {quota_used} / {quota_left} / {quota_total} / {quota_reset}";
          chip3.draggable = true;
          chip3.addEventListener("click", function(e) {
            e.stopPropagation();
            bubbleModuleAdd({ type: "quota", modelId: am.id, size: 8, tpl: "已用 {quota} · 剩 {quota_left}" });
          });
          chip3.addEventListener("dragstart", function(e) {
            try {
              e.dataTransfer.setData("text/plain", key3);
            } catch (err) {
            }
            bubbleDragKey = key3;
          });
          bubblePalEl.appendChild(chip3);
          if (apiPlanSupport(am.id)) {
            var key4 = "pq:" + am.id;
            var chip4 = document2.createElement("div");
            chip4.className = "dshwv-palchip";
            chip4.setAttribute("data-pal", key4);
            chip4.textContent = "订阅额度·" + am.name;
            chip4.title = "该厂商的订阅额度（由厂商接口读取，非手动）；模板变量 {plan} / {plan_left} / {plan_reset}";
            chip4.draggable = true;
            chip4.addEventListener("click", function(e) {
              e.stopPropagation();
              bubbleModuleAdd({ type: "plan", modelId: am.id, size: 8, tpl: "额度 {plan}" });
            });
            chip4.addEventListener("dragstart", function(e) {
              try {
                e.dataTransfer.setData("text/plain", key4);
              } catch (err) {
              }
              bubbleDragKey = key4;
            });
            bubblePalEl.appendChild(chip4);
          }
        });
      } else if (apiModelsError) {
        var chipErr = document2.createElement("div");
        chipErr.className = "dshwv-palchip";
        chipErr.textContent = "⚠ 模型列表加载失败，点此重试";
        chipErr.style.opacity = ".85";
        chipErr.addEventListener("click", function(e) {
          e.stopPropagation();
          apiModelsError = "";
          loadApiModels(function() {
            try {
              renderBubblePal();
            } catch (err) {
            }
          }, true);
        });
        bubblePalEl.appendChild(chipErr);
      } else {
        var chipLd = document2.createElement("div");
        chipLd.className = "dshwv-palchip";
        chipLd.textContent = "余额·加载中…";
        chipLd.style.opacity = ".6";
        bubblePalEl.appendChild(chipLd);
        loadApiModels(function() {
          try {
            renderBubblePal();
          } catch (err) {
          }
        });
      }
      for (var li = 0; li < bubbleLib.length; li++) {
        (function(lb) {
          var chip = document2.createElement("div");
          chip.className = "dshwv-libchip";
          chip.title = "从模块库加入: " + lb.name;
          var body2 = document2.createElement("div");
          body2.className = "dshwv-palchip";
          body2.setAttribute("data-pal", "lib:" + lb.id);
          body2.textContent = "▦ " + lb.name;
          body2.draggable = true;
          body2.addEventListener("click", function(e) {
            e.stopPropagation();
            bubbleModuleAdd(bubbleCloneModule(lb.module));
          });
          body2.addEventListener("dragstart", function(e) {
            try {
              e.dataTransfer.setData("text/plain", "lib:" + lb.id);
            } catch (err) {
            }
            bubbleDragKey = "lib:" + lb.id;
          });
          chip.appendChild(body2);
          var del = document2.createElement("button");
          del.type = "button";
          del.className = "dshwv-libdel";
          del.textContent = "✕";
          del.title = "从模块库删除: " + lb.name;
          del.addEventListener("click", function(e) {
            e.stopPropagation();
            showConfirm("从模块库删除「" + lb.name + "」?", function() {
              bubbleLibDel(lb.id);
              if (bubblePalEl) renderBubblePal();
            });
          });
          chip.appendChild(del);
          bubblePalEl.appendChild(chip);
        })(bubbleLib[li]);
      }
      var newChip = document2.createElement("div");
      newChip.className = "dshwv-paladd";
      newChip.textContent = "+ 新建模块";
      newChip.title = "新建模块(先选类型:文本/随机语句/图片动图/随机图片)";
      newChip.draggable = true;
      newChip.addEventListener("click", function(e) {
        e.stopPropagation();
        bubbleModuleWizard();
      });
      newChip.addEventListener("dragstart", function(e) {
        try {
          e.dataTransfer.setData("text/plain", "wizard");
        } catch (err) {
        }
        bubbleDragKey = "wizard";
      });
      bubblePalEl.appendChild(newChip);
    }
    function bubbleModuleWizard() {
      bubbleModuleNew({ type: "text", text: "新内容", size: 6 }, true);
    }
    function bubbleLibById(id) {
      for (var i = 0; i < bubbleLib.length; i++) if (bubbleLib[i].id === id) return bubbleLib[i];
      return null;
    }
    var bubbleDragKey = null;
    function bubbleItemHasImage() {
      try {
        var it = bubbleEditTarget();
        if (!it || !it.modules) return false;
        for (var i = 0; i < it.modules.length; i++) if (bubbleIsImgMod(it.modules[i])) return true;
      } catch (err) {
      }
      return false;
    }
    function bubbleWarnOneImage() {
      showConfirm("一个泡泡只能有一个图片类模块(图片/动图 或 随机图片)。当前泡泡已含图片,请先修改或删除现有图片模块后再添加。", function() {
      }, "知道了");
    }
    function bubbleModuleAdd(m) {
      try {
        var it = bubbleEditTarget();
        if (!it) return;
        if (!it.modules) it.modules = [];
        if (m && bubbleIsImgMod(m) && bubbleItemHasImage()) {
          bubbleWarnOneImage();
          return;
        }
        if (bubbleRowsOf(it.modules).length >= BUBBLE_PV_ROW_MAX) {
          bubblePvWarn("泡泡最多 " + BUBBLE_PV_ROW_MAX + " 行,无法再加新行");
          return;
        }
        it.modules.push(m);
        renderBubblePv();
      } catch (err) {
      }
    }
    function bubbleModuleNew(m, isNew) {
      openModuleEditor(m, function(saved) {
        if (saved) bubbleModuleAdd(saved);
      }, isNew);
    }
    function bubblePickImageToAdd() {
      if (bubbleItemHasImage()) {
        bubbleWarnOneImage();
        return;
      }
      bubbleModuleNew({ type: "image", imgId: "", size: 6 });
    }
    var BUBBLE_PV_ROW_MAX = 6;
    var BUBBLE_PV_MOD_MAX = 6;
    var bubbleModDrag = null;
    var bubblePvZone = "";
    function bubblePvWarn(msg) {
      showConfirm(msg, function() {
      }, "知道了");
    }
    function bubblePvRowModel() {
      var it = bubbleEditTarget();
      if (!it || !Array.isArray(it.modules)) return [];
      return bubbleRowsOf(it.modules);
    }
    function bubblePvRowCommit(rows) {
      var it = bubbleEditTarget();
      if (!it) return;
      it.modules = bubbleRowsFlat(rows);
      renderBubblePv();
    }
    function bubbleModuleEdit(m, anchorBtn) {
      try {
        if (m && (m.type === "text" || m.type === "link")) {
          openQuickTextEditor(m, anchorBtn);
          return;
        }
        if (m && (m.type === "balance" || m.type === "today" || m.type === "peak" || m.type === "nextpeak")) {
          openQuickModuleEditor(m, anchorBtn);
          return;
        }
        openModuleEditor(m, function(saved) {
          if (saved) renderBubblePv();
        });
      } catch (err) {
      }
    }
    function bubblePvDelBlock(ri, mi2) {
      var rows = bubblePvRowModel();
      if (!rows[ri] || mi2 >= rows[ri].length) return;
      rows[ri].splice(mi2, 1);
      if (!rows[ri].length) rows.splice(ri, 1);
      bubblePvRowCommit(rows);
    }
    function bubblePvMoveRow(fromRow, toRow, zone) {
      var rows = bubblePvRowModel();
      if (fromRow < 0 || fromRow >= rows.length || toRow < 0 || toRow >= rows.length || fromRow === toRow) return;
      var target = rows[toRow];
      var moved = rows.splice(fromRow, 1)[0];
      var t = rows.indexOf(target);
      if (t < 0) {
        rows.push(moved);
        bubblePvRowCommit(rows);
        return;
      }
      rows.splice(zone === "after" ? t + 1 : t, 0, moved);
      bubblePvRowCommit(rows);
    }
    function bubblePvDropBlock(riFrom, miFrom, riTarget, zone) {
      try {
        var rows = bubblePvRowModel();
        if (!rows[riFrom] || miFrom >= rows[riFrom].length || !rows[riTarget]) return;
        var m = rows[riFrom][miFrom];
        if (!m || typeof m !== "object") return;
        var tRow = rows[riTarget];
        var imageInvolved = bubbleIsImgMod(m) || bubbleIsImgMod(tRow[0]);
        if (imageInvolved && (zone === "pairL" || zone === "pairR")) zone = "before";
        rows[riFrom].splice(miFrom, 1);
        if (!rows[riFrom].length) rows.splice(riFrom, 1);
        var tIdx = -1;
        for (var i = 0; i < rows.length; i++) if (rows[i] === tRow) {
          tIdx = i;
          break;
        }
        if (tIdx >= 0 && (zone === "pairL" || zone === "pairR")) {
          var tgt = rows[tIdx];
          if (!bubbleIsImgMod(m) && !bubbleIsImgMod(tgt[0])) {
            if (tgt.length >= BUBBLE_PV_MOD_MAX) {
              bubblePvWarn("同一行最多 " + BUBBLE_PV_MOD_MAX + " 个模块,无法再并入");
              return;
            }
            tgt.splice(zone === "pairL" ? 0 : tgt.length, 0, m);
            bubblePvRowCommit(rows);
            return;
          }
          zone = "before";
        }
        if (rows.length >= BUBBLE_PV_ROW_MAX) {
          bubblePvWarn("泡泡最多 " + BUBBLE_PV_ROW_MAX + " 行,无法另起新行");
          return;
        }
        var at = tIdx >= 0 ? zone === "after" ? tIdx + 1 : tIdx : Math.min(riFrom, rows.length);
        rows.splice(at, 0, [m]);
        bubblePvRowCommit(rows);
      } catch (err) {
      }
    }
    function bubblePvDropBlockEnd(riFrom, miFrom) {
      var rows = bubblePvRowModel();
      if (!rows[riFrom] || miFrom >= rows[riFrom].length) return;
      var m = rows[riFrom][miFrom];
      rows[riFrom].splice(miFrom, 1);
      if (!rows[riFrom].length) rows.splice(riFrom, 1);
      if (rows.length >= BUBBLE_PV_ROW_MAX) {
        bubblePvWarn("泡泡最多 " + BUBBLE_PV_ROW_MAX + " 行,无法再另起一行");
        return;
      }
      rows.push([m]);
      bubblePvRowCommit(rows);
    }
    function bubblePvMoveRowEnd(fromRow) {
      var rows = bubblePvRowModel();
      if (fromRow < 0 || fromRow >= rows.length) return;
      rows.push(rows.splice(fromRow, 1)[0]);
      bubblePvRowCommit(rows);
    }
    function bubblePvAddToRow(ri) {
      var rows = bubblePvRowModel();
      if (!rows[ri]) return;
      if (rows[ri].length >= BUBBLE_PV_MOD_MAX) {
        bubblePvWarn("同一行最多 " + BUBBLE_PV_MOD_MAX + " 个模块");
        return;
      }
      rows[ri].push({ type: "text", text: "新内容", size: 6, bold: true });
      bubblePvRowCommit(rows);
    }
    function bubblePvPaletteToRow(key, ri) {
      try {
        var rows = bubblePvRowModel();
        if (!rows[ri]) return;
        var tgt = rows[ri];
        if (bubbleIsImgMod(tgt[0])) {
          bubblePvWarn("该行是图片类模块(图片/随机图片,独占一行):请拖到下方空白区另起一行");
          return;
        }
        if (key === "image" || key === "randimg") {
          bubblePvWarn("图片模块必须独占一整行:请拖到下方空白区新增");
          return;
        }
        if (key === "wizard") key = "text";
        var m = bubblePaletteModule(key);
        if (!m) return;
        if (tgt.length >= BUBBLE_PV_MOD_MAX) {
          bubblePvWarn("同一行最多 " + BUBBLE_PV_MOD_MAX + " 个模块,无法再加入");
          return;
        }
        tgt.push(m);
        bubblePvRowCommit(rows);
      } catch (err) {
      }
    }
    function bubblePaletteModule(key) {
      if (key === "text") return { type: "text", text: "新内容", size: 6, bold: true };
      if (key === "balance") return { type: "balance", size: 11, tpl: "{balance_ds}" };
      if (key === "today") return { type: "today", size: 1, tpl: "今日已用 {expense_ds}" };
      if (key === "peak") return { type: "peak", size: 4, peakColor: "#e0433f", offColor: "#2fa24c", tpl: "{status}" };
      if (key === "nextpeak") return { type: "peak", size: 6, bold: true, peakStyle: "count", peakColor: "#e0433f", offColor: "#2fa24c", tpl: "{countdown}" };
      if (key === "link") return { type: "link", text: "打开链接", url: "", size: 6, color: "#2f4488" };
      if (key === "randimg") return { type: "randimg", imgs: [], imgScale: 1 };
      if (typeof key === "string" && key.indexOf("bal:") === 0) {
        var am0 = apiModelById(key.slice(4));
        if (!am0) return null;
        return { type: "balance", modelId: am0.id, size: 8, tpl: "{balance}" };
      }
      if (typeof key === "string" && key.indexOf("qt:") === 0) {
        var am1 = apiModelById(key.slice(3));
        if (!am1) return null;
        return { type: "quota", modelId: am1.id, size: 8, tpl: "已用 {quota} · 剩 {quota_left}" };
      }
      if (typeof key === "string" && key.indexOf("pq:") === 0) {
        var am2 = apiModelById(key.slice(3));
        if (!am2) return null;
        return { type: "plan", modelId: am2.id, size: 8, tpl: "额度 {plan}" };
      }
      if (key === "random") return bubbleCloneModule(bubbleDefaultSecondModules()[0]);
      if (typeof key === "string" && key.indexOf("lib:") === 0) {
        var lb = bubbleLibById(key.slice(4));
        return lb ? bubbleCloneModule(lb.module) : null;
      }
      return null;
    }
    var PV_TOUCH_HOLD_MS = 400;
    var PV_TOUCH_SLOP = 8;
    var PV_TOUCH_BAND = 0.2;
    var pvTouchArm = null;
    var pvTouchDrag = null;
    var pvTouchSuppressAt = 0;
    function pvTouchBars() {
      try {
        return bubblePvEl ? [].slice.call(bubblePvEl.querySelectorAll(".dshwv-pvrow")) : [];
      } catch (err) {
        return [];
      }
    }
    function pvTouchBarIndexOf(bar) {
      var bars = pvTouchBars();
      for (var i = 0; i < bars.length; i++) if (bars[i] === bar) return i;
      return -1;
    }
    function pvTouchClearHighlight() {
      var bars = pvTouchBars();
      for (var i = 0; i < bars.length; i++) {
        bars[i].style.boxShadow = "";
        bars[i].style.outline = "";
      }
    }
    function pvTouchArmCancel() {
      if (pvTouchArm && pvTouchArm.timer) clearTimeout(pvTouchArm.timer);
      pvTouchArm = null;
    }
    function pvTouchDetach() {
      try {
        document2.removeEventListener("touchmove", pvTouchMove, true);
        document2.removeEventListener("touchend", pvTouchEnd, true);
        document2.removeEventListener("touchcancel", pvTouchEnd, true);
      } catch (err) {
      }
    }
    function pvTouchEnter() {
      var a = pvTouchArm;
      if (!a) return;
      pvTouchArm = null;
      pvTouchDrag = { kind: a.kind, el: a.el, ri: a.ri, mi: a.mi, key: a.key, y0: a.y, dy: 0, ri2: -1, zone: "" };
      pvTouchSuppressAt = Date.now() + 700;
      try {
        a.el.classList.add("dshwv-pv-dragging");
        if (navigator && navigator.vibrate) navigator.vibrate(10);
      } catch (err) {
      }
    }
    function pvTouchStart(e) {
      try {
        if (pvTouchDrag || pvTouchArm) return;
        if (!e.touches || e.touches.length !== 1) return;
        var t = e.touches[0];
        var el = e.target;
        if (!el || !el.closest) return;
        if (el.closest("button")) return;
        var bar = el.closest(".dshwv-pvrow");
        var grip = el.closest(".dshwv-pvdrag");
        var blk = el.closest(".dshwv-pvmod");
        var pal = el.closest("[data-pal]");
        var kind = "", ri = -1, mi2 = -1, key = "";
        if (pal) {
          kind = "pal";
          key = pal.getAttribute("data-pal") || "";
          el = pal;
        } else if (grip && bar) {
          kind = "row";
          ri = pvTouchBarIndexOf(bar);
          el = grip;
        } else if (blk && bar) {
          kind = "mod";
          ri = pvTouchBarIndexOf(bar);
          mi2 = [].slice.call(bar.querySelectorAll(".dshwv-pvmod")).indexOf(blk);
          el = blk;
        } else return;
        if (kind === "pal") {
          if (!key) return;
        } else if (ri < 0 || kind === "mod" && mi2 < 0) return;
        try {
          el.draggable = false;
        } catch (err) {
        }
        pvTouchArm = { kind, el, ri, mi: mi2, key, x: t.clientX, y: t.clientY, timer: setTimeout2(pvTouchEnter, PV_TOUCH_HOLD_MS) };
        document2.addEventListener("touchmove", pvTouchMove, { capture: true, passive: false });
        document2.addEventListener("touchend", pvTouchEnd, true);
        document2.addEventListener("touchcancel", pvTouchEnd, true);
      } catch (err) {
      }
    }
    function pvTouchMove(e) {
      try {
        var t = e.touches && e.touches[0];
        if (!t) return;
        if (pvTouchArm) {
          var dx = t.clientX - pvTouchArm.x;
          var dy = t.clientY - pvTouchArm.y;
          if (dx * dx + dy * dy > PV_TOUCH_SLOP * PV_TOUCH_SLOP) pvTouchArmCancel();
          return;
        }
        if (!pvTouchDrag) return;
        if (e.touches.length > 1) {
          pvTouchFinish(false);
          return;
        }
        try {
          e.preventDefault();
        } catch (err) {
        }
        pvTouchDrag.dy = t.clientY - pvTouchDrag.y0;
        try {
          pvTouchDrag.el.style.transform = "translateY(" + pvTouchDrag.dy + "px)";
        } catch (err) {
        }
        var bars = pvTouchBars();
        var ri2 = -1;
        var zone = "";
        for (var i = 0; i < bars.length; i++) {
          var rc = bars[i].getBoundingClientRect();
          if (!rc.width) continue;
          if (t.clientY < rc.top || t.clientY > rc.bottom) continue;
          ri2 = i;
          if (pvTouchDrag.kind === "pal") {
            zone = "join";
            break;
          }
          var xRel = (t.clientX - rc.left) / rc.width;
          if (pvTouchDrag.kind === "mod" && xRel < PV_TOUCH_BAND) {
            zone = "pairL";
            break;
          }
          if (pvTouchDrag.kind === "mod" && xRel > 1 - PV_TOUCH_BAND) {
            zone = "pairR";
            break;
          }
          zone = t.clientY < rc.top + rc.height / 2 ? "before" : "after";
          break;
        }
        pvTouchDrag.ri2 = ri2;
        pvTouchDrag.zone = zone;
        pvTouchClearHighlight();
        if (ri2 >= 0 && bars[ri2]) {
          if (zone === "join") bars[ri2].style.outline = "2px solid rgba(32,49,112,.55)";
          else {
            var sh = bubbleDropShadow(zone);
            if (sh) bars[ri2].style.boxShadow = sh;
          }
        }
      } catch (err) {
      }
    }
    function pvTouchFinish(apply) {
      var d = pvTouchDrag;
      pvTouchDrag = null;
      pvTouchArmCancel();
      pvTouchDetach();
      if (!d) return;
      pvTouchSuppressAt = Date.now() + 700;
      try {
        d.el.classList.remove("dshwv-pv-dragging");
        d.el.style.transform = "";
        pvTouchClearHighlight();
      } catch (err) {
      }
      if (!apply) return;
      try {
        if (d.kind === "row") {
          if (d.ri2 < 0) {
            bubblePvMoveRowEnd(d.ri);
            return;
          }
          if (d.ri2 !== d.ri) bubblePvMoveRow(d.ri, d.ri2, d.zone === "after" ? "after" : "before");
          return;
        }
        if (d.kind === "mod") {
          if (d.ri2 < 0) {
            bubblePvDropBlockEnd(d.ri, d.mi);
            return;
          }
          var z = d.zone === "pairL" || d.zone === "pairR" || d.zone === "after" ? d.zone : "before";
          bubblePvDropBlock(d.ri, d.mi, d.ri2, z);
          return;
        }
        if (d.kind === "pal") {
          if (d.ri2 < 0) {
            if (d.key === "image") {
              bubblePickImageToAdd();
              return;
            }
            var m = bubblePaletteModule(d.key);
            if (m) bubbleModuleAdd(m);
            return;
          }
          bubblePvPaletteToRow(d.key, d.ri2);
          return;
        }
      } catch (err) {
      }
    }
    function pvTouchEnd(e) {
      try {
        if (e && e.touches && e.touches.length > 0) return;
      } catch (err) {
      }
      pvTouchFinish(true);
    }
    document2.addEventListener("touchstart", pvTouchStart, { passive: true });
    document2.addEventListener("click", function(e) {
      try {
        if (Date.now() >= pvTouchSuppressAt) return;
        if (!e.target || !e.target.closest) return;
        if (!e.target.closest(".dshwv-bubpvbox") && !e.target.closest(".dshwv-bubpal") && !e.target.closest("[data-pal]")) return;
        e.preventDefault();
        e.stopPropagation();
      } catch (err) {
      }
    }, true);
    function bubblePvFont(level) {
      var mult = bubbleModuleFontU(level);
      return Math.max(10, Math.round(mult * 0.42));
    }
    function renderBubblePv() {
      bubblePvEl.innerHTML = "";
      var it = bubbleEditTarget();
      if (!it) return;
      var rows = bubbleRowsOf(it.modules || []);
      for (var r = 0; r < rows.length; r++) {
        (function(ri, rowMods) {
          var isImgRow = bubbleIsImgMod(rowMods[0]);
          var bar = document2.createElement("div");
          bar.className = "dshwv-pvrow dshwv-pvrowline";
          bar.title = isImgRow ? bubbleModuleSummary(rowMods[0]) + " 独占一行:拖 ⠿ 可整行排序" : "同一行模块并排(≤6):拖 ⠿ 整行排序;拖模块块到某行左/右边缘=并入该行,上/下=另起一行";
          var grip = document2.createElement("span");
          grip.className = "dshwv-pvdrag";
          grip.textContent = "⠿";
          grip.title = "按住拖动整行排序";
          grip.draggable = true;
          grip.addEventListener("dragstart", function(e) {
            e.stopPropagation();
            try {
              e.dataTransfer.setData("text/plain", "prow:" + ri);
            } catch (err) {
            }
            bubbleRowDragIdx = ri;
            bubbleModDrag = null;
            bubblePvZone = "";
          });
          grip.addEventListener("dragend", function() {
            bubbleRowDragIdx = null;
            bubblePvZone = "";
          });
          bar.appendChild(grip);
          for (var mi2 = 0; mi2 < rowMods.length; mi2++) {
            (function(m, mIdx) {
              var blk = document2.createElement("div");
              blk.className = "dshwv-pvmod" + (bubbleIsImgMod(m) ? " dshwv-pvimg" : "");
              blk.draggable = true;
              blk.title = isImgRow ? bubbleModuleSummary(m) + "(独占一行,可整行排序)" : "拖动到某行:左/右边缘=并入该行首/尾,上/下=另起一行";
              blk.addEventListener("dragstart", function(e) {
                e.stopPropagation();
                try {
                  e.dataTransfer.setData("text/plain", "mod:" + ri + ":" + mIdx);
                } catch (err) {
                }
                bubbleRowDragIdx = null;
                bubbleModDrag = { ri, mi: mIdx };
                bubblePvZone = "";
              });
              blk.addEventListener("dragend", function() {
                bubbleModDrag = null;
                bubblePvZone = "";
              });
              var lab = document2.createElement("span");
              lab.className = "dshwv-pvlab";
              lab.textContent = bubbleModuleListLabel(m);
              lab.title = "点击编辑该模块(内容/样式)";
              lab.addEventListener("click", function(e) {
                e.stopPropagation();
                bubbleModuleEdit(m, lab);
              });
              blk.appendChild(lab);
              var ed = document2.createElement("button");
              ed.type = "button";
              ed.className = "dshwv-bubmini";
              ed.textContent = "✎";
              ed.title = "编辑该模块(内容/样式)";
              ed.addEventListener("click", function(e) {
                e.stopPropagation();
                bubbleModuleEdit(m, ed);
              });
              blk.appendChild(ed);
              var del = document2.createElement("button");
              del.type = "button";
              del.className = "dshwv-bubmini";
              del.textContent = "✕";
              del.title = "删除该模块";
              del.addEventListener("click", function(e) {
                e.stopPropagation();
                bubblePvDelBlock(ri, mIdx);
              });
              blk.appendChild(del);
              bar.appendChild(blk);
            })(rowMods[mi2], mi2);
          }
          if (!isImgRow) {
            var add = document2.createElement("button");
            add.type = "button";
            add.className = "dshwv-pvadd";
            add.textContent = "+";
            add.title = "把模块加入同一行(默认文本,并排显示;其余类型可把上方色板拖进本行)";
            add.addEventListener("click", function(e) {
              e.stopPropagation();
              bubblePvAddToRow(ri);
            });
            bar.appendChild(add);
          }
          function highlight(zone) {
            bubblePvZone = zone;
            bar.style.boxShadow = "";
            bar.style.outline = "";
            if (zone === "join") bar.style.outline = "2px solid rgba(32,49,112,.55)";
            else {
              var sh = bubbleDropShadow(zone);
              if (sh) bar.style.boxShadow = sh;
            }
          }
          bar.addEventListener("dragover", function(e) {
            try {
              var isMod = !!bubbleModDrag;
              var isRow = bubbleRowDragIdx !== null && bubbleRowDragIdx !== void 0;
              var isPal = !isMod && !isRow && !!bubbleDragKey;
              if (!isMod && !isRow && !isPal) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              var rc = bar.getBoundingClientRect();
              if (!rc.width) return;
              if (isPal) {
                highlight("join");
                return;
              }
              var x = e.clientX - rc.left;
              if (isMod && x < rc.width * 0.2) {
                highlight("pairL");
                return;
              }
              if (isMod && x > rc.width * 0.8) {
                highlight("pairR");
                return;
              }
              highlight(e.clientY - rc.top < rc.height / 2 ? "before" : "after");
            } catch (err) {
            }
          });
          bar.addEventListener("dragleave", function() {
            bubblePvZone = "";
            bar.style.boxShadow = "";
            bar.style.outline = "";
          });
          bar.addEventListener("drop", function(e) {
            try {
              e.preventDefault();
              e.stopPropagation();
              var zone = bubblePvZone;
              bubblePvZone = "";
              bar.style.boxShadow = "";
              bar.style.outline = "";
              if (bubbleRowDragIdx !== null && bubbleRowDragIdx !== void 0) {
                var fromRow = bubbleRowDragIdx;
                bubbleRowDragIdx = null;
                if (fromRow !== ri) bubblePvMoveRow(fromRow, ri, zone);
                return;
              }
              if (bubbleModDrag) {
                var md = bubbleModDrag;
                bubbleModDrag = null;
                if (zone === "join") zone = "after";
                bubblePvDropBlock(md.ri, md.mi, ri, zone);
                return;
              }
              if (bubbleDragKey) {
                var key = bubbleDragKey;
                bubbleDragKey = null;
                bubblePvPaletteToRow(key, ri);
                return;
              }
            } catch (err) {
            }
          });
          bubblePvEl.appendChild(bar);
        })(r, rows[r]);
      }
      try {
        var rw = root && (root.offsetWidth || root.getBoundingClientRect().width) || 280;
        bubblePreviewInto(bubblePvPrevEl, it.modules || [], Math.min(rw, 408));
      } catch (err) {
      }
    }
    var bubbleRowDragIdx = null;
    function bubbleItemDiscard() {
      try {
        var idx = bubbleEditItemIdx;
        var snap = bubbleItemSnap;
        bubbleItemSnap = null;
        if (idx >= 0 && idx < bubbleEditItems.length && snap) bubbleEditItems[idx] = snap;
      } catch (err) {
      }
      closeBubbleItem();
      renderBubbleFirst();
      renderBubbleMore();
    }
    function bubbleItemSave() {
      showConfirm("保存该泡泡内容?", function() {
        var it = bubbleEditTarget();
        if (it) {
          it.kind = "custom";
          if (!it.modules) it.modules = [];
        }
        bubbleItemSnap = null;
        closeBubbleItem();
        renderBubbleFirst();
        renderBubbleMore();
      });
    }
    function bubbleItemResetToDefault() {
      showConfirm("恢复该泡泡为默认内容(与首次点击泡一致)?", function() {
        var it = bubbleEditTarget();
        if (it) {
          var mods = [];
          try {
            var src = null;
            if (bubbleCfg && Array.isArray(bubbleCfg.items) && bubbleCfg.items.length) {
              var f0 = bubbleCfg.items[0];
              if (f0 && !bubbleIsChoice(f0) && Array.isArray(f0.modules)) src = f0;
            }
            if (!src && BUBBLE_DEFAULT_ITEMS && BUBBLE_DEFAULT_ITEMS.length) {
              var d0 = BUBBLE_DEFAULT_ITEMS[0];
              if (d0 && !bubbleIsChoice(d0) && Array.isArray(d0.modules)) src = d0;
            }
            if (src) mods = JSON.parse(JSON.stringify(src.modules));
          } catch (err) {
          }
          it.kind = "custom";
          it.modules = mods;
        }
        renderBubblePv();
      });
    }
    bubbleMask = document2.createElement("div");
    bubbleMask.className = "dshwv-bubmask";
    bubbleMask.style.display = "none";
    var bubbleCard = document2.createElement("div");
    bubbleCard.className = "dshwv-bubcard";
    var bubbleTitle = document2.createElement("div");
    bubbleTitle.className = "dshwv-bubtitle";
    bubbleTitle.textContent = "自定义泡泡";
    bubbleCard.appendChild(bubbleTitle);
    var bubbleSecFirst = document2.createElement("div");
    bubbleSecFirst.className = "dshwv-bubsec dshwv-bubsec-first";
    bubbleSecFirst.textContent = "首次点击弹出内容";
    bubbleCard.appendChild(bubbleSecFirst);
    var bubbleFirstRow = document2.createElement("div");
    bubbleFirstRow.className = "dshwv-bubrow";
    bubbleFirstChipEl = document2.createElement("div");
    bubbleFirstChipEl.className = "dshwv-bubchip";
    bubbleFirstChipEl.title = "点击编辑该泡泡的内容模块";
    bubbleFirstChipEl.addEventListener("click", function(e) {
      e.stopPropagation();
      openBubbleItem(0);
    });
    bubbleFirstRow.appendChild(bubbleFirstChipEl);
    bubbleCard.appendChild(bubbleFirstRow);
    var bubbleSecMore = document2.createElement("div");
    bubbleSecMore.className = "dshwv-bubsec";
    bubbleSecMore.textContent = "再次点击弹出内容";
    bubbleCard.appendChild(bubbleSecMore);
    bubbleMoreListEl = document2.createElement("div");
    bubbleMoreListEl.addEventListener("dragover", function(e) {
      try {
        if (e.target && e.target.closest && e.target.closest(".dshwv-bubrow-drag")) return;
        e.preventDefault();
      } catch (err) {
      }
    });
    bubbleMoreListEl.addEventListener("drop", function(e) {
      try {
        if (e.target && e.target.closest && e.target.closest(".dshwv-bubrow-drag")) return;
        e.preventDefault();
        bubbleDropToEnd();
      } catch (err) {
      }
    });
    bubbleCard.appendChild(bubbleMoreListEl);
    var bubbleAddBtn = document2.createElement("button");
    bubbleAddBtn.type = "button";
    bubbleAddBtn.className = "dshwv-bubadd";
    bubbleAddBtn.textContent = "+ 添加泡泡(点完上一个后显示下一个)";
    bubbleAddBtn.addEventListener("click", bubbleAddMore);
    bubbleCard.appendChild(bubbleAddBtn);
    var bubbleTapAdvRow = document2.createElement("div");
    bubbleTapAdvRow.className = "dshwv-bubsec";
    bubbleTapAdvRow.style.display = "flex";
    bubbleTapAdvRow.style.alignItems = "center";
    bubbleTapAdvRow.style.flexWrap = "wrap";
    bubbleTapAdvRow.style.gap = "4px 6px";
    bubbleTapAdvRow.style.color = "#203170";
    var bubbleTapAdvChk = document2.createElement("input");
    bubbleTapAdvChk.type = "checkbox";
    bubbleTapAdvChk.className = "dshwv-check";
    bubbleTapAdvChk.id = "dshwv-tapadv";
    bubbleTapAdvChk.title = "开启后：点一下角色=往后推进一项（不再回到首次点击泡泡）；走到最后一项再点=收起泡泡";
    var bubbleTapAdvLab = document2.createElement("label");
    bubbleTapAdvLab.setAttribute("for", "dshwv-tapadv");
    bubbleTapAdvLab.style.cursor = "pointer";
    bubbleTapAdvLab.style.fontSize = "12px";
    bubbleTapAdvLab.textContent = "点按角色推进泡泡队列";
    var bubbleTapAdvHint = document2.createElement("span");
    bubbleTapAdvHint.className = "dshwv-bubhint";
    bubbleTapAdvHint.style.margin = "0";
    bubbleTapAdvHint.textContent = "（关闭＝点角色回到第 1 个泡泡；开启＝点一下往后一个）";
    bubbleTapAdvRow.appendChild(bubbleTapAdvChk);
    bubbleTapAdvRow.appendChild(bubbleTapAdvLab);
    bubbleTapAdvRow.appendChild(bubbleTapAdvHint);
    bubbleCard.appendChild(bubbleTapAdvRow);
    var bubbleBtns = document2.createElement("div");
    bubbleBtns.className = "dshwv-bubbtns";
    function bubbleBtn(label, cls, fn) {
      var b = document2.createElement("button");
      b.type = "button";
      b.className = "dshwv-bubbtn " + cls;
      b.textContent = label;
      b.addEventListener("click", function(e) {
        e.stopPropagation();
        fn();
      });
      return b;
    }
    bubbleBtns.appendChild(bubbleBtn("取消", "dshwv-bubbtn-no", function() {
      if (bubbleEditorDirty()) showConfirm("放弃未保存的更改?", function() {
        closeBubbleEditor();
      });
      else closeBubbleEditor();
    }));
    bubbleBtns.appendChild(bubbleBtn("重置", "dshwv-bubbtn-no", bubbleEditorReset));
    bubbleBtns.appendChild(bubbleBtn("保存", "dshwv-bubbtn-ok", bubbleEditorSave));
    bubbleCard.appendChild(bubbleBtns);
    bubbleMask.appendChild(bubbleCard);
    document2.body.appendChild(bubbleMask);
    bubbleItemMask = document2.createElement("div");
    bubbleItemMask.className = "dshwv-bubmask";
    bubbleItemMask.style.display = "none";
    var bubbleItemCard = document2.createElement("div");
    bubbleItemCard.className = "dshwv-bubcard";
    bubbleItemTitleEl = document2.createElement("div");
    bubbleItemTitleEl.className = "dshwv-bubtitle";
    bubbleItemCard.appendChild(bubbleItemTitleEl);
    bubbleItemSideEl = document2.createElement("div");
    bubbleItemSideEl.className = "dshwv-sidebar";
    bubbleItemSideEl.style.display = "none";
    bubbleItemCard.appendChild(bubbleItemSideEl);
    var bubbleSecPal = document2.createElement("div");
    bubbleSecPal.className = "dshwv-bubsec dshwv-bubsec-first dshwv-bubsec-withq";
    bubbleSecPal.textContent = "可选模块";
    bubbleSecPal.insertBefore(dshwvAskDot(
      '<div style="font-weight:600;margin-bottom:4px">可选模块 &amp; 泡泡内容预览</div><div>点击「可选模块」即可加入泡泡;桌面端也可直接拖到下方泡泡框。</div><div style="margin-top:4px">同一行模块并排显示(≤6 个):</div><div>· 拖模块块到某行左/右边缘 = 并入该行</div><div>· 拖到某行上/下 = 另起一行(拖回本行上下 = 拆行)</div><div>· 拖 ⠿ 手柄 = 整行排序</div><div style="margin-top:4px;opacity:.75">手机端:长按约 0.4 秒进入拖动</div>'
    ), bubbleSecPal.firstChild);
    bubbleItemCard.appendChild(bubbleSecPal);
    bubblePalEl = document2.createElement("div");
    bubblePalEl.className = "dshwv-bubpal";
    bubbleItemCard.appendChild(bubblePalEl);
    var bubbleSecPv = document2.createElement("div");
    bubbleSecPv.className = "dshwv-bubsec";
    bubbleSecPv.textContent = "泡泡内容预览";
    bubbleItemCard.appendChild(bubbleSecPv);
    bubblePvEl = document2.createElement("div");
    bubblePvEl.className = "dshwv-bubpvbox";
    bubblePvEl.addEventListener("dragover", function(e) {
      try {
        if (e.target && e.target.closest && e.target.closest(".dshwv-pvrow")) return;
        e.preventDefault();
      } catch (err) {
      }
    });
    bubblePvEl.addEventListener("drop", function(e) {
      try {
        if (e.target && e.target.closest && e.target.closest(".dshwv-pvrow")) return;
        e.preventDefault();
        if (bubbleRowDragIdx !== null && bubbleRowDragIdx !== void 0) {
          var fr = bubbleRowDragIdx;
          bubbleRowDragIdx = null;
          bubblePvMoveRowEnd(fr);
          return;
        }
        if (bubbleModDrag) {
          var mdd = bubbleModDrag;
          bubbleModDrag = null;
          bubblePvDropBlockEnd(mdd.ri, mdd.mi);
          return;
        }
        var key = bubbleDragKey;
        if (!key) return;
        bubbleDragKey = null;
        if (key === "image") {
          bubblePickImageToAdd();
          return;
        }
        if (key === "wizard") {
          bubbleModuleWizard();
          return;
        }
        var m = bubblePaletteModule(key);
        if (m) bubbleModuleAdd(m);
      } catch (err) {
      }
    });
    bubbleItemCard.appendChild(bubblePvEl);
    var bubblePvPrevEl = document2.createElement("div");
    bubblePvPrevEl.className = "dshwv-bubprev";
    bubbleItemCard.appendChild(bubblePvPrevEl);
    var bubbleItemBtns = document2.createElement("div");
    bubbleItemBtns.className = "dshwv-bubbtns";
    bubbleItemBtns.appendChild(bubbleBtn("取消", "dshwv-bubbtn-no", function() {
      showConfirm("放弃该泡泡的未保存修改?", function() {
        bubbleItemDiscard();
      });
    }));
    bubbleItemBtns.appendChild(bubbleBtn("恢复默认", "dshwv-bubbtn-no", bubbleItemResetToDefault));
    bubbleItemBtns.appendChild(bubbleBtn("保存", "dshwv-bubbtn-ok", bubbleItemSave));
    bubbleItemCard.appendChild(bubbleItemBtns);
    bubbleItemMask.appendChild(bubbleItemCard);
    document2.body.appendChild(bubbleItemMask);
    var moduleMask = null;
    var moduleEditRef = null;
    var moduleOnSave = null;
    var moduleEditNew = false;
    var moduleTitleEl = null;
    var moduleTypeLabelEl = null;
    var moduleBodyEl = null;
    var moduleColorEl = null;
    var moduleSizeEl = null;
    var moduleImgListEl = null;
    var moduleImgSelect = null;
    var moduleImgPreviewEl = null;
    var bubbleImgList = [];
    function loadBubbleImgs(cb) {
      try {
        fetch("/dsh-whale/bubble-imgs.json", { cache: "no-store" }).then(function(r) {
          return r.json();
        }).then(function(d) {
          if (d && d.ok && Array.isArray(d.images)) {
            bubbleImgList = d.images;
            if (cb) cb();
          }
        }).catch(function() {
        });
      } catch (err) {
      }
    }
    function bubbleUploadImg(file, cb) {
      try {
        var fr = new FileReader();
        fr.onload = function() {
          var data = String(fr.result || "");
          if (data.indexOf("data:image/png;base64,") !== 0 && data.indexOf("data:image/gif;base64,") !== 0) {
            if (cb) cb(false);
            return;
          }
          fetch("/dsh-whale/bubble-img-upload.json", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "upload", name: file.name || "", data })
          }).then(function(r) {
            return r.json();
          }).then(function(d) {
            if (d && d.ok && Array.isArray(d.images)) {
              bubbleImgList = d.images;
              if (cb) cb(true);
            } else if (cb) cb(false);
          }).catch(function() {
            if (cb) cb(false);
          });
        };
        fr.onerror = function() {
          if (cb) cb(false);
        };
        fr.readAsDataURL(file);
      } catch (err) {
        if (cb) cb(false);
      }
    }
    function cssToRgb(css2) {
      var s = String(css2 || "").trim();
      var m = /^#([0-9a-fA-F]{6})$/.exec(s);
      if (m) {
        var n = parseInt(m[1], 16);
        return [n >> 16 & 255, n >> 8 & 255, n & 255];
      }
      m = /^rgb(s*(d+)s*,s*(d+)s*,s*(d+)s*)$/i.exec(s);
      if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
      return [32, 49, 112];
    }
    function rgbToCss(r, g, b) {
      return "rgb(" + Math.max(0, Math.min(255, Math.round(r))) + "," + Math.max(0, Math.min(255, Math.round(g))) + "," + Math.max(0, Math.min(255, Math.round(b))) + ")";
    }
    function bubbleColorEdit(container, getCss, setCss, label) {
      var row = document2.createElement("div");
      row.className = "dshwv-audiorow";
      var lb = document2.createElement("span");
      lb.textContent = label || "颜色";
      row.appendChild(lb);
      var inp = document2.createElement("input");
      inp.type = "color";
      inp.className = "dshwv-colnat";
      row.appendChild(inp);
      var def = document2.createElement("button");
      def.type = "button";
      def.className = "dshwv-snapbtn dshwv-snapbtn-no";
      def.textContent = "默认";
      def.title = "恢复默认颜色";
      def.addEventListener("click", function() {
        setCss("");
        sync();
      });
      row.appendChild(def);
      container.appendChild(row);
      function sync() {
        try {
          var v = getCss();
          if (/^#[0-9a-fA-F]{6}$/.test(v || "")) {
            inp.value = v;
            return;
          }
          if (v) {
            var a = cssToRgb(v);
            inp.value = "#" + ((1 << 24) + (a[0] << 16) + (a[1] << 8) + a[2]).toString(16).slice(1);
            return;
          }
          inp.value = "#203170";
        } catch (err) {
        }
      }
      inp.addEventListener("input", function() {
        setCss(inp.value);
      });
      inp.addEventListener("change", function() {
        setCss(inp.value);
      });
      sync();
    }
    var bubbleRgbOpenMenu = null;
    var bubbleFontOpenMenu = null;
    var bubbleColorOpenMenu = null;
    function visibleTopZ() {
      var top = 20500;
      var cand = [bubbleMask, bubbleItemMask, moduleMask, usageMoreMask, qeditEl, window2.__dshwRemindMask];
      function eff(el) {
        try {
          if (!el) return 0;
          if (el.style && el.style.display === "none") return 0;
          var s = el.style ? el.style.zIndex || "" : "";
          if (!s) {
            var cs = window2.getComputedStyle ? window2.getComputedStyle(el) : null;
            if (cs) s = cs.zIndex;
          }
          var n2 = parseFloat(s);
          return isFinite(n2) ? n2 : 0;
        } catch (err) {
          return 0;
        }
      }
      for (var i = 0; i < cand.length; i++) {
        var n = eff(cand[i]);
        if (n > top) top = n;
      }
      return top;
    }
    function whaleZClean() {
      try {
        var zsEl = document2.getElementById("dshw-remind-overlay-z");
        if (zsEl) {
          try {
            document2.head.removeChild(zsEl);
          } catch (err) {
          }
        }
        if (!window2.__dshwRemindMask) {
          if (moduleMask && moduleMask.style.zIndex) moduleMask.style.zIndex = "";
          if (qeditEl && qeditEl.style.zIndex) qeditEl.style.zIndex = "";
        }
      } catch (err) {
      }
    }
    function dshwDropOpen(menuEl, anchorEl) {
      try {
        if (menuEl.parentNode !== document2.body) document2.body.appendChild(menuEl);
        menuEl.style.position = "fixed";
        menuEl.style.minWidth = "0px";
        menuEl.style.left = "0px";
        menuEl.style.top = "0px";
        menuEl.classList.add("dshwv-rgbopen");
        var r = anchorEl.getBoundingClientRect();
        var vp = viewport();
        var w = Math.max(20, Math.round(r.width));
        if (menuEl.classList && menuEl.classList.contains("dshwv-qcolmenu")) {
          try {
            var rowHost = anchorEl && anchorEl.parentNode ? anchorEl.parentNode.parentNode : null;
            if (rowHost && rowHost.querySelector) {
              var swEl = rowHost.querySelector(".dshwv-qcolorhost");
              if (swEl && swEl.offsetWidth > 0) w = Math.max(w, Math.round(r.width + swEl.offsetWidth));
            }
          } catch (err) {
          }
        }
        if (w > vp.w - 16) w = Math.max(20, vp.w - 16);
        menuEl.style.width = w + "px";
        menuEl.style.maxWidth = "none";
        var left = r.left;
        if (left + w > vp.w - 8) left = Math.max(8, vp.w - w - 8);
        menuEl.style.left = Math.round(left) + "px";
        menuEl.style.top = Math.round(r.bottom + 2) + "px";
        var vTop = visibleTopZ();
        menuEl.style.zIndex = String(Math.max(26010, Math.round(vTop) + 10));
      } catch (err) {
      }
    }
    var bubbleSysFontList = [];
    var bubbleSysFontTried = false;
    function refreshSystemFonts(onDone) {
      if (bubbleSysFontTried) {
        if (onDone) onDone();
        return;
      }
      bubbleSysFontTried = true;
      if (!window2.queryLocalFonts) {
        if (onDone) onDone();
        return;
      }
      try {
        window2.queryLocalFonts().then(function(list) {
          try {
            var seen = {};
            var out = [];
            if (list && list.length) {
              for (var i = 0; i < list.length; i++) {
                var fam = String(list[i] && list[i].family || "");
                var lab = String(list[i] && (list[i].fullName || list[i].family) || fam);
                if (!fam) continue;
                if (fam.indexOf('"') >= 0 || fam.indexOf(",") >= 0) continue;
                var key = fam.toLowerCase();
                if (seen[key]) continue;
                seen[key] = true;
                out.push({ v: '"' + fam + '"', l: lab });
              }
              out.sort(function(a, b) {
                return a.l < b.l ? -1 : a.l > b.l ? 1 : 0;
              });
            }
            bubbleSysFontList = out;
          } catch (err) {
          }
          if (onDone) onDone();
        }).catch(function() {
          if (onDone) onDone();
        });
      } catch (err) {
        if (onDone) onDone();
      }
    }
    function bubbleRgbSelect(current, cb) {
      var wrap = document2.createElement("div");
      wrap.className = "dshwv-rgbwrap";
      var cur = current === true ? "macaron" : current || "";
      var opts = [
        ["", "无"],
        ["macaron", "马卡龙"],
        ["candy", "糖果"],
        ["rouge", "酒红"],
        ["bamboo", "翠青"],
        ["aurora", "极光幻彩"],
        ["deepsea", "深海蓝调"],
        ["sunset", "落日熔金"],
        ["forest", "森林秘语"],
        ["champagne", "香槟鎏金"],
        ["lavender", "薰衣草梦境"],
        ["mint", "薄荷汽水"],
        ["lava", "岩浆熔岩"],
        ["galaxy", "银河星紫"],
        ["ink", "墨韵黑白"],
        ["indigo", "靛蓝夜曲"]
      ];
      function labelOf(v) {
        for (var i = 0; i < opts.length; i++) if (opts[i][0] === v) return opts[i][1];
        return "无";
      }
      var head = document2.createElement("button");
      head.type = "button";
      head.className = "dshwv-rgbhead";
      head.textContent = labelOf(cur);
      head.title = "选择跑马灯方案";
      wrap.appendChild(head);
      var menu = document2.createElement("div");
      menu.className = "dshwv-rgbmenu";
      function fillMenu() {
        menu.innerHTML = "";
        for (var i = 0; i < opts.length; i++) {
          (function(v, lab) {
            var o = document2.createElement("div");
            o.className = "dshwv-rgbopt" + (v === cur ? " dshwv-rgbcur" : "");
            o.textContent = lab;
            o.addEventListener("click", function(e) {
              e.stopPropagation();
              cur = v;
              head.textContent = labelOf(cur);
              closeRgbMenu();
              cb(v);
            });
            menu.appendChild(o);
          })(opts[i][0], opts[i][1]);
        }
      }
      fillMenu();
      wrap.appendChild(menu);
      head.addEventListener("click", function(e) {
        e.stopPropagation();
        if (bubbleRgbOpenMenu === menu) {
          closeRgbMenu();
          return;
        }
        closeRgbMenu();
        menu.classList.add("dshwv-rgbopen");
        bubbleRgbOpenMenu = menu;
      });
      function closeRgbMenu() {
        if (bubbleRgbOpenMenu) bubbleRgbOpenMenu.classList.remove("dshwv-rgbopen");
        bubbleRgbOpenMenu = null;
      }
      if (!window2.__dshwRgbDocBound) {
        window2.__dshwRgbDocBound = true;
        document2.addEventListener("pointerdown", function(e) {
          if (!bubbleRgbOpenMenu) return;
          try {
            if (e.target && e.target.closest && e.target.closest(".dshwv-rgbwrap")) return;
          } catch (err) {
          }
          closeRgbMenu();
        }, true);
      }
      return wrap;
    }
    function bubbleFontEditRow(getVal, setVal) {
      var FONT_OPTIONS = [
        ["", "默认字体"],
        ['"Microsoft YaHei",sans-serif', "微软雅黑"],
        ['"PingFang SC","Microsoft YaHei",sans-serif', "苹方/雅黑"],
        ['DengXian,"Microsoft YaHei",sans-serif', "等线"],
        ["SimSun,serif", "宋体"],
        ["SimHei,sans-serif", "黑体"],
        ["KaiTi,serif", "楷体"],
        ["FangSong,serif", "仿宋"],
        ["STKaiti,KaiTi,serif", "华文楷体"],
        ['"Noto Sans SC",sans-serif', "Noto Sans SC"],
        ['"Source Han Sans SC",sans-serif', "思源黑体"],
        ['"Segoe UI",sans-serif', "Segoe UI"],
        ["Arial,Helvetica,sans-serif", "Arial"],
        ["Helvetica,Arial,sans-serif", "Helvetica"],
        ["Verdana,sans-serif", "Verdana"],
        ["Tahoma,sans-serif", "Tahoma"],
        ['"Trebuchet MS",sans-serif', "Trebuchet MS"],
        ['"Times New Roman",serif', "Times New Roman"],
        ["Georgia,serif", "Georgia"],
        ['"Courier New",monospace', "Courier New"],
        ["Consolas,monospace", "Consolas"],
        ["Impact,fantasy", "Impact"],
        ['"Comic Sans MS",cursive', "Comic Sans MS"]
      ];
      var row = document2.createElement("div");
      row.className = "dshwv-audiorow";
      var fl = document2.createElement("span");
      fl.textContent = "字体";
      row.appendChild(fl);
      var box = document2.createElement("div");
      box.className = "dshwv-rgbwrap dshwv-fontwrap";
      var head = document2.createElement("button");
      head.type = "button";
      head.className = "dshwv-rgbhead";
      head.title = "选择系统字体";
      box.appendChild(head);
      var menu = document2.createElement("div");
      menu.className = "dshwv-rgbmenu dshwv-fontmenu";
      function currentVal() {
        return getVal ? String(getVal() || "") : "";
      }
      function labelOf(v) {
        for (var i = 0; i < FONT_OPTIONS.length; i++) if (FONT_OPTIONS[i][0] === v) return FONT_OPTIONS[i][1];
        if (v) return String(v).slice(0, 14);
        return "默认字体";
      }
      function syncHead() {
        var v = currentVal();
        head.textContent = labelOf(v);
        head.style.fontFamily = v || "";
        head.title = "当前: " + (v || "默认字体") + ";点击选择系统字体";
      }
      function optionList() {
        var list = [];
        var seen = {};
        for (var i = 0; i < FONT_OPTIONS.length; i++) {
          list.push(FONT_OPTIONS[i]);
          seen[FONT_OPTIONS[i][0]] = true;
        }
        for (var s = 0; s < bubbleSysFontList.length; s++) {
          if (!seen[bubbleSysFontList[s].v]) {
            seen[bubbleSysFontList[s].v] = true;
            list.push([bubbleSysFontList[s].v, bubbleSysFontList[s].l]);
          }
        }
        return list;
      }
      function fill() {
        menu.innerHTML = "";
        var cur = currentVal();
        var all = optionList();
        for (var i = 0; i < all.length; i++) {
          (function(fv, flab) {
            var o = document2.createElement("div");
            o.className = "dshwv-rgbopt" + (fv === cur ? " dshwv-rgbcur" : "");
            o.textContent = flab;
            o.style.fontFamily = fv || "";
            o.addEventListener("click", function() {
              if (setVal) setVal(fv);
              closeFontMenu();
              syncHead();
              fill();
            });
            menu.appendChild(o);
          })(all[i][0], all[i][1]);
        }
      }
      box.appendChild(menu);
      function closeFontMenu() {
        menu.classList.remove("dshwv-rgbopen");
        bubbleFontOpenMenu = null;
      }
      head.addEventListener("click", function(e) {
        e.stopPropagation();
        if (bubbleFontOpenMenu === menu) {
          closeFontMenu();
          return;
        }
        if (bubbleFontOpenMenu) bubbleFontOpenMenu.classList.remove("dshwv-rgbopen");
        fill();
        bubbleFontOpenMenu = menu;
        dshwDropOpen(menu, head);
        refreshSystemFonts(function() {
          if (bubbleFontOpenMenu === menu && menu.classList.contains("dshwv-rgbopen")) {
            fill();
            dshwDropOpen(menu, head);
          }
        });
      });
      if (!window2.__dshwFontDocBound) {
        window2.__dshwFontDocBound = true;
        document2.addEventListener("pointerdown", function(e) {
          if (!bubbleFontOpenMenu) return;
          try {
            if (e.target && e.target.closest && (e.target.closest(".dshwv-fontwrap") || e.target.closest(".dshwv-rgbmenu"))) return;
          } catch (err) {
          }
          bubbleFontOpenMenu.classList.remove("dshwv-rgbopen");
          bubbleFontOpenMenu = null;
        }, true);
      }
      row.appendChild(box);
      syncHead();
      fill();
      return row;
    }
    function moduleTypeName(t, m) {
      if (t === "balance") return "余额数值";
      if (t === "today") return "今日已用";
      if (t === "peak" || t === "nextpeak") {
        if (m) return bubblePeakModuleLabel(m);
        return t === "nextpeak" ? "时段倒计时" : "峰谷时段";
      }
      if (t === "image") return "图片/动图";
      if (t === "randimg") return "随机图片";
      if (t === "random") return "随机语句";
      return "文本";
    }
    function renderModuleEditor() {
      var m = moduleEditRef;
      if (m && m.type === "nextpeak") {
        m.type = "peak";
        if (!m.peakStyle) m.peakStyle = "count";
      }
      if (moduleEditNew && m.type === "text" && m.bold === void 0) m.bold = true;
      moduleColorEl = null;
      moduleSizeEl = null;
      moduleBodyEl.innerHTML = "";
      moduleTitleEl.textContent = (moduleEditNew ? "新增模块: " : "编辑模块: ") + moduleTypeName(m.type, m);
      function moduleTplRow() {
        var row = document2.createElement("div");
        row.className = "dshwv-audiorow";
        var lab = document2.createElement("span");
        lab.textContent = "内容";
        lab.style.flex = "0 0 auto";
        row.appendChild(lab);
        var inp = document2.createElement("input");
        inp.type = "text";
        inp.style.flex = "1";
        inp.style.minWidth = "0";
        inp.style.boxSizing = "border-box";
        inp.style.border = "1px solid rgba(32,49,112,.4)";
        inp.style.borderRadius = "6px";
        inp.style.padding = "3px 6px";
        inp.style.fontSize = "12px";
        inp.style.color = "#203170";
        inp.style.background = "#fff";
        inp.value = m.tpl || "";
        function hintOf() {
          if (m.type === "balance") return "例: {balance_ds}";
          if (m.type === "today") return "例: 今日已用 {expense_ds}";
          if (bubbleIsPeakCount(m)) return "例: 距空闲 {countdown}";
          return "例: 当前 {status}";
        }
        var hp = hintOf();
        inp.placeholder = hp;
        inp.title = "输入内容;右侧 ? 查看可用占位符";
        inp.addEventListener("input", function() {
          m.tpl = inp.value;
        });
        row.appendChild(inp);
        var qb = document2.createElement("button");
        qb.type = "button";
        qb.className = "dshwv-tplq";
        qb.textContent = "?";
        qb.title = "可用占位符用法";
        qb.addEventListener("click", function(e) {
          e.stopPropagation();
          bubbleTplHelpToggle(m, qb);
        });
        row.appendChild(qb);
        moduleBodyEl.appendChild(row);
      }
      if (moduleEditNew) {
        var tr = document2.createElement("div");
        tr.className = "dshwv-audiorow";
        var tl = document2.createElement("span");
        tl.textContent = "类型";
        tr.appendChild(tl);
        var tsel = document2.createElement("select");
        tsel.className = "dshwv-sound";
        var topts = [
          ["text", "文本"],
          ["random", "随机语句"],
          ["image", "图片/动图"],
          ["randimg", "随机图片"]
        ];
        for (var ti2 = 0; ti2 < topts.length; ti2++) {
          var o2 = document2.createElement("option");
          o2.value = topts[ti2][0];
          o2.textContent = topts[ti2][1];
          tsel.appendChild(o2);
        }
        tsel.value = m.type;
        tsel.addEventListener("change", function() {
          m.type = tsel.value;
          if (m.type === "random" && !Array.isArray(m.lines)) m.lines = [];
          if (m.type === "random" && m.bold === void 0) m.bold = true;
          if (m.type === "text" && m.bold === void 0) m.bold = true;
          if (m.type === "image" && !m.imgId) m.imgId = "";
          if (m.type === "randimg") {
            if (!Array.isArray(m.imgs)) m.imgs = [];
            if (m.imgScale === void 0) m.imgScale = 1;
          }
          renderModuleEditor();
        });
        tr.appendChild(tsel);
        dshwCustSel(tsel);
        moduleBodyEl.appendChild(tr);
      }
      if (bubbleLib.length) {
        var lr2 = document2.createElement("div");
        lr2.className = "dshwv-bubsec";
        lr2.textContent = "从模块库载入";
        moduleBodyEl.appendChild(lr2);
        for (var li3 = 0; li3 < bubbleLib.length; li3++) {
          (function(lb) {
            var lrow = document2.createElement("div");
            lrow.className = "dshwv-bublibrow";
            var lbtn = document2.createElement("button");
            lbtn.type = "button";
            lbtn.className = "dshwv-bubnewbtn";
            lbtn.textContent = lb.name;
            lbtn.title = "将该模块配置载入当前编辑";
            lbtn.addEventListener("click", function() {
              var c = bubbleCloneModule(lb.module);
              var oldKeys = Object.keys(m);
              for (var kk = 0; kk < oldKeys.length; kk++) {
                try {
                  delete m[oldKeys[kk]];
                } catch (err) {
                }
              }
              var nk = Object.keys(c);
              for (var j2 = 0; j2 < nk.length; j2++) m[nk[j2]] = c[nk[j2]];
              moduleColorEl = null;
              moduleSizeEl = null;
              renderModuleEditor();
            });
            lrow.appendChild(lbtn);
            var ldel = document2.createElement("button");
            ldel.type = "button";
            ldel.className = "dshwv-bubmini";
            ldel.textContent = "✕";
            ldel.title = "从模块库删除";
            ldel.addEventListener("click", function() {
              showConfirm("从模块库删除「" + lb.name + "」?", function() {
                bubbleLibDel(lb.id);
                renderModuleEditor();
                if (bubblePalEl) renderBubblePal();
              });
            });
            lrow.appendChild(ldel);
            moduleBodyEl.appendChild(lrow);
          })(bubbleLib[li3]);
        }
      }
      if (m.type === "text") {
        var ti = document2.createElement("input");
        ti.type = "text";
        ti.className = "dshwv-cropname";
        ti.maxLength = 60;
        ti.value = m.text || "";
        ti.placeholder = "文本内容";
        ti.addEventListener("input", function() {
          m.text = ti.value || " ";
        });
        moduleBodyEl.appendChild(ti);
      } else if (m.type === "random") {
        let linePanel = function(l, box) {
          box.innerHTML = "";
          function lineVal(lv, mv, dft) {
            return lv !== void 0 && lv !== null ? lv : mv !== void 0 && mv !== null ? mv : dft;
          }
          var r2 = document2.createElement("div");
          r2.className = "dshwv-audiorow";
          var c2 = document2.createElement("span");
          c2.textContent = "字号";
          r2.appendChild(c2);
          var ps = document2.createElement("input");
          ps.type = "range";
          ps.min = "1";
          ps.max = "50";
          ps.step = "1";
          ps.className = "dshwv-cropzoom";
          ps.value = String(lineVal(l.size, m.size, 3));
          r2.appendChild(ps);
          var psNum = document2.createElement("span");
          psNum.className = "dshwv-volpct";
          psNum.textContent = String(lineVal(l.size, m.size, 3));
          ps.addEventListener("input", function() {
            l.size = Math.round(Number(ps.value) || 3);
            psNum.textContent = ps.value;
          });
          r2.appendChild(psNum);
          box.appendChild(r2);
          box.appendChild(bubbleFontEditRow(function() {
            return lineVal(l.fontFamily, m.fontFamily, "");
          }, function(v) {
            l.fontFamily = v || "";
          }));
          if (!l.rgb) bubbleColorEdit(box, function() {
            return lineVal(l.color, m.color, "");
          }, function(v) {
            l.color = v;
          }, "颜色");
          var lbgV = l.bgRgb ? l.bgRgb : l.bg ? "solid" : m.bgRgb ? m.bgRgb : m.bg ? "solid" : "none";
          var lbgHex0 = l.bg || m.bg || "#dbe4f5";
          var lbgc = qColorSelectBuild(lbgV, function(v) {
            if (v === "none") {
              l.bgRgb = "";
              l.bg = "";
            } else if (v === "solid") {
              l.bgRgb = "";
              if (!l.bg) l.bg = lbgHex0;
            } else {
              l.bgRgb = v;
              l.bg = "";
            }
            lbgc.sync(v === "none" ? "none" : v, l.bg || lbgHex0, function(h) {
              l.bg = h;
            });
          }, { label: "底色", defaultHex: lbgHex0, defaultText: "默认", allowNone: true });
          box.appendChild(lbgc.row);
          lbgc.sync(lbgV, lbgHex0, function(h) {
            l.bg = h;
          });
          var r3 = document2.createElement("div");
          r3.className = "dshwv-audiorow";
          function lb2(label, key) {
            var la = document2.createElement("label");
            la.style.display = "inline-flex";
            la.style.alignItems = "center";
            la.style.gap = "3px";
            la.style.marginRight = "10px";
            var cb = document2.createElement("input");
            cb.type = "checkbox";
            cb.checked = !!lineVal(l[key], m[key], false);
            cb.addEventListener("change", function() {
              l[key] = cb.checked;
            });
            var tx = document2.createElement("span");
            tx.textContent = label;
            la.appendChild(cb);
            la.appendChild(tx);
            return la;
          }
          r3.appendChild(lb2("加粗", "bold"));
          r3.appendChild(lb2("斜体", "italic"));
          r3.appendChild(lb2("下划线", "ul"));
          var r3l = document2.createElement("span");
          r3l.textContent = "跑马灯";
          r3.appendChild(r3l);
          r3.appendChild(bubbleRgbSelect(l.rgb, function(v) {
            l.rgb = v;
            linePanel(l, box);
          }));
          box.appendChild(r3);
        }, renderLines = function() {
          listEl.innerHTML = "";
          hint.style.display = m.lines.length ? "flex" : "none";
          for (var i = 0; i < m.lines.length; i++) {
            (function(idx) {
              var l = m.lines[idx];
              if (!l) return;
              var wrap = document2.createElement("div");
              wrap.className = "dshwv-linerow";
              var lr = document2.createElement("div");
              lr.className = "dshwv-audiorow";
              var wt = document2.createElement("input");
              wt.type = "number";
              wt.min = "1";
              wt.max = "99";
              wt.className = "dshwv-linew";
              wt.value = String(l.w || 1);
              wt.title = "权重";
              wt.addEventListener("input", function() {
                l.w = Math.max(1, Math.round(Number(wt.value) || 1));
              });
              lr.appendChild(wt);
              var tx = document2.createElement("input");
              tx.type = "text";
              tx.className = "dshwv-linetx";
              tx.value = l.t;
              tx.placeholder = "句子";
              tx.addEventListener("input", function() {
                l.t = tx.value || " ";
              });
              lr.appendChild(tx);
              var ed = document2.createElement("button");
              ed.type = "button";
              ed.className = "dshwv-bubmini";
              ed.textContent = "✎";
              ed.title = "该句悬浮样式编辑(句子/字号/字体/颜色/字形)";
              ed.addEventListener("click", function(e) {
                e.stopPropagation();
                openQuickSentenceEditor(l, m, tx, ed);
              });
              lr.appendChild(ed);
              var cp = document2.createElement("button");
              cp.type = "button";
              cp.className = "dshwv-bubmini";
              cp.textContent = "⧉";
              cp.title = "复制该行(含样式)";
              cp.addEventListener("click", function() {
                m.lines.splice(idx + 1, 0, JSON.parse(JSON.stringify(l)));
                renderLines();
              });
              lr.appendChild(cp);
              var del = document2.createElement("button");
              del.type = "button";
              del.className = "dshwv-linedel";
              del.textContent = "✕";
              del.title = "删除该句";
              del.addEventListener("click", function() {
                m.lines.splice(idx, 1);
                renderLines();
              });
              lr.appendChild(del);
              wrap.appendChild(lr);
              listEl.appendChild(wrap);
            })(i);
          }
        };
        var hint = document2.createElement("div");
        hint.className = "dshwv-linehead";
        var hw = document2.createElement("span");
        hw.className = "dshwv-lhw";
        hw.textContent = "权重";
        hint.appendChild(hw);
        var hc = document2.createElement("span");
        hc.className = "dshwv-lhc";
        hc.textContent = "内容";
        hint.appendChild(hc);
        var ho = document2.createElement("span");
        ho.className = "dshwv-lho";
        ho.textContent = "操作";
        hint.appendChild(ho);
        moduleBodyEl.appendChild(hint);
        if (!Array.isArray(m.lines)) m.lines = [];
        var listEl = document2.createElement("div");
        listEl.className = "dshwv-listbox";
        listEl.style.maxHeight = "240px";
        listEl.style.overflowY = "auto";
        listEl.style.paddingRight = "2px";
        moduleBodyEl.appendChild(listEl);
        renderLines();
        var addL = document2.createElement("button");
        addL.type = "button";
        addL.className = "dshwv-addline";
        addL.textContent = "+ 添加语句";
        addL.addEventListener("click", function() {
          m.lines.push({ t: "新句子", w: 1 });
          renderLines();
        });
        moduleBodyEl.appendChild(addL);
      } else if (m.type === "image") {
        let fillImgSel = function() {
          moduleImgSelect.innerHTML = "";
          var opt0 = document2.createElement("option");
          opt0.value = "";
          opt0.textContent = "— 选择泡泡图库图片 —";
          moduleImgSelect.appendChild(opt0);
          for (var i = 0; i < bubbleImgList.length; i++) {
            var o = document2.createElement("option");
            o.value = bubbleImgList[i].id;
            o.textContent = bubbleImgList[i].name;
            moduleImgSelect.appendChild(o);
          }
          if (m.imgId) moduleImgSelect.value = m.imgId;
          moduleImgSelect.dispatchEvent(new Event("change"));
          if (moduleImgDrop) moduleImgDrop.refresh();
        };
        moduleImgSelect = document2.createElement("select");
        moduleImgSelect.className = "dshwv-sound";
        moduleBodyEl.appendChild(moduleImgSelect);
        moduleImgDrop = dshwCustSel(moduleImgSelect);
        moduleImgPreviewEl = document2.createElement("img");
        moduleImgPreviewEl.className = "dshwv-bubimgprev";
        moduleImgPreviewEl.alt = "";
        moduleBodyEl.appendChild(moduleImgPreviewEl);
        moduleImgSelect.addEventListener("change", function() {
          m.imgId = moduleImgSelect.value;
          if (m.imgId) {
            moduleImgPreviewEl.src = bridge.asset("/dsh-whale/bubble-img.png?id=" + encodeURIComponent(m.imgId));
            moduleImgPreviewEl.style.display = "block";
          } else moduleImgPreviewEl.style.display = "none";
        });
        var fileInput = document2.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/png,image/gif";
        fileInput.style.display = "none";
        var upBtn = document2.createElement("button");
        upBtn.type = "button";
        upBtn.className = "dshwv-snapbtn dshwv-snapbtn-no";
        upBtn.textContent = "上传图片(png/gif)";
        upBtn.addEventListener("click", function() {
          fileInput.click();
        });
        fileInput.addEventListener("change", function() {
          var f = fileInput.files && fileInput.files[0];
          if (!f) return;
          bubbleUploadImg(f, function(ok) {
            if (ok) fillImgSel();
            fileInput.value = "";
          });
        });
        var upRow = document2.createElement("div");
        upRow.className = "dshwv-uproll";
        upRow.appendChild(upBtn);
        upRow.appendChild(fileInput);
        moduleBodyEl.appendChild(upRow);
        var scRow = document2.createElement("div");
        scRow.className = "dshwv-audiorow";
        var scL = document2.createElement("span");
        scL.textContent = "显示大小";
        scRow.appendChild(scL);
        var scInit = Number(m.imgScale);
        if (!isFinite(scInit) || scInit <= 0) scInit = 1;
        var scInp = document2.createElement("input");
        scInp.type = "range";
        scInp.min = "10";
        scInp.max = "100";
        scInp.step = "5";
        scInp.className = "dshwv-cropzoom";
        scInp.style.flex = "1";
        scInp.value = String(Math.round(scInit * 100));
        scInp.addEventListener("input", function() {
          m.imgScale = Math.max(0.1, Math.min(1, Number(scInp.value) / 100));
          scVal.textContent = scInp.value + "%";
          try {
            if (moduleImgPreviewEl) moduleImgPreviewEl.style.maxWidth = Math.round(120 * m.imgScale) + "px";
          } catch (err) {
          }
        });
        scRow.appendChild(scInp);
        var scVal = document2.createElement("span");
        scVal.className = "dshwv-volpct";
        scVal.textContent = scInp.value + "%";
        scRow.appendChild(scVal);
        moduleBodyEl.appendChild(scRow);
        try {
          if (moduleImgPreviewEl) moduleImgPreviewEl.style.maxWidth = Math.round(120 * scInit) + "px";
        } catch (err) {
        }
        if (!bubbleImgList.length) loadBubbleImgs(fillImgSel);
        else fillImgSel();
      } else if (m.type === "randimg") {
        let renderImgItems = function() {
          try {
            dshwCustSelClose();
          } catch (err) {
          }
          rlistEl.innerHTML = "";
          rhint.style.display = m.imgs.length ? "flex" : "none";
          for (var ii = 0; ii < m.imgs.length; ii++) {
            (function(idx2) {
              var it2 = m.imgs[idx2] || (m.imgs[idx2] = { imgId: "", w: 1 });
              var wrap2 = document2.createElement("div");
              wrap2.className = "dshwv-linerow";
              var lr22 = document2.createElement("div");
              lr22.className = "dshwv-audiorow";
              var wt2 = document2.createElement("input");
              wt2.type = "number";
              wt2.min = "1";
              wt2.max = "99";
              wt2.className = "dshwv-linew";
              wt2.value = String(it2.w || 1);
              wt2.title = "权重(越大越容易被抽到)";
              wt2.addEventListener("input", function() {
                it2.w = Math.max(1, Math.round(Number(wt2.value) || 1));
              });
              lr22.appendChild(wt2);
              var sel2 = document2.createElement("select");
              sel2.className = "dshwv-sound";
              sel2.style.flex = "1 1 auto";
              sel2.style.minWidth = "0";
              var oo0 = document2.createElement("option");
              oo0.value = "";
              oo0.textContent = "— 选择泡泡图库图片 —";
              sel2.appendChild(oo0);
              for (var bi2 = 0; bi2 < bubbleImgList.length; bi2++) {
                var ob2 = document2.createElement("option");
                ob2.value = bubbleImgList[bi2].id;
                ob2.textContent = bubbleImgList[bi2].name || bubbleImgList[bi2].id;
                sel2.appendChild(ob2);
              }
              if (it2.imgId) sel2.value = it2.imgId;
              lr22.appendChild(sel2);
              var drop2 = dshwCustSel(sel2);
              var th2 = document2.createElement("img");
              th2.className = "dshwv-rimthumb";
              th2.alt = "";
              function syncTh2() {
                try {
                  if (it2.imgId) th2.src = bridge.asset("/dsh-whale/bubble-img.png?id=" + encodeURIComponent(it2.imgId));
                  else th2.removeAttribute("src");
                  th2.style.display = "block";
                } catch (err) {
                }
              }
              syncTh2();
              lr22.appendChild(th2);
              sel2.addEventListener("change", function() {
                it2.imgId = sel2.value;
                syncTh2();
              });
              var cp2 = document2.createElement("button");
              cp2.type = "button";
              cp2.className = "dshwv-bubmini";
              cp2.textContent = "⧉";
              cp2.title = "复制该项";
              cp2.addEventListener("click", function() {
                m.imgs.splice(idx2 + 1, 0, { imgId: it2.imgId, w: it2.w });
                renderImgItems();
              });
              lr22.appendChild(cp2);
              var del2 = document2.createElement("button");
              del2.type = "button";
              del2.className = "dshwv-linedel";
              del2.textContent = "✕";
              del2.title = "删除该图片";
              del2.addEventListener("click", function() {
                m.imgs.splice(idx2, 1);
                renderImgItems();
              });
              lr22.appendChild(del2);
              wrap2.appendChild(lr22);
              rlistEl.appendChild(wrap2);
            })(ii);
          }
          if (!m.imgs.length) {
            var emptyImg = document2.createElement("div");
            emptyImg.className = "dshwv-bubhint";
            emptyImg.textContent = "还没有图片:点「添加图片」从图库选,或「上传图片(png/gif)」直接加入";
            rlistEl.appendChild(emptyImg);
          }
        };
        var rhint = document2.createElement("div");
        rhint.className = "dshwv-linehead";
        var rhw = document2.createElement("span");
        rhw.className = "dshwv-lhw";
        rhw.textContent = "权重";
        rhint.appendChild(rhw);
        var rhc = document2.createElement("span");
        rhc.className = "dshwv-lhc";
        rhc.textContent = "图片";
        rhint.appendChild(rhc);
        var rho = document2.createElement("span");
        rho.className = "dshwv-lho";
        rho.textContent = "操作";
        rho.style.flex = "0 0 82px";
        rhint.appendChild(rho);
        moduleBodyEl.appendChild(rhint);
        if (!Array.isArray(m.imgs)) m.imgs = [];
        var rlistEl = document2.createElement("div");
        rlistEl.className = "dshwv-listbox";
        rlistEl.style.maxHeight = "240px";
        rlistEl.style.overflowY = "auto";
        rlistEl.style.paddingRight = "2px";
        moduleBodyEl.appendChild(rlistEl);
        renderImgItems();
        var addImgBtn = document2.createElement("button");
        addImgBtn.type = "button";
        addImgBtn.className = "dshwv-addline";
        addImgBtn.textContent = "+ 添加图片(从图库选)";
        addImgBtn.addEventListener("click", function() {
          m.imgs.push({ imgId: "", w: 1 });
          renderImgItems();
        });
        moduleBodyEl.appendChild(addImgBtn);
        var upRow2 = document2.createElement("div");
        upRow2.className = "dshwv-uproll";
        var fileInput2 = document2.createElement("input");
        fileInput2.type = "file";
        fileInput2.accept = "image/png,image/gif";
        fileInput2.style.display = "none";
        var upBtn2 = document2.createElement("button");
        upBtn2.type = "button";
        upBtn2.className = "dshwv-snapbtn dshwv-snapbtn-no";
        upBtn2.textContent = "上传图片(png/gif)";
        upBtn2.title = "上传后自动加入本随机图片列表(同时进入泡泡图库)";
        upBtn2.addEventListener("click", function() {
          fileInput2.click();
        });
        fileInput2.addEventListener("change", function() {
          var f2 = fileInput2.files && fileInput2.files[0];
          if (!f2) return;
          var before2 = {};
          for (var z2 = 0; z2 < bubbleImgList.length; z2++) before2[bubbleImgList[z2].id] = 1;
          bubbleUploadImg(f2, function(ok) {
            fileInput2.value = "";
            if (!ok) return;
            var newId2 = "";
            for (var z3 = 0; z3 < bubbleImgList.length; z3++) if (!before2[bubbleImgList[z3].id]) {
              newId2 = bubbleImgList[z3].id;
              break;
            }
            if (!newId2 && bubbleImgList.length) newId2 = bubbleImgList[bubbleImgList.length - 1].id;
            if (newId2) m.imgs.push({ imgId: newId2, w: 1 });
            renderImgItems();
          });
        });
        upRow2.appendChild(upBtn2);
        upRow2.appendChild(fileInput2);
        moduleBodyEl.appendChild(upRow2);
        var scRow2 = document2.createElement("div");
        scRow2.className = "dshwv-audiorow";
        var scL2 = document2.createElement("span");
        scL2.textContent = "显示大小";
        scRow2.appendChild(scL2);
        var scInit2 = Number(m.imgScale);
        if (!isFinite(scInit2) || scInit2 <= 0) scInit2 = 1;
        var scInp2 = document2.createElement("input");
        scInp2.type = "range";
        scInp2.min = "10";
        scInp2.max = "100";
        scInp2.step = "5";
        scInp2.className = "dshwv-cropzoom";
        scInp2.style.flex = "1";
        scInp2.value = String(Math.round(scInit2 * 100));
        var scVal2 = document2.createElement("span");
        scVal2.className = "dshwv-volpct";
        scVal2.textContent = scInp2.value + "%";
        scInp2.addEventListener("input", function() {
          m.imgScale = Math.max(0.1, Math.min(1, Number(scInp2.value) / 100));
          scVal2.textContent = scInp2.value + "%";
        });
        scRow2.appendChild(scInp2);
        scRow2.appendChild(scVal2);
        moduleBodyEl.appendChild(scRow2);
        if (!bubbleImgList.length) loadBubbleImgs(renderImgItems);
      } else {
        if (m.type === "peak" || m.type === "nextpeak") {
          if (m.type === "peak") {
            var stRow = document2.createElement("div");
            stRow.className = "dshwv-audiorow";
            var stL = document2.createElement("span");
            stL.textContent = "显示样式";
            stRow.appendChild(stL);
            var stSel = document2.createElement("select");
            stSel.className = "dshwv-sound";
            for (var sti = 0; sti < BUBBLE_PEAK_STYLE_OPTS.length; sti++) {
              var so = document2.createElement("option");
              so.value = BUBBLE_PEAK_STYLE_OPTS[sti][0];
              so.textContent = BUBBLE_PEAK_STYLE_OPTS[sti][1];
              stSel.appendChild(so);
            }
            stSel.value = bubblePeakStyleOf(m);
            stSel.addEventListener("change", function() {
              m.peakStyle = stSel.value || "default";
            });
            moduleBodyEl.appendChild(stRow);
            stRow.appendChild(stSel);
            dshwCustSel(stSel);
          }
          moduleTplRow();
          var peakStates = [
            { label: "高峰色", colorKey: "peakColor", rgbKey: "peakRgb", defaultHex: "#e0433f", defaultText: "默认红", bgKey: "peakBg", bgRgbKey: "peakBgRgb", bgHex: "#fbe7e6" },
            { label: "空闲色", colorKey: "offColor", rgbKey: "offRgb", defaultHex: "#2fa24c", defaultText: "默认绿", bgKey: "offBg", bgRgbKey: "offBgRgb", bgHex: "#e4f3e7" }
          ];
          if (!m.peakColor) m.peakColor = "#e0433f";
          if (!m.offColor) m.offColor = "#2fa24c";
          for (var psi = 0; psi < peakStates.length; psi++) {
            (function(st) {
              var grp = document2.createElement("div");
              grp.className = "dshwv-peakrow";
              var curPeak = m[st.rgbKey] ? m[st.rgbKey] : "solid";
              var ccRow = qColorSelectBuild(curPeak, function(v) {
                if (v === "solid") {
                  m[st.rgbKey] = "";
                  if (!m[st.colorKey]) m[st.colorKey] = st.defaultHex;
                } else {
                  m[st.rgbKey] = v;
                  m[st.colorKey] = "";
                }
                ccRow.sync(v === "solid" ? "solid" : v, m[st.colorKey], function(hex) {
                  m[st.colorKey] = hex;
                });
              }, { label: st.label, defaultHex: st.defaultHex, defaultText: st.defaultText });
              grp.appendChild(ccRow.row);
              var stBgV = m[st.bgRgbKey] ? m[st.bgRgbKey] : m[st.bgKey] ? "solid" : "none";
              var stBgHex0 = m[st.bgKey] || st.bgHex;
              var bgRowC = qColorSelectBuild(stBgV, function(v) {
                if (v === "none") {
                  m[st.bgRgbKey] = "";
                  m[st.bgKey] = "";
                } else if (v === "solid") {
                  m[st.bgRgbKey] = "";
                  if (!m[st.bgKey]) m[st.bgKey] = stBgHex0;
                } else {
                  m[st.bgRgbKey] = v;
                  m[st.bgKey] = "";
                }
                bgRowC.sync(v === "none" ? "none" : v, m[st.bgKey] || stBgHex0, function(hex) {
                  m[st.bgKey] = hex;
                });
              }, { label: "底色", defaultHex: stBgHex0, defaultText: "默认", allowNone: true });
              grp.appendChild(bgRowC.row);
              moduleBodyEl.appendChild(grp);
              ccRow.sync(curPeak, m[st.colorKey] || st.defaultHex, function(hex) {
                m[st.colorKey] = hex;
              });
              bgRowC.sync(stBgV, stBgHex0, function(hex) {
                m[st.bgKey] = hex;
              });
            })(peakStates[psi]);
          }
        } else {
          var note = document2.createElement("div");
          note.className = "dshwv-bubhint";
          note.textContent = "该模块为内置数值,内容自动获取,可调下方颜色/字号";
          moduleBodyEl.appendChild(note);
          moduleTplRow();
        }
      }
      if (!bubbleIsImgMod(m) && m.type !== "random") {
        let glyphBox = function(label, key) {
          var lab = document2.createElement("label");
          lab.style.display = "inline-flex";
          lab.style.alignItems = "center";
          lab.style.gap = "3px";
          lab.style.marginRight = "10px";
          var cb = document2.createElement("input");
          cb.type = "checkbox";
          cb.checked = !!m[key];
          cb.addEventListener("change", function() {
            m[key] = cb.checked;
          });
          var tx = document2.createElement("span");
          tx.textContent = label;
          lab.appendChild(cb);
          lab.appendChild(tx);
          return lab;
        };
        var isPeak2 = m.type === "peak" || m.type === "nextpeak";
        var sec = document2.createElement("div");
        sec.className = "dshwv-bubsec";
        sec.textContent = "样式";
        moduleBodyEl.appendChild(sec);
        moduleBodyEl.appendChild(bubbleFontEditRow(function() {
          return m.fontFamily || "";
        }, function(v) {
          m.fontFamily = v || "";
        }));
        var sizeRow = document2.createElement("div");
        sizeRow.className = "dshwv-audiorow";
        var sl = document2.createElement("span");
        sl.textContent = "字号";
        sizeRow.appendChild(sl);
        moduleSizeEl = document2.createElement("input");
        moduleSizeEl.type = "range";
        moduleSizeEl.min = "1";
        moduleSizeEl.max = "50";
        moduleSizeEl.step = "1";
        moduleSizeEl.className = "dshwv-cropzoom";
        moduleSizeEl.value = String(m.size || 6);
        sizeRow.appendChild(moduleSizeEl);
        var sizeNum = document2.createElement("span");
        sizeNum.className = "dshwv-volpct";
        sizeNum.textContent = String(m.size || 6);
        moduleSizeEl.addEventListener("input", function() {
          sizeNum.textContent = moduleSizeEl.value;
        });
        sizeRow.appendChild(sizeNum);
        moduleBodyEl.appendChild(sizeRow);
        var glyphRow = document2.createElement("div");
        glyphRow.className = "dshwv-audiorow";
        glyphRow.appendChild(glyphBox("加粗", "bold"));
        glyphRow.appendChild(glyphBox("斜体", "italic"));
        glyphRow.appendChild(glyphBox("下划线", "ul"));
        moduleBodyEl.appendChild(glyphRow);
        if (!isPeak2) {
          var w3cc = qColorSelectBuild(m.rgb ? m.rgb : "solid", function(v) {
            if (v === "solid") {
              m.rgb = "";
              if (!m.color) m.color = "#203170";
            } else {
              m.rgb = v;
              m.color = "";
            }
            var mode2 = v === "solid" ? "solid" : v;
            w3cc.sync(mode2, m.color, function(hex) {
              m.color = hex;
            });
          });
          moduleBodyEl.appendChild(w3cc.row);
          w3cc.sync(m.rgb ? m.rgb : "solid", m.color || "#203170", function(hex) {
            m.color = hex;
          });
        }
        if (!isPeak2) {
          var bgCur = m.bgRgb ? m.bgRgb : m.bg ? "solid" : "none";
          var bgcc = qColorSelectBuild(bgCur, function(v) {
            if (v === "none") {
              m.bgRgb = "";
              m.bg = "";
            } else if (v === "solid") {
              m.bgRgb = "";
              if (!m.bg) m.bg = "#dbe4f5";
            } else {
              m.bgRgb = v;
              m.bg = "";
            }
            bgcc.sync(v === "none" ? "none" : v, m.bg, function(hex) {
              m.bg = hex;
            });
          }, { label: "底色", defaultHex: "#dbe4f5", defaultText: "默认", allowNone: true });
          moduleBodyEl.appendChild(bgcc.row);
          bgcc.sync(bgCur, m.bg || "#dbe4f5", function(hex) {
            m.bg = hex;
          });
        }
      }
    }
    var moduleNamePromptModule = null;
    function openModuleNamePrompt(m) {
      try {
        moduleNamePromptModule = m || moduleEditRef || null;
        moduleNameInput.value = "";
        moduleNamePromptMask.style.display = "flex";
        setTimeout2(function() {
          try {
            moduleNameInput.focus();
          } catch (err) {
          }
        }, 30);
      } catch (err) {
      }
    }
    function closeModuleNamePrompt() {
      moduleNamePromptMask.style.display = "none";
      moduleNamePromptModule = null;
    }
    function saveModuleNamePrompt() {
      var m = moduleNamePromptModule || moduleEditRef;
      if (!m) {
        closeModuleNamePrompt();
        return;
      }
      bubbleLibAdd(moduleNameInput.value, m);
      moduleNameInput.value = "";
      closeModuleNamePrompt();
      if (bubblePalEl) renderBubblePal();
    }
    function openModuleEditor(m, onSave, isNew) {
      try {
        whaleZClean();
        moduleEditRef = m;
        moduleOnSave = onSave || null;
        moduleEditNew = !!isNew;
        renderModuleEditor();
        moduleMask.style.display = "flex";
      } catch (err) {
      }
    }
    function closeModuleEditor(saved) {
      try {
        if (saved && moduleEditRef) {
          if (moduleColorEl) moduleEditRef.color = moduleColorEl.value === "#203170" && !moduleEditRef.color ? "" : moduleColorEl.value;
          if (moduleSizeEl) moduleEditRef.size = Math.max(1, Math.min(50, Math.round(Number(moduleSizeEl.value) || 6)));
          if (moduleEditRef.type === "image" && !moduleEditRef.imgId) {
            showConfirm("请先选择或上传一张图片", function() {
            });
            return;
          }
          if (moduleEditRef.type === "randimg") {
            var anyImg2 = false;
            var arr2 = Array.isArray(moduleEditRef.imgs) ? moduleEditRef.imgs : [];
            for (var qi2 = 0; qi2 < arr2.length; qi2++) if (arr2[qi2] && arr2[qi2].imgId) {
              anyImg2 = true;
              break;
            }
            if (!anyImg2) {
              showConfirm("随机图片还没有图片:请先「添加图片」或「上传图片」", function() {
              });
              return;
            }
          }
          if (moduleOnSave) moduleOnSave(moduleEditRef);
        }
        moduleMask.style.display = "none";
        moduleEditRef = null;
        moduleOnSave = null;
        moduleEditNew = false;
      } catch (err) {
        moduleMask.style.display = "none";
      }
    }
    moduleMask = document2.createElement("div");
    moduleMask.className = "dshwv-bubmask";
    moduleMask.style.display = "none";
    var moduleCard = document2.createElement("div");
    moduleCard.className = "dshwv-bubcard";
    moduleTitleEl = document2.createElement("div");
    moduleTitleEl.className = "dshwv-bubtitle";
    moduleCard.appendChild(moduleTitleEl);
    moduleBodyEl = document2.createElement("div");
    moduleCard.appendChild(moduleBodyEl);
    var moduleBtns = document2.createElement("div");
    moduleBtns.className = "dshwv-bubbtns";
    moduleBtns.appendChild(bubbleBtn("取消", "dshwv-bubbtn-no", function() {
      closeModuleEditor(false);
    }));
    var saveAsBtn = document2.createElement("button");
    saveAsBtn.type = "button";
    saveAsBtn.className = "dshwv-bubbtn dshwv-bubbtn-no";
    saveAsBtn.textContent = "另存";
    saveAsBtn.title = "另存为可选模块:把当前模块存入模块库,可在任意泡泡里复用";
    saveAsBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      openModuleNamePrompt(moduleEditRef);
    });
    moduleBtns.appendChild(saveAsBtn);
    moduleBtns.appendChild(bubbleBtn("保存", "dshwv-bubbtn-ok", function() {
      closeModuleEditor(true);
    }));
    moduleCard.appendChild(moduleBtns);
    moduleMask.appendChild(moduleCard);
    document2.body.appendChild(moduleMask);
    var moduleNamePromptMask = document2.createElement("div");
    moduleNamePromptMask.className = "dshwv-confirmmask";
    moduleNamePromptMask.style.display = "none";
    var moduleNamePromptCard = document2.createElement("div");
    moduleNamePromptCard.className = "dshwv-audiowin";
    var moduleNamePromptTitle = document2.createElement("div");
    moduleNamePromptTitle.className = "dshwv-audiotitle";
    moduleNamePromptTitle.textContent = "存为可选模块";
    moduleNamePromptCard.appendChild(moduleNamePromptTitle);
    var moduleNameInput = document2.createElement("input");
    moduleNameInput.type = "text";
    moduleNameInput.className = "dshwv-audionameinput";
    moduleNameInput.maxLength = 20;
    moduleNameInput.placeholder = "模块名称(留空自动编号)";
    moduleNamePromptCard.appendChild(moduleNameInput);
    var moduleNameBtns = document2.createElement("div");
    moduleNameBtns.className = "dshwv-cropbtns";
    var moduleNameCancel = document2.createElement("button");
    moduleNameCancel.type = "button";
    moduleNameCancel.className = "dshwv-cropbtn dshwv-cropbtn-no";
    moduleNameCancel.textContent = "取消";
    moduleNameCancel.addEventListener("click", closeModuleNamePrompt);
    var moduleNameOk = document2.createElement("button");
    moduleNameOk.type = "button";
    moduleNameOk.className = "dshwv-cropbtn dshwv-cropbtn-ok";
    moduleNameOk.textContent = "保存";
    moduleNameOk.addEventListener("click", saveModuleNamePrompt);
    moduleNameBtns.appendChild(moduleNameCancel);
    moduleNameBtns.appendChild(moduleNameOk);
    moduleNamePromptCard.appendChild(moduleNameBtns);
    moduleNamePromptMask.appendChild(moduleNamePromptCard);
    document2.body.appendChild(moduleNamePromptMask);
    moduleNameInput.addEventListener("keydown", function(e) {
      try {
        if (e.key === "Enter") saveModuleNamePrompt();
        else if (e.key === "Escape") closeModuleNamePrompt();
      } catch (err) {
      }
    });
    var CROP_BOX = 260;
    var cropMask = document2.createElement("div");
    cropMask.className = "dshwv-cropmask";
    cropMask.style.display = "none";
    var cropCard = document2.createElement("div");
    cropCard.className = "dshwv-cropwin";
    var cropTitle = document2.createElement("div");
    cropTitle.className = "dshwv-croptitle";
    cropTitle.textContent = "裁剪角色图片";
    var cropBox = document2.createElement("div");
    cropBox.className = "dshwv-cropbox";
    var cropCanvas = document2.createElement("canvas");
    cropCanvas.width = CROP_BOX;
    cropCanvas.height = CROP_BOX;
    cropBox.appendChild(cropCanvas);
    var cropZoom = document2.createElement("input");
    cropZoom.type = "range";
    cropZoom.min = "0.3";
    cropZoom.max = "3";
    cropZoom.step = "0.01";
    cropZoom.value = "1";
    cropZoom.className = "dshwv-cropzoom";
    var cropZoomWrap = document2.createElement("div");
    cropZoomWrap.className = "dshwv-cropctrl";
    var cropZoomLabel = document2.createElement("span");
    cropZoomLabel.className = "dshwv-croplabel";
    cropZoomLabel.textContent = "缩放";
    var cropZoomNum = document2.createElement("input");
    cropZoomNum.type = "number";
    cropZoomNum.min = "30";
    cropZoomNum.max = "300";
    cropZoomNum.step = "1";
    cropZoomNum.value = "100";
    cropZoomNum.className = "dshwv-cropnum";
    cropZoomWrap.appendChild(cropZoomLabel);
    cropZoomWrap.appendChild(cropZoom);
    cropZoomWrap.appendChild(cropZoomNum);
    var cropNameInput = document2.createElement("input");
    cropNameInput.type = "text";
    cropNameInput.className = "dshwv-cropname";
    cropNameInput.maxLength = 16;
    cropNameInput.placeholder = "角色名称";
    var cropAngleWrap = document2.createElement("div");
    cropAngleWrap.className = "dshwv-cropctrl";
    var cropAngleLabel = document2.createElement("span");
    cropAngleLabel.className = "dshwv-croplabel";
    cropAngleLabel.textContent = "旋转";
    var cropFlipHBtn = document2.createElement("button");
    cropFlipHBtn.type = "button";
    cropFlipHBtn.className = "dshwv-cropflip";
    cropFlipHBtn.textContent = "⇋";
    cropFlipHBtn.title = "水平翻转";
    var cropFlipVBtn = document2.createElement("button");
    cropFlipVBtn.type = "button";
    cropFlipVBtn.className = "dshwv-cropflip";
    cropFlipVBtn.textContent = "⇅";
    cropFlipVBtn.title = "垂直翻转";
    var cropAngle = document2.createElement("input");
    cropAngle.type = "range";
    cropAngle.min = "-360";
    cropAngle.max = "360";
    cropAngle.step = "1";
    cropAngle.value = "0";
    cropAngle.className = "dshwv-cropzoom";
    var cropAngleNum = document2.createElement("input");
    cropAngleNum.type = "number";
    cropAngleNum.min = "-360";
    cropAngleNum.max = "360";
    cropAngleNum.step = "1";
    cropAngleNum.value = "0";
    cropAngleNum.className = "dshwv-cropnum";
    cropAngleWrap.appendChild(cropAngleLabel);
    cropAngleWrap.appendChild(cropFlipHBtn);
    cropAngleWrap.appendChild(cropFlipVBtn);
    cropAngleWrap.appendChild(cropAngle);
    cropAngleWrap.appendChild(cropAngleNum);
    var cropBtns = document2.createElement("div");
    cropBtns.className = "dshwv-cropbtns";
    var cropCancelBtn = document2.createElement("button");
    cropCancelBtn.type = "button";
    cropCancelBtn.className = "dshwv-cropbtn dshwv-cropbtn-no";
    cropCancelBtn.textContent = "取消";
    var cropResetBtn = document2.createElement("button");
    cropResetBtn.type = "button";
    cropResetBtn.className = "dshwv-cropbtn dshwv-cropbtn-no";
    cropResetBtn.textContent = "重置";
    cropResetBtn.title = "重置缩放、旋转和位置";
    var cropOkBtn = document2.createElement("button");
    cropOkBtn.type = "button";
    cropOkBtn.className = "dshwv-cropbtn dshwv-cropbtn-ok";
    cropOkBtn.textContent = "确认";
    cropBtns.appendChild(cropCancelBtn);
    cropBtns.appendChild(cropResetBtn);
    cropBtns.appendChild(cropOkBtn);
    cropCard.appendChild(cropTitle);
    cropCard.appendChild(cropBox);
    cropCard.appendChild(cropNameInput);
    cropCard.appendChild(cropZoomWrap);
    cropCard.appendChild(cropAngleWrap);
    cropCard.appendChild(cropBtns);
    cropMask.appendChild(cropCard);
    document2.body.appendChild(cropMask);
    cropBox.addEventListener("pointerdown", onCropDown);
    cropBox.addEventListener("pointermove", onCropMove);
    cropBox.addEventListener("pointerup", onCropUp);
    cropBox.addEventListener("pointercancel", onCropUp);
    cropBox.addEventListener("pointerleave", onCropUp);
    cropBox.addEventListener("wheel", onCropWheel, { passive: false });
    cropAngle.addEventListener("input", function() {
      if (cropState) {
        cropState.rotation = clampAngle(Number(cropAngle.value));
        cropAngleNum.value = String(cropState.rotation);
        positionCrop();
      }
    });
    cropAngleNum.addEventListener("input", function() {
      if (cropState) {
        var v = Math.round(Number(cropAngleNum.value));
        if (!isFinite(v)) v = 0;
        cropState.rotation = clampAngle(v);
        cropAngle.value = String(cropState.rotation);
        positionCrop();
      }
    });
    cropAngleNum.addEventListener("change", function() {
      if (cropState) cropAngleNum.value = String(cropState.rotation);
    });
    cropZoom.addEventListener("input", function() {
      if (cropState) {
        cropState.zoom = Number(cropZoom.value);
        cropZoomNum.value = String(Math.round(cropState.zoom * 100));
        positionCrop();
      }
    });
    cropZoomNum.addEventListener("input", function() {
      if (cropState) {
        var pct = Number(cropZoomNum.value);
        if (!isFinite(pct)) pct = 100;
        cropState.zoom = Math.min(3, Math.max(0.3, pct / 100));
        cropZoom.value = String(cropState.zoom);
        positionCrop();
      }
    });
    cropZoomNum.addEventListener("change", function() {
      if (cropState) cropZoomNum.value = String(Math.round(cropState.zoom * 100));
    });
    cropCancelBtn.addEventListener("click", function() {
      hideCropModal();
    });
    cropResetBtn.addEventListener("click", function() {
      resetCrop();
    });
    cropOkBtn.addEventListener("click", function() {
      confirmCrop();
    });
    cropFlipHBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      flipCrop("H");
    });
    cropFlipVBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      flipCrop("V");
    });
    var gifMask = document2.createElement("div");
    gifMask.className = "dshwv-gifmask";
    gifMask.style.display = "none";
    var gifCard = document2.createElement("div");
    gifCard.className = "dshwv-gifwin";
    var gifTitle = document2.createElement("div");
    gifTitle.className = "dshwv-giftitle";
    gifTitle.textContent = "导入动图角色";
    var gifPreviewBox = document2.createElement("div");
    gifPreviewBox.className = "dshwv-gifpreview";
    var gifPreviewImg = document2.createElement("img");
    gifPreviewImg.className = "dshwv-gifpreviewimg";
    gifPreviewImg.alt = "动图预览";
    gifPreviewImg.draggable = false;
    gifPreviewBox.appendChild(gifPreviewImg);
    var gifHint = document2.createElement("div");
    gifHint.className = "dshwv-gifhint";
    gifHint.textContent = "GIF 动图不支持裁剪，将按原始尺寸原样导入";
    var gifNameInput = document2.createElement("input");
    gifNameInput.type = "text";
    gifNameInput.className = "dshwv-gifname";
    gifNameInput.maxLength = 16;
    gifNameInput.placeholder = "角色名称";
    var gifBtns = document2.createElement("div");
    gifBtns.className = "dshwv-cropbtns";
    var gifCancelBtn = document2.createElement("button");
    gifCancelBtn.type = "button";
    gifCancelBtn.className = "dshwv-cropbtn dshwv-cropbtn-no";
    gifCancelBtn.textContent = "取消";
    var gifOkBtn = document2.createElement("button");
    gifOkBtn.type = "button";
    gifOkBtn.className = "dshwv-cropbtn dshwv-cropbtn-ok";
    gifOkBtn.textContent = "确认";
    gifBtns.appendChild(gifCancelBtn);
    gifBtns.appendChild(gifOkBtn);
    gifCard.appendChild(gifTitle);
    gifCard.appendChild(gifPreviewBox);
    gifCard.appendChild(gifHint);
    gifCard.appendChild(gifNameInput);
    gifCard.appendChild(gifBtns);
    gifMask.appendChild(gifCard);
    document2.body.appendChild(gifMask);
    gifCancelBtn.addEventListener("click", hideGifRoleModal);
    gifOkBtn.addEventListener("click", confirmGifRole);
    var gifRoleDataUrl = null;
    var gifRoleFileName = "";
    var gifRoleAnimType = "gif";
    function openGifRoleModal(dataUrl, fileName, animType) {
      gifRoleDataUrl = dataUrl;
      gifRoleAnimType = animType === "apng" ? "apng" : "gif";
      gifRoleFileName = (fileName || "").replace(/.[^.]+$/, "") || "新角色";
      if (gifRoleAnimType === "apng") {
        gifTitle.textContent = "导入 APNG 动图角色";
        gifHint.textContent = "APNG 动图不支持裁剪，将按原始尺寸原样导入";
      } else {
        gifTitle.textContent = "导入 GIF 动图角色";
        gifHint.textContent = "GIF 动图不支持裁剪，将按原始尺寸原样导入";
      }
      gifNameInput.value = "";
      gifPreviewImg.src = bridge.asset(dataUrl);
      gifMask.style.display = "flex";
    }
    function hideGifRoleModal() {
      gifMask.style.display = "none";
      gifRoleDataUrl = null;
      gifRoleFileName = "";
      gifRoleAnimType = "gif";
      gifPreviewImg.src = bridge.asset("");
    }
    function confirmGifRole() {
      try {
        var name = (gifNameInput.value || "").trim().slice(0, 16) || "新角色";
        if (!gifRoleDataUrl) {
          hideGifRoleModal();
          return;
        }
        fetch(ROLE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // format 显式传给 host：APNG 的 dataURL 是 image/png，host 无法自行区分
          body: JSON.stringify({ name, image: gifRoleDataUrl, format: gifRoleAnimType })
        }).then(function(r) {
          return r.json();
        }).then(function(d) {
          if (d && d.ok && Array.isArray(d.roles)) {
            roleList = d.roles;
            renderRolePanel();
            var newest = null;
            for (var i = 0; i < roleList.length; i++) {
              if (roleList[i].id !== "default" && (!newest || roleList[i].createdAt > newest.createdAt)) newest = roleList[i];
            }
            if (newest) applyRole(newest.id, newest.name, roleUrl(newest.id));
          }
        }).catch(function() {
        }).finally(function() {
          hideGifRoleModal();
        });
      } catch (err) {
        try {
          hideGifRoleModal();
        } catch (err2) {
        }
      }
    }
    var confirmMask = document2.createElement("div");
    confirmMask.className = "dshwv-confirmmask";
    confirmMask.style.display = "none";
    var confirmCard = document2.createElement("div");
    confirmCard.className = "dshwv-confirmwin";
    var confirmText = document2.createElement("div");
    confirmText.className = "dshwv-confirmtext";
    var confirmBtns = document2.createElement("div");
    confirmBtns.className = "dshwv-confirmbtns";
    var confirmNoBtn = document2.createElement("button");
    confirmNoBtn.type = "button";
    confirmNoBtn.className = "dshwv-cropbtn dshwv-cropbtn-no";
    confirmNoBtn.textContent = "取消";
    var confirmYesBtn = document2.createElement("button");
    confirmYesBtn.type = "button";
    confirmYesBtn.className = "dshwv-cropbtn dshwv-cropbtn-ok";
    confirmYesBtn.textContent = "删除";
    confirmBtns.appendChild(confirmNoBtn);
    confirmBtns.appendChild(confirmYesBtn);
    confirmCard.appendChild(confirmText);
    confirmCard.appendChild(confirmBtns);
    confirmMask.appendChild(confirmCard);
    document2.body.appendChild(confirmMask);
    confirmNoBtn.addEventListener("click", hideConfirm);
    confirmYesBtn.addEventListener("click", function() {
      var cb = confirmCb;
      hideConfirm();
      if (cb) cb();
    });
    var audioEditMask = document2.createElement("div");
    audioEditMask.className = "dshwv-audiomask";
    audioEditMask.style.display = "none";
    var audioEditCard = document2.createElement("div");
    audioEditCard.className = "dshwv-audiowin";
    var audioEditTitle = document2.createElement("div");
    audioEditTitle.className = "dshwv-audiotitle";
    audioEditTitle.textContent = "音效组";
    var audioEditName = document2.createElement("input");
    audioEditName.type = "text";
    audioEditName.className = "dshwv-audionameinput";
    audioEditName.maxLength = 20;
    audioEditName.placeholder = "预设名称";
    var audioEditPressRow = document2.createElement("div");
    audioEditPressRow.className = "dshwv-audiorow";
    var audioEditPressLabel = document2.createElement("span");
    audioEditPressLabel.className = "dshwv-audioslotlabel";
    audioEditPressLabel.textContent = "按压";
    var audioEditPressWrap = document2.createElement("div");
    audioEditPressWrap.className = "dshwv-slotwrap";
    var audioEditPressBtn = document2.createElement("button");
    audioEditPressBtn.type = "button";
    audioEditPressBtn.className = "dshwv-slotbtn";
    audioEditPressBtn.textContent = "小黄鸭·按下";
    var audioEditPressPanel = document2.createElement("div");
    audioEditPressPanel.className = "dshwv-slotlist";
    audioEditPressWrap.appendChild(audioEditPressBtn);
    audioEditPressWrap.appendChild(audioEditPressPanel);
    var audioEditPressImport = document2.createElement("button");
    audioEditPressImport.type = "button";
    audioEditPressImport.className = "dshwv-audiosmallimport";
    audioEditPressImport.textContent = "导入";
    audioEditPressImport.title = "导入并裁剪按压音";
    audioEditPressRow.appendChild(audioEditPressLabel);
    audioEditPressRow.appendChild(audioEditPressWrap);
    audioEditPressRow.appendChild(audioEditPressImport);
    var audioEditReleaseRow = document2.createElement("div");
    audioEditReleaseRow.className = "dshwv-audiorow";
    var audioEditReleaseLabel = document2.createElement("span");
    audioEditReleaseLabel.className = "dshwv-audioslotlabel";
    audioEditReleaseLabel.textContent = "松开";
    var audioEditReleaseWrap = document2.createElement("div");
    audioEditReleaseWrap.className = "dshwv-slotwrap";
    var audioEditReleaseBtn = document2.createElement("button");
    audioEditReleaseBtn.type = "button";
    audioEditReleaseBtn.className = "dshwv-slotbtn";
    audioEditReleaseBtn.textContent = "小黄鸭·松开";
    var audioEditReleasePanel = document2.createElement("div");
    audioEditReleasePanel.className = "dshwv-slotlist";
    audioEditReleaseWrap.appendChild(audioEditReleaseBtn);
    audioEditReleaseWrap.appendChild(audioEditReleasePanel);
    var audioEditReleaseImport = document2.createElement("button");
    audioEditReleaseImport.type = "button";
    audioEditReleaseImport.className = "dshwv-audiosmallimport";
    audioEditReleaseImport.textContent = "导入";
    audioEditReleaseImport.title = "导入并裁剪松开音";
    audioEditReleaseRow.appendChild(audioEditReleaseLabel);
    audioEditReleaseRow.appendChild(audioEditReleaseWrap);
    audioEditReleaseRow.appendChild(audioEditReleaseImport);
    var audioEditBtns = document2.createElement("div");
    audioEditBtns.className = "dshwv-cropbtns";
    var audioEditCancel = document2.createElement("button");
    audioEditCancel.type = "button";
    audioEditCancel.className = "dshwv-cropbtn dshwv-cropbtn-no";
    audioEditCancel.textContent = "取消";
    var audioEditPlay = document2.createElement("button");
    audioEditPlay.type = "button";
    audioEditPlay.className = "dshwv-cropbtn dshwv-cropbtn-no";
    audioEditPlay.textContent = "试听";
    audioEditPlay.title = "按住播放按压音，松开播放松开音（模拟点击挂件）";
    var audioEditSave = document2.createElement("button");
    audioEditSave.type = "button";
    audioEditSave.className = "dshwv-cropbtn dshwv-cropbtn-ok";
    audioEditSave.textContent = "保存";
    audioEditBtns.appendChild(audioEditCancel);
    audioEditBtns.appendChild(audioEditPlay);
    audioEditBtns.appendChild(audioEditSave);
    audioEditCard.appendChild(audioEditTitle);
    audioEditCard.appendChild(audioEditName);
    audioEditCard.appendChild(audioEditPressRow);
    audioEditCard.appendChild(audioEditReleaseRow);
    audioEditCard.appendChild(audioEditBtns);
    audioEditMask.appendChild(audioEditCard);
    document2.body.appendChild(audioEditMask);
    audioEditCancel.addEventListener("click", hideAudioEditor);
    audioEditPlay.addEventListener("pointerdown", function(e) {
      e.stopPropagation();
      audioEditPreviewDown();
    });
    audioEditPlay.addEventListener("pointerup", function(e) {
      e.stopPropagation();
      audioEditPreviewUp();
    });
    audioEditPlay.addEventListener("pointercancel", audioEditPreviewUp);
    audioEditPlay.addEventListener("pointerleave", audioEditPreviewUp);
    audioEditSave.addEventListener("click", saveAudioGroup);
    audioEditMask.addEventListener("click", function(e) {
      if (e.target === audioEditMask || e.target === audioEditCard) closeAudioSlotPanels();
    });
    var audioCropMask = document2.createElement("div");
    audioCropMask.className = "dshwv-audiomask";
    audioCropMask.style.display = "none";
    var audioCropCard = document2.createElement("div");
    audioCropCard.className = "dshwv-audiowin";
    var audioCropTitle = document2.createElement("div");
    audioCropTitle.className = "dshwv-audiotitle";
    audioCropTitle.textContent = "裁剪音频";
    var audioCropCanvas = document2.createElement("canvas");
    audioCropCanvas.width = 300;
    audioCropCanvas.height = 120;
    audioCropCanvas.className = "dshwv-audiocropcanvas";
    var audioCropStart = document2.createElement("input");
    audioCropStart.type = "range";
    audioCropStart.min = "0";
    audioCropStart.max = "100";
    audioCropStart.step = "0.001";
    audioCropStart.value = "0";
    audioCropStart.className = "dshwv-cropzoom";
    var audioCropStartNum = document2.createElement("input");
    audioCropStartNum.type = "number";
    audioCropStartNum.min = "0";
    audioCropStartNum.step = "0.001";
    audioCropStartNum.value = "0";
    audioCropStartNum.className = "dshwv-cropnum";
    audioCropStartNum.title = "起始时间（秒）";
    var audioCropStartRow = document2.createElement("div");
    audioCropStartRow.className = "dshwv-audiosliderrow";
    audioCropStartRow.appendChild(audioCropStart);
    audioCropStartRow.appendChild(audioCropStartNum);
    var audioCropEnd = document2.createElement("input");
    audioCropEnd.type = "range";
    audioCropEnd.min = "0";
    audioCropEnd.max = "100";
    audioCropEnd.step = "0.001";
    audioCropEnd.value = "100";
    audioCropEnd.className = "dshwv-cropzoom";
    var audioCropEndNum = document2.createElement("input");
    audioCropEndNum.type = "number";
    audioCropEndNum.min = "0";
    audioCropEndNum.step = "0.001";
    audioCropEndNum.value = "0";
    audioCropEndNum.className = "dshwv-cropnum";
    audioCropEndNum.title = "结束时间（秒）";
    var audioCropEndRow = document2.createElement("div");
    audioCropEndRow.className = "dshwv-audiosliderrow";
    audioCropEndRow.appendChild(audioCropEnd);
    audioCropEndRow.appendChild(audioCropEndNum);
    audioCropStart.style.display = "none";
    audioCropEnd.style.display = "none";
    var audioCropDual = document2.createElement("div");
    audioCropDual.className = "dshwv-dualrange";
    var audioCropDualTrack = document2.createElement("div");
    audioCropDualTrack.className = "dshwv-dualrange-track";
    var audioCropDualFill = document2.createElement("div");
    audioCropDualFill.className = "dshwv-dualrange-fill";
    var audioCropDualStart = document2.createElement("div");
    audioCropDualStart.className = "dshwv-dualrange-thumb";
    var audioCropDualEnd = document2.createElement("div");
    audioCropDualEnd.className = "dshwv-dualrange-thumb";
    audioCropDual.appendChild(audioCropDualTrack);
    audioCropDual.appendChild(audioCropDualFill);
    audioCropDual.appendChild(audioCropDualStart);
    audioCropDual.appendChild(audioCropDualEnd);
    var audioCropDualRow = document2.createElement("div");
    audioCropDualRow.className = "dshwv-audiosliderrow";
    audioCropDualRow.appendChild(audioCropStartNum);
    audioCropDualRow.appendChild(audioCropDual);
    audioCropDualRow.appendChild(audioCropEndNum);
    var audioCropZoomLabel = document2.createElement("span");
    audioCropZoomLabel.className = "dshwv-zoomlabel";
    audioCropZoomLabel.textContent = "缩放倍数";
    var audioCropZoomRange = document2.createElement("input");
    audioCropZoomRange.type = "range";
    audioCropZoomRange.min = "1";
    audioCropZoomRange.max = "50";
    audioCropZoomRange.step = "1";
    audioCropZoomRange.value = "1";
    audioCropZoomRange.className = "dshwv-cropzoom";
    audioCropZoomRange.title = "波形放大倍数";
    var audioCropZoomNum = document2.createElement("input");
    audioCropZoomNum.type = "number";
    audioCropZoomNum.min = "1";
    audioCropZoomNum.max = "50";
    audioCropZoomNum.step = "1";
    audioCropZoomNum.value = "1";
    audioCropZoomNum.className = "dshwv-cropnum";
    audioCropZoomNum.title = "放大倍数";
    var audioCropZoomRow = document2.createElement("div");
    audioCropZoomRow.className = "dshwv-audiosliderrow";
    audioCropZoomRow.appendChild(audioCropZoomLabel);
    audioCropZoomRow.appendChild(audioCropZoomRange);
    audioCropZoomRow.appendChild(audioCropZoomNum);
    var audioCropTime = document2.createElement("div");
    audioCropTime.className = "dshwv-audiotime";
    audioCropTime.textContent = "0.0s – 0.0s";
    var audioCropNameRow = document2.createElement("div");
    audioCropNameRow.className = "dshwv-audiosliderrow";
    audioCropNameRow.style.justifyContent = "center";
    audioCropNameRow.style.margin = "2px 0";
    var audioCropName = document2.createElement("input");
    audioCropName.type = "text";
    audioCropName.maxLength = 30;
    audioCropName.placeholder = "音频片段名称";
    audioCropName.title = "裁剪后片段的名称（可改名，留空用源文件名）";
    audioCropName.style.cssText = "width:min(60%,240px);flex:0 1 auto;margin:0;text-align:center;border:1px solid rgba(32,49,112,.4);border-radius:6px;padding:2px 6px;font-size:12px;color:#203170;background:#fff;box-sizing:border-box";
    audioCropNameRow.appendChild(audioCropName);
    audioCropNameRow.style.marginBottom = "12px";
    function updateAudioCropOkState() {
      try {
        audioCropOk.disabled = false;
      } catch (err) {
      }
    }
    audioCropName.addEventListener("input", updateAudioCropOkState);
    var audioCropBtns = document2.createElement("div");
    audioCropBtns.className = "dshwv-cropbtns";
    var audioCropCancel = document2.createElement("button");
    audioCropCancel.type = "button";
    audioCropCancel.className = "dshwv-cropbtn dshwv-cropbtn-no";
    audioCropCancel.textContent = "取消";
    var audioCropPlay = document2.createElement("button");
    audioCropPlay.type = "button";
    audioCropPlay.className = "dshwv-cropbtn dshwv-cropbtn-no";
    audioCropPlay.textContent = "试听";
    audioCropPlay.title = "试听裁剪后的片段";
    var audioCropOk = document2.createElement("button");
    audioCropOk.type = "button";
    audioCropOk.className = "dshwv-cropbtn dshwv-cropbtn-ok";
    audioCropOk.textContent = "确认";
    audioCropOk.disabled = false;
    audioCropBtns.appendChild(audioCropCancel);
    audioCropBtns.appendChild(audioCropPlay);
    audioCropBtns.appendChild(audioCropOk);
    audioCropCard.appendChild(audioCropTitle);
    audioCropCard.appendChild(audioCropCanvas);
    audioCropCard.appendChild(audioCropDualRow);
    audioCropCard.appendChild(audioCropZoomRow);
    audioCropCard.appendChild(audioCropTime);
    audioCropCard.appendChild(audioCropNameRow);
    audioCropCard.appendChild(audioCropBtns);
    audioCropMask.appendChild(audioCropCard);
    document2.body.appendChild(audioCropMask);
    audioCropCancel.addEventListener("click", hideAudioCrop);
    audioCropOk.addEventListener("click", confirmAudioCrop);
    audioCropPlay.addEventListener("click", previewAudioCrop);
    audioCropStart.addEventListener("input", onAudioCropStartInput);
    audioCropEnd.addEventListener("input", onAudioCropEndInput);
    audioCropStartNum.addEventListener("input", onAudioCropStartNumInput);
    audioCropStartNum.addEventListener("change", onAudioCropStartNumChange);
    audioCropEndNum.addEventListener("input", onAudioCropEndNumInput);
    audioCropEndNum.addEventListener("change", onAudioCropEndNumChange);
    audioCropZoomRange.addEventListener("input", onAudioCropZoomInput);
    audioCropZoomNum.addEventListener("input", onAudioCropZoomNumInput);
    audioCropZoomNum.addEventListener("change", onAudioCropZoomNumChange);
    audioCropCanvas.addEventListener("wheel", onAudioCropWheel, { passive: false });
    audioCropCanvas.addEventListener("pointerdown", onAudioCropSelDown);
    audioCropCanvas.addEventListener("pointermove", onAudioCropSelMove);
    audioCropCanvas.addEventListener("pointerup", onAudioCropSelUp);
    audioCropCanvas.addEventListener("pointercancel", onAudioCropSelUp);
    audioCropDual.addEventListener("pointerdown", onAudioCropDualDown);
    audioCropDual.addEventListener("pointermove", onAudioCropDualMove);
    audioCropDual.addEventListener("pointerup", onAudioCropDualUp);
    audioCropDual.addEventListener("pointercancel", onAudioCropDualUp);
    var textBox = document2.createElement("div");
    textBox.className = "dshwv-text";
    var labelEl = document2.createElement("div");
    labelEl.className = "dshwv-label";
    labelEl.textContent = "DeepSeek 余额";
    var amountEl = document2.createElement("div");
    amountEl.className = "dshwv-amount";
    var hintEl = document2.createElement("div");
    hintEl.className = "dshwv-hint";
    textBox.appendChild(labelEl);
    textBox.appendChild(amountEl);
    textBox.appendChild(hintEl);
    var bubbleBox = document2.createElement("div");
    bubbleBox.className = "dshwv-pop";
    bubbleBox.inert = true;
    bubbleBox.innerHTML = '<svg viewBox="0 0 1026 700" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"><path class="dshwv-bshape" fill="#FFFFFF" stroke="#203170" stroke-width="18" stroke-linejoin="round" stroke-linecap="round" d="M 827 248 A 373 232 0 1 0 81 246 A 373 232 0 0 0 301 465 A 57 32 10 0 0 413 484 A 373 232 0 0 0 827 248 Z"/><ellipse class="dshwv-b1" cx="352" cy="561" rx="37.5" ry="26" fill="#FFFFFF" stroke="#203170" stroke-width="18"/><ellipse class="dshwv-b2" cx="442" cy="646" rx="24.5" ry="18" fill="#FFFFFF" stroke="#203170" stroke-width="18"/></svg>';
    var gifEl = document2.createElement("img");
    gifEl.className = "dshwv-gif";
    gifEl.src = bridge.asset(GIF_URL);
    gifEl.alt = "";
    gifEl.draggable = false;
    bubbleBox.appendChild(gifEl);
    var gifFailed = false;
    gifEl.onerror = function() {
      gifFailed = true;
    };
    bubbleBox.appendChild(textBox);
    bubbleBox.addEventListener("click", function(e) {
      e.stopPropagation();
      if (!bubbleShown) return;
      if (costBubbleActive) {
        hideCostBubble();
        return;
      }
      bubbleNext();
    });
    var body = document2.createElement("div");
    body.className = "dshwv-body";
    body.appendChild(img);
    body.appendChild(bubbleBox);
    root.appendChild(body);
    root.appendChild(menuBtn);
    document2.body.appendChild(root);
    document2.body.appendChild(menuBox);
    var dshwCenterX = 44.25;
    var dshwCenterY = 36;
    function measureBubbleCenter() {
      try {
        var svg = bubbleBox && bubbleBox.querySelector("svg");
        var shape = svg && svg.querySelector(".dshwv-bshape");
        if (!shape || typeof shape.getBBox !== "function") return;
        var bb = shape.getBBox();
        if (!bb || !isFinite(bb.x + bb.y + bb.width + bb.height) || bb.width <= 0 || bb.height <= 0) return;
        var cx = (bb.x + bb.width / 2) / 1026 * 100;
        var cy = (bb.y + bb.height / 2) / 700 * 100;
        if (!isFinite(cx) || !isFinite(cy)) return;
        dshwCenterX = cx;
        dshwCenterY = cy;
        try {
          var s = document2.documentElement.style;
          s.setProperty("--dshw-vx", cx + "%");
          s.setProperty("--dshw-vy", cy + "%");
        } catch (err) {
        }
      } catch (err) {
      }
    }
    measureBubbleCenter();
    try {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(measureBubbleCenter);
    } catch (err) {
    }
    setTimeout2(measureBubbleCenter, 120);
    try {
      window2.addEventListener("load", function() {
        measureBubbleCenter();
      });
    } catch (err) {
    }
    var state = {
      scale: 1.5,
      h: "right",
      hOff: 0,
      v: "bottom",
      vOff: 0,
      left: 0,
      top: 0,
      balance: null,
      currency: null,
      todayUsage: null,
      isPeak: false,
      status: "loading",
      message: "",
      flip: false
    };
    var SNAP_KEY = "dshw-snap";
    var SNAP_VER = 3;
    var SNAP_DEFAULTS = {
      mode: "ratio",
      ratio: { L: 10, T: 0, R: 10, B: 15, F: 50 },
      px: { L: 80, T: 0, R: 80, B: 80, F: -1 }
    };
    var snapConfig = null;
    function cloneSnap(c) {
      return {
        mode: c.mode,
        ratio: { L: c.ratio.L, T: c.ratio.T, R: c.ratio.R, B: c.ratio.B, F: c.ratio.F },
        px: { L: c.px.L, T: c.px.T, R: c.px.R, B: c.px.B, F: c.px.F }
      };
    }
    function clampSnapKey(mode, key, val, vp) {
      try {
        if (mode === "px") {
          var w = Math.max(1, vp.w), h = Math.max(1, vp.h);
          var p = snapEdit ? snapEdit.px : snapConfig.px;
          if (key === "L") return Math.max(0, Math.min(val, p.F >= 0 ? p.F : w / 2));
          if (key === "R") return Math.max(0, Math.min(val, Math.max(0, w - (p.F >= 0 ? p.F : w / 2))));
          if (key === "T") return Math.max(0, Math.min(val, Math.max(0, h - p.B)));
          if (key === "B") return Math.max(0, Math.min(val, Math.max(0, h - p.T)));
          if (key === "F") return Math.max(p.L, Math.min(val, Math.max(p.L, w - p.R)));
        } else {
          var r = snapEdit ? snapEdit.ratio : snapConfig.ratio;
          if (key === "L") return Math.max(0, Math.min(val, r.F));
          if (key === "R") return Math.max(0, Math.min(val, 100 - r.F));
          if (key === "T") return Math.max(0, Math.min(val, 100 - r.B));
          if (key === "B") return Math.max(0, Math.min(val, 100 - r.T));
          if (key === "F") return Math.max(r.L, Math.min(val, 100 - r.R));
        }
      } catch (err) {
      }
      return val;
    }
    function fixSnapConfig(cfg, mode) {
      try {
        var m = mode || cfg.mode;
        if (m === "off") return;
        var vp = viewport();
        if (m === "px") {
          var w = Math.max(1, vp.w), h = Math.max(1, vp.h);
          if (!(cfg.px.F >= 0)) {
            cfg.px.F = Math.round(w / 2);
            if (!(cfg.px.L > 0)) cfg.px.L = 80;
            if (!(cfg.px.R > 0)) cfg.px.R = 80;
            cfg.px.B = Math.max(0, cfg.px.B > 0 ? cfg.px.B : 80);
            cfg.px.T = Math.max(0, Math.min(cfg.px.T, Math.max(0, h - cfg.px.B)));
          }
          cfg.px.L = Math.max(0, Math.min(cfg.px.L, cfg.px.F));
          cfg.px.R = Math.max(0, Math.min(cfg.px.R, Math.max(0, w - cfg.px.F)));
          cfg.px.F = Math.max(cfg.px.L, Math.min(cfg.px.F, Math.max(cfg.px.L, w - cfg.px.R)));
          cfg.px.L = Math.max(0, Math.min(cfg.px.L, cfg.px.F));
          cfg.px.R = Math.max(0, Math.min(cfg.px.R, Math.max(0, w - cfg.px.F)));
          cfg.px.T = Math.max(0, Math.min(cfg.px.T, Math.max(0, h - cfg.px.B)));
          cfg.px.B = Math.max(0, Math.min(cfg.px.B, Math.max(0, h - cfg.px.T)));
          cfg.px.T = Math.max(0, Math.min(cfg.px.T, Math.max(0, h - cfg.px.B)));
        } else {
          cfg.ratio.L = Math.max(0, Math.min(cfg.ratio.L, cfg.ratio.F));
          cfg.ratio.R = Math.max(0, Math.min(cfg.ratio.R, 100 - cfg.ratio.F));
          cfg.ratio.F = Math.max(cfg.ratio.L, Math.min(cfg.ratio.F, 100 - cfg.ratio.R));
          cfg.ratio.L = Math.max(0, Math.min(cfg.ratio.L, cfg.ratio.F));
          cfg.ratio.R = Math.max(0, Math.min(cfg.ratio.R, 100 - cfg.ratio.F));
          cfg.ratio.T = Math.max(0, Math.min(cfg.ratio.T, 100 - cfg.ratio.B));
          cfg.ratio.B = Math.max(0, Math.min(cfg.ratio.B, 100 - cfg.ratio.T));
          cfg.ratio.T = Math.max(0, Math.min(cfg.ratio.T, 100 - cfg.ratio.B));
        }
      } catch (err) {
      }
    }
    function loadSnapConfig() {
      snapConfig = cloneSnap(SNAP_DEFAULTS);
      try {
        var raw = localStorage.getItem(SNAP_KEY);
        if (raw) {
          var d = JSON.parse(raw);
          if (d && d.v === SNAP_VER) {
            if (d.mode === "ratio" || d.mode === "px" || d.mode === "off") snapConfig.mode = d.mode;
            var keys = ["L", "T", "R", "B", "F"];
            var i, k;
            if (d.ratio) for (i = 0; i < keys.length; i++) {
              k = keys[i];
              if (typeof d.ratio[k] === "number" && isFinite(d.ratio[k])) snapConfig.ratio[k] = d.ratio[k];
            }
            if (d.px) for (i = 0; i < keys.length; i++) {
              k = keys[i];
              if (typeof d.px[k] === "number" && isFinite(d.px[k])) snapConfig.px[k] = d.px[k];
            }
          }
        }
      } catch (err) {
      }
      fixSnapConfig(snapConfig, "ratio");
      fixSnapConfig(snapConfig, "px");
    }
    function saveSnapConfig() {
      try {
        var out = cloneSnap(snapConfig);
        out.v = SNAP_VER;
        localStorage.setItem(SNAP_KEY, JSON.stringify(out));
      } catch (err) {
      }
    }
    loadSnapConfig();
    var busy = false;
    var settleTimer = null;
    var animDelayTimer = null;
    var drag = null;
    var shown = null;
    var animId = null;
    var bubbleShown = false;
    var bubbleTimer = null;
    var bubbleRandomActive = false;
    var bubbleRandomLines = null;
    var BUBBLE_STYLE_CLASS = { A: "dshwv-label", B: "dshwv-amount", P: "dshwv-period", C: "dshwv-hint" };
    function pickOne(arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    }
    function singleCenter(style, text, color, wrap) {
      return [null, { t: text, s: style, c: color || "", w: !!wrap }, null];
    }
    var RANDOM_GROUPS = [
      { w: 7, lines: function() {
        return singleCenter("B", pickOne(["好模型... ↓", "好女孩...↓"]));
      } },
      { w: 7, lines: function() {
        return singleCenter("A", pickOne(["不知道用户有什么用，先赶走吧~", "我...我...我也要挣钱吗？", "我去吃饭啦，测完叫我", "压力一只蓝色大肥鱼？！", "DeepSleep...", "坏了...用户彻底怒了！"]), "", true);
      } },
      { w: 10, lines: function() {
        return { gif: true };
      } },
      { w: 3, lines: function() {
        return singleCenter("A", pickOne(["你目录里的dsh是什么...大烧货吗...?", "恭喜你实现token自由！token全跑了！", "真当我是便宜货啊..."]), "", true);
      } },
      { w: 1, lines: function() {
        return singleCenter("B", "哦鲸鲸... ");
      } }
    ];
    function pickRandomLines() {
      var total = 0;
      for (var i = 0; i < RANDOM_GROUPS.length; i++) total += RANDOM_GROUPS[i].w;
      var r = Math.random() * total;
      for (var i = 0; i < RANDOM_GROUPS.length; i++) {
        r -= RANDOM_GROUPS[i].w;
        if (r < 0) return RANDOM_GROUPS[i].lines();
      }
      return RANDOM_GROUPS[RANDOM_GROUPS.length - 1].lines();
    }
    function applyBubbleLines(lines) {
      if (lines && lines.gif) {
        if (gifFailed) {
          lines = singleCenter("A", pickOne(["gif 加载失败了...", "今天没有动图给你看~", "呜呜 动图不见了..."]), "", true);
        } else {
          if (gifFadeTimer) {
            clearTimeout(gifFadeTimer);
            gifFadeTimer = null;
          }
          gifEl.style.display = "block";
          gifEl.style.opacity = "";
          labelEl.style.display = "none";
          amountEl.style.display = "none";
          hintEl.style.display = "none";
          return;
        }
      }
      if (gifFadeTimer) {
        clearTimeout(gifFadeTimer);
        gifFadeTimer = null;
      }
      gifEl.style.display = "none";
      gifEl.style.opacity = "";
      var els = [labelEl, amountEl, hintEl];
      for (var i = 0; i < 3; i++) {
        var el = els[i];
        var ln = lines && lines[i];
        if (ln) {
          el.style.display = "";
          el.className = (BUBBLE_STYLE_CLASS[ln.s] || "dshwv-label") + (ln.w ? " dshwv-wrap" : "");
          el.textContent = ln.t;
          el.style.color = ln.c || "";
        } else {
          el.style.display = "none";
          el.textContent = "";
          el.style.color = "";
        }
      }
    }
    var bubbleSwapTimer = null;
    var hintFadeTimer = null;
    var gifFadeTimer = null;
    var lastHintText = null;
    function setHint(text) {
      if (text === lastHintText) return;
      var first = lastHintText === null;
      lastHintText = text;
      if (first || !bubbleShown) {
        hintEl.textContent = text;
        return;
      }
      hintEl.style.transition = "opacity .18s ease";
      hintEl.style.opacity = "0";
      hintFadeTimer = setTimeout2(function() {
        hintFadeTimer = null;
        hintEl.textContent = text;
        hintEl.style.opacity = "1";
        setTimeout2(function() {
          hintEl.style.transition = "";
          hintEl.style.opacity = "";
        }, 220);
      }, 190);
    }
    function swapBubbleContent(applyFn) {
      if (bubbleSwapTimer) {
        clearTimeout(bubbleSwapTimer);
        bubbleSwapTimer = null;
      }
      textBox.style.transition = "opacity .18s ease";
      textBox.style.opacity = "0";
      bubbleSwapTimer = setTimeout2(function() {
        bubbleSwapTimer = null;
        applyFn();
        textBox.style.opacity = "1";
        setTimeout2(function() {
          textBox.style.transition = "";
          textBox.style.opacity = "";
        }, 220);
      }, 190);
    }
    function restoreBubbleLines() {
      if (bubbleSwapTimer) {
        clearTimeout(bubbleSwapTimer);
        bubbleSwapTimer = null;
      }
      if (hintFadeTimer) {
        clearTimeout(hintFadeTimer);
        hintFadeTimer = null;
      }
      if (gifFadeTimer) {
        clearTimeout(gifFadeTimer);
        gifFadeTimer = null;
      }
      lastHintText = null;
      textBox.style.transition = "";
      textBox.style.opacity = "";
      gifEl.style.display = "none";
      gifEl.style.opacity = "";
      labelEl.style.display = "";
      labelEl.className = "dshwv-label";
      labelEl.textContent = "DeepSeek 余额";
      labelEl.style.color = "";
      labelEl.style.opacity = "";
      amountEl.style.display = "";
      amountEl.className = "dshwv-amount";
      amountEl.style.color = "";
      amountEl.style.opacity = "";
      hintEl.style.display = "";
      hintEl.className = "dshwv-hint";
      hintEl.style.color = "";
      hintEl.style.opacity = "";
      render();
    }
    var costBubbleTimer = null;
    var bubbleTtlTimer = null;
    var bubbleScene = null;
    var bubbleSeq = bubbleDefaultQueue();
    var bubbleSeqIdx = 0;
    var bubbleRoundOn = false;
    var bubbleCfg = null;
    var bubbleLib = [];
    var bubbleTapAdvance = false;
    function bubbleCloneModule(m) {
      return JSON.parse(JSON.stringify(m || {}));
    }
    function bubbleLibAdd(name, module) {
      try {
        if (!module) return null;
        var id = "bmod_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
        var it = { id, name: String(name || "").trim().slice(0, 20) || "模块" + (bubbleLib.length + 1), module: bubbleCloneModule(module) };
        bubbleLib.push(it);
        return it;
      } catch (err) {
        return null;
      }
    }
    function bubbleLibDel(id) {
      bubbleLib = bubbleLib.filter(function(x) {
        return x.id !== id;
      });
    }
    function applyBubbleCfgSeq() {
      try {
        if (!bubbleCfg || !Array.isArray(bubbleCfg.items) || !bubbleCfg.items.length) return;
        var seq = [];
        for (var i = 0; i < bubbleCfg.items.length; i++) {
          var it = bubbleCfg.items[i];
          if (it && it.kind === "choice" && Array.isArray(it.options)) {
            var opts = [];
            for (var ci = 0; ci < it.options.length && ci < 2; ci++) {
              var co = it.options[ci] || {};
              var cit = co.item || {};
              var citem = null;
              if (cit.kind === "custom" && Array.isArray(cit.modules)) citem = { kind: "custom", modules: cit.modules };
              else if (cit.kind === "random") citem = { kind: "random" };
              else citem = { kind: "normal" };
              opts.push({ w: bubbleChoiceWeight(co), item: citem });
            }
            if (opts.length) {
              seq.push({ kind: "choice", options: opts });
              continue;
            }
          }
          if (it && it.kind === "custom" && Array.isArray(it.modules)) seq.push({ kind: "custom", modules: it.modules });
          else if (it && it.kind === "random") seq.push({ kind: "random" });
          else seq.push({ kind: "normal" });
        }
        if (seq.length) bubbleSeq = seq;
      } catch (err) {
      }
    }
    function loadBubbleCfg() {
      try {
        fetch(BUBBLE_URL, { cache: "no-store" }).then(function(r) {
          return r.json();
        }).then(function(d) {
          if (d && d.ok && d.config) {
            bubbleCfg = d.config;
            bubbleLib = d.config.lib && Array.isArray(d.config.lib) ? JSON.parse(JSON.stringify(d.config.lib)) : [];
            bubbleTapAdvance = d.config.tapAdvance === true;
            applyBubbleCfgSeq();
            maybeBubbleMigratePeak();
          }
        }).catch(function() {
        });
      } catch (err) {
      }
    }
    function saveBubbleCfg(cfg, okFn) {
      try {
        fetch(BUBBLE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cfg)
        }).then(function(r) {
          return r.json();
        }).then(function(d) {
          if (d && d.ok && d.config) {
            bubbleCfg = d.config;
            applyBubbleCfgSeq();
            if (okFn) okFn();
          } else if (okFn) okFn(false);
        }).catch(function() {
          if (okFn) okFn(false);
        });
      } catch (err) {
        if (okFn) okFn(false);
      }
    }
    function bubbleEachPeakMod(cfg, fn) {
      try {
        let walk = function(step) {
          if (!step || typeof step !== "object") return;
          if (Array.isArray(step.modules)) {
            for (var i = 0; i < step.modules.length; i++) {
              var md = step.modules[i];
              if (md && (md.type === "peak" || md.type === "nextpeak")) fn(md);
            }
          }
          if (step.kind === "choice" && Array.isArray(step.options)) {
            for (var j = 0; j < step.options.length; j++) {
              var o = step.options[j];
              walk(o && o.item);
            }
          }
        };
        if (!cfg || !Array.isArray(cfg.items)) return;
        for (var k = 0; k < cfg.items.length; k++) walk(cfg.items[k]);
      } catch (err) {
      }
    }
    function maybeBubbleMigratePeak() {
      try {
        var legacy = window2.__dshwLegacyPeak;
        if (!legacy && !bubbleCfg) return;
        if (!bubbleCfg || !Array.isArray(bubbleCfg.items)) return;
        if (!legacy && !hasNextPeakMod(bubbleCfg)) return;
        window2.__dshwLegacyPeak = null;
        var changed = false;
        bubbleEachPeakMod(bubbleCfg, function(md) {
          if (md.type === "nextpeak") {
            md.type = "peak";
            md.peakStyle = "count";
            changed = true;
            return;
          }
          if (!md.peakStyle) {
            md.peakStyle = legacy || "default";
            changed = true;
          }
        });
        if (changed) saveBubbleCfg(bubbleCfg);
      } catch (err) {
      }
    }
    function hasNextPeakMod(cfg) {
      var found = false;
      bubbleEachPeakMod(cfg, function(md) {
        if (md.type === "nextpeak") found = true;
      });
      return found;
    }
    function bubbleRowKeyOf(m) {
      try {
        m = m || {};
        var n = m.row;
        if (typeof n === "number" && isFinite(n) && Math.round(n) === n && n > 0) return n;
      } catch (err) {
      }
      return null;
    }
    function bubbleIsImgMod(m) {
      return !!m && (m.type === "image" || m.type === "randimg");
    }
    function bubbleRowsOf(mods) {
      var out = [];
      if (!Array.isArray(mods)) return out;
      var cur = null;
      for (var i = 0; i < mods.length; i++) {
        var m = mods[i] || {};
        if (bubbleIsImgMod(m)) {
          out.push([m]);
          cur = null;
          continue;
        }
        if (cur && cur.key !== null && bubbleRowKeyOf(m) === cur.key) {
          cur.row.push(m);
          continue;
        }
        cur = { key: bubbleRowKeyOf(m), row: [m] };
        out.push(cur.row);
      }
      return out;
    }
    function bubbleRowsFlat(rows) {
      var flat = [];
      try {
        if (!Array.isArray(rows)) return flat;
        for (var r = 0; r < rows.length; r++) {
          var row = rows[r];
          if (!row || !row.length) continue;
          var multi = row.length > 1;
          for (var i = 0; i < row.length; i++) {
            var m = row[i];
            if (!m || typeof m !== "object") continue;
            if (multi) m.row = r + 1;
            else try {
              delete m.row;
            } catch (err) {
            }
            flat.push(m);
          }
        }
      } catch (err) {
      }
      return flat;
    }
    function bubbleRowsCanon(mods) {
      try {
        if (!Array.isArray(mods)) return;
        var flat = bubbleRowsFlat(bubbleRowsOf(mods));
        mods.length = 0;
        for (var i = 0; i < flat.length; i++) mods.push(flat[i]);
      } catch (err) {
      }
    }
    function bubbleClearAll() {
      try {
        if (bubbleTtlTimer) {
          clearTimeout(bubbleTtlTimer);
          bubbleTtlTimer = null;
        }
      } catch (err) {
      }
      try {
        if (bubbleTimer) {
          clearTimeout(bubbleTimer);
          bubbleTimer = null;
        }
      } catch (err) {
      }
      try {
        if (bubbleSwapTimer) {
          clearTimeout(bubbleSwapTimer);
          bubbleSwapTimer = null;
        }
      } catch (err) {
      }
      try {
        if (hintFadeTimer) {
          clearTimeout(hintFadeTimer);
          hintFadeTimer = null;
        }
      } catch (err) {
      }
      try {
        if (gifFadeTimer) {
          clearTimeout(gifFadeTimer);
          gifFadeTimer = null;
        }
      } catch (err) {
      }
      try {
        if (costBubbleTimer) {
          clearTimeout(costBubbleTimer);
          costBubbleTimer = null;
        }
      } catch (err) {
      }
      try {
        if (animId) {
          cancelAnimationFrame(animId);
          animId = null;
        }
      } catch (err) {
      }
      try {
        if (animDelayTimer) {
          clearTimeout(animDelayTimer);
          animDelayTimer = null;
        }
      } catch (err) {
      }
      try {
        if (settleTimer) {
          clearTimeout(settleTimer);
          settleTimer = null;
        }
      } catch (err) {
      }
    }
    function bubbleCloseVisual() {
      try {
        bubbleBox.classList.remove("dshwv-pop-open");
        bubbleBox.inert = true;
      } catch (err) {
      }
      try {
        textBox.style.transition = "";
        textBox.style.opacity = "";
      } catch (err) {
      }
      try {
        hintEl.style.transition = "";
        hintEl.style.opacity = "";
      } catch (err) {
      }
      try {
        if (gifFadeTimer) {
          clearTimeout(gifFadeTimer);
          gifFadeTimer = null;
        }
      } catch (err) {
      }
      gifFadeTimer = setTimeout2(function() {
        gifFadeTimer = null;
        try {
          gifEl.style.display = "none";
        } catch (err) {
        }
      }, 240);
    }
    function bubbleClearModuleRows() {
      try {
        var els = textBox.querySelectorAll(".dshwv-trow, .dshwv-mimg");
        for (var i = 0; i < els.length; i++) {
          try {
            textBox.removeChild(els[i]);
          } catch (err) {
          }
        }
      } catch (err) {
      }
    }
    function sceneOpen(kind, renderFn, ttlMs) {
      var wasOpen = bubbleShown;
      bubbleClearAll();
      bubbleClearModuleRows();
      try {
        gifEl.style.display = "none";
        gifEl.style.opacity = "";
      } catch (err) {
      }
      try {
        textBox.style.transition = "";
        textBox.style.opacity = "";
      } catch (err) {
      }
      bubbleScene = { kind, ttlMs: ttlMs || 0 };
      bubbleShown = true;
      costBubbleActive = kind === "cost";
      bubbleRandomActive = kind === "random";
      lastHintText = null;
      function finish() {
        try {
          renderFn();
        } catch (err) {
        }
        try {
          bubbleBox.classList.add("dshwv-pop-open");
          bubbleBox.inert = false;
        } catch (err) {
        }
        if (wasOpen) {
          try {
            textBox.style.transition = "opacity .16s ease";
            textBox.style.opacity = "1";
            bubbleSwapTimer = setTimeout2(function() {
              bubbleSwapTimer = null;
              try {
                textBox.style.transition = "";
                textBox.style.opacity = "";
              } catch (err) {
              }
            }, 180);
          } catch (err) {
          }
        }
        if (ttlMs > 0) bubbleTtlTimer = setTimeout2(bubbleAutoClose, ttlMs);
      }
      if (wasOpen) {
        try {
          textBox.style.transition = "opacity .12s ease";
          textBox.style.opacity = "0";
          bubbleSwapTimer = setTimeout2(function() {
            bubbleSwapTimer = null;
            finish();
          }, 120);
        } catch (err) {
          finish();
        }
      } else {
        finish();
      }
    }
    function bubbleAutoClose() {
      bubbleTtlTimer = null;
      if (bubbleScene && bubbleScene.kind === "cost") {
        if (whaleSysSwapNext()) return;
        hideCostBubble();
        return;
      }
      if (bubbleScene && bubbleScene.kind === "alert") {
        if (whaleSysSwapNext()) return;
        hideUsageAlertBubble();
        return;
      }
      hideBubble();
    }
    function bubbleResetTtl() {
      try {
        if (bubbleTtlTimer) {
          clearTimeout(bubbleTtlTimer);
          bubbleTtlTimer = null;
        }
      } catch (err) {
      }
      if (bubbleScene && bubbleScene.ttlMs > 0) bubbleTtlTimer = setTimeout2(bubbleAutoClose, bubbleScene.ttlMs);
    }
    function bubbleRenderDefault() {
      restoreBubbleLines();
    }
    function bubbleRenderRandom(lines) {
      if (lines && lines.gif) {
        if (gifFailed) {
          lines = singleCenter("A", pickOne(["gif 加载失败了...", "今天没有动图给你看~", "呜呜 动图不见了..."]), "", true);
        } else {
          try {
            gifEl.style.display = "block";
            gifEl.style.opacity = "";
          } catch (err) {
          }
          labelEl.style.display = "none";
          amountEl.style.display = "none";
          hintEl.style.display = "none";
          return;
        }
      }
      applyBubbleLines(lines);
    }
    function bubbleRenderCostMods(amount) {
      bubbleRenderModules(usageAlertModsResolved(usageTurnCostLines(), null, null, usageCostValue(amount)));
    }
    function bubblePickChoiceStep(step) {
      var opts = bubbleChoiceOptions(step);
      if (!opts.length) return null;
      var total = 0;
      for (var i = 0; i < opts.length; i++) total += bubbleChoiceWeight(opts[i]);
      var r = Math.random() * total;
      var acc = 0;
      for (var j = 0; j < opts.length; j++) {
        acc += bubbleChoiceWeight(opts[j]);
        if (r < acc) return opts[j] && opts[j].item || null;
      }
      var last = opts[opts.length - 1];
      return last && last.item || null;
    }
    function bubbleShowSeqNext() {
      var step = bubbleSeq[bubbleSeqIdx];
      if (!step) {
        hideBubble();
        return;
      }
      bubbleSeqIdx++;
      var item = bubbleIsChoice(step) ? bubblePickChoiceStep(step) : step;
      if (!item) {
        hideBubble();
        return;
      }
      if (item.kind === "random") {
        var lines = pickRandomLines();
        bubbleRandomLines = lines;
        sceneOpen("random", function() {
          bubbleRenderRandom(lines);
        }, BUBBLE_MS);
      } else if (item.kind === "custom") {
        sceneOpen("custom", function() {
          bubbleRenderModules(item.modules || []);
        }, BUBBLE_MS);
      } else {
        sceneOpen("normal", bubbleRenderDefault, BUBBLE_MS);
      }
    }
    function bubbleModuleFontU(level) {
      var n = Number(level) || 6;
      n = Math.max(1, Math.min(50, Math.round(n)));
      return Math.round(40 + (n - 1) * 200 / 49);
    }
    function bubbleAmountText() {
      if (state.status === "error") return state.message && state.message.indexOf("配置密钥") >= 0 ? "未配置 API key" : "余额不可用";
      var v = shown !== null ? shown : state.balance !== null ? state.balance : null;
      if (v === null) return "…";
      return fmt(v, state.currency);
    }
    function bubbleTodayText() {
      return "今日已用 " + (state.todayUsage !== null && state.todayUsage !== void 0 ? fmt(state.todayUsage, state.currency) : "--");
    }
    function apiModelBalanceInfo(modelId) {
      var m = apiModelById(modelId);
      if (!m) return null;
      return { name: m.name, balance: m.balance, today: m.todayUsage, currency: m.currency, todayCurrency: apiTodayCur(m), mode: m.balanceMode || (m.hasBalanceApi === false ? "events" : "api") };
    }
    function apiModelBalanceText(modelId) {
      var i = apiModelBalanceInfo(modelId);
      if (!i) return "--";
      if (i.balance === null || i.balance === void 0) return "—";
      return apiFmtMoney(i.balance, i.currency);
    }
    function apiModelTodayText(modelId) {
      var i = apiModelBalanceInfo(modelId);
      if (!i) return "--";
      return apiFmtMoney(i.today, i.todayCurrency || i.currency);
    }
    function apiQuotaOf(modelId) {
      var m = apiModelById(modelId);
      var q = m && m.quota || null;
      if (!q && usageSet && usageSet.models && usageSet.models[modelId]) q = usageSet.models[modelId].quota || null;
      return q || null;
    }
    function apiQuotaInfo(modelId) {
      var q = apiQuotaOf(modelId);
      if (!q) return null;
      var total = Number(q.total) || 0;
      var isAuto = q.mode === "codex" || q.mode !== "manual" && (q.mode === "auto" || q.autoUsed !== void 0);
      var used = isAuto ? Math.max(0, Number(q.autoUsed) || 0) : Math.max(0, Number(q.used) || 0);
      if (!total && !used) return null;
      var left = Math.max(0, total - used);
      return {
        total,
        used,
        left,
        pct: total > 0 ? Math.min(100, used / total * 100) : 0,
        unit: q.unit === "money" ? "money" : "tokens",
        reset: q.reset || "none",
        mode: q.mode === "codex" ? "codex" : isAuto ? "auto" : "manual"
      };
    }
    function apiFmtQuotaNum(n) {
      n = Number(n) || 0;
      if (n >= 1e8) return (n / 1e8).toFixed(2).replace(/\.?0+$/, "") + "亿";
      if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e6 ? 0 : 1).replace(/\.0$/, "") + "万";
      return String(Math.round(n));
    }
    function apiQuotaUnitSuffix(i) {
      return i && i.unit === "money" ? " 元" : i ? " tokens" : "";
    }
    function apiQuotaUsedText(modelId) {
      var i = apiQuotaInfo(modelId);
      if (!i) return "--";
      return (i.unit === "money" ? "¥" : "") + apiFmtQuotaNum(i.used) + (i.unit === "money" ? "" : "");
    }
    function apiQuotaLeftText(modelId) {
      var i = apiQuotaInfo(modelId);
      if (!i) return "--";
      return (i.unit === "money" ? "¥" : "") + apiFmtQuotaNum(i.left);
    }
    function apiQuotaTotalText(modelId) {
      var i = apiQuotaInfo(modelId);
      if (!i) return "--";
      return (i.unit === "money" ? "¥" : "") + apiFmtQuotaNum(i.total);
    }
    function apiQuotaPctText(modelId) {
      var i = apiQuotaInfo(modelId);
      if (!i) return "--";
      return i.pct.toFixed(1).replace(/\.0$/, "") + "%";
    }
    function apiQuotaResetText(modelId) {
      var i = apiQuotaInfo(modelId);
      if (!i) return "--";
      if (i.reset === "none") return "不重置";
      var now = /* @__PURE__ */ new Date();
      var nx = i.reset === "monthly" ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      var ms = Math.max(0, nx.getTime() - now.getTime());
      var h = Math.floor(ms / 36e5);
      var d = Math.floor(h / 24);
      if (d > 0) return d + "天" + h % 24 + "小时后重置";
      return h + "小时" + Math.floor(ms % 36e5 / 6e4) + "分后重置";
    }
    function apiQuotaSummary(modelId) {
      var q = apiQuotaOf(modelId);
      if (!q || !q.on) return "已关闭";
      var i = apiQuotaInfo(modelId);
      if (!i) return "已开启（未填总量）";
      return (i.mode === "codex" ? "Codex · " : i.mode === "auto" ? "自动 · " : "手动 · ") + "已用 " + apiQuotaPctText(modelId) + " · 剩 " + apiFmtQuotaNum(i.left) + apiQuotaUnitSuffix(i);
    }
    function apiCodexOf(modelId) {
      var m = apiModelById(modelId);
      return m && m.codex || null;
    }
    function apiFmtTokens(n) {
      n = Number(n) || 0;
      if (n >= 1e8) return (n / 1e8).toFixed(2).replace(/\.?0+$/, "") + "亿";
      if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e6 ? 0 : 1).replace(/\.0$/, "") + "万";
      return String(Math.round(n));
    }
    function apiCodexDays7(c) {
      var s = 0;
      if (c && Array.isArray(c.days7)) for (var i = 0; i < c.days7.length; i++) s += Number(c.days7[i].tokens) || 0;
      return s;
    }
    function apiCodexRowText(am) {
      var c = am && am.codex;
      if (!c || !c.ok) return c && c.error ? "⚠ " + c.error : "无 Codex 数据";
      return "Codex 今日 " + apiFmtTokens(c.todayTokens) + " · 近7天 " + apiFmtTokens(apiCodexDays7(c)) + " tokens";
    }
    function apiCodexWinLabel(w, idx) {
      if (w && w.windowMinutes) {
        if (w.windowMinutes >= 1440) return Math.round(w.windowMinutes / 1440) + "天窗口";
        if (w.windowMinutes >= 60) return Math.round(w.windowMinutes / 60) + "h";
        return w.windowMinutes + "分钟";
      }
      return idx === 0 ? "5h" : "周";
    }
    function apiCodexWindowReset(w) {
      if (!w || !w.resetAt) return "";
      var left = Number(w.resetAt) - Date.now();
      if (!isFinite(left)) return "";
      if (left <= 0) return "即将重置";
      var h = Math.floor(left / 36e5);
      var d = Math.floor(h / 24);
      if (d > 0) return d + "天" + h % 24 + "小时后重置";
      return h + "小时" + Math.floor(left % 36e5 / 6e4) + "分后重置";
    }
    function apiCodexWindowsText(c) {
      var w = c && c.windows;
      if (!w) return "";
      var pct = function(v) {
        return v === null || v === void 0 ? "--" : (Number(v) || 0).toFixed(1).replace(/\.0$/, "") + "%";
      };
      var parts = [];
      if (w.primary) parts.push(apiCodexWinLabel(w.primary, 0) + " 已用 " + pct(w.primary.usedPct) + (apiCodexWindowReset(w.primary) ? " · " + apiCodexWindowReset(w.primary) : ""));
      if (w.secondary) parts.push(apiCodexWinLabel(w.secondary, 1) + " 已用 " + pct(w.secondary.usedPct) + (apiCodexWindowReset(w.secondary) ? " · " + apiCodexWindowReset(w.secondary) : ""));
      if (w.planType) parts.push(w.planType);
      return parts.join(" | ");
    }
    function apiCodexDetailText(modelId) {
      var c = apiCodexOf(modelId);
      if (!c || !c.ok) return c && c.error ? c.error : "无 Codex 数据";
      var s = "今日 " + apiFmtTokens(c.todayTokens) + " · 本月 " + apiFmtTokens(c.monthTokens) + " · 累计 " + apiFmtTokens(c.totalTokens) + " · 近7天 " + apiFmtTokens(apiCodexDays7(c)) + "（" + (c.sessions || 0) + " 个会话文件）";
      var w = apiCodexWindowsText(c);
      if (w) s += " · " + w;
      return s;
    }
    function apiPlanOf(modelId) {
      var m = apiModelById(modelId);
      return m && m.plan || null;
    }
    function apiPlanSupport(modelId) {
      var m = apiModelById(modelId);
      if (!m) return false;
      if (m.plan && m.plan.hide) return false;
      return !!(m.planSupport || m.plan);
    }
    function apiPlanPctText(v) {
      if (v === null || v === void 0) return "--";
      return (Number(v) || 0).toFixed(1).replace(/\.0$/, "") + "%";
    }
    function apiPlanUsedText(modelId) {
      var p = apiPlanOf(modelId);
      if (!p || !p.ok) return "--";
      return apiPlanPctText(p.usedPct);
    }
    function apiPlanLeftText(modelId) {
      var p = apiPlanOf(modelId);
      if (!p || !p.ok) return "--";
      return apiPlanPctText(p.remainPct);
    }
    function apiPlanResetText(modelId) {
      var p = apiPlanOf(modelId);
      if (!p || !p.ok || p.resetAt === null || p.resetAt === void 0 || p.resetAt === "") return "--";
      var t = p.resetAt;
      var ms = null;
      if (typeof t === "number") ms = t < 1e12 ? t * 1e3 : t;
      else {
        var pd = Date.parse(String(t));
        if (isFinite(pd)) ms = pd;
      }
      if (ms === null) return String(t);
      var left = ms - Date.now();
      if (!isFinite(left)) return String(t);
      if (left <= 0) return "即将重置";
      var h = Math.floor(left / 36e5);
      var d = Math.floor(h / 24);
      if (d > 0) return d + "天" + h % 24 + "小时后重置";
      return h + "小时" + Math.floor(left % 36e5 / 6e4) + "分后重置";
    }
    function apiPlanSummary(modelId) {
      var p = apiPlanOf(modelId);
      if (!p) return "读取中…";
      if (!p.ok) return p.hide ? "--" : p.error || "读取失败";
      var s = "已用 " + apiPlanUsedText(modelId) + " · " + apiPlanResetText(modelId);
      if (p.weeklyUsedPct !== null && p.weeklyUsedPct !== void 0) s += " · 周 " + apiPlanPctText(p.weeklyUsedPct);
      if (p.level) s += " · " + p.level;
      return s;
    }
    function bubbleIsModelMod(m) {
      return !!(m && m.modelId && m.modelId !== "deepseek");
    }
    function bubbleContentTokenMap(m) {
      m = m || {};
      var v = "";
      var map = {};
      if (bubbleIsModelMod(m) && (m.type === "balance" || m.type === "today" || m.type === "quota" || m.type === "plan")) {
        map["balance"] = apiModelBalanceText(m.modelId);
        map["today"] = apiModelTodayText(m.modelId);
        map["balance_ds"] = map["balance"];
        map["expense_ds"] = map["today"];
        map["quota"] = apiQuotaPctText(m.modelId);
        map["quota_pct"] = map["quota"];
        map["quota_used"] = apiQuotaUsedText(m.modelId);
        map["quota_left"] = apiQuotaLeftText(m.modelId);
        map["quota_total"] = apiQuotaTotalText(m.modelId);
        map["quota_reset"] = apiQuotaResetText(m.modelId);
        map["plan"] = apiPlanUsedText(m.modelId);
        map["plan_used"] = map["plan"];
        map["plan_left"] = apiPlanLeftText(m.modelId);
        map["plan_reset"] = apiPlanResetText(m.modelId);
        return map;
      }
      if (m.type === "balance") {
        v = bubbleAmountText();
        map["balance_ds"] = v;
      } else if (m.type === "today") {
        v = state.todayUsage !== null && state.todayUsage !== void 0 ? fmt(state.todayUsage, state.currency) : "--";
        map["expense_ds"] = v;
      } else if (bubbleIsPeakCount(m)) {
        v = bubbleCountdownText();
        map["countdown"] = v;
      } else {
        v = bubblePeakText(m);
        map["status"] = v;
      }
      return map;
    }
    function bubbleTplHelpItems(m) {
      m = m || {};
      var arr = [];
      function add(k, d) {
        arr.push({ k: "{" + k + "}", d });
      }
      if (bubbleIsModelMod(m) && (m.type === "balance" || m.type === "today" || m.type === "quota" || m.type === "plan")) {
        if (m.type !== "quota" && m.type !== "plan") {
          add("balance", "该模型的余额");
          add("today", "该模型今日已用");
        }
        if (m.type !== "plan") {
          add("quota", "额度已用百分比");
          add("quota_used", "额度已用值");
          add("quota_left", "额度剩余值");
          add("quota_total", "额度总量");
          add("quota_reset", "额度重置倒计时");
        }
        add("plan", "订阅额度已用百分比");
        add("plan_left", "订阅额度剩余百分比");
        add("plan_reset", "订阅额度重置倒计时");
        return arr;
      }
      if (m.type === "balance") add("balance_ds", "余额数值");
      else if (m.type === "today") add("expense_ds", "今日已用金额");
      else if (m.type === "peak" || m.type === "nextpeak") {
        if (bubbleIsPeakCount(m)) add("countdown", "距下一时段倒计时 (HH:MM:SS)");
        else add("status", "高峰/空闲 状态文字(随显示样式变化)");
      }
      return arr;
    }
    var dshwvTplHelpEl = null;
    function bubbleTplHelpToggle(m, anchor) {
      try {
        if (!dshwvTplHelpEl) {
          dshwvTplHelpEl = document2.createElement("div");
          dshwvTplHelpEl.className = "dshwv-tplhelp";
          document2.body.appendChild(dshwvTplHelpEl);
          document2.addEventListener("pointerdown", function(e) {
            if (!dshwvTplHelpEl || dshwvTplHelpEl.style.display === "none") return;
            try {
              if (e.target && e.target.closest && (e.target.closest(".dshwv-tplq") || e.target.closest(".dshwv-tplhelp"))) return;
            } catch (err) {
            }
            dshwvTplHelpEl.style.display = "none";
          }, true);
          document2.addEventListener("keydown", function(e) {
            if (e.key === "Escape") dshwvTplHelpEl.style.display = "none";
          });
        }
        if (dshwvTplHelpEl.style.display === "block") {
          dshwvTplHelpEl.style.display = "none";
          return;
        }
        var items = bubbleTplHelpItems(m);
        var html = '<div style="font-weight:600;margin-bottom:4px">可用占位符(替换到内容里)</div>';
        if (!items.length) html += '<div style="opacity:.8">该模块无自动内容占位</div>';
        for (var i = 0; i < items.length; i++) html += '<div style="margin:1px 0"><b style="color:#2f4488">' + items[i].k + "</b> — " + items[i].d + "</div>";
        html += '<div style="margin-top:5px;opacity:.65">其余文字原样显示;留空=默认自动内容</div>';
        dshwvTplHelpEl.innerHTML = html;
        dshwvTplHelpEl.style.display = "block";
        try {
          dshwvTplHelpEl.style.zIndex = String(Math.max(26080, Math.round(visibleTopZ()) + 10));
        } catch (err) {
        }
        var r = anchor ? anchor.getBoundingClientRect() : { left: 60, top: 120, right: 180, width: 100 };
        var w = 252;
        var vp = viewport();
        var left = Math.max(4, Math.min(r.right - w, vp.w - w - 4));
        var top = r.bottom + 4;
        var h = dshwvTplHelpEl.offsetHeight || 120;
        if (top + h > vp.h - 4) top = Math.max(4, r.top - h - 4);
        dshwvTplHelpEl.style.left = Math.round(left) + "px";
        dshwvTplHelpEl.style.top = Math.round(top) + "px";
      } catch (err) {
      }
    }
    var dshwvHintEl = null;
    var dshwvHintPinned = false;
    var dshwvHintShownAt = 0;
    function dshwvHintHide() {
      dshwvHintPinned = false;
      if (dshwvHintEl) dshwvHintEl.style.display = "none";
    }
    function dshwvHintEnsure() {
      if (dshwvHintEl) return dshwvHintEl;
      dshwvHintEl = document2.createElement("div");
      dshwvHintEl.className = "dshwv-tplhelp dshwv-hintbox";
      dshwvHintEl.style.display = "none";
      document2.body.appendChild(dshwvHintEl);
      document2.addEventListener("pointerdown", function(e) {
        if (!dshwvHintEl || dshwvHintEl.style.display === "none") return;
        try {
          if (e.target && e.target.closest && (e.target.closest(".dshwv-askq") || e.target.closest(".dshwv-hintbox"))) return;
        } catch (err) {
        }
        dshwvHintHide();
      }, true);
      document2.addEventListener("keydown", function(e) {
        if (e.key === "Escape") dshwvHintHide();
      });
      return dshwvHintEl;
    }
    function dshwvHintShow(html, anchor, pinned) {
      var el = dshwvHintEnsure();
      try {
        if (dshwvTplHelpEl) dshwvTplHelpEl.style.display = "none";
      } catch (err) {
      }
      el.innerHTML = html;
      el.style.display = "block";
      try {
        el.style.zIndex = String(Math.max(26080, Math.round(visibleTopZ()) + 10));
      } catch (err) {
      }
      dshwvHintPinned = !!pinned;
      dshwvHintShownAt = Date.now();
      try {
        var r = anchor ? anchor.getBoundingClientRect() : { left: 60, top: 120, right: 180, bottom: 140 };
        var vp = viewport();
        var w = el.offsetWidth || 320;
        var h = el.offsetHeight || 120;
        var left = Math.max(4, Math.min(r.left, vp.w - w - 4));
        var top = r.bottom + 6;
        if (top + h > vp.h - 4) top = Math.max(4, r.top - h - 6);
        el.style.left = Math.round(left) + "px";
        el.style.top = Math.round(top) + "px";
      } catch (err) {
      }
    }
    function dshwvAskDot(html) {
      var b = document2.createElement("button");
      b.type = "button";
      b.className = "dshwv-askq dshwv-tplq";
      b.textContent = "?";
      b.title = "查看说明";
      b.addEventListener("mouseenter", function() {
        if (dshwvHintPinned && dshwvHintEl && dshwvHintEl.style.display === "block") return;
        dshwvHintShow(html, b, false);
      });
      b.addEventListener("mouseleave", function() {
        if (!dshwvHintPinned) dshwvHintHide();
      });
      b.addEventListener("click", function(e) {
        e.stopPropagation();
        if (dshwvHintEl && dshwvHintEl.style.display === "block" && dshwvHintPinned && Date.now() - dshwvHintShownAt > 350) {
          dshwvHintHide();
          return;
        }
        dshwvHintShow(html, b, true);
      });
      return b;
    }
    function bubbleContentText(m, autoTxt) {
      m = m || {};
      if (!m.tpl || !String(m.tpl).length) return autoTxt;
      var map = bubbleContentTokenMap(m);
      var s = String(m.tpl);
      var keys = Object.keys(map).sort(function(a, b) {
        return b.length - a.length;
      });
      for (var i = 0; i < keys.length; i++) s = s.split("{" + keys[i] + "}").join(String(map[keys[i]]));
      return s;
    }
    function bubbleCountTextOf(m) {
      return bubbleContentText(m, bubbleCountdownText());
    }
    function bubbleMarqueeDur() {
      return Math.round(1500 + Math.random() * 3e3) + "ms";
    }
    var BUBBLE_PEAK_STYLE_OPTS = [
      ["default", "默认"],
      ["liangwen", "梁文峰谷"],
      ["qiangqiang", "!?强强?!"],
      ["count", "倒计时"],
      ["mini", "简洁(峰/谷)"]
    ];
    function bubblePeakStyleOf(m) {
      m = m || {};
      if (m.type === "nextpeak") return "count";
      var s = String(m.peakStyle || "default");
      for (var i = 0; i < BUBBLE_PEAK_STYLE_OPTS.length; i++) {
        if (BUBBLE_PEAK_STYLE_OPTS[i][0] === s) return s;
      }
      return "default";
    }
    function bubbleIsPeakCount(m) {
      return bubblePeakStyleOf(m) === "count";
    }
    function bubblePeakModuleLabel(m) {
      var s = bubblePeakStyleOf(m);
      if (s === "count") return "时段倒计时";
      if (s === "mini") return "简洁(峰/谷)";
      return "峰谷时段";
    }
    function bubblePeakReady() {
      return state && state.balance !== null && state.status !== "loading" && state.status !== "error";
    }
    function bubbleIsPeakNow() {
      if (bubblePeakReady()) return !!state.isPeak;
      return bubbleCountdownIsPeak();
    }
    function bubblePeakText(m) {
      m = m || {};
      var st = bubblePeakStyleOf(m);
      var peak = bubbleIsPeakNow();
      if (st === "liangwen") return peak ? "梁文峰" : "梁文谷";
      if (st === "qiangqiang") return peak ? "!?峰峰?!" : "!?谷谷?!";
      if (st === "mini") return peak ? "峰" : "谷";
      return peak ? "高峰时段" : "空闲时段";
    }
    function bubblePickLine(lines, avoidIdx) {
      if (!Array.isArray(lines) || !lines.length) return null;
      if (lines.length === 1) return 0;
      var total = 0;
      for (var i = 0; i < lines.length; i++) total += Math.max(1, Number(lines[i].w) || 1);
      var pick;
      for (var guard = 0; guard < 6; guard++) {
        var r = Math.random() * total;
        var acc = 0;
        pick = lines.length - 1;
        for (var j = 0; j < lines.length; j++) {
          acc += Math.max(1, Number(lines[j].w) || 1);
          if (r < acc) {
            pick = j;
            break;
          }
        }
        if (pick !== avoidIdx) break;
      }
      return pick;
    }
    function bubbleModuleText(m, avoidIdx) {
      var t = m.text || "";
      if (m.type === "random" && Array.isArray(m.lines)) {
        var idx = bubblePickLine(m.lines, avoidIdx);
        var ln = m.lines[idx];
        if (ln) {
          m._lastPick = idx;
          return ln.t;
        }
        return "";
      }
      return t;
    }
    function bubbleCountdownIsPeak(sec) {
      sec = isFinite(Number(sec)) ? Number(sec) : Math.floor(Date.now() / 1e3);
      var bj = new Date((sec + 8 * 3600) * 1e3);
      var dow = bj.getUTCDay();
      var h = bj.getUTCHours();
      if (dow === 0 || dow === 6) return false;
      return h >= 9 && h < 12 || h >= 14 && h < 18;
    }
    function bubbleCountdownNextChange(sec) {
      sec = isFinite(Number(sec)) ? Number(sec) : Math.floor(Date.now() / 1e3);
      var cur = bubbleCountdownIsPeak(sec);
      var bjDay0 = Math.floor((sec + 8 * 3600) / 86400) * 86400;
      var best = null;
      for (var d = 0; d <= 8 && best === null; d++) {
        var dayStartBj = bjDay0 + d * 86400;
        var edges = [0, 9 * 3600, 12 * 3600, 14 * 3600, 18 * 3600];
        for (var i = 0; i < edges.length; i++) {
          var cand = dayStartBj + edges[i] - 8 * 3600;
          if (cand <= sec + 1) continue;
          if (bubbleCountdownIsPeak(cand) !== cur) {
            best = cand;
            break;
          }
        }
      }
      if (best === null) return sec + 86400;
      return best;
    }
    function bubbleCountdownText() {
      var now = Math.floor(Date.now() / 1e3);
      var cand = bubbleCountdownNextChange(now);
      var remain = Math.max(0, cand - now);
      var p = function(n) {
        return String(n).padStart(2, "0");
      };
      var hh = Math.floor(remain / 3600);
      var mm = Math.floor(remain % 3600 / 60);
      var ss = remain % 60;
      return p(hh) + ":" + p(mm) + ":" + p(ss);
    }
    var bubbleCountdownTicker = null;
    var bubbleCountdownRows = [];
    function bubbleCountdownApplyStyle(el, mod, peak) {
      try {
        var rgb = peak ? mod.peakRgb || "" : mod.offRgb || "";
        var col = peak ? mod.peakColor || "" : mod.offColor || "";
        if (!rgb && !col) col = mod.color || "";
        var cls = Array.prototype.slice.call(el.classList || []);
        for (var i = 0; i < cls.length; i++) {
          if (String(cls[i]).indexOf("dshwv-rgb") === 0) {
            try {
              el.classList.remove(cls[i]);
            } catch (err) {
            }
          }
        }
        el.style.color = "";
        if (rgb) {
          var scheme = rgb === true ? "macaron" : String(rgb || "macaron");
          el.classList.add("dshwv-rgb");
          if (scheme === "candy" || scheme === "rouge" || scheme === "bamboo" || scheme === "aurora" || scheme === "deepsea" || scheme === "sunset" || scheme === "forest" || scheme === "champagne" || scheme === "lavender" || scheme === "mint" || scheme === "lava" || scheme === "galaxy" || scheme === "ink" || scheme === "indigo") el.classList.add("dshwv-rgb-" + scheme);
        } else if (col) {
          el.style.color = col;
        }
      } catch (err) {
      }
    }
    function bubbleCountdownTick() {
      try {
        bubbleCountdownRows = bubbleCountdownRows.filter(function(x2) {
          return x2 && x2.el && x2.el.isConnected;
        });
        var cur = bubbleCountdownIsPeak();
        for (var i = 0; i < bubbleCountdownRows.length; i++) {
          var x = bubbleCountdownRows[i];
          try {
            x.el.textContent = bubbleCountTextOf(x.mod);
            bubbleCountdownApplyStyle(x.el, x.mod, cur);
          } catch (err) {
          }
        }
        if (!bubbleCountdownRows.length && bubbleCountdownTicker) {
          clearInterval(bubbleCountdownTicker);
          bubbleCountdownTicker = null;
        }
      } catch (err) {
      }
    }
    function bubbleCountdownRegister(el, mod) {
      bubbleCountdownRows.push({ el, mod });
      if (!bubbleCountdownTicker) bubbleCountdownTicker = setInterval(bubbleCountdownTick, 1e3);
    }
    function bubbleRowContentOf(mod) {
      mod = mod || {};
      if (mod.type === "nextpeak" || mod.type === "peak" && bubbleIsPeakCount(mod)) return { txt: bubbleCountTextOf(mod), line: null };
      if (mod.type === "balance") {
        var bv = bubbleIsModelMod(mod) ? apiModelBalanceText(mod.modelId) : bubbleAmountText();
        return { txt: bubbleContentText(mod, bv), line: null };
      }
      if (mod.type === "today") {
        var tv2 = bubbleIsModelMod(mod) ? apiModelTodayText(mod.modelId) : state.todayUsage !== null && state.todayUsage !== void 0 ? fmt(state.todayUsage, state.currency) : "--";
        return { txt: bubbleContentText(mod, "今日已用 " + tv2), line: null };
      }
      if (mod.type === "quota") {
        var qi = apiQuotaInfo(mod.modelId);
        var qt = qi ? "额度 " + apiQuotaPctText(mod.modelId) + " · 剩 " + apiFmtQuotaNum(qi.left) + apiQuotaUnitSuffix(qi) : "额度 --";
        return { txt: bubbleContentText(mod, qt), line: null };
      }
      if (mod.type === "plan") {
        return { txt: bubbleContentText(mod, "额度 " + apiPlanSummary(mod.modelId)), line: null };
      }
      if (mod.type === "peak") {
        var pw = bubblePeakText(mod);
        return { txt: bubbleContentText(mod, pw), line: null };
      }
      if (mod.type === "random" && Array.isArray(mod.lines)) {
        var pi = bubblePickLine(mod.lines, mod._lastPick);
        if (pi !== null && pi !== void 0 && mod.lines[pi]) {
          mod._lastPick = pi;
          return { txt: mod.lines[pi].t, line: mod.lines[pi] };
        }
        return { txt: "", line: null };
      }
      return { txt: mod.text || "", line: null };
    }
    function bubbleRowsTo(parentEl, mods) {
      if (!parentEl || !Array.isArray(mods)) return;
      var old = parentEl.querySelectorAll(".dshwv-trow, .dshwv-mimg");
      for (var i = 0; i < old.length; i++) {
        try {
          parentEl.removeChild(old[i]);
        } catch (err) {
        }
      }
      var ROW_MAX = 6;
      var MOD_MAX = 6;
      function blockOf(m, rowContent2) {
        var line = rowContent2 ? rowContent2.line : null;
        var fSize = m.size;
        var fColor = m.color;
        var fBold = m.bold;
        var fItalic = m.italic;
        var fUl = m.ul;
        var fRgb = m.rgb;
        if (line) {
          if (line.size) fSize = line.size;
          if (line.color) fColor = line.color;
          if (line.bold === false) fBold = false;
          else if (line.bold === true) fBold = true;
          if (line.italic === false) fItalic = false;
          else if (line.italic === true) fItalic = true;
          if (line.ul === false) fUl = false;
          else if (line.ul === true) fUl = true;
          if (line.rgb) fRgb = line.rgb;
        }
        if (m.type === "random" && fBold !== false) fBold = true;
        var curPeak = bubbleIsPeakCount(m) ? bubbleCountdownIsPeak() : bubbleIsPeakNow();
        var effBg = "";
        var effBgRgb = "";
        if (m.type === "peak" || m.type === "nextpeak") {
          effBgRgb = curPeak ? String(m.peakBgRgb || "") : String(m.offBgRgb || "");
          effBg = effBgRgb ? "" : curPeak ? String(m.peakBg || "") : String(m.offBg || "");
        } else {
          if (line && line.bgRgb) effBgRgb = String(line.bgRgb);
          else if (line && line.bg) effBg = String(line.bg);
          if (!effBgRgb && !effBg) {
            if (m.bgRgb) effBgRgb = String(m.bgRgb);
            else if (m.bg) effBg = String(m.bg);
          }
        }
        if (effBgRgb === "true") effBgRgb = "macaron";
        var needBg = !!(effBgRgb || effBg);
        var row = document2.createElement("div");
        row.className = "dshwv-trow";
        var tx = row;
        if (needBg) {
          row.style.padding = "1px 6px";
          row.style.borderRadius = "7px";
          row.style.textShadow = "none";
          tx = document2.createElement("span");
          tx.className = "dshwv-trowtx";
          row.appendChild(tx);
        }
        tx.textContent = String(rowContent2.txt);
        if (m.type === "peak" || m.type === "nextpeak") {
          row.style.whiteSpace = "nowrap";
          row.style.maxWidth = "none";
        }
        row.style.fontSize = "calc(var(--dshw-u) * " + bubbleModuleFontU(fSize) + ")";
        if (fBold) row.style.fontWeight = m.type === "balance" ? "900" : "700";
        else if (m.type === "balance") row.style.fontWeight = "800";
        if (fItalic) row.style.fontStyle = "italic";
        if (fUl) row.style.textDecoration = "underline";
        var fFont = m.fontFamily || "";
        if (line && line.fontFamily) fFont = line.fontFamily;
        if (fFont) row.style.fontFamily = fFont;
        if (bubbleIsPeakCount(m)) row.style.fontVariantNumeric = "tabular-nums";
        var marquee = fRgb;
        if (m.type === "peak" || m.type === "nextpeak") {
          var peakStateMarquee = curPeak ? m.peakRgb || "" : m.offRgb || "";
          if (peakStateMarquee) marquee = peakStateMarquee;
        }
        function applyTextGradient(target, g2) {
          target.classList.add("dshwv-rgb");
          var scheme = g2 === true ? "macaron" : String(g2 || "macaron");
          if (scheme === "candy" || scheme === "rouge" || scheme === "bamboo" || scheme === "aurora" || scheme === "deepsea" || scheme === "sunset" || scheme === "forest" || scheme === "champagne" || scheme === "lavender" || scheme === "mint" || scheme === "lava" || scheme === "galaxy" || scheme === "ink" || scheme === "indigo") target.classList.add("dshwv-rgb-" + scheme);
        }
        if (marquee) {
          var mt = needBg ? tx : row;
          applyTextGradient(mt, marquee);
          mt.style.animationDuration = bubbleMarqueeDur();
        } else if (m.type === "peak" || m.type === "nextpeak") {
          var pcol = curPeak ? m.peakColor || "" : m.offColor || "";
          if (pcol) row.style.color = pcol;
          else if (fColor) row.style.color = fColor;
        } else if (fColor) {
          row.style.color = fColor;
        }
        if (needBg) {
          if (effBgRgb) {
            row.classList.add("dshwv-bgrgb");
            if (effBgRgb === "candy" || effBgRgb === "rouge" || effBgRgb === "bamboo" || effBgRgb === "aurora" || effBgRgb === "deepsea" || effBgRgb === "sunset" || effBgRgb === "forest" || effBgRgb === "champagne" || effBgRgb === "lavender" || effBgRgb === "mint" || effBgRgb === "lava" || effBgRgb === "galaxy" || effBgRgb === "ink" || effBgRgb === "indigo" || effBgRgb === "macaron") row.classList.add("dshwv-bgrgb-" + effBgRgb);
            row.style.animationDuration = bubbleMarqueeDur();
          } else if (effBg) {
            row.style.background = effBg;
          }
        }
        return { el: row, tx, fSize, mod: m, peak: m.type === "peak" || m.type === "nextpeak", bg: needBg };
      }
      function maybeWrap(blk) {
        if (!blk || blk.peak) return;
        try {
          var compFs = window2.getComputedStyle ? parseFloat(window2.getComputedStyle(blk.el).fontSize) : 0;
          var multNow = bubbleModuleFontU(blk.fSize);
          var capPx = compFs && multNow ? 560 * compFs / multNow : 0;
          if (capPx > 0 && blk.el.scrollWidth > capPx + 2) {
            blk.el.style.maxWidth = capPx + "px";
            blk.el.style.whiteSpace = "normal";
            blk.el.style.overflowWrap = "anywhere";
            blk.el.style.wordBreak = "break-word";
          } else {
            blk.el.style.whiteSpace = "nowrap";
          }
        } catch (err) {
        }
      }
      function registerIfCountdown(blk) {
        if (parentEl === textBox && ["balance", "today", "quota"].includes(blk.mod.type)) liveValues.set(blk.tx, blk.mod);
        if (bubbleIsPeakCount(blk.mod)) bubbleCountdownRegister(blk.tx, blk.mod);
      }
      function enableLinkRun(blk2) {
        try {
          var lmd = blk2 && blk2.mod;
          if (!lmd || lmd.type !== "link") return;
          if (!parentEl || parentEl !== textBox) return;
          var u0 = String(lmd.url || "").trim();
          if (!/^https?:\/\//i.test(u0)) return;
          var lel = blk2.el;
          lel.style.cursor = "pointer";
          lel.style.pointerEvents = "auto";
          lel.title = u0;
          lel.addEventListener("click", function(e) {
            try {
              e.preventDefault();
            } catch (err) {
            }
            try {
              e.stopPropagation();
            } catch (err) {
            }
            try {
              window2.open(u0, "_blank", "noopener");
            } catch (err) {
            }
          });
        } catch (err) {
        }
      }
      var groups = bubbleRowsOf(mods);
      var rows = 0;
      var imgDone = false;
      for (var g = 0; g < groups.length; g++) {
        var grp = groups[g];
        if (!grp || !grp.length) continue;
        if (bubbleIsImgMod(grp[0])) {
          var md = grp[0];
          var pickId = md.imgId || "";
          if (md.type === "randimg") {
            if (!Array.isArray(md.imgs)) md.imgs = [];
            var pool = [];
            for (var pi0 = 0; pi0 < md.imgs.length; pi0++) {
              var it0 = md.imgs[pi0] || {};
              if (it0.imgId) pool.push({ imgId: it0.imgId, w: it0.w });
            }
            if (!pool.length) continue;
            var pickIdx = bubblePickLine(pool, md._lastPickImg);
            if (pickIdx === null || pickIdx === void 0 || !pool[pickIdx]) continue;
            md._lastPickImg = pickIdx;
            pickId = pool[pickIdx].imgId;
          }
          if (imgDone || !pickId) continue;
          var im = document2.createElement("img");
          im.className = "dshwv-mimg";
          var scV2 = Number(md.imgScale);
          if (isFinite(scV2) && scV2 > 0) im.style.maxWidth = "calc(var(--dshw-u) * " + 540 * Math.max(0.1, Math.min(1, scV2)) + ")";
          im.src = bridge.asset("/dsh-whale/bubble-img.png?id=" + encodeURIComponent(pickId));
          im.alt = "";
          im.draggable = false;
          parentEl.appendChild(im);
          imgDone = true;
          continue;
        }
        for (var s = 0; s < grp.length && rows < ROW_MAX; s += MOD_MAX) {
          var chunk = [];
          for (var c = s; c < grp.length && c < s + MOD_MAX; c++) {
            var cm = grp[c] || {};
            var rowContent = bubbleRowContentOf(cm);
            if (!rowContent || rowContent.txt === "" || rowContent.txt === void 0 || rowContent.txt === null) continue;
            chunk.push(blockOf(cm, rowContent));
          }
          if (!chunk.length) continue;
          if (chunk.length === 1) {
            var blk1 = chunk[0];
            parentEl.appendChild(blk1.el);
            enableLinkRun(blk1);
            registerIfCountdown(blk1);
            maybeWrap(blk1);
            rows++;
            continue;
          }
          var capPx2 = 0;
          try {
            var uCss2 = window2.getComputedStyle ? window2.getComputedStyle(parentEl).getPropertyValue("--dshw-u") : "";
            var uVal2 = parseFloat(uCss2);
            if (uVal2 > 0) capPx2 = 560 * uVal2;
          } catch (err) {
          }
          var para = document2.createElement("div");
          para.className = "dshwv-trow dshwv-trowline";
          para.style.textAlign = "center";
          if (capPx2 > 0) para.style.maxWidth = capPx2 + "px";
          for (var p = 0; p < chunk.length; p++) {
            var pr = chunk[p];
            var pe = pr.el;
            pe.style.display = "inline";
            pe.style.verticalAlign = "baseline";
            pe.style.margin = "0 calc(var(--dshw-u) * 6) 0 0";
            if (!pr.bg) {
              pe.style.padding = "1px 0";
            }
            if (pr.bg) {
              pe.style.boxDecorationBreak = "clone";
              pe.style.webkitBoxDecorationBreak = "clone";
            }
            if (!pr.peak) {
              pe.style.whiteSpace = "normal";
              pe.style.overflowWrap = "anywhere";
              pe.style.wordBreak = "break-word";
              pe.style.maxWidth = "";
            }
            para.appendChild(pe);
            enableLinkRun(pr);
          }
          parentEl.appendChild(para);
          for (var p2 = 0; p2 < chunk.length; p2++) {
            registerIfCountdown(chunk[p2]);
          }
          rows++;
        }
      }
    }
    var bubbleLiveMods = null;
    function bubbleRenderModules(mods) {
      try {
        bubbleLiveMods = Array.isArray(mods) ? mods.slice() : null;
        gifEl.style.display = "none";
        labelEl.style.display = "none";
        amountEl.style.display = "none";
        hintEl.style.display = "none";
        bubbleRowsTo(textBox, mods);
      } catch (err) {
      }
    }
    function bubblePreviewInto(container, mods, widthPx) {
      try {
        if (!container) return;
        container.innerHTML = "";
        var B = Math.max(120, root && (root.offsetWidth || root.getBoundingClientRect().width) || 300);
        var hostW = Math.max(120, container.parentNode && (container.parentNode.clientWidth || container.parentNode.getBoundingClientRect().width) || 408);
        var W = Math.max(120, Math.min(B, hostW));
        container.style.width = W + "px";
        container.style.transform = "none";
        container.style.transformOrigin = "";
        container.style.setProperty("--dshw-u", W / 1026 + "px");
        var halfGap = Math.max(0, (hostW - W) / 2);
        var shiftR = Math.min(10, Math.max(0, Math.round(halfGap)));
        container.style.marginLeft = Math.max(0, Math.round(halfGap)) + shiftR + "px";
        container.style.marginRight = Math.max(0, Math.round(halfGap) - shiftR) + "px";
        var pop = document2.createElement("div");
        pop.className = "dshwv-minipop";
        pop.style.aspectRatio = "auto";
        var cropTop = Math.max(2, Math.round(W * 0.012));
        pop.style.height = Math.round(W * 560 / 1026) + cropTop + "px";
        pop.style.overflow = "hidden";
        var stage = document2.createElement("div");
        stage.style.position = "absolute";
        stage.style.left = "0";
        stage.style.top = cropTop + "px";
        stage.style.width = "100%";
        stage.style.height = Math.round(W * 700 / 1026) + "px";
        try {
          var svgEl = bubbleBox.querySelector("svg");
          if (svgEl) stage.innerHTML = svgEl.outerHTML;
        } catch (err) {
        }
        try {
          var tailEls = stage.querySelectorAll(".dshwv-b1, .dshwv-b2");
          for (var t1 = 0; t1 < tailEls.length; t1++) {
            try {
              tailEls[t1].style.display = "none";
            } catch (err) {
            }
          }
        } catch (err) {
        }
        var tb = document2.createElement("div");
        tb.className = "dshwv-text";
        tb.style.opacity = "1";
        tb.style.transition = "none";
        stage.appendChild(tb);
        pop.appendChild(stage);
        container.appendChild(pop);
        bubbleRowsTo(tb, mods || []);
      } catch (err) {
      }
    }
    function whaleClick() {
      try {
        if (!bubbleOn) return;
        if (bubbleScene && (bubbleScene.kind === "cost" || bubbleScene.kind === "alert")) return;
        if (!bubbleShown) {
          bubbleRoundOn = true;
          bubbleSeqIdx = 0;
          bubbleShowSeqNext();
          return;
        }
        if (bubbleTapAdvance) {
          bubbleNext();
          return;
        }
        if (!bubbleRoundOn) return;
        if (bubbleSeqIdx <= 1) {
          bubbleResetTtl();
          return;
        }
        bubbleSeqIdx = 0;
        bubbleShowSeqNext();
      } catch (err) {
      }
    }
    function bubbleNext() {
      try {
        if (!bubbleShown) return;
        if (bubbleScene && bubbleScene.kind === "cost") {
          hideCostBubble();
          return;
        }
        if (bubbleScene && bubbleScene.kind === "alert") {
          hideUsageAlertBubble();
          return;
        }
        if (bubbleRoundOn && bubbleSeqIdx < bubbleSeq.length) {
          bubbleShowSeqNext();
          return;
        }
        hideBubble();
      } catch (err) {
      }
    }
    function showBubble() {
      if (!bubbleOn) return;
      if (costBubbleActive) return;
      bubbleRoundOn = true;
      bubbleSeqIdx = 0;
      bubbleShowSeqNext();
    }
    function hideBubble() {
      bubbleClearAll();
      bubbleRoundOn = false;
      bubbleSeqIdx = 0;
      bubbleScene = null;
      bubbleShown = false;
      bubbleRandomActive = false;
      bubbleRandomLines = null;
      lastHintText = null;
      bubbleCloseVisual();
    }
    function showCostBubble(amount) {
      if (!bubbleOn || !turnCostOn) return;
      whaleSysPush({ kind: "cost", amount, rank: 3 });
    }
    function hideCostBubble() {
      if (whaleSysSwapNext()) return;
      bubbleClearAll();
      costBubbleActive = false;
      bubbleScene = null;
      bubbleShown = false;
      bubbleRandomActive = false;
      bubbleRandomLines = null;
      bubbleCloseVisual();
      whaleSysDone();
    }
    var USAGE_ALERT_TTL = 6500;
    var whaleSysQueue = [];
    var whaleSysItem = null;
    var whaleSysTimer = null;
    function whaleSysPush(item) {
      try {
        if (!bubbleOn || !bubbleBox || !textBox) return false;
        if (costBubbleActive && !whaleSysItem) return false;
        if (!item || !item.kind) return false;
        var rank = Number(item.rank);
        if (!(rank >= 1)) rank = 2;
        item.rank = rank;
        var pos = whaleSysQueue.length;
        for (var i = 0; i < whaleSysQueue.length; i++) {
          if (whaleSysQueue[i].rank > rank) {
            pos = i;
            break;
          }
        }
        whaleSysQueue.splice(pos, 0, item);
        if (whaleSysTimer) {
          clearTimeout(whaleSysTimer);
          whaleSysTimer = null;
        }
        whaleSysTimer = setTimeout2(whaleSysTick, 30);
        return true;
      } catch (err) {
        return false;
      }
    }
    function whaleSysTick() {
      whaleSysTimer = null;
      try {
        if (!bubbleOn || !bubbleBox || !textBox) {
          whaleSysQueue = [];
          whaleSysItem = null;
          return;
        }
        if (whaleSysItem) return;
        if (!whaleSysQueue.length) return;
        if (costBubbleActive || bubbleScene && bubbleScene.kind === "alert") return;
        var item = whaleSysQueue.shift();
        if (!item) return;
        whaleSysItem = item;
        if (item.kind === "cost") {
          sceneOpen("cost", function() {
            bubbleRenderCostMods(item.amount);
          }, turnCostCloseMs > 0 ? turnCostCloseMs : 0);
        } else {
          sceneOpen("alert", function() {
            bubbleRenderModules(item.mods || []);
          }, item && item.ttlMs != null ? item.ttlMs : USAGE_ALERT_TTL);
        }
      } catch (err) {
      }
    }
    function whaleSysDone() {
      try {
        whaleSysItem = null;
        if (whaleSysTimer) {
          clearTimeout(whaleSysTimer);
          whaleSysTimer = null;
        }
        whaleSysTick();
      } catch (err) {
      }
    }
    function whaleSysSwapNext() {
      try {
        if (!whaleSysQueue.length || !bubbleOn || !bubbleShown) return false;
        var item = whaleSysQueue.shift();
        if (!item) return false;
        whaleSysItem = item;
        if (item.kind === "cost") {
          sceneOpen("cost", function() {
            bubbleRenderCostMods(item.amount);
          }, turnCostCloseMs > 0 ? turnCostCloseMs : 0);
        } else {
          sceneOpen("alert", function() {
            bubbleRenderModules(item.mods || []);
          }, item && item.ttlMs != null ? item.ttlMs : USAGE_ALERT_TTL);
        }
        return true;
      } catch (err) {
        return false;
      }
    }
    function hideUsageAlertBubble() {
      if (whaleSysSwapNext()) return;
      bubbleClearAll();
      bubbleScene = null;
      bubbleShown = false;
      bubbleRandomActive = false;
      bubbleRandomLines = null;
      bubbleLiveMods = null;
      bubbleCloseVisual();
      whaleSysDone();
    }
    function clamp(v, lo, hi) {
      return v < lo ? lo : v > hi ? hi : v;
    }
    function viewport() {
      return {
        w: window2.innerWidth || document2.documentElement.clientWidth || 1280,
        h: window2.innerHeight || document2.documentElement.clientHeight || 800
      };
    }
    function rightGap() {
      if (!scrollGapOn) return 0;
      return scrollGapPx > 0 ? scrollGapPx : 0;
    }
    function fmt(balance, currency) {
      var num = Number(balance);
      var fixed = isFinite(num) ? num.toFixed(2) : "--";
      return currency === "CNY" ? "¥ " + fixed : fixed + " " + currency;
    }
    function animateAmount(from, to, currency, duration) {
      if (costBubbleActive) return;
      if (animId) cancelAnimationFrame(animId);
      if (from === null || !isFinite(from)) from = to;
      if (from === to) {
        shown = to;
        amountEl.textContent = fmt(to, currency);
        refreshLiveValues();
        return;
      }
      var startTime = null;
      function step(ts) {
        if (costBubbleActive) {
          animId = null;
          return;
        }
        if (startTime === null) startTime = ts;
        var t = Math.min(1, (ts - startTime) / duration);
        var eased = 1 - Math.pow(1 - t, 3);
        var val = from + (to - from) * eased;
        shown = val;
        refreshLiveValues();
        amountEl.textContent = fmt(val, currency);
        if (t < 1) {
          animId = requestAnimationFrame(step);
        } else {
          animId = null;
          shown = to;
          amountEl.textContent = fmt(to, currency);
          refreshLiveValues();
        }
      }
      animId = requestAnimationFrame(step);
    }
    function render() {
      if (costBubbleActive) return;
      var amount, hint;
      if (state.status === "error") {
        amount = shown !== null ? fmt(shown, state.currency) : "--";
        hint = state.message ? state.message.slice(0, 14) : "获取失败 · 点击重试";
      } else if (state.balance === null) {
        amount = shown !== null ? fmt(shown, state.currency) : "…";
        hint = "加载中…";
      } else {
        amount = shown !== null ? fmt(shown, state.currency) : fmt(state.balance, state.currency);
        hint = "今日已用 " + (state.todayUsage !== null && state.todayUsage !== void 0 ? fmt(state.todayUsage, state.currency) : "--");
      }
      amountEl.textContent = amount;
      if (bubbleRandomActive && bubbleRandomLines) {
        applyBubbleLines(bubbleRandomLines);
      } else {
        setHint(hint);
      }
      refreshLiveValues();
    }
    function express() {
      root.style.right = "auto";
      root.style.bottom = "auto";
      root.style.left = state.left + "px";
      root.style.top = state.top + "px";
      root.classList.toggle("dshwv-left", !!state.flip);
    }
    function settle() {
      var vp = viewport();
      var w = root.offsetWidth || root.getBoundingClientRect().width || 0;
      var h = root.offsetHeight || root.getBoundingClientRect().height || 0;
      if (drag && drag.active) {
        state.left = clamp(state.left, 0, Math.max(0, vp.w - w - rightGap()));
        state.top = clamp(state.top, 0, Math.max(0, vp.h - h));
        express();
        return;
      }
      if (state.h === "right") {
        state.left = Math.max(0, vp.w - w - state.hOff - rightGap());
      } else if (state.h === "left") {
        state.left = state.hOff;
      } else {
        state.left = clamp(state.left, 0, Math.max(0, vp.w - w - rightGap()));
      }
      if (state.v === "bottom") {
        state.top = Math.max(0, vp.h - h - state.vOff);
      } else if (state.v === "top") {
        state.top = state.vOff;
      } else {
        state.top = clamp(state.top, 0, Math.max(0, vp.h - h));
      }
      refreshFlip();
    }
    function snapBounds(vp) {
      var b = { L: 0, T: 0, R: vp.w, B: vp.h, F: vp.w / 2 };
      try {
        var cfg = snapConfig;
        if (!cfg || cfg.mode === "off") return b;
        if (cfg.mode === "px") {
          b.L = cfg.px.L;
          b.T = cfg.px.T;
          b.R = vp.w - cfg.px.R;
          b.B = vp.h - cfg.px.B;
          b.F = cfg.px.F;
        } else {
          b.L = vp.w * cfg.ratio.L / 100;
          b.T = vp.h * cfg.ratio.T / 100;
          b.R = vp.w * (100 - cfg.ratio.R) / 100;
          b.B = vp.h * (100 - cfg.ratio.B) / 100;
          b.F = vp.w * cfg.ratio.F / 100;
        }
      } catch (err) {
      }
      return b;
    }
    function snapZones(cx, cyBox, cyImg, vp) {
      var out = { zH: null, zV: null, flip: false };
      try {
        var cfg = snapConfig;
        if (!cfg || cfg.mode === "off") return out;
        var b = snapBounds(vp);
        out.flip = cx < b.F;
        if (cx < b.L) out.zH = "left";
        else if (cx > b.R) out.zH = "right";
        if (cyBox < b.T) out.zV = "top";
        else if (cyImg > b.B) out.zV = "bottom";
      } catch (err) {
      }
      return out;
    }
    function refreshFlip() {
      try {
        if (state.h === "left") {
          state.flip = true;
        } else if (state.h === "right") {
          state.flip = false;
        } else {
          var w = root.offsetWidth || root.getBoundingClientRect().width || 0;
          var h = root.offsetHeight || root.getBoundingClientRect().height || 0;
          var ac = artCenterAt(state.left, state.top, w, h, !!state.flip);
          var vp = viewport();
          state.flip = ac.cx < snapBounds(vp).F;
        }
        express();
      } catch (err) {
      }
    }
    function artCenterAt(left, top, w, h, flipped) {
      var iw = Math.max(1, w * 0.5945);
      var cx = flipped ? left + iw / 2 : left + w - iw / 2;
      var cy = top + h - iw / 2;
      return { cx, cy };
    }
    function refresh(manual) {
      if (busy) return;
      busy = true;
      if (animDelayTimer) {
        clearTimeout(animDelayTimer);
        animDelayTimer = null;
      }
      if (manual || state.balance === null) {
        state.status = "loading";
        render();
      }
      var ctrl = null;
      var timer = null;
      try {
        ctrl = new AbortController();
        timer = setTimeout2(function() {
          try {
            ctrl.abort();
          } catch (err) {
          }
        }, FETCH_TIMEOUT_MS);
      } catch (err) {
      }
      fetch(BALANCE_URL + (manual ? "?refresh=1" : ""), { cache: "no-store", signal: ctrl ? ctrl.signal : void 0 }).then(function(r) {
        return r.json();
      }).then(function(data) {
        if (data && data.ok) {
          var nb = Number(data.totalBalance);
          var nc = String(data.currency || "CNY");
          var changed = state.balance !== null && (nb !== state.balance || nc !== state.currency);
          var currencyChanged = state.currency !== null && nc !== state.currency;
          state.balance = nb;
          state.currency = nc;
          state.message = "";
          root.title = data.stale ? "显示最近成功获取的余额，网络恢复后将更新" : "DeepSeek API 余额（不代表网页会员额度）";
          state.todayUsage = data.todayUsage !== void 0 ? data.todayUsage : null;
          state.isPeak = !!data.isPeak;
          checkUsageAlerts(nb, state.todayUsage);
          if (changed && !currencyChanged) {
            if (!manual) {
              showBubble();
              state.status = "changing";
              if (animDelayTimer) clearTimeout(animDelayTimer);
              animDelayTimer = setTimeout2(function() {
                animDelayTimer = null;
                animateAmount(shown, nb, nc, ANIM_MS);
              }, 300);
              if (settleTimer) clearTimeout(settleTimer);
              settleTimer = setTimeout2(function() {
                settleTimer = null;
                if (state.status === "changing") {
                  state.status = "ok";
                  render();
                }
              }, CHANGE_MS + 300);
            } else {
              animateAmount(shown, nb, nc, ANIM_MS);
              state.status = "ok";
              render();
            }
          } else {
            if (animId === null) shown = nb;
            state.status = "ok";
            render();
          }
        } else {
          state.status = "error";
          state.message = data && data.error ? String(data.error) : "获取失败";
          root.title = state.message;
          render();
        }
      }).catch(function() {
        state.status = "error";
        state.message = "获取失败";
        root.title = state.message;
        render();
      }).finally(function() {
        busy = false;
        if (timer) clearTimeout(timer);
      });
    }
    var soundOn = false;
    var soundVol = 0;
    var soundSet = "duck";
    var usageMode = "ledger";
    var peakMode = "default";
    var bubbleOn = true;
    var turnCostOn = true;
    var turnCostCloseMs = 5e3;
    var costBubbleActive = false;
    var scrollGapOn = false;
    var scrollGapPx = 17;
    var menuBtnHide = false;
    function saveConfig() {
      try {
        fetch(SIZE_URL, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scale: state.scale, sound: soundOn, vol: soundVol, soundSet, usageMode, peakMode, bubbleOn, turnCostOn, turnCostCloseMs, scrollGapOn, scrollGapPx, menuBtnHide }) });
        var vp = viewport();
        var w = root.offsetWidth || root.getBoundingClientRect().width || 0;
        var h = root.offsetHeight || root.getBoundingClientRect().height || 0;
        var leftDist = state.left;
        var rightDist = vp.w - state.left - w;
        var topDist = state.top;
        var bottomDist = vp.h - state.top - h;
        var hAnchor = leftDist <= rightDist ? "left" : "right";
        var hDistRaw = Math.round(Math.min(leftDist, rightDist));
        var hDist = hAnchor === "right" && scrollGapOn ? Math.max(0, hDistRaw - rightGap()) : hDistRaw;
        localStorage.setItem("dshw-pos", JSON.stringify({
          v: 2,
          hAnchor,
          hDist,
          vAnchor: topDist <= bottomDist ? "top" : "bottom",
          vDist: Math.round(Math.min(topDist, bottomDist))
        }));
      } catch (err) {
      }
    }
    function setUsageMode(v) {
      usageMode = "ledger";
      saveConfig();
      refresh(false);
    }
    function setBubbleOn(v) {
      bubbleOn = !!v;
      bubbleToggle.checked = bubbleOn;
      saveConfig();
      if (!bubbleOn) hideCostBubble();
    }
    function setTurnCostOn(v) {
      turnCostOn = !!v;
      turnCostToggle.checked = turnCostOn;
      turnCostCloseInput.disabled = !turnCostOn;
      saveConfig();
      if (!turnCostOn) hideCostBubble();
    }
    var turnCostCloseDefer = false;
    var turnCostCloseDeferSnap = 0;
    function setTurnCostClose(v) {
      var n = Math.max(0, Math.round(Number(v) || 0));
      turnCostCloseMs = n * 1e3;
      turnCostCloseInput.value = String(n);
      if (turnCostCloseDefer) return;
      saveConfig();
    }
    function setScrollGapOn(v) {
      scrollGapOn = !!v;
      scrollGapToggle.checked = scrollGapOn;
      scrollGapInput.disabled = !scrollGapOn;
      saveConfig();
      settle();
    }
    function setScrollGapPx(v) {
      if (!scrollGapOn) return;
      var n = Math.max(0, Math.round(Number(v) || 0));
      scrollGapPx = n;
      scrollGapInput.value = String(n);
      saveConfig();
      settle();
    }
    function applyMenuBtnHideUI() {
      try {
        menuBtn.classList.toggle("dshwv-menu-btn-hidden", menuBtnHide);
        if (menuBtnHide) menuBtn.classList.remove("dshwv-menu-btn-visible");
      } catch (err) {
      }
    }
    function setMenuBtnHide(v) {
      menuBtnHide = !!v;
      if (menuHideToggle) menuHideToggle.checked = menuBtnHide;
      saveConfig();
      applyMenuBtnHideUI();
    }
    function scaleToDisplay(s) {
      return Math.round((s - MIN_SCALE) / ((MAX_SCALE - MIN_SCALE) / 19)) + 1;
    }
    function setScale(v) {
      var next = Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(v))) * 10) / 10;
      var prevTrans = root.style.transition;
      root.style.transition = "none";
      var rect = root.getBoundingClientRect();
      var fx = state.flip ? rect.left : rect.right;
      var fy = rect.bottom;
      state.scale = next;
      root.style.setProperty("--dshw-scale", String(next));
      scaleInput.value = String(next);
      scaleNumber.value = String(scaleToDisplay(next));
      saveConfig();
      var r2 = root.getBoundingClientRect();
      var vp = viewport();
      if (state.flip) {
        state.left = Math.min(Math.max(fx, 0), Math.max(0, vp.w - r2.width));
      } else {
        state.left = Math.min(Math.max(fx - r2.width, 0), Math.max(0, vp.w - r2.width));
      }
      state.top = Math.min(Math.max(fy - r2.height, 0), Math.max(0, vp.h - r2.height));
      express();
      requestAnimationFrame(function() {
        root.style.transition = prevTrans;
      });
    }
    function setVol(v) {
      var next = Math.round(Math.min(1, Math.max(0, Number(v))) * 100) / 100;
      soundVol = next;
      soundOn = next > 0;
      volInput.value = String(next);
      volPct.textContent = Math.round(next * 100) + "%";
      try {
        if (pressAudio) pressAudio.volume = next;
        if (releaseAudio) releaseAudio.volume = next;
      } catch (err) {
      }
      saveConfig();
    }
    function setSoundSet(v) {
      soundSet = typeof v === "string" && v ? v : "duck";
      setAudioBtnText(audioGroupName(soundSet));
      applySoundSet();
      saveConfig();
    }
    var SQUISH = "scaleY(0.88) scaleX(1.05)";
    var pressAudio = null;
    var releaseAudio = null;
    var pressing = false;
    var pressEnded = false;
    var releasePlayed = false;
    var releaseTimer = null;
    function applySoundSet() {
      try {
        if (releaseTimer) {
          clearTimeout(releaseTimer);
          releaseTimer = null;
        }
        if (pressAudio) {
          pressAudio.onended = null;
          pressAudio.pause();
        }
        if (releaseAudio) releaseAudio.pause();
        pressEnded = false;
        releasePlayed = false;
        var pEmpty = audioGroupSlotEmpty(soundSet, "press");
        var rEmpty = audioGroupSlotEmpty(soundSet, "release");
        if (pEmpty) {
          pressAudio = null;
        } else {
          pressAudio = new Audio("/dsh-whale/sound/press.mp3?set=" + soundSet);
          pressAudio.preload = "auto";
          pressAudio.volume = soundVol;
        }
        if (rEmpty) {
          releaseAudio = null;
        } else {
          releaseAudio = new Audio("/dsh-whale/sound/release.mp3?set=" + soundSet);
          releaseAudio.preload = "auto";
          releaseAudio.volume = soundVol;
        }
      } catch (err) {
      }
    }
    function playPress() {
      if (!soundOn) return;
      try {
        if (releaseTimer) {
          clearTimeout(releaseTimer);
          releaseTimer = null;
        }
        if (releaseAudio) {
          releaseAudio.pause();
          releaseAudio.currentTime = 0;
        }
        pressEnded = false;
        releasePlayed = false;
        if (!pressAudio) {
          pressEnded = true;
          return;
        }
        pressAudio.onended = function() {
          pressEnded = true;
          if (!pressing && !releasePlayed) playRelease();
        };
        pressAudio.currentTime = 0;
        var p = pressAudio.play();
        if (p && typeof p.catch === "function") p.catch(function() {
        });
      } catch (err) {
      }
    }
    function playRelease() {
      if (releasePlayed || !releaseAudio || !soundOn) return;
      releasePlayed = true;
      try {
        releaseAudio.currentTime = 0;
        var p = releaseAudio.play();
        if (p && typeof p.catch === "function") p.catch(function() {
        });
      } catch (err) {
      }
    }
    function pressDown() {
      body.style.transform = SQUISH;
      pressing = true;
      playPress();
    }
    function pressUp() {
      body.style.transform = "scaleY(1) scaleX(1)";
      pressing = false;
      if (pressEnded) {
        playRelease();
        return;
      }
      var durKnown = false;
      var remainMs = 0;
      try {
        var dur = pressAudio ? pressAudio.duration : 0;
        if (isFinite(dur) && dur > 0) {
          durKnown = true;
          remainMs = (dur - pressAudio.currentTime) * 1e3;
        }
      } catch (err) {
      }
      if (durKnown) {
        releaseTimer = setTimeout2(function() {
          releaseTimer = null;
          playRelease();
        }, Math.max(0, remainMs - 100));
      }
    }
    var menuOpen = false;
    var menuClosedAt = 0;
    function toggleMenu() {
      menuOpen = !menuOpen;
      if (menuOpen) positionMenu();
      menuBox.classList.toggle("dshwv-menu-open", menuOpen);
      menuBox.inert = !menuOpen;
      menuBox.setAttribute("aria-hidden", String(!menuOpen));
      menuBtn.setAttribute("aria-expanded", String(menuOpen));
      if (menuOpen && !menuBtnHide) menuBtn.classList.add("dshwv-menu-btn-visible");
      if (!menuOpen) closeUsagePanel();
    }
    function closeMenu() {
      menuOpen = false;
      menuClosedAt = Date.now();
      menuBox.classList.remove("dshwv-menu-open");
      menuBox.inert = true;
      menuBox.setAttribute("aria-hidden", "true");
      menuBtn.setAttribute("aria-expanded", "false");
      closeRolePanel();
      closeAudioGroupPanel();
      closeUsagePanel();
      root.style.transition = "";
      snapCheck();
    }
    function snapCheck() {
      if (!snapConfig || snapConfig.mode === "off") return;
      var rect = root.getBoundingClientRect();
      var vp = viewport();
      var w = rect.width, h = rect.height;
      var left = rect.left, top = rect.top;
      var ac = artCenterAt(left, top, w, h, !!state.flip);
      var z = snapZones(ac.cx, top + h / 2, ac.cy, vp);
      var moved = false;
      if (z.zH === "left") {
        state.h = "left";
        state.hOff = 0;
        left = 0;
        moved = true;
      } else if (z.zH === "right") {
        state.h = "right";
        state.hOff = 0;
        left = vp.w - w - rightGap();
        moved = true;
      } else {
        state.h = null;
        state.hOff = left;
      }
      if (z.zV === "top") {
        state.v = "top";
        state.vOff = 0;
        top = 0;
        moved = true;
      } else if (z.zV === "bottom") {
        state.v = "bottom";
        state.vOff = 0;
        top = Math.max(0, vp.h - h);
        moved = true;
      } else {
        state.v = "bottom";
        state.vOff = Math.max(0, vp.h - top - h);
      }
      state.flip = z.flip;
      if (moved) {
        state.left = left;
        state.top = top;
        settle();
      } else {
        express();
      }
    }
    function positionMenu() {
      try {
        var r = root.getBoundingClientRect();
        var b = menuBtn.getBoundingClientRect();
        var vp = viewport();
        var onLeft = r.left + r.width / 2 < vp.w / 2;
        if (onLeft) {
          menuBox.style.left = b.left + "px";
          menuBox.style.right = "auto";
          menuBox.style.transformOrigin = "bottom left";
        } else {
          menuBox.style.right = vp.w - b.right + "px";
          menuBox.style.left = "auto";
          menuBox.style.transformOrigin = "bottom right";
        }
        var assetTop = r.bottom - r.height * 0.5945;
        menuBox.style.bottom = vp.h - assetTop + 6 + "px";
        menuBox.style.top = "auto";
      } catch (err) {
      }
    }
    var ROLE_URL = "/dsh-whale/roles.json";
    var currentRole = { id: "default", name: "小鲸鱼", url: IMG_URL };
    var roleList = [];
    function loadRoles() {
      try {
        fetch(ROLE_URL, { cache: "no-store" }).then(function(r) {
          return r.json();
        }).then(function(d) {
          if (!d || !d.ok || !Array.isArray(d.roles)) return;
          roleList = d.roles;
          renderRolePanel();
          var saved = "";
          try {
            saved = localStorage.getItem("dshw-role") || "";
          } catch (err) {
          }
          var found = null;
          for (var i = 0; i < roleList.length; i++) {
            if (roleList[i].id === saved) {
              found = roleList[i];
              break;
            }
          }
          if (found) {
            if (currentRole.id !== found.id) applyRole(found.id, found.name, found.url);
            else renderRolePanel();
          } else if (saved && saved !== "default") {
            applyRole("default", "小鲸鱼", IMG_URL);
          }
        }).catch(function() {
        });
      } catch (err) {
      }
    }
    function setRoleBtnText(t) {
      try {
        roleBtnLabel.textContent = t;
      } catch (err) {
      }
    }
    function setAudioBtnText(t) {
      try {
        audioGroupBtnLabel.textContent = t;
      } catch (err) {
      }
    }
    var MARQ_SPEED = 40;
    function bindNameMarquee(item, nameEl) {
      try {
        let stop = function() {
          try {
            if (timer) {
              clearTimeout(timer);
              timer = null;
            }
            var t = nameEl.querySelector(".dshwv-nameinner");
            if (!t) return;
            t.style.transitionTimingFunction = "";
            t.style.transitionDuration = "";
            t.style.transform = "";
            while (t.children && t.children.length > 1) t.removeChild(t.children[t.children.length - 1]);
          } catch (err) {
          }
        }, distOf = function() {
          try {
            var t = nameEl.querySelector(".dshwv-nameinner");
            if (!t) return 0;
            return t.scrollWidth / 2;
          } catch (err) {
            return 0;
          }
        }, textWOf = function() {
          try {
            var t = nameEl.querySelector(".dshwv-nameinner");
            if (!t || !t.children || !t.children.length) return 0;
            return t.children[0].offsetWidth || 0;
          } catch (err) {
            return 0;
          }
        }, ensureDup = function() {
          var t = nameEl.querySelector(".dshwv-nameinner");
          if (!t || !t.children || t.children.length >= 2) return t;
          var first = t.children[0];
          var c = document2.createElement("span");
          c.className = "dshwv-namecopy";
          c.textContent = first.textContent;
          t.appendChild(c);
          return t;
        }, cycle = function() {
          var dist = distOf();
          var dur = Math.max(200, dist / MARQ_SPEED * 1e3);
          timer = setTimeout2(function() {
            try {
              cycle();
            } catch (err) {
            }
          }, dur + 40);
          var t = nameEl.querySelector(".dshwv-nameinner");
          if (!t) return;
          t.style.transitionTimingFunction = "linear";
          t.style.transitionDuration = "0ms";
          t.style.transform = "translateX(0px)";
          void t.offsetWidth;
          t.style.transitionDuration = dur + "ms";
          t.style.transform = "translateX(" + -dist + "px)";
        };
        if (!item || !nameEl) return;
        var timer = null;
        item.addEventListener("mouseenter", function() {
          try {
            stop();
            if (textWOf() <= nameEl.clientWidth + 1) return;
            ensureDup();
            cycle();
          } catch (err) {
          }
        });
        item.addEventListener("mouseleave", stop);
      } catch (err) {
      }
    }
    function makeNameCell(className, text) {
      var outer = document2.createElement("span");
      outer.className = className;
      var inner = document2.createElement("span");
      inner.className = "dshwv-nameinner";
      var c = document2.createElement("span");
      c.className = "dshwv-namecopy";
      c.textContent = text;
      inner.appendChild(c);
      outer.appendChild(inner);
      return outer;
    }
    function applyRole(id, name, url) {
      currentRole = { id, name, url };
      img.src = bridge.asset(url);
      setRoleBtnText(name);
      try {
        localStorage.setItem("dshw-role", id);
      } catch (err) {
      }
      hitReady = false;
      hitFailed = false;
      setupHitTest(url);
      closeRolePanel();
      renderRolePanel();
    }
    function roleUrl(id) {
      if (id === "default") return IMG_URL;
      return "/dsh-whale/role-image.png?id=" + encodeURIComponent(id);
    }
    function toggleRolePanel() {
      if (rolePanel.classList.contains("dshwv-rolelist-open")) {
        closeRolePanel();
        return;
      }
      try {
        var b = roleBtn.getBoundingClientRect();
        var vp = viewport();
        var panelW = Math.max(200, Math.round(b.width));
        rolePanel.style.width = panelW + "px";
        rolePanel.style.left = Math.max(4, Math.min(b.left, vp.w - panelW - 4)) + "px";
        rolePanel.style.top = b.bottom + 6 + "px";
        rolePanel.style.display = "block";
        rolePanel.classList.add("dshwv-rolelist-open");
      } catch (err) {
      }
    }
    function closeRolePanel() {
      rolePanel.classList.remove("dshwv-rolelist-open");
      rolePanel.style.display = "none";
    }
    function renderRolePanel() {
      try {
        rolePanel.innerHTML = "";
        roleList.forEach(function(r) {
          var item = document2.createElement("div");
          item.className = "dshwv-roleitem" + (currentRole.id === r.id ? " dshwv-roleitem-cur" : "");
          var thumb = document2.createElement("img");
          thumb.className = "dshwv-rolethumb";
          thumb.src = bridge.asset(r.url);
          thumb.alt = "";
          thumb.draggable = false;
          var name = makeNameCell("dshwv-rolename", r.name);
          var nameWrap = document2.createElement("span");
          nameWrap.className = "dshwv-rolenamewrap";
          if (r.format === "gif" || r.format === "apng") {
            var gifTag = document2.createElement("span");
            gifTag.className = "dshwv-roleGifTag";
            gifTag.textContent = r.format === "apng" ? "APNG" : "GIF";
            nameWrap.appendChild(gifTag);
          }
          nameWrap.appendChild(name);
          item.appendChild(thumb);
          item.appendChild(nameWrap);
          var pin = document2.createElement("button");
          pin.type = "button";
          pin.className = "dshwv-rolepin" + (r.pinned ? " on" : "");
          pin.textContent = "📌";
          pin.title = r.pinned ? "取消置顶" : "置顶";
          pin.addEventListener("click", function(e) {
            e.stopPropagation();
            togglePin(r.id, !r.pinned);
          });
          item.appendChild(pin);
          if (r.id !== "default") {
            var del = document2.createElement("button");
            del.type = "button";
            del.className = "dshwv-roledel";
            del.textContent = "✕";
            del.title = "删除角色";
            del.addEventListener("click", function(e) {
              e.stopPropagation();
              deleteRole(r.id);
            });
            item.appendChild(del);
          }
          item.addEventListener("click", function() {
            applyRole(r.id, r.name, roleUrl(r.id));
          });
          bindNameMarquee(item, name);
          rolePanel.appendChild(item);
        });
      } catch (err) {
      }
    }
    function togglePin(id, pinned) {
      try {
        fetch("/dsh-whale/role-pin.json", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, pinned })
        }).then(function(r) {
          return r.json();
        }).then(function(d) {
          if (d && d.ok && Array.isArray(d.roles)) {
            roleList = d.roles;
            renderRolePanel();
          }
        }).catch(function() {
        });
      } catch (err) {
      }
    }
    var confirmCb = null;
    function showConfirm(text, cb, okLabel) {
      confirmCb = cb || null;
      try {
        confirmMask.style.setProperty("z-index", "40000", "important");
      } catch (err) {
      }
      confirmText.textContent = text;
      try {
        if (!okLabel) okLabel = String(text || "").indexOf("删除") !== -1 ? "删除" : "确定";
        confirmYesBtn.textContent = okLabel;
      } catch (err) {
      }
      confirmMask.style.display = "flex";
    }
    function hideConfirm() {
      confirmMask.style.display = "none";
      confirmCb = null;
    }
    function deleteRole(id) {
      var r = null;
      for (var i = 0; i < roleList.length; i++) if (roleList[i].id === id) {
        r = roleList[i];
        break;
      }
      showConfirm("确定删除角色「" + (r ? r.name : id) + "」吗？", function() {
        try {
          fetch("/dsh-whale/role-delete.json", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id })
          }).then(function(res) {
            return res.json();
          }).then(function(d) {
            if (d && d.ok && Array.isArray(d.roles)) {
              roleList = d.roles;
              renderRolePanel();
              if (currentRole.id === id) applyRole("default", "小鲸鱼", IMG_URL);
            }
          }).catch(function() {
          });
        } catch (err) {
        }
      });
    }
    var cropState = null;
    function countGifFrames(bytes) {
      try {
        var head = "";
        for (var i = 0; i < 6; i++) head += String.fromCharCode(bytes[i]);
        if (head !== "GIF87a" && head !== "GIF89a") return 1;
        var flags = bytes[10];
        var hasGct = (flags & 128) !== 0;
        var gctSize = 3 * (1 << (flags & 7) + 1);
        var pos = 13 + (hasGct ? gctSize : 0);
        var frames = 0;
        while (pos + 1 < bytes.length) {
          var b = bytes[pos];
          if (b === 59) break;
          if (b === 44) {
            frames++;
            var lctFlag = bytes[pos + 9] & 128;
            var lctSize = lctFlag ? 3 * (1 << (bytes[pos + 9] & 7) + 1) : 0;
            pos += 10 + lctSize;
            if (pos >= bytes.length) break;
            pos++;
            while (pos < bytes.length) {
              var sz = bytes[pos];
              pos++;
              if (sz === 0) break;
              pos += sz;
            }
          } else if (b === 33) {
            pos += 2;
            while (pos < bytes.length) {
              var sz2 = bytes[pos];
              pos++;
              if (sz2 === 0) break;
              pos += sz2;
            }
          } else {
            break;
          }
        }
        return Math.max(1, frames);
      } catch (err) {
        return 1;
      }
    }
    function isAnimatedPng(bytes) {
      try {
        if (bytes.length < 8) return false;
        for (var s = 0; s < 8; s++) {
          if (bytes[s] !== [137, 80, 78, 71, 13, 10, 26, 10][s]) return false;
        }
        var pos = 8;
        while (pos + 8 <= bytes.length) {
          var len = bytes[pos] << 24 | bytes[pos + 1] << 16 | bytes[pos + 2] << 8 | bytes[pos + 3];
          var type = "";
          for (var i = 0; i < 4; i++) type += String.fromCharCode(bytes[pos + 4 + i]);
          if (type === "acTL") return true;
          if (type === "IEND") return false;
          pos += 12 + len;
        }
        return false;
      } catch (err) {
        return false;
      }
    }
    function onRoleFileChosen(input) {
      try {
        var f = input && input.files && input.files[0];
        input.value = "";
        if (!f) return;
        if (!/^image\//.test(f.type)) return;
        var reader = new FileReader();
        reader.onload = function() {
          try {
            var buf = new Uint8Array(reader.result);
            var isGifFile = /^image\/gif$/i.test(f.type) || /.gif$/i.test(f.name);
            var isPngFile = /^image\/png$/i.test(f.type) || /.png$/i.test(f.name);
            var animType = null;
            if (isGifFile) {
              if (countGifFrames(buf) > 1) animType = "gif";
            } else if (isPngFile) {
              if (isAnimatedPng(buf)) animType = "apng";
            }
            if (animType) {
              var fr = new FileReader();
              fr.onload = function() {
                openGifRoleModal(fr.result, f.name, animType);
              };
              fr.readAsDataURL(f);
              return;
            }
          } catch (err) {
          }
          var dr = new FileReader();
          dr.onload = function() {
            openCropModal(dr.result, f.name);
          };
          dr.readAsDataURL(f);
        };
        reader.readAsArrayBuffer(f);
      } catch (err) {
      }
    }
    function openCropModal(dataUrl, fileName) {
      try {
        var imgEl = new Image();
        imgEl.onload = function() {
          cropState = {
            img: imgEl,
            zoom: 1,
            ox: 0,
            // 图片中心相对画布中心的横向偏移（画布 px）
            oy: 0,
            // 图片中心相对画布中心的纵向偏移
            rotation: 0,
            // 旋转角度（度）
            flipH: false,
            // 水平翻转
            flipV: false,
            // 垂直翻转
            baseScale: Math.max(CROP_BOX / imgEl.width, CROP_BOX / imgEl.height)
          };
          cropNameInput.value = "";
          cropZoom.value = "1";
          cropZoomNum.value = "100";
          cropAngle.value = "0";
          cropAngleNum.value = "0";
          positionCrop();
          cropMask.style.display = "flex";
        };
        imgEl.onerror = function() {
        };
        imgEl.src = bridge.asset(dataUrl);
      } catch (err) {
      }
    }
    function clampAngle(v) {
      var n = Number(v);
      if (!isFinite(n)) return 0;
      return Math.min(360, Math.max(-360, Math.round(n)));
    }
    function cropDisplaySize() {
      var s = cropState.baseScale * cropState.zoom;
      var w = cropState.img.width * s;
      var h = cropState.img.height * s;
      var rad = cropState.rotation * Math.PI / 180;
      var c = Math.abs(Math.cos(rad));
      var sn = Math.abs(Math.sin(rad));
      return { w: w * c + h * sn, h: w * sn + h * c, s };
    }
    function positionCrop() {
      if (!cropState) return;
      var d = cropDisplaySize();
      var maxOx = Math.max(0, (d.w - CROP_BOX) / 2);
      var maxOy = Math.max(0, (d.h - CROP_BOX) / 2);
      cropState.ox = Math.min(maxOx, Math.max(-maxOx, cropState.ox));
      cropState.oy = Math.min(maxOy, Math.max(-maxOy, cropState.oy));
      drawCrop();
    }
    function drawCrop() {
      try {
        if (!cropState) return;
        var ctx = cropCanvas.getContext("2d");
        var s = cropState.baseScale * cropState.zoom;
        var rad = cropState.rotation * Math.PI / 180;
        var w = cropState.img.width * s;
        var h = cropState.img.height * s;
        ctx.clearRect(0, 0, CROP_BOX, CROP_BOX);
        ctx.save();
        ctx.translate(CROP_BOX / 2 + cropState.ox, CROP_BOX / 2 + cropState.oy);
        ctx.rotate(rad);
        ctx.scale(cropState.flipH ? -1 : 1, cropState.flipV ? -1 : 1);
        ctx.drawImage(cropState.img, -w / 2, -h / 2, w, h);
        ctx.restore();
      } catch (err) {
      }
    }
    var cropDrag = null;
    function onCropDown(e) {
      if (!cropState) return;
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch (err) {
      }
      cropDrag = { x: e.clientX, y: e.clientY, ox: cropState.ox, oy: cropState.oy };
    }
    function onCropMove(e) {
      if (!cropDrag || !cropState) return;
      cropState.ox = cropDrag.ox + (e.clientX - cropDrag.x);
      cropState.oy = cropDrag.oy + (e.clientY - cropDrag.y);
      positionCrop();
    }
    function onCropUp() {
      cropDrag = null;
    }
    function onCropWheel(e) {
      if (!cropState) return;
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch (err) {
      }
      var delta = (e.deltaY > 0 ? -1 : 1) * 0.05;
      cropState.zoom = Math.min(3, Math.max(0.3, cropState.zoom + delta));
      cropZoom.value = String(Math.round(cropState.zoom * 100) / 100);
      cropZoomNum.value = String(Math.round(cropState.zoom * 100));
      positionCrop();
    }
    function resetCrop() {
      if (!cropState) return;
      cropState.zoom = 1;
      cropState.ox = 0;
      cropState.oy = 0;
      cropState.rotation = 0;
      cropState.flipH = false;
      cropState.flipV = false;
      cropZoom.value = "1";
      cropZoomNum.value = "100";
      cropAngle.value = "0";
      cropAngleNum.value = "0";
      cropFlipHBtn.classList.remove("dshwv-cropflip-on");
      cropFlipVBtn.classList.remove("dshwv-cropflip-on");
      positionCrop();
    }
    var cropFlipTimer = null;
    function flipCrop(axis) {
      if (!cropState) return;
      try {
        if (cropFlipTimer) {
          clearTimeout(cropFlipTimer);
          cropFlipTimer = null;
        }
      } catch (err) {
      }
      var flipTarget = axis === "H" ? "scaleX(-1)" : "scaleY(-1)";
      cropCanvas.style.transition = "transform .3s ease";
      cropCanvas.style.transform = flipTarget;
      cropFlipTimer = setTimeout2(function() {
        cropFlipTimer = null;
        try {
          if (axis === "H") {
            cropState.flipH = !cropState.flipH;
            cropFlipHBtn.classList.toggle("dshwv-cropflip-on", cropState.flipH);
          } else {
            cropState.flipV = !cropState.flipV;
            cropFlipVBtn.classList.toggle("dshwv-cropflip-on", cropState.flipV);
          }
          positionCrop();
          requestAnimationFrame(function() {
            cropCanvas.style.transition = "";
            cropCanvas.style.transform = "";
          });
        } catch (err) {
        }
      }, 300);
    }
    function confirmCrop() {
      try {
        if (!cropState) return;
        var name = (cropNameInput.value || "").trim().slice(0, 16) || "新角色";
        var s = cropState.baseScale * cropState.zoom;
        var k = 610 / CROP_BOX;
        var rad = cropState.rotation * Math.PI / 180;
        var w = cropState.img.width * s * k;
        var h = cropState.img.height * s * k;
        var out = document2.createElement("canvas");
        out.width = 610;
        out.height = 610;
        var octx = out.getContext("2d");
        octx.translate(305 + cropState.ox * k, 305 + cropState.oy * k);
        octx.rotate(rad);
        octx.scale(cropState.flipH ? -1 : 1, cropState.flipV ? -1 : 1);
        octx.drawImage(cropState.img, -w / 2, -h / 2, w, h);
        var dataUrl = out.toDataURL("image/png");
        fetch(ROLE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, image: dataUrl })
        }).then(function(r) {
          return r.json();
        }).then(function(d) {
          if (d && d.ok && Array.isArray(d.roles)) {
            roleList = d.roles;
            renderRolePanel();
            var newest = null;
            for (var i = 0; i < roleList.length; i++) {
              if (roleList[i].id !== "default" && (!newest || roleList[i].createdAt > newest.createdAt)) newest = roleList[i];
            }
            if (newest) applyRole(newest.id, newest.name, roleUrl(newest.id));
          }
        }).catch(function() {
        }).finally(function() {
          hideCropModal();
        });
      } catch (err) {
        try {
          hideCropModal();
        } catch (err2) {
        }
      }
    }
    function hideCropModal() {
      cropMask.style.display = "none";
      cropState = null;
      cropDrag = null;
    }
    var AUDIO_URL = "/dsh-whale/audio.json";
    var audioGroups = [];
    var audioFragments = [];
    var audioGroupPanelOpen = false;
    function loadAudio() {
      try {
        fetch(AUDIO_URL, { cache: "no-store" }).then(function(r) {
          return r.json();
        }).then(function(d) {
          if (!d || !d.ok) return;
          if (Array.isArray(d.groups)) audioGroups = d.groups;
          if (Array.isArray(d.fragments)) audioFragments = d.fragments;
          var exists = false;
          for (var i = 0; i < audioGroups.length; i++) if (audioGroups[i].id === soundSet) {
            exists = true;
            break;
          }
          if (!exists) setSoundSet("duck");
          else {
            setAudioBtnText(audioGroupName(soundSet));
            try {
              applySoundSet();
            } catch (err) {
            }
          }
          renderAudioGroupPanel();
          refreshTaskEndAfterAudio();
        }).catch(function() {
        });
      } catch (err) {
      }
    }
    function audioGroupName(id) {
      for (var i = 0; i < audioGroups.length; i++) if (audioGroups[i].id === id) return audioGroups[i].name;
      return id === "duck" ? "小黄鸭" : id === "fx1" ? "音效1" : id;
    }
    function audioGroupSlotEmpty(id, slot) {
      try {
        for (var i = 0; i < audioGroups.length; i++) {
          var g = audioGroups[i];
          if (g && g.id === id) return g[slot] === "";
        }
      } catch (err) {
      }
      return false;
    }
    function toggleAudioGroupPanel() {
      if (audioGroupPanelOpen) {
        closeAudioGroupPanel();
        return;
      }
      try {
        renderAudioGroupPanel();
        var b = audioGroupBtn.getBoundingClientRect();
        var vp = viewport();
        var panelW = Math.max(200, Math.round(b.width));
        audioGroupPanel.style.width = panelW + "px";
        audioGroupPanel.style.left = Math.max(4, Math.min(b.left, vp.w - panelW - 4)) + "px";
        audioGroupPanel.style.top = b.bottom + 6 + "px";
        audioGroupPanel.style.display = "block";
        audioGroupPanel.classList.add("dshwv-audiolist-open");
        audioGroupPanelOpen = true;
      } catch (err) {
      }
    }
    function closeAudioGroupPanel() {
      audioGroupPanel.classList.remove("dshwv-audiolist-open");
      audioGroupPanel.style.display = "none";
      audioGroupPanelOpen = false;
    }
    function renderAudioGroupPanel() {
      try {
        audioGroupPanel.innerHTML = "";
        audioGroups.forEach(function(g) {
          var item = document2.createElement("div");
          item.className = "dshwv-audioitem" + (soundSet === g.id ? " dshwv-audioitem-cur" : "");
          var thumb = document2.createElement("span");
          thumb.className = "dshwv-audiothumb";
          thumb.textContent = "🎵";
          item.appendChild(thumb);
          var name = makeNameCell("dshwv-audioname", g.name);
          item.appendChild(name);
          if (g.preset) {
            var tag = document2.createElement("span");
            tag.className = "dshwv-audiopreset";
            tag.textContent = "预设";
            item.appendChild(tag);
          } else {
            var pin = document2.createElement("button");
            pin.type = "button";
            pin.className = "dshwv-audiopin" + (g.pinned ? " on" : "");
            pin.textContent = "📌";
            pin.title = g.pinned ? "取消置顶" : "置顶";
            pin.addEventListener("click", function(e) {
              e.stopPropagation();
              audioPinGroup(g.id, !g.pinned);
            });
            item.appendChild(pin);
            var del = document2.createElement("button");
            del.type = "button";
            del.className = "dshwv-audiodel";
            del.textContent = "✕";
            del.title = "删除音效组";
            del.addEventListener("click", function(e) {
              e.stopPropagation();
              audioDeleteGroup(g.id);
            });
            item.appendChild(del);
          }
          item.addEventListener("click", function() {
            setSoundSet(g.id);
            closeAudioGroupPanel();
          });
          bindNameMarquee(item, name);
          audioGroupPanel.appendChild(item);
        });
      } catch (err) {
      }
    }
    function audioPinGroup(id, pinned) {
      try {
        fetch(AUDIO_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "pin-group", id, pinned })
        }).then(function(r) {
          return r.json();
        }).then(function(d) {
          if (d && d.ok && Array.isArray(d.groups)) {
            audioGroups = d.groups;
            renderAudioGroupPanel();
            refreshTaskEndAfterAudio();
          }
        }).catch(function() {
        });
      } catch (err) {
      }
    }
    function audioDeleteGroup(id) {
      var g = null;
      for (var i = 0; i < audioGroups.length; i++) if (audioGroups[i].id === id) {
        g = audioGroups[i];
        break;
      }
      showConfirm("确定删除音效组「" + (g ? g.name : id) + "」吗？", function() {
        try {
          fetch(AUDIO_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete-group", id })
          }).then(function(r) {
            return r.json();
          }).then(function(d) {
            if (d && d.ok && Array.isArray(d.groups)) {
              audioGroups = d.groups;
              renderAudioGroupPanel();
              refreshTaskEndAfterAudio();
              if (soundSet === id) setSoundSet("duck");
            }
          }).catch(function() {
          });
        } catch (err) {
        }
      });
    }
    var editingAudioGroupId = null;
    var activeSlotPanel = null;
    function audioSlotValue(slot) {
      return slot === "press" ? audioEditPressVal || "ya1" : audioEditReleaseVal || "ya2";
    }
    var audioEditPressVal = "ya1";
    var audioEditReleaseVal = "ya2";
    function audioSlotName(id) {
      for (var i = 0; i < audioFragments.length; i++) if (audioFragments[i].id === id) return audioFragments[i].name;
      return id;
    }
    function audioSlotBtnText(btn, id) {
      try {
        var txt = audioSlotName(id);
        btn.style.opacity = txt ? "" : ".55";
        btn.textContent = txt || "留空·不发声";
        btn.title = "留空则该事件不发声;点击可选择音频片段";
      } catch (err) {
      }
      return btn;
    }
    function openAudioGroupEditor(group) {
      editingAudioGroupId = group && group.id ? group.id : null;
      audioEditTitle.textContent = editingAudioGroupId ? "编辑音效组" : "新建音效组";
      audioEditName.value = group && group.name ? group.name : "";
      var isNewGroup = !(group && group.id);
      audioEditPressVal = group && typeof group.press === "string" ? group.press : isNewGroup ? "" : "ya1";
      audioEditReleaseVal = group && typeof group.release === "string" ? group.release : isNewGroup ? "" : "ya2";
      audioEditPressBtn.textContent = audioSlotName(audioEditPressVal);
      audioEditReleaseBtn.textContent = audioSlotName(audioEditReleaseVal);
      audioSlotBtnText(audioEditPressBtn, audioEditPressVal);
      audioSlotBtnText(audioEditReleaseBtn, audioEditReleaseVal);
      audioEditPreviewEnsure();
      audioEditMask.style.display = "flex";
    }
    function toggleAudioSlotPanel(slot) {
      var btn = slot === "press" ? audioEditPressBtn : audioEditReleaseBtn;
      var panel = slot === "press" ? audioEditPressPanel : audioEditReleasePanel;
      if (activeSlotPanel === panel) {
        closeAudioSlotPanels();
        return;
      }
      closeAudioSlotPanels();
      activeSlotPanel = panel;
      renderAudioSlotPanel(slot);
      try {
        var b = btn.getBoundingClientRect();
        var vp = viewport();
        var panelW = Math.max(120, Math.round(b.width));
        panel.style.width = panelW + "px";
        panel.style.left = Math.max(4, Math.min(b.left, vp.w - panelW - 4)) + "px";
        panel.style.top = b.bottom + 4 + "px";
        panel.style.display = "block";
      } catch (err) {
      }
    }
    function closeAudioSlotPanels() {
      if (audioEditPressPanel) audioEditPressPanel.style.display = "none";
      if (audioEditReleasePanel) audioEditReleasePanel.style.display = "none";
      activeSlotPanel = null;
    }
    function renderAudioSlotPanel(slot) {
      try {
        var panel = slot === "press" ? audioEditPressPanel : audioEditReleasePanel;
        var current = slot === "press" ? audioEditPressVal : audioEditReleaseVal;
        panel.innerHTML = "";
        var emptyItem = document2.createElement("div");
        emptyItem.className = "dshwv-audioitem" + (!current ? " dshwv-audioitem-cur" : "");
        var emptyIcon = document2.createElement("span");
        emptyIcon.className = "dshwv-audiothumb";
        emptyIcon.textContent = "🚫";
        emptyItem.appendChild(emptyIcon);
        var emptyName = makeNameCell("dshwv-audioname", "留空（不发声）");
        emptyItem.appendChild(emptyName);
        emptyItem.addEventListener("click", function() {
          if (slot === "press") {
            audioEditPressVal = "";
            audioSlotBtnText(audioEditPressBtn, "");
          } else {
            audioEditReleaseVal = "";
            audioSlotBtnText(audioEditReleaseBtn, "");
          }
          audioEditPreviewEnsure(true);
          closeAudioSlotPanels();
        });
        bindNameMarquee(emptyItem, emptyName);
        panel.appendChild(emptyItem);
        audioFragments.forEach(function(f) {
          var item = document2.createElement("div");
          item.className = "dshwv-audioitem" + (current === f.id ? " dshwv-audioitem-cur" : "");
          var thumb = document2.createElement("span");
          thumb.className = "dshwv-audiothumb";
          thumb.textContent = "🎵";
          item.appendChild(thumb);
          var name = makeNameCell("dshwv-audioname", f.name);
          item.appendChild(name);
          if (f.preset) {
            var tag = document2.createElement("span");
            tag.className = "dshwv-audiopreset";
            tag.textContent = "预设";
            item.appendChild(tag);
          } else {
            var del = document2.createElement("button");
            del.type = "button";
            del.className = "dshwv-audiodel";
            del.textContent = "✕";
            del.title = "删除该音频";
            del.addEventListener("click", function(e) {
              e.stopPropagation();
              audioDeleteFragmentInSlot(slot, f.id);
            });
            item.appendChild(del);
          }
          item.addEventListener("click", function() {
            if (slot === "press") {
              audioEditPressVal = f.id;
              audioSlotBtnText(audioEditPressBtn, f.id);
            } else {
              audioEditReleaseVal = f.id;
              audioSlotBtnText(audioEditReleaseBtn, f.id);
            }
            audioEditPreviewEnsure(true);
            closeAudioSlotPanels();
          });
          bindNameMarquee(item, name);
          panel.appendChild(item);
        });
      } catch (err) {
      }
    }
    function hideAudioEditor() {
      stopAudioEditPreview();
      audioEditMask.style.display = "none";
      editingAudioGroupId = null;
      closeAudioSlotPanels();
    }
    var audioEditPreviewEl = null;
    var audioEditPreviewRelease = null;
    var audioEditPreviewTimer = null;
    var audioEditPreviewReady = false;
    var audioEditPreviewPressing = false;
    var audioEditPreviewPressEnded = false;
    var audioEditPreviewReleasePlayed = false;
    function audioEditPreviewEnsure(force) {
      try {
        if (!force && audioEditPreviewReady) return true;
        var pressId = audioEditPressVal || "";
        var releaseId = audioEditReleaseVal || "";
        try {
          stopAudioEditPreview();
        } catch (err) {
        }
        try {
          if (audioEditPreviewEl) {
            audioEditPreviewEl.pause();
            audioEditPreviewEl = null;
          }
          if (audioEditPreviewRelease) {
            audioEditPreviewRelease.pause();
            audioEditPreviewRelease = null;
          }
        } catch (err) {
        }
        if (pressId) {
          audioEditPreviewEl = new Audio("/dsh-whale/audio-fragment.wav?id=" + encodeURIComponent(pressId));
          audioEditPreviewEl.preload = "auto";
          audioEditPreviewEl.volume = soundVol;
        }
        if (releaseId) {
          audioEditPreviewRelease = new Audio("/dsh-whale/audio-fragment.wav?id=" + encodeURIComponent(releaseId));
          audioEditPreviewRelease.preload = "auto";
          audioEditPreviewRelease.volume = soundVol;
        }
        audioEditPreviewReady = true;
        return true;
      } catch (err) {
        return false;
      }
    }
    function audioEditPreviewDown() {
      try {
        stopAudioEditPreview();
        if (!audioEditPreviewEnsure()) return;
        audioEditPreviewPressing = true;
        audioEditPreviewPressEnded = false;
        audioEditPreviewReleasePlayed = false;
        if (!audioEditPreviewEl) {
          audioEditPreviewPressEnded = true;
          return;
        }
        audioEditPreviewEl.onended = function() {
          audioEditPreviewPressEnded = true;
          if (!audioEditPreviewPressing && !audioEditPreviewReleasePlayed) audioEditPreviewUp();
        };
        var p = audioEditPreviewEl.play();
        if (p && typeof p.catch === "function") p.catch(function() {
        });
      } catch (err) {
      }
    }
    function audioEditPreviewUp() {
      try {
        if (!audioEditPreviewPressing) return;
        audioEditPreviewPressing = false;
        if (!audioEditPreviewEl) {
          audioEditPreviewPlayRelease();
          return;
        }
        if (audioEditPreviewPressEnded) {
          audioEditPreviewPlayRelease();
          return;
        }
        var durKnown = false;
        var remainMs = 0;
        try {
          var dur = audioEditPreviewEl ? audioEditPreviewEl.duration : 0;
          if (isFinite(dur) && dur > 0) {
            durKnown = true;
            remainMs = (dur - audioEditPreviewEl.currentTime) * 1e3;
          }
        } catch (err) {
        }
        if (durKnown) {
          audioEditPreviewTimer = setTimeout2(function() {
            audioEditPreviewTimer = null;
            audioEditPreviewPlayRelease();
          }, Math.max(0, remainMs - 100));
        }
      } catch (err) {
      }
    }
    function audioEditPreviewPlayRelease() {
      try {
        if (audioEditPreviewReleasePlayed || !audioEditPreviewRelease) return;
        audioEditPreviewReleasePlayed = true;
        audioEditPreviewRelease.currentTime = 0;
        var p = audioEditPreviewRelease.play();
        if (p && typeof p.catch === "function") p.catch(function() {
        });
      } catch (err) {
      }
    }
    function stopAudioEditPreview() {
      try {
        if (audioEditPreviewTimer) {
          clearTimeout(audioEditPreviewTimer);
          audioEditPreviewTimer = null;
        }
        if (audioEditPreviewEl) {
          audioEditPreviewEl.pause();
          audioEditPreviewEl.currentTime = 0;
        }
        if (audioEditPreviewRelease) {
          audioEditPreviewRelease.pause();
          audioEditPreviewRelease.currentTime = 0;
        }
        audioEditPreviewPressing = false;
        audioEditPreviewPressEnded = false;
        audioEditPreviewReleasePlayed = false;
      } catch (err) {
      }
    }
    function saveAudioGroup() {
      try {
        stopAudioEditPreview();
        var name = (audioEditName.value || "").trim().slice(0, 20);
        if (!name) {
          audioEditName.focus();
          return;
        }
        fetch(AUDIO_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save-group",
            id: editingAudioGroupId || "",
            name,
            // 槽位可显式留空('' = 该事件静音);host 端对空串原样保存
            press: audioEditPressVal || "",
            release: audioEditReleaseVal || ""
          })
        }).then(function(r) {
          return r.json();
        }).then(function(d) {
          if (d && d.ok && Array.isArray(d.groups)) {
            audioGroups = d.groups;
            renderAudioGroupPanel();
            refreshTaskEndAfterAudio();
            if (!editingAudioGroupId) {
              var newest = d.groups.filter(function(x) {
                return !x.preset;
              }).sort(function(a, b) {
                return (b.pinnedAt || 0) - (a.pinnedAt || 0);
              })[0];
              if (newest) setSoundSet(newest.id);
            } else if (soundSet === editingAudioGroupId) {
              try {
                applySoundSet();
              } catch (err) {
              }
            }
            hideAudioEditor();
          }
        }).catch(function() {
        });
      } catch (err) {
      }
    }
    var audioCropFileInput = document2.createElement("input");
    audioCropFileInput.type = "file";
    audioCropFileInput.accept = "audio/*";
    audioCropFileInput.style.display = "none";
    document2.body.appendChild(audioCropFileInput);
    var audioCropTarget = null;
    var audioCropCtx = null;
    var audioCropBuffer = null;
    var audioCropFileBase = "";
    var audioCropZoom = 1;
    var audioCropOffset = 0;
    audioEditPressImport.addEventListener("click", function() {
      audioCropTarget = "press";
      audioCropFileInput.click();
    });
    audioEditReleaseImport.addEventListener("click", function() {
      audioCropTarget = "release";
      audioCropFileInput.click();
    });
    audioCropFileInput.addEventListener("change", function() {
      var f = audioCropFileInput.files && audioCropFileInput.files[0];
      audioCropFileInput.value = "";
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function() {
        openAudioCrop(reader.result, f.name);
      };
      reader.readAsArrayBuffer(f);
    });
    function openAudioCrop(arrayBuf, fileName) {
      try {
        audioCropFileBase = (fileName || "音频片段").replace(/.[^.]+$/, "");
        audioCropZoom = 1;
        audioCropOffset = 0;
        stopAudioCropPreview();
        if (!audioCropCtx) {
          try {
            audioCropCtx = new (window2.AudioContext || window2.webkitAudioContext)();
          } catch (err) {
            audioCropCtx = null;
          }
        }
        if (!audioCropCtx) {
          alert("当前浏览器不支持音频解码");
          return;
        }
        audioCropCtx.decodeAudioData(arrayBuf, function(buf) {
          audioCropBuffer = buf;
          audioCropStart.value = "0";
          audioCropEnd.value = "100";
          audioCropStartNum.max = buf.duration.toFixed(3);
          audioCropEndNum.max = buf.duration.toFixed(3);
          audioCropZoomRange.value = "1";
          audioCropZoomNum.value = "1";
          drawAudioCrop();
          try {
            audioCropName.value = "";
          } catch (err) {
          }
          updateAudioCropOkState();
          audioCropMask.style.display = "flex";
        }, function() {
          alert("音频解码失败");
        });
      } catch (err) {
      }
    }
    function audioCropRange() {
      var b = audioCropBuffer;
      if (!b) return null;
      var s = Number(audioCropStart.value) / 100;
      var e = Number(audioCropEnd.value) / 100;
      if (e < s) {
        var t = s;
        s = e;
        e = t;
      }
      return { start: b.duration * s, end: b.duration * e, s, e };
    }
    function onAudioCropWheel(e) {
      if (!audioCropBuffer) return;
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch (err) {
      }
      var maxOff = Math.max(0, 1 - 1 / audioCropZoom);
      if (maxOff <= 0) return;
      var dx = (e.deltaY || 0) + (e.deltaX || 0);
      if (dx === 0) return;
      var move = dx / audioCropCanvas.width / audioCropZoom;
      audioCropOffset = Math.min(maxOff, Math.max(0, audioCropOffset + move));
      drawAudioCrop();
    }
    function drawAudioCrop(skipSync) {
      try {
        if (!audioCropBuffer) return;
        var r = audioCropRange();
        audioCropTime.textContent = r.start.toFixed(1) + "s – " + r.end.toFixed(1) + "s（共 " + audioCropBuffer.duration.toFixed(1) + "s，缩放 x" + audioCropZoom.toFixed(1) + "）";
        var ctx = audioCropCanvas.getContext("2d");
        var W = audioCropCanvas.width, H = audioCropCanvas.height;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = "#f3f5fb";
        ctx.fillRect(0, 0, W, H);
        var ch = audioCropBuffer.getChannelData(0);
        var totalLen = ch.length;
        var viewStart = audioCropOffset;
        var viewSpan = 1 / audioCropZoom;
        ctx.strokeStyle = "#9fb0d9";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var x = 0; x < W; x++) {
          var g0 = viewStart + x / W * viewSpan;
          var g1 = viewStart + (x + 1) / W * viewSpan;
          var i0 = Math.max(0, Math.floor(g0 * totalLen));
          var i1 = Math.max(i0 + 1, Math.min(totalLen - 1, Math.ceil(g1 * totalLen)));
          var mn = 0, mx = 0;
          for (var i = i0; i < i1; i++) {
            var v = ch[i];
            if (v < mn) mn = v;
            if (v > mx) mx = v;
          }
          var yTop = H / 2 - mx * H / 2;
          var yBot = H / 2 - mn * H / 2;
          ctx.moveTo(x, yTop);
          ctx.lineTo(x, yBot);
        }
        ctx.stroke();
        var vx0 = (r.s - viewStart) / viewSpan * W;
        var vx1 = (r.e - viewStart) / viewSpan * W;
        var drawX0 = Math.max(0, vx0);
        var drawX1 = Math.min(W, vx1);
        if (drawX1 > drawX0) {
          ctx.fillStyle = "rgba(32,49,112,.25)";
          ctx.fillRect(drawX0, 0, drawX1 - drawX0, H);
          ctx.strokeStyle = "#203170";
          ctx.lineWidth = 2;
          ctx.strokeRect(drawX0 + 0.5, 0.5, drawX1 - drawX0, H - 1);
        }
        ctx.strokeStyle = "rgba(32,49,112,.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, H - 1);
        ctx.lineTo(W, H - 1);
        ctx.stroke();
        if (!skipSync) {
          audioCropStartNum.value = r.start.toFixed(3);
          audioCropEndNum.value = r.end.toFixed(3);
          audioCropZoomRange.value = String(audioCropZoom);
          audioCropZoomNum.value = String(Math.round(audioCropZoom * 100) / 100);
        }
        try {
          var trackW = audioCropDual.clientWidth || 200;
          var usable = Math.max(1, trackW - 8);
          audioCropDualStart.style.left = 4 + r.s * usable + "px";
          audioCropDualEnd.style.left = 4 + r.e * usable + "px";
          audioCropDualFill.style.left = 4 + r.s * usable + "px";
          audioCropDualFill.style.width = Math.max(0, (r.e - r.s) * usable) + "px";
        } catch (err) {
        }
      } catch (err) {
      }
    }
    function onAudioCropStartInput() {
      syncAudioCropStartNum();
      drawAudioCrop();
    }
    function syncAudioCropStartNum() {
      var b = audioCropBuffer;
      if (!b) return;
      audioCropStartNum.value = (b.duration * Number(audioCropStart.value) / 100).toFixed(3);
    }
    function onAudioCropEndInput() {
      syncAudioCropEndNum();
      drawAudioCrop();
    }
    function syncAudioCropEndNum() {
      var b = audioCropBuffer;
      if (!b) return;
      audioCropEndNum.value = (b.duration * Number(audioCropEnd.value) / 100).toFixed(3);
    }
    function onAudioCropStartNumInput() {
      var b = audioCropBuffer;
      if (!b) return;
      var v = Number(audioCropStartNum.value);
      if (!isFinite(v)) return;
      v = Math.min(Math.max(0, v), b.duration);
      var endSec = b.duration * Number(audioCropEnd.value) / 100;
      if (v > endSec - 1e-3) v = Math.max(0, endSec - 1e-3);
      audioCropStart.value = String(v / b.duration * 100);
      drawAudioCrop(true);
    }
    function onAudioCropStartNumChange() {
      var b = audioCropBuffer;
      if (!b) return;
      var v = Number(audioCropStartNum.value);
      if (!isFinite(v)) v = 0;
      v = Math.min(Math.max(0, v), b.duration);
      var endSec = b.duration * Number(audioCropEnd.value) / 100;
      if (v > endSec - 1e-3) v = Math.max(0, endSec - 1e-3);
      audioCropStart.value = String(v / b.duration * 100);
      drawAudioCrop();
    }
    function onAudioCropEndNumInput() {
      var b = audioCropBuffer;
      if (!b) return;
      var v = Number(audioCropEndNum.value);
      if (!isFinite(v)) return;
      v = Math.min(Math.max(0, v), b.duration);
      var startSec = b.duration * Number(audioCropStart.value) / 100;
      if (v < startSec + 1e-3) v = Math.min(b.duration, startSec + 1e-3);
      audioCropEnd.value = String(v / b.duration * 100);
      drawAudioCrop(true);
    }
    function onAudioCropEndNumChange() {
      var b = audioCropBuffer;
      if (!b) return;
      var v = Number(audioCropEndNum.value);
      if (!isFinite(v)) v = b.duration;
      v = Math.min(Math.max(0, v), b.duration);
      var startSec = b.duration * Number(audioCropStart.value) / 100;
      if (v < startSec + 1e-3) v = Math.min(b.duration, startSec + 1e-3);
      audioCropEnd.value = String(v / b.duration * 100);
      drawAudioCrop();
    }
    function applyAudioCropZoom(v, skipSync) {
      if (!audioCropBuffer) return;
      var next = Number(v);
      if (!isFinite(next) || next < 1) next = 1;
      if (next > 50) next = 50;
      var r = audioCropRange();
      var mid = (r.s + r.e) / 2;
      var viewSpan = 1 / audioCropZoom;
      var midInView = viewSpan > 0 ? (mid - audioCropOffset) / viewSpan : 0.5;
      audioCropZoom = next;
      var newSpan = 1 / audioCropZoom;
      audioCropOffset = mid - midInView * newSpan;
      audioCropOffset = Math.min(1 - 1 / audioCropZoom, Math.max(0, audioCropOffset));
      audioCropZoomRange.value = String(audioCropZoom);
      audioCropZoomNum.value = String(Math.round(audioCropZoom * 100) / 100);
      drawAudioCrop(skipSync);
    }
    function onAudioCropZoomInput() {
      applyAudioCropZoom(audioCropZoomRange.value);
    }
    function onAudioCropZoomNumInput() {
      var v = Number(audioCropZoomNum.value);
      if (!isFinite(v) || v < 1) return;
      if (v > 50) return;
      applyAudioCropZoom(v, true);
    }
    function onAudioCropZoomNumChange() {
      applyAudioCropZoom(audioCropZoomNum.value);
    }
    var audioCropSelDrag = null;
    function onAudioCropSelDown(e) {
      if (!audioCropBuffer) return;
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch (err) {
      }
      var rect = audioCropCanvas.getBoundingClientRect();
      var W = audioCropCanvas.width;
      var globalRatio = audioCropOffset + (e.clientX - rect.left) / W * (1 / audioCropZoom);
      globalRatio = Math.min(1, Math.max(0, globalRatio));
      audioCropSelDrag = { startRatio: globalRatio, moved: false };
      audioCropStart.value = String(globalRatio * 100);
      syncAudioCropStartNum();
      drawAudioCrop();
    }
    function onAudioCropSelMove(e) {
      if (!audioCropSelDrag || !audioCropBuffer) return;
      var rect = audioCropCanvas.getBoundingClientRect();
      var W = audioCropCanvas.width;
      var globalRatio = audioCropOffset + (e.clientX - rect.left) / W * (1 / audioCropZoom);
      globalRatio = Math.min(1, Math.max(0, globalRatio));
      if (Math.abs(globalRatio - audioCropSelDrag.startRatio) > 2e-3) audioCropSelDrag.moved = true;
      if (audioCropSelDrag.moved) {
        var s = Math.min(audioCropSelDrag.startRatio, globalRatio);
        var en = Math.max(audioCropSelDrag.startRatio, globalRatio);
        audioCropStart.value = String(s * 100);
        audioCropEnd.value = String(en * 100);
        syncAudioCropStartNum();
        syncAudioCropEndNum();
        drawAudioCrop();
      }
    }
    function onAudioCropSelUp() {
      audioCropSelDrag = null;
    }
    var audioCropDualDrag = null;
    function onAudioCropDualDown(e) {
      if (!audioCropBuffer) return;
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch (err) {
      }
      var ratio = audioCropDualRatio(e);
      var startV = Number(audioCropStart.value) / 100;
      var endV = Number(audioCropEnd.value) / 100;
      var dStart = Math.abs(ratio - startV);
      var dEnd = Math.abs(ratio - endV);
      audioCropDualDrag = { side: dStart <= dEnd ? "start" : "end" };
      audioCropDualMoveTo(ratio);
    }
    function onAudioCropDualMove(e) {
      if (!audioCropDualDrag || !audioCropBuffer) return;
      audioCropDualMoveTo(audioCropDualRatio(e));
    }
    function audioCropDualRatio(e) {
      var rect = audioCropDual.getBoundingClientRect();
      var usable = Math.max(1, rect.width - 8);
      var ratio = (e.clientX - rect.left - 4) / usable;
      return Math.min(1, Math.max(0, ratio));
    }
    function audioCropDualMoveTo(ratio) {
      if (!audioCropDualDrag) return;
      var startV = Number(audioCropStart.value) / 100;
      var endV = Number(audioCropEnd.value) / 100;
      if (audioCropDualDrag.side === "start") {
        if (ratio >= endV) ratio = Math.max(0, endV - 1e-4);
        audioCropStart.value = String(ratio * 100);
        syncAudioCropStartNum();
      } else {
        if (ratio <= startV) ratio = Math.min(1, startV + 1e-4);
        audioCropEnd.value = String(ratio * 100);
        syncAudioCropEndNum();
      }
      drawAudioCrop();
    }
    function onAudioCropDualUp() {
      audioCropDualDrag = null;
    }
    function hideAudioCrop() {
      stopAudioCropPreview();
      audioCropMask.style.display = "none";
      audioCropBuffer = null;
      audioCropTarget = null;
      audioCropFileBase = "";
      try {
        audioCropName.value = "";
      } catch (err) {
      }
      updateAudioCropOkState();
    }
    var audioCropPreviewNode = null;
    function stopAudioCropPreview() {
      try {
        if (audioCropPreviewNode) {
          audioCropPreviewNode.stop();
          audioCropPreviewNode.disconnect();
          audioCropPreviewNode = null;
        }
      } catch (err) {
      }
    }
    function previewAudioCrop() {
      try {
        if (!audioCropBuffer || !audioCropCtx) return;
        stopAudioCropPreview();
        var r = audioCropRange();
        var len = Math.floor((r.end - r.start) * audioCropBuffer.sampleRate);
        if (len < 1) return;
        var slice = audioCropCtx.createBuffer(audioCropBuffer.numberOfChannels, len, audioCropBuffer.sampleRate);
        for (var c = 0; c < audioCropBuffer.numberOfChannels; c++) {
          var src = audioCropBuffer.getChannelData(c);
          var dst = slice.getChannelData(c);
          var off = Math.floor(r.start * audioCropBuffer.sampleRate);
          for (var i = 0; i < len; i++) dst[i] = src[off + i] || 0;
        }
        var srcNode = audioCropCtx.createBufferSource();
        srcNode.buffer = slice;
        srcNode.connect(audioCropCtx.destination);
        audioCropPreviewNode = srcNode;
        srcNode.onended = function() {
          if (audioCropPreviewNode === srcNode) audioCropPreviewNode = null;
        };
        srcNode.start();
      } catch (err) {
      }
    }
    function encodeWav(buffer) {
      var numCh = buffer.numberOfChannels;
      var sampleRate = buffer.sampleRate;
      var len = buffer.length;
      var bytesPerSample = 2;
      var blockAlign = numCh * bytesPerSample;
      var dataSize = len * blockAlign;
      var ab = new ArrayBuffer(44 + dataSize);
      var dv = new DataView(ab);
      function writeStr(offset2, s2) {
        for (var i2 = 0; i2 < s2.length; i2++) dv.setUint8(offset2 + i2, s2.charCodeAt(i2));
      }
      writeStr(0, "RIFF");
      dv.setUint32(4, 36 + dataSize, true);
      writeStr(8, "WAVE");
      writeStr(12, "fmt ");
      dv.setUint32(16, 16, true);
      dv.setUint16(20, 1, true);
      dv.setUint16(22, numCh, true);
      dv.setUint32(24, sampleRate, true);
      dv.setUint32(28, sampleRate * blockAlign, true);
      dv.setUint16(32, blockAlign, true);
      dv.setUint16(34, 16, true);
      writeStr(36, "data");
      dv.setUint32(40, dataSize, true);
      var offset = 44;
      for (var i = 0; i < len; i++) {
        for (var c = 0; c < numCh; c++) {
          var v = buffer.getChannelData(c)[i];
          var s = Math.max(-1, Math.min(1, v));
          dv.setInt16(offset, s < 0 ? s * 32768 : s * 32767, true);
          offset += 2;
        }
      }
      return new Blob([ab], { type: "audio/wav" });
    }
    function confirmAudioCrop() {
      try {
        if (!audioCropBuffer) return;
        stopAudioCropPreview();
        var fragName = String(audioCropName.value || "").trim();
        if (!fragName) {
          try {
            audioCropName.style.borderColor = "#e0433f";
            audioCropName.style.boxShadow = "0 0 0 2px rgba(224,67,63,.25)";
            audioCropName.focus();
            setTimeout2(function() {
              audioCropName.style.borderColor = "rgba(32,49,112,.4)";
              audioCropName.style.boxShadow = "none";
            }, 1200);
          } catch (err) {
          }
          return;
        }
        var r = audioCropRange();
        var len = Math.floor((r.end - r.start) * audioCropBuffer.sampleRate);
        if (len < 1) {
          alert("所选片段为空");
          return;
        }
        var slice = audioCropCtx.createBuffer(audioCropBuffer.numberOfChannels, len, audioCropBuffer.sampleRate);
        for (var c = 0; c < audioCropBuffer.numberOfChannels; c++) {
          var src = audioCropBuffer.getChannelData(c);
          var dst = slice.getChannelData(c);
          var off = Math.floor(r.start * audioCropBuffer.sampleRate);
          for (var i = 0; i < len; i++) dst[i] = src[off + i] || 0;
        }
        var blob = encodeWav(slice);
        var reader = new FileReader();
        reader.onload = function() {
          uploadAudioFragment(reader.result, fragName, function(ok) {
            if (ok) {
              if (audioCropTarget === "press") {
                audioEditPressVal = lastUploadedFragmentId || audioEditPressVal;
                audioSlotBtnText(audioEditPressBtn, audioEditPressVal);
              } else if (audioCropTarget === "release") {
                audioEditReleaseVal = lastUploadedFragmentId || audioEditReleaseVal;
                audioSlotBtnText(audioEditReleaseBtn, audioEditReleaseVal);
              }
              var wasResImport = audioCropTarget === "__library__";
              audioEditPreviewEnsure(true);
              hideAudioCrop();
              if (wasResImport) {
                try {
                  openResManager();
                } catch (err) {
                }
              }
            }
          });
        };
        reader.readAsDataURL(blob);
      } catch (err) {
      }
    }
    var lastUploadedFragmentId = null;
    function uploadAudioFragment(dataUrl, name, cb) {
      try {
        fetch(AUDIO_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "upload-fragment", name, audio: dataUrl })
        }).then(function(r) {
          return r.json();
        }).then(function(d) {
          if (d && d.ok && Array.isArray(d.fragments)) {
            audioFragments = d.fragments;
            lastUploadedFragmentId = d.id || null;
            refreshTaskEndAfterAudio();
            if (cb) cb(true);
          } else {
            if (cb) cb(false);
          }
        }).catch(function() {
          if (cb) cb(false);
        });
      } catch (err) {
        if (cb) cb(false);
      }
    }
    function audioDeleteFragmentInSlot(slot, id) {
      if (!id) return;
      var f = null;
      for (var i = 0; i < audioFragments.length; i++) if (audioFragments[i].id === id) {
        f = audioFragments[i];
        break;
      }
      if (!f || f.preset) return;
      showConfirm("确定删除音频「" + f.name + "」吗？", function() {
        try {
          fetch(AUDIO_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete-fragment", id })
          }).then(function(r) {
            return r.json();
          }).then(function(d) {
            if (d && d.ok && Array.isArray(d.fragments)) {
              audioFragments = d.fragments;
              if (Array.isArray(d.groups)) audioGroups = d.groups;
              if (slot === "press" && audioEditPressVal === id) {
                audioEditPressVal = "ya1";
                audioSlotBtnText(audioEditPressBtn, "ya1");
              }
              if (slot === "release" && audioEditReleaseVal === id) {
                audioEditReleaseVal = "ya2";
                audioSlotBtnText(audioEditReleaseBtn, "ya2");
              }
              audioEditPreviewEnsure(true);
              renderAudioGroupPanel();
              if (activeSlotPanel) renderAudioSlotPanel(slot);
              refreshTaskEndAfterAudio();
            }
          }).catch(function() {
          });
        } catch (err) {
        }
      });
    }
    audioEditPressBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      toggleAudioSlotPanel("press");
    });
    audioEditReleaseBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      toggleAudioSlotPanel("release");
    });
    var hitCanvas = null;
    var hitReady = false;
    var hitFailed = false;
    function setupHitTest(url) {
      try {
        hitCanvas = document2.createElement("canvas");
        hitCanvas.width = 610;
        hitCanvas.height = 610;
        hitReady = false;
        hitFailed = false;
        var probe = new Image();
        probe.onload = function() {
          try {
            var ctx = hitCanvas.getContext("2d");
            var iw = probe.width || 610;
            var ih = probe.height || 610;
            var scale = Math.min(610 / iw, 610 / ih);
            var dw = iw * scale;
            var dh = ih * scale;
            var dx = 610 - dw;
            var dy = 610 - dh;
            ctx.drawImage(probe, dx, dy, dw, dh);
            hitReady = true;
          } catch (err) {
            hitFailed = true;
          }
        };
        probe.onerror = function() {
          hitFailed = true;
        };
        probe.src = bridge.asset(url || IMG_URL);
      } catch (err) {
      }
    }
    function isWhaleHit(e) {
      if (!hitCanvas || !hitReady) {
        if (!hitFailed) return false;
        try {
          var fr = img.getBoundingClientRect();
          if (!fr || fr.width <= 0 || fr.height <= 0) return false;
          return e.clientX >= fr.left && e.clientX <= fr.right && e.clientY >= fr.top && e.clientY <= fr.bottom;
        } catch (err) {
          return false;
        }
      }
      try {
        var r = img.getBoundingClientRect();
        if (!r || r.width <= 0 || r.height <= 0) return false;
        var lx = (e.clientX - r.left) / r.width * 610;
        var ly = (e.clientY - r.top) / r.height * 610;
        if (lx < 0 || ly < 0 || lx >= 610 || ly >= 610) return false;
        if (state.flip) lx = 610 - lx;
        var data = hitCanvas.getContext("2d").getImageData(Math.floor(lx), Math.floor(ly), 1, 1).data;
        return data[3] > 10;
      } catch (err) {
        return false;
      }
    }
    function onDocPointerDown(e) {
      if (e.target && e.target.closest) {
        if (e.target.closest(".dshwv-pop") || e.target.closest(".dshwv-menu-btn")) return;
        if (e.target.closest(".dshwv-rolelist") || e.target.closest(".dshwv-audiolist") || e.target.closest(".dshwv-cropmask") || e.target.closest(".dshwv-confirmmask") || e.target.closest(".dshwv-audiomask") || e.target.closest(".dshwv-snapmask") || e.target.closest(".dshwv-bubmask") || e.target.closest(".dshwv-qedit") || e.target.closest(".dshwv-usagepanel") || e.target.closest(".dshwv-usage-mask") || e.target.closest(".dshwv-resmask") || e.target.closest(".dshwv-custmenu") || e.target.closest(".dshwv-custbtn")) return;
        if (e.target.closest(".dshwv-rolebtn") || e.target.closest(".dshwv-audiobtn") || e.target.closest(".dshwv-roleimport") || e.target.closest(".dshwv-audioimport")) return;
        if (e.target.closest(".dshwv-menu")) {
          closeRolePanel();
          closeAudioGroupPanel();
          return;
        }
      }
      var rightMouse = e.pointerType === "mouse" && e.button !== 0;
      if (menuOpen && !rightMouse) {
        closeMenu();
        return;
      }
      if (e.button !== 0 && e.pointerType === "mouse") return;
      if (!isWhaleHit(e)) return;
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch (err) {
      }
      var vp = viewport();
      var rect = root.getBoundingClientRect();
      drag = { active: true, startX: e.clientX, startY: e.clientY, origLeft: rect.left, origTop: rect.top, w: rect.width, h: rect.height, moved: false, vp };
      root.classList.add("dshwv-dragging");
      pressDown();
      setWidgetCursor("grabbing");
      document2.addEventListener("pointermove", onDocPointerMove, true);
      document2.addEventListener("pointerup", onDocPointerUp, true);
      document2.addEventListener("pointercancel", onDocPointerCancel, true);
    }
    function onDocPointerMove(e) {
      if (!drag || !drag.active) return;
      var dx = e.clientX - drag.startX;
      var dy = e.clientY - drag.startY;
      if (dx * dx + dy * dy >= CLICK_SQ) drag.moved = true;
      state.left = clamp(drag.origLeft + dx, 0, Math.max(0, drag.vp.w - drag.w));
      state.top = clamp(drag.origTop + dy, 0, Math.max(0, drag.vp.h - drag.h));
      express();
    }
    function onDocPointerUp(e) {
      try {
        if (isWhaleHit(e)) {
          e.preventDefault();
          e.stopPropagation();
        }
      } catch (err) {
      }
      endDrag(e, true);
    }
    function onDocPointerCancel(e) {
      endDrag(e, false);
    }
    function onDocClickStopper(e) {
      if (e.target && e.target.closest) {
        if (e.target.closest(".dshwv-pop") || e.target.closest(".dshwv-menu") || e.target.closest(".dshwv-menu-btn") || e.target.closest(".dshwv-rolelist") || e.target.closest(".dshwv-cropmask") || e.target.closest(".dshwv-confirmmask") || e.target.closest(".dshwv-audiolist") || e.target.closest(".dshwv-audiomask") || e.target.closest(".dshwv-snapmask") || e.target.closest(".dshwv-bubmask") || e.target.closest(".dshwv-qedit") || e.target.closest(".dshwv-usagepanel") || e.target.closest(".dshwv-usage-mask") || e.target.closest(".dshwv-resmask") || e.target.closest(".dshwv-custmenu") || e.target.closest(".dshwv-custbtn")) return;
      }
      if (!isWhaleHit(e)) return;
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch (err) {
      }
    }
    function onDocContextMenu(e) {
      try {
        if (!menuBtnHide) return;
        if (touchDrag || touchEndedAt > 0 && Date.now() - touchEndedAt < 1500 || longPressRecent()) {
          e.preventDefault();
          return;
        }
        if (e.target && e.target.closest) {
          if (e.target.closest(".dshwv-pop") || e.target.closest(".dshwv-menu") || e.target.closest(".dshwv-menu-btn") || e.target.closest(".dshwv-rolelist") || e.target.closest(".dshwv-audiolist") || e.target.closest(".dshwv-cropmask") || e.target.closest(".dshwv-confirmmask") || e.target.closest(".dshwv-audiomask") || e.target.closest(".dshwv-snapmask") || e.target.closest(".dshwv-bubmask") || e.target.closest(".dshwv-qedit") || e.target.closest(".dshwv-usagepanel") || e.target.closest(".dshwv-usage-mask") || e.target.closest(".dshwv-resmask") || e.target.closest(".dshwv-custmenu") || e.target.closest(".dshwv-custbtn")) return;
        }
        if (!isWhaleHit(e)) return;
        e.preventDefault();
        toggleMenu();
      } catch (err) {
      }
    }
    document2.addEventListener("pointerdown", onDocPointerDown, true);
    document2.addEventListener("click", onDocClickStopper, true);
    document2.addEventListener("contextmenu", onDocContextMenu, true);
    function widgetUiHit(target) {
      if (!target || !target.closest) return false;
      return !!(target.closest(".dshwv-pop") || target.closest(".dshwv-menu") || target.closest(".dshwv-menu-btn") || target.closest(".dshwv-rolelist") || target.closest(".dshwv-audiolist") || target.closest(".dshwv-cropmask") || target.closest(".dshwv-confirmmask") || target.closest(".dshwv-audiomask") || target.closest(".dshwv-snapmask") || target.closest(".dshwv-bubmask") || target.closest(".dshwv-qedit") || target.closest(".dshwv-usagepanel") || target.closest(".dshwv-usage-mask") || target.closest(".dshwv-resmask") || target.closest(".dshwv-custmenu") || target.closest(".dshwv-custbtn") || target.closest(".dshwv-rolebtn") || target.closest(".dshwv-audiobtn") || target.closest(".dshwv-roleimport") || target.closest(".dshwv-audioimport"));
    }
    var touchDrag = null;
    var TOUCH_LONG_PRESS_MS = 1500;
    var TOUCH_LONG_PRESS_SLOP = 10;
    var touchStartPt = null;
    var touchNowPt = null;
    var touchLongPressTimer = null;
    var longPressFiredAt = 0;
    var touchEndedAt = 0;
    function longPressRecent() {
      return longPressFiredAt > 0 && Date.now() - longPressFiredAt < 800;
    }
    function cancelTouchLongPress() {
      if (touchLongPressTimer) {
        clearTimeout(touchLongPressTimer);
        touchLongPressTimer = null;
      }
    }
    function fireTouchLongPressMenu() {
      cancelTouchLongPress();
      longPressFiredAt = Date.now();
      try {
        if (navigator && navigator.vibrate) navigator.vibrate(10);
      } catch (err) {
      }
      try {
        if (drag && drag.active) endDrag({ clientX: touchNowPt ? touchNowPt.x : 0, clientY: touchNowPt ? touchNowPt.y : 0 }, false);
      } catch (err) {
      }
      toggleMenu();
    }
    function onDocTouchStart(e) {
      try {
        if (touchDrag) return;
        if (!e.touches || e.touches.length !== 1) return;
        if (widgetUiHit(e.target)) return;
        var t = e.touches[0];
        if (!isWhaleHit({ clientX: t.clientX, clientY: t.clientY })) return;
        touchDrag = { id: t.identifier };
        touchStartPt = { x: t.clientX, y: t.clientY };
        touchNowPt = { x: t.clientX, y: t.clientY };
        if (menuBtnHide && !menuOpen && Date.now() - menuClosedAt > 600) {
          cancelTouchLongPress();
          touchLongPressTimer = setTimeout2(fireTouchLongPressMenu, TOUCH_LONG_PRESS_MS);
        }
        try {
          e.preventDefault();
        } catch (err) {
        }
        document2.addEventListener("touchmove", onDocTouchMove, { capture: true, passive: false });
        document2.addEventListener("touchend", onDocTouchEnd, true);
        document2.addEventListener("touchcancel", onDocTouchEnd, true);
      } catch (err) {
      }
    }
    function onDocTouchMove(e) {
      if (e.touches && e.touches.length > 1) {
        onDocTouchEnd();
        return;
      }
      try {
        var t = e.touches && e.touches[0];
        if (t) {
          touchNowPt = { x: t.clientX, y: t.clientY };
          if (touchLongPressTimer && touchStartPt) {
            var dx = t.clientX - touchStartPt.x;
            var dy = t.clientY - touchStartPt.y;
            if (dx * dx + dy * dy > TOUCH_LONG_PRESS_SLOP * TOUCH_LONG_PRESS_SLOP) cancelTouchLongPress();
          }
        }
      } catch (err) {
      }
      try {
        e.preventDefault();
      } catch (err) {
      }
    }
    function onDocTouchEnd() {
      cancelTouchLongPress();
      if (touchDrag) touchEndedAt = Date.now();
      touchDrag = null;
      touchStartPt = null;
      touchNowPt = null;
      document2.removeEventListener("touchmove", onDocTouchMove, true);
      document2.removeEventListener("touchend", onDocTouchEnd, true);
      document2.removeEventListener("touchcancel", onDocTouchEnd, true);
    }
    document2.addEventListener("touchstart", onDocTouchStart, { capture: true, passive: false });
    var widgetCursor = "";
    function setWidgetCursor(v) {
      if (v !== widgetCursor) {
        widgetCursor = v;
        try {
          document2.body.style.cursor = v;
        } catch (err) {
        }
      }
    }
    function onDocPointerMoveCursor(e) {
      if (drag && drag.active) {
        setWidgetCursor("grabbing");
        return;
      }
      var el = null;
      try {
        el = document2.elementFromPoint(e.clientX, e.clientY);
      } catch (err) {
      }
      if (el && el.closest && (el.closest(".dshwv-pop") || el.closest(".dshwv-menu") || el.closest(".dshwv-menu-btn") || el.closest(".dshwv-rolelist") || el.closest(".dshwv-cropmask") || el.closest(".dshwv-confirmmask") || el.closest(".dshwv-audiolist") || el.closest(".dshwv-audiomask") || el.closest(".dshwv-snapmask") || el.closest(".dshwv-bubmask") || el.closest(".dshwv-qedit") || el.closest(".dshwv-usagepanel") || el.closest(".dshwv-usage-mask") || el.closest(".dshwv-resmask") || el.closest(".dshwv-custmenu") || el.closest(".dshwv-custbtn"))) {
        setWidgetCursor("");
        if (!menuBtnHide) menuBtn.classList.add("dshwv-menu-btn-visible");
        return;
      }
      var over = isWhaleHit(e);
      setWidgetCursor(over ? "grab" : "");
      var imageRect = img.getBoundingClientRect();
      var buttonRect = menuBtn.getBoundingClientRect();
      var nearMenu = [imageRect, buttonRect].some(function(r) {
        return r.width > 0 && r.height > 0 && e.clientX >= r.left - 6 && e.clientX <= r.right + 6 && e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6;
      });
      if (!menuBtnHide) menuBtn.classList.toggle("dshwv-menu-btn-visible", nearMenu || menuOpen);
    }
    document2.addEventListener("pointermove", onDocPointerMoveCursor, true);
    function endDrag(e, clickAllowed) {
      if (!drag || !drag.active) return;
      drag.active = false;
      document2.removeEventListener("pointermove", onDocPointerMove, true);
      document2.removeEventListener("pointerup", onDocPointerUp, true);
      document2.removeEventListener("pointercancel", onDocPointerCancel, true);
      pressUp();
      root.classList.remove("dshwv-dragging");
      setWidgetCursor(isWhaleHit(e) ? "grab" : "");
      if (clickAllowed && !drag.moved) {
        if (longPressRecent()) return;
        whaleClick();
        refresh(true);
        return;
      }
      var dx = e.clientX - drag.startX;
      var dy = e.clientY - drag.startY;
      var left = clamp(drag.origLeft + dx, 0, Math.max(0, drag.vp.w - drag.w));
      var top = clamp(drag.origTop + dy, 0, Math.max(0, drag.vp.h - drag.h));
      var ac = artCenterAt(left, top, drag.w, drag.h, !!state.flip);
      var z = snapZones(ac.cx, top + drag.h / 2, ac.cy, drag.vp);
      if (z.zH === "left") {
        state.h = "left";
        state.hOff = 0;
      } else if (z.zH === "right") {
        state.h = "right";
        state.hOff = 0;
      } else {
        state.h = null;
        state.hOff = left;
      }
      if (z.zV === "top") {
        state.v = "top";
        state.vOff = 0;
      } else if (z.zV === "bottom") {
        state.v = "bottom";
        state.vOff = 0;
      } else {
        state.v = null;
        state.vOff = top;
      }
      state.flip = z.zH === "left" ? true : z.zH === "right" ? false : z.flip;
      state.left = left;
      state.top = top;
      settle();
      saveConfig();
    }
    function applyAnchorPos() {
      try {
        var a = JSON.parse(localStorage.getItem("dshw-pos") || "null");
        if (!a || a.v !== 2 || a.hAnchor !== "left" && a.hAnchor !== "right" || typeof a.hDist !== "number" || a.vAnchor !== "top" && a.vAnchor !== "bottom" || typeof a.vDist !== "number") return false;
        var vp = viewport();
        var w = root.offsetWidth || root.getBoundingClientRect().width || 0;
        var h = root.offsetHeight || root.getBoundingClientRect().height || 0;
        var effectiveRightDist = a.hAnchor === "right" ? a.hDist + (scrollGapOn ? rightGap() : 0) : a.hDist;
        var l = a.hAnchor === "left" ? a.hDist : vp.w - effectiveRightDist - w;
        var t = a.vAnchor === "top" ? a.vDist : vp.h - a.vDist - h;
        state.left = clamp(l, 0, Math.max(0, vp.w - w));
        state.top = clamp(t, 0, Math.max(0, vp.h - h));
        state.h = a.hAnchor;
        state.hOff = a.hDist;
        state.v = a.vAnchor;
        state.vOff = a.vDist;
        refreshFlip();
        return true;
      } catch (err) {
        return false;
      }
    }
    window2.addEventListener("resize", function() {
      if (state.h === null && state.v === null && applyAnchorPos()) return;
      settle();
    });
    var rect0 = root.getBoundingClientRect();
    state.left = rect0.left;
    state.top = rect0.top;
    express();
    render();
    applySoundSet();
    setupHitTest(initRoleUrl);
    loadRoles();
    loadAudio();
    loadUsageSettings(function() {
      try {
        if (usageSet && usageSet.taskEnd) {
          taskEndToggle.checked = !!usageSet.taskEnd.on;
          taskEndSel.disabled = !usageSet.taskEnd.on;
        }
        fillTaskEndOptions(usageSet && usageSet.taskEnd);
        setTimeout2(function() {
          try {
            if (audioFragments && audioFragments.length) fillTaskEndOptions(usageSet && usageSet.taskEnd);
          } catch (err) {
          }
        }, 1500);
      } catch (err) {
      }
    });
    loadBubbleCfg();
    fetch(SIZE_URL, { cache: "no-store" }).then(function(r) {
      return r.json();
    }).then(function(d) {
      if (d && typeof d.scale === "number" && d.scale >= MIN_SCALE - 0.1 && d.scale <= MAX_SCALE + 0.1) {
        state.scale = d.scale;
        root.style.setProperty("--dshw-scale", String(d.scale));
        scaleInput.value = String(d.scale);
        scaleNumber.value = String(scaleToDisplay(d.scale));
        settle();
      }
      if (d && typeof d.vol === "number") {
        soundVol = d.vol;
        soundOn = soundVol > 0;
        volInput.value = String(soundVol);
        volPct.textContent = Math.round(soundVol * 100) + "%";
        try {
          if (pressAudio) pressAudio.volume = soundVol;
          if (releaseAudio) releaseAudio.volume = soundVol;
        } catch (err) {
        }
      }
      if (d && typeof d.soundSet === "string" && d.soundSet) {
        soundSet = d.soundSet;
        setAudioBtnText(audioGroupName(soundSet));
        applySoundSet();
      }
      if (d && typeof d.usageMode === "string") {
        usageMode = "ledger";
      }
      if (d && typeof d.peakMode === "string" && (d.peakMode === "liangwen" || d.peakMode === "qiangqiang")) {
        window2.__dshwLegacyPeak = d.peakMode;
        maybeBubbleMigratePeak();
      }
      peakMode = "default";
      if (d && typeof d.bubbleOn === "boolean") {
        bubbleOn = d.bubbleOn;
        bubbleToggle.checked = bubbleOn;
      }
      if (d && typeof d.turnCostOn === "boolean") {
        turnCostOn = d.turnCostOn;
        turnCostToggle.checked = turnCostOn;
        turnCostCloseInput.disabled = !turnCostOn;
      }
      if (d && typeof d.turnCostCloseMs === "number") {
        turnCostCloseMs = d.turnCostCloseMs > 0 ? d.turnCostCloseMs : 0;
        turnCostCloseInput.value = String(Math.round(turnCostCloseMs / 1e3));
      }
      if (d && typeof d.scrollGapOn === "boolean") {
        scrollGapOn = d.scrollGapOn;
        scrollGapToggle.checked = scrollGapOn;
        scrollGapInput.disabled = !scrollGapOn;
      }
      if (d && typeof d.scrollGapPx === "number") {
        scrollGapPx = d.scrollGapPx > 0 ? Math.round(d.scrollGapPx) : 0;
        scrollGapInput.value = String(scrollGapPx);
      }
      if (d && typeof d.menuBtnHide === "boolean") {
        menuBtnHide = d.menuBtnHide;
        if (menuHideToggle) menuHideToggle.checked = menuBtnHide;
        applyMenuBtnHideUI();
      }
      try {
        var a = JSON.parse(localStorage.getItem("dshw-pos") || "null");
        if (a && a.v === 2 && (a.hAnchor === "left" || a.hAnchor === "right") && typeof a.hDist === "number" && (a.vAnchor === "top" || a.vAnchor === "bottom") && typeof a.vDist === "number") {
          var vpA = viewport();
          var wA = root.offsetWidth || root.getBoundingClientRect().width || 0;
          var hA = root.offsetHeight || root.getBoundingClientRect().height || 0;
          var effectiveRightDist = a.hAnchor === "right" ? a.hDist + (scrollGapOn ? rightGap() : 0) : a.hDist;
          var lA = a.hAnchor === "left" ? a.hDist : vpA.w - effectiveRightDist - wA;
          var tA = a.vAnchor === "top" ? a.vDist : vpA.h - a.vDist - hA;
          state.left = clamp(lA, 0, Math.max(0, vpA.w - wA));
          state.top = clamp(tA, 0, Math.max(0, vpA.h - hA));
          state.h = a.hAnchor;
          state.hOff = a.hDist;
          state.v = a.vAnchor;
          state.vOff = a.vDist;
          settle();
        }
      } catch (err) {
      }
      refresh(false);
    }).catch(function() {
      refresh(false);
    });
    setInterval(function() {
      refresh(false);
      try {
        loadApiModels(null, true);
      } catch (err) {
      }
    }, REFRESH_MS);
    row7.remove();
    turnCostOn = false;
    bridge.ready({
      menu: menuBox,
      root,
      refresh: function() {
        refresh(true);
        apiModelsNetworkForce = true;
        loadApiModels(null, true);
      },
      openSettings: function() {
        loadApiModels(function() {
          openApiModelPanel("deepseek");
        }, true);
      },
      openMenu: function() {
        if (!menuOpen) toggleMenu();
      }
    });
  }

  // src/audio.js
  function audioResourceURL(file, url) {
    const mime = /\.mp3$/i.test(file) ? "audio/mpeg" : /\.wav$/i.test(file) ? "audio/wav" : "";
    return mime && typeof url === "string" ? url.replace(/^data:[^;,]*(?=[;,])/i, `data:${mime}`) : url;
  }
  function createAudioBridge({ window: window2, asset, status, canPlay }) {
    const playing = /* @__PURE__ */ new Set();
    function stop() {
      for (const audio of playing) {
        audio.pause();
        audio.currentTime = 0;
      }
      playing.clear();
    }
    function Audio(url) {
      const audio = new window2.Audio(asset(url));
      const source = String(url).replace("/dsh-whale/", "");
      const failed = (error) => {
        const message = error?.name === "NotAllowedError" ? "浏览器阻止播放，请点击角色重试并检查网站声音权限" : error?.message || "音频加载失败";
        status.state = "播放失败";
        status.source = source;
        status.error = message;
        console.warn("[DeepSeek Whale] 音效播放失败", source, message);
      };
      audio.addEventListener("error", () => failed(audio.error));
      audio.addEventListener("playing", () => {
        playing.add(audio);
        Object.assign(status, { state: "播放中", source, error: "" });
      });
      audio.addEventListener("pause", () => playing.delete(audio));
      audio.addEventListener("ended", () => {
        playing.delete(audio);
        Object.assign(status, { state: "播放完成", source, error: "" });
      });
      const play = audio.play.bind(audio);
      audio.play = function() {
        if (!canPlay()) return Promise.resolve();
        playing.add(audio);
        try {
          return play().catch((error) => {
            playing.delete(audio);
            if (error.name !== "AbortError") failed(error);
            throw error;
          });
        } catch (error) {
          playing.delete(audio);
          failed(error);
          throw error;
        }
      };
      return audio;
    }
    return { Audio, stop };
  }

  // src/display.js
  function displayKeys(hostname) {
    return { global: "display:global", site: `display:site:${hostname}`, deepseek: "display:deepseek" };
  }
  function displaySettings(store, hostname) {
    const keys = displayKeys(hostname);
    const global = store.get(keys.global, false) === true;
    const site = store.get(keys.site, false) === true;
    const deepseek = store.get(keys.deepseek, true) === true;
    const isDeepSeek = hostname === "deepseek.com" || hostname.endsWith(".deepseek.com");
    const sources = [global && "全网站", site && "本站", deepseek && isDeepSeek && "DeepSeek 网站"].filter(Boolean);
    return { global, site, deepseek, isDeepSeek, enabled: sources.length > 0, sources };
  }
  var displayLabels = { global: "全网站显示", site: "本站显示", deepseek: "DeepSeek 网站显示" };

  // src/main.js
  var nativeDocument = document;
  var nativeWindow = window;
  var hostId = "deepseek-whale-userjs";
  var prefix = "deepseek-whale-userjs:v1:";
  var startup = {
    version: "1.0.0",
    stage: "入口",
    error: "",
    http: typeof HTTPSend,
    resourceCount: 0,
    imageReady: false,
    audio: { state: "未播放", source: "", error: "" }
  };
  if (window.top === window && ["http:", "https:"].includes(location.protocol) && !nativeDocument.getElementById(hostId)) {
    console.info("[DeepSeek Whale] 用户脚本入口已执行", startup.version);
    try {
      GM_registerMenuCommand("🩺 查看小鲸鱼运行状态", () => {
        nativeWindow.alert(JSON.stringify({
          ...startup,
          page: location.origin + location.pathname,
          mounted: !!nativeDocument.getElementById(hostId),
          hidden: !startup.display?.enabled
        }, null, 2));
      });
      start();
    } catch (error) {
      reportStartupError(error);
    }
  }
  function reportStartupError(error) {
    startup.error = String(error?.message || error);
    console.error(`[DeepSeek Whale] ${startup.stage}失败`, error);
    const notice = nativeDocument.createElement("div");
    notice.id = hostId + "-error";
    notice.style.cssText = "all:initial;position:fixed;right:12px;bottom:12px;z-index:2147483647;padding:12px;border:1px solid #b91c1c;border-radius:8px;background:#fff;color:#991b1b;font:13px/1.5 Arial,sans-serif;max-width:320px;";
    notice.textContent = "小鲸鱼启动失败：" + startup.error + "。请通过脚本菜单「查看小鲸鱼运行状态」获取详情。";
    nativeDocument.documentElement.appendChild(notice);
  }
  function start() {
    startup.stage = "显示设置初始化";
    const store = {
      get(key, fallback) {
        return GM_getValue(prefix + key, fallback);
      },
      set(key, value) {
        GM_setValue(prefix + key, value);
      },
      remove(key) {
        GM_deleteValue(prefix + key);
      }
    };
    const keys = displayKeys(location.hostname);
    const commands = [], listeners = [];
    let widget = null, ended = false;
    function changeDisplay(name, value) {
      store.set(keys[name], value);
      sync();
    }
    function sync() {
      if (ended) return;
      const settings = displaySettings(store, location.hostname);
      startup.display = settings;
      commands.splice(0).forEach((id) => GM_unregisterMenuCommand(id));
      for (const name of Object.keys(keys)) {
        const label = `${settings[name] ? "✅" : "⬜"} ${displayLabels[name]}${name === "site" ? `（${location.hostname}）` : ""}`;
        commands.push(GM_registerMenuCommand(label, () => changeDisplay(name, !displaySettings(store, location.hostname)[name])));
      }
      if (!settings.enabled) {
        widget?.dispose();
        widget = null;
        startup.stage = "显示已关闭";
        startup.imageReady = false;
        nativeDocument.getElementById(hostId + "-error")?.remove();
        return;
      }
      if (!widget) {
        startup.error = "";
        nativeDocument.getElementById(hostId + "-error")?.remove();
        try {
          widget = mountWidgetHost(store, changeDisplay);
        } catch (error) {
          nativeDocument.getElementById(hostId)?.remove();
          reportStartupError(error);
        }
      }
      widget?.updateDisplay(settings);
    }
    if (typeof GM_addValueChangeListener === "function") {
      for (const key of Object.values(keys)) listeners.push(GM_addValueChangeListener(prefix + key, (_key, _old, _value, remote) => {
        if (remote) sync();
      }));
    }
    const onVisible = () => {
      if (!nativeDocument.hidden) sync();
    };
    nativeDocument.addEventListener("visibilitychange", onVisible);
    nativeWindow.addEventListener("pagehide", (event) => {
      if (event.persisted) return;
      ended = true;
      widget?.dispose();
      commands.forEach((id) => GM_unregisterMenuCommand(id));
      if (typeof GM_removeValueChangeListener === "function") listeners.forEach((id) => GM_removeValueChangeListener(id));
      nativeDocument.removeEventListener("visibilitychange", onVisible);
    }, { once: true });
    sync();
  }
  function mountWidgetHost(store, changeDisplay) {
    startup.stage = "HTTPSend 加载检查";
    if (typeof HTTPSend !== "function") {
      throw new Error("HTTPSend @require 未加载，请检查脚本管理器中的外部资源下载状态");
    }
    startup.stage = "GM 存储与资源初始化";
    const files = [
      "DSniang1.png",
      "Ya1.mp3",
      "Ya2.mp3",
      "D1.mp3",
      "D2.mp3",
      "minecraft-exp-orb.wav",
      "task-end-a.wav",
      "bubble-petpet.gif",
      "bubble-money1.gif"
    ];
    const resources = Object.fromEntries(files.map((file) => {
      try {
        return [file, audioResourceURL(file, GM_getResourceURL(file.replaceAll(".", "_").replaceAll("-", "_")))];
      } catch {
        return [file, ""];
      }
    }));
    startup.resourceCount = Object.values(resources).filter(Boolean).length;
    const service = new WhaleService({ store, request: HTTPSend, resources });
    const audioBridge = createAudioBridge({
      window: nativeWindow,
      asset: (url) => service.asset(url),
      status: startup.audio,
      canPlay: () => !disposed
    });
    startup.stage = "Shadow DOM 与样式初始化";
    const host = nativeDocument.createElement("div");
    host.id = hostId;
    host.style.cssText = "all:initial!important;position:fixed!important;inset:0!important;z-index:2147483000!important;pointer-events:none!important;isolation:isolate!important;";
    const shadow = host.attachShadow({ mode: "closed" });
    const mount = nativeDocument.createElement("div");
    mount.style.cssText = 'font:14px Arial,"Microsoft YaHei",sans-serif;color:#203170;line-height:normal;pointer-events:none;';
    shadow.appendChild(mount);
    nativeDocument.documentElement.appendChild(host);
    const styleMap = /* @__PURE__ */ new Map();
    const head = {
      appendChild(style) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(style.textContent);
        styleMap.set(style, sheet);
        shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
        return style;
      },
      removeChild(style) {
        const sheet = styleMap.get(style);
        shadow.adoptedStyleSheets = shadow.adoptedStyleSheets.filter((item) => item !== sheet);
        styleMap.delete(style);
        return style;
      }
    };
    head.appendChild(Object.assign(nativeDocument.createElement("style"), { textContent: ':host{color-scheme:light}*,*::before,*::after{box-sizing:border-box}button,input,select,textarea{font:inherit}button,input,select,textarea,a,[class*="mask"],[class*="panel"],[class*="list"],[class*="window"]{pointer-events:auto}button{touch-action:manipulation}.dshwv-menu{max-height:90vh;overflow-y:auto}.dshwv-usage-window,.dshwv-bubwin,.dshwv-itemwin,.dshwv-modulewin{max-width:96vw!important;max-height:94vh!important;overflow:auto}.whale-user-note{font-size:11px;white-space:normal;line-height:1.5;color:#64748b;margin:7px 0}.whale-user-button{width:100%;border:0;border-radius:6px;padding:7px;background:#203170;color:white;cursor:pointer;margin:3px 0}' }));
    const closedSurfaces = [
      ".dshwv-menu:not(.dshwv-menu-open)",
      ".dshwv-menu-btn:not(.dshwv-menu-btn-visible)",
      ".dshwv-menu-btn.dshwv-menu-btn-hidden",
      ".dshwv-pop:not(.dshwv-pop-open)"
    ];
    head.appendChild(Object.assign(nativeDocument.createElement("style"), { textContent: closedSurfaces.flatMap((selector) => [selector, `${selector} *`]).join(",") + "{visibility:hidden!important;pointer-events:none!important}" }));
    let hooks, disposed = false;
    const displayInputs = /* @__PURE__ */ new Map();
    let displayNote;
    const intervalIds = /* @__PURE__ */ new Set(), timeoutIds = /* @__PURE__ */ new Set(), subscriptions = [], commands = [];
    const facadeListeners = [];
    const documentFacade = new Proxy(nativeDocument, {
      get(target, key) {
        if (key === "body") return mount;
        if (key === "head") return head;
        if (key === "documentElement") return host;
        if (key === "activeElement") return shadow.activeElement;
        if (key === "querySelector" || key === "querySelectorAll") return shadow[key].bind(shadow);
        if (key === "getElementById") return (id) => shadow.getElementById(id) || [...styleMap.keys()].find((style) => style.id === id) || null;
        if (key === "elementFromPoint") return (x, y) => shadow.elementFromPoint(x, y) || target.elementFromPoint(x, y);
        if (key === "addEventListener") return (type, listener, options) => {
          const capture = typeof options === "boolean" ? options : !!options?.capture;
          if (facadeListeners.some((item) => item.type === type && item.listener === listener && item.capture === capture)) return;
          const outside = (event) => {
            if (!disposed && !event.composedPath().includes(host)) listener(event);
          };
          const inside = (event) => {
            if (!disposed) listener(event);
          };
          target.addEventListener(type, outside, options);
          shadow.addEventListener(type, inside, options);
          facadeListeners.push({ type, listener, options, capture, outside, inside });
        };
        if (key === "removeEventListener") return (type, listener, options) => {
          const capture = typeof options === "boolean" ? options : !!options?.capture;
          const index = facadeListeners.findIndex((item2) => item2.type === type && item2.listener === listener && item2.capture === capture);
          if (index < 0) return;
          const item = facadeListeners.splice(index, 1)[0];
          target.removeEventListener(type, item.outside, capture);
          shadow.removeEventListener(type, item.inside, capture);
        };
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    const windowState = /* @__PURE__ */ new Map();
    const windowFacade = new Proxy({}, {
      get(_, key) {
        const target = nativeWindow;
        if (typeof key === "string" && key.startsWith("__dsh")) return windowState.get(key);
        if (key === "document") return documentFacade;
        if (key === "addEventListener") return (type, listener, options) => {
          target.addEventListener(type, listener, options);
          subscriptions.push(() => target.removeEventListener(type, listener, options));
        };
        const value = Reflect.get(target, key, target);
        return ["getComputedStyle", "open", "removeEventListener"].includes(key) ? value.bind(target) : value;
      },
      set(_, key, value) {
        windowState.set(key, value);
        return true;
      }
    });
    function asset(value) {
      return service.asset(value);
    }
    const bridge = {
      document: documentFacade,
      window: windowFacade,
      asset,
      storage: {
        getItem(key) {
          return store.get(`local:${location.hostname}:${key}`, null);
        },
        setItem(key, value) {
          store.set(`local:${location.hostname}:${key}`, String(value));
        },
        removeItem(key) {
          store.remove(`local:${location.hostname}:${key}`);
        }
      },
      async fetch(url, options) {
        const response = await service.fetch(url, options);
        if (options?.method === "POST" && url.endsWith("api-models.json")) {
          bridge.setTimeout(() => hooks?.refresh(), 0);
        }
        return response;
      },
      Audio: audioBridge.Audio,
      setInterval(callback, ms) {
        const id = nativeWindow.setInterval(() => {
          if (!nativeDocument.hidden && !disposed) callback();
        }, ms);
        intervalIds.add(id);
        return id;
      },
      clearInterval(id) {
        nativeWindow.clearInterval(id);
        intervalIds.delete(id);
      },
      setTimeout(callback, ms) {
        const id = nativeWindow.setTimeout(() => {
          timeoutIds.delete(id);
          if (!disposed) callback();
        }, ms);
        timeoutIds.add(id);
        return id;
      },
      clearTimeout(id) {
        nativeWindow.clearTimeout(id);
        timeoutIds.delete(id);
      },
      ready(value) {
        hooks = value;
        startup.stage = "运行中";
        const roleImage = shadow.querySelector(".dshwv-img");
        startup.imageReady = !!roleImage?.naturalWidth;
        roleImage?.addEventListener("load", () => {
          startup.imageReady = true;
        });
        roleImage?.addEventListener("error", () => {
          startup.imageReady = false;
          console.error("[DeepSeek Whale] 角色图片加载失败，请检查 GM resource 下载状态");
        });
        const button = nativeDocument.createElement("button");
        button.type = "button";
        button.className = "whale-user-button";
        button.textContent = "API 密钥 / 余额";
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          hooks.openSettings();
        });
        const note = nativeDocument.createElement("div");
        note.className = "whale-user-note";
        note.textContent = "显示 API 账户余额，不代表网页会员额度。今日已用为脚本运行期间观测到的余额下降额。";
        hooks.menu.prepend(button, note);
        for (const [name, text] of Object.entries(displayLabels)) {
          const label = nativeDocument.createElement("label");
          label.style.cssText = "display:flex;align-items:center;gap:6px;margin:7px 0;cursor:pointer;";
          const input = nativeDocument.createElement("input");
          input.type = "checkbox";
          input.dataset.whaleDisplay = name;
          input.addEventListener("change", () => changeDisplay(name, input.checked));
          displayInputs.set(name, input);
          label.append(input, nativeDocument.createTextNode(text));
          hooks.menu.appendChild(label);
        }
        displayNote = nativeDocument.createElement("div");
        displayNote.className = "whale-user-note";
        hooks.menu.appendChild(displayNote);
      }
    };
    function command(label, handler) {
      commands.push(GM_registerMenuCommand(label, handler));
    }
    command("🔑 设置 DeepSeek API 密钥", () => hooks?.openSettings());
    command("🔄 刷新余额", () => hooks?.refresh());
    command("📒 导出余额观测记录（不含密钥）", () => {
      const ledgers = Object.fromEntries(GM_listValues().filter((key) => key.startsWith(prefix + "ledger:")).map((key) => [key.slice(prefix.length), GM_getValue(key)]));
      const blob = new Blob([JSON.stringify({ version: 1, exportedAt: (/* @__PURE__ */ new Date()).toISOString(), ledgers }, null, 2)], { type: "application/json" });
      const link = nativeDocument.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "deepseek-whale-ledger.json";
      link.click();
      bridge.setTimeout(() => URL.revokeObjectURL(link.href), 1e3);
    });
    const onVisible = () => {
      if (!nativeDocument.hidden) hooks?.refresh();
    };
    nativeDocument.addEventListener("visibilitychange", onVisible);
    subscriptions.push(() => nativeDocument.removeEventListener("visibilitychange", onVisible));
    function dispose() {
      if (disposed) return;
      disposed = true;
      audioBridge.stop();
      service.dispose();
      for (const id of intervalIds) nativeWindow.clearInterval(id);
      for (const id of timeoutIds) nativeWindow.clearTimeout(id);
      for (const item of facadeListeners) {
        nativeDocument.removeEventListener(item.type, item.outside, item.capture);
        shadow.removeEventListener(item.type, item.inside, item.capture);
      }
      subscriptions.forEach((unsubscribe) => unsubscribe());
      commands.forEach((id) => GM_unregisterMenuCommand(id));
      host.remove();
    }
    startup.stage = "组件初始化";
    try {
      createWidget(bridge);
    } catch (error) {
      dispose();
      throw error;
    }
    return {
      dispose,
      updateDisplay(settings) {
        for (const [name, input] of displayInputs) input.checked = settings[name];
        displayNote.textContent = "任一开关符合当前网站时显示。当前来源：" + settings.sources.join("、");
      }
    };
  }
})();
