// ==UserScript==
// @name         Tug Injector - 浏览器插件上架助手
// @namespace    https://github.com/user/tug
// @version      0.1.0
// @description  从本地 tug dock 服务拉取数据，自动填充应用商店上架表单
// @match        https://chrome.google.com/webstore/devconsole/*
// @match        https://chromewebstore.google.com/u/*/edit/*
// @match        https://partner.microsoft.com/en-us/dashboard/microsoftedge/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ===================== 配置 =====================
  const TUG_API = 'http://127.0.0.1:4321';
  const TUG_DATA_ENDPOINT = `${TUG_API}/api/tug-data`;
  const TUG_HEALTH_ENDPOINT = `${TUG_API}/api/health`;
  const TUG_PULL_ENDPOINT = `${TUG_API}/api/tug-pull`;

  // ===================== 工具函数 =====================

  /**
   * 绕过 React/Angular 虚拟 DOM，设置原生值
   * 直接设置 value 无法触发框架的状态更新，
   * 必须通过原型链上的 setter 并手动派发事件
   */
  function setNativeValue(element, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (valueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
      valueSetter.call(element, value);
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  /**
   * 等待元素出现在 DOM 中
   */
  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`等待元素超时: ${selector}`));
      }, timeout);
    });
  }

  /**
   * 延迟执行
   */
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 通过 GM_xmlhttpRequest 发起跨域请求（绕过页面 CSP 限制）
   */
  function tugFetch(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'json',
        onload: (res) => {
          if (res.status === 200) {
            resolve(res.response);
          } else {
            reject(new Error(`请求失败: ${res.status}`));
          }
        },
        onerror: (err) => reject(new Error(`网络错误: ${err.error || '无法连接本地服务'}`)),
      });
    });
  }

  /**
   * 通过 GM_xmlhttpRequest 发送 POST 请求（用于回传数据）
   */
  function tugPost(url, data) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(data),
        responseType: 'json',
        onload: (res) => {
          if (res.status === 200) {
            resolve(res.response);
          } else {
            reject(new Error(`请求失败: ${res.status} - ${res.response?.error || ''}`));
          }
        },
        onerror: (err) => reject(new Error(`网络错误: ${err.error || '无法连接本地服务'}`)),
      });
    });
  }

  // ===================== 浮动控制台 UI =====================

  function createFloatingPanel() {
    GM_addStyle(`
      #tug-panel {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 99999;
        background: #1a1a2e;
        color: #e0e0e0;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        min-width: 280px;
        overflow: hidden;
        transition: all 0.3s ease;
      }

      #tug-panel .tug-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: #16213e;
        cursor: move;
        user-select: none;
      }

      #tug-panel .tug-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: #00d2ff;
      }

      #tug-panel .tug-status {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-right: 8px;
      }

      #tug-panel .tug-status.connected { background: #00e676; }
      #tug-panel .tug-status.disconnected { background: #ff5252; }
      #tug-panel .tug-status.loading { background: #ffab40; animation: tug-pulse 1s infinite; }

      @keyframes tug-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }

      #tug-panel .tug-body {
        padding: 12px 16px;
      }

      #tug-panel .tug-btn {
        display: block;
        width: 100%;
        padding: 10px 16px;
        margin-bottom: 8px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.2s;
      }

      #tug-panel .tug-btn-primary {
        background: linear-gradient(135deg, #00d2ff, #3a7bd5);
        color: white;
      }

      #tug-panel .tug-btn-primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 210, 255, 0.3);
      }

      #tug-panel .tug-btn-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      #tug-panel .tug-btn-secondary {
        background: #2a2a4a;
        color: #b0b0b0;
      }

      #tug-panel .tug-btn-secondary:hover {
        background: #3a3a5a;
      }

      #tug-panel .tug-log {
        max-height: 150px;
        overflow-y: auto;
        margin-top: 8px;
        padding: 8px;
        background: #0d1117;
        border-radius: 6px;
        font-family: 'Fira Code', 'Cascadia Code', monospace;
        font-size: 11px;
        line-height: 1.6;
      }

      #tug-panel .tug-log-entry { color: #8b949e; }
      #tug-panel .tug-log-entry.success { color: #3fb950; }
      #tug-panel .tug-log-entry.error { color: #f85149; }
      #tug-panel .tug-log-entry.info { color: #58a6ff; }
    `);

    const panel = document.createElement('div');
    panel.id = 'tug-panel';
    panel.innerHTML = `
      <div class="tug-header">
        <h3><span class="tug-status disconnected" id="tug-status-dot"></span>Tug 控制台</h3>
        <span style="cursor:pointer;font-size:18px;color:#666" id="tug-minimize">─</span>
      </div>
        <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
          <label style="font-size: 11px; color: #8b949e; white-space: nowrap;">当前语言:</label>
          <input type="text" id="tug-locale-override" placeholder="自动检测 (如 zh_CN)" style="flex: 1; background: #0d1117; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; padding: 3px 6px; font-size: 11px;">
        </div>
        <button class="tug-btn tug-btn-primary" id="tug-fill-btn" disabled>⚓ Tug in (填入当前语言)</button>
        <button class="tug-btn tug-btn-primary" id="tug-pull-btn" disabled style="background: linear-gradient(135deg, #f093fb, #f5576c);">📤 Tug out (读出当前语言)</button>
        <button class="tug-btn tug-btn-secondary" id="tug-batch-pull-btn" disabled style="color: #a5d6ff;">🌐 批量扫描并回传多语言</button>
        <button class="tug-btn tug-btn-secondary" id="tug-check-btn">🔍 检查连接</button>
        <div class="tug-log" id="tug-log"></div>
      </div>
    `;

    document.body.appendChild(panel);

    // 最小化/展开
    let minimized = false;
    document.getElementById('tug-minimize').addEventListener('click', () => {
      const body = document.getElementById('tug-body');
      minimized = !minimized;
      body.style.display = minimized ? 'none' : 'block';
    });

    return panel;
  }

  // ===================== 日志系统 =====================

  function log(message, type = 'info') {
    const logEl = document.getElementById('tug-log');
    if (!logEl) return;

    const entry = document.createElement('div');
    entry.className = `tug-log-entry ${type}`;
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    entry.textContent = `[${time}] ${message}`;
    logEl.appendChild(entry);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ===================== 状态管理 =====================

  function setStatus(status) {
    const dot = document.getElementById('tug-status-dot');
    if (dot) {
      dot.className = `tug-status ${status}`;
    }
  }

  // ===================== Chrome Web Store 填充逻辑 =====================

  /**
   * 检测当前页面是哪个商店
   */
  function detectStore() {
    const url = window.location.href;
    if (url.includes('chrome.google.com') || url.includes('chromewebstore.google.com')) {
      return 'chrome';
    }
    if (url.includes('partner.microsoft.com')) {
      return 'edge';
    }
    return 'unknown';
  }

  /**
   * Chrome Web Store 表单填充
   */
  async function fillChromeWebStore(data) {
    const { scheme } = data;
    log('开始填充 Chrome Web Store 表单...', 'info');

    const defaultLocale = scheme.locales.en || Object.values(scheme.locales)[0];
    if (!defaultLocale) {
      log('未找到可用的语言数据', 'error');
      return;
    }

    // 填充描述字段
    const textareas = document.querySelectorAll('textarea');
    const inputs = document.querySelectorAll('input[type="text"]');

    for (const textarea of textareas) {
      const label = textarea.getAttribute('aria-label') || '';
      const placeholder = textarea.getAttribute('placeholder') || '';
      const context = (label + placeholder).toLowerCase();

      if (context.includes('description') || context.includes('detailed description')) {
        setNativeValue(textarea, defaultLocale.description);
        log('✓ 已填充: 详细描述', 'success');
        await sleep(300);
      }
    }

    for (const input of inputs) {
      const label = input.getAttribute('aria-label') || '';
      const placeholder = input.getAttribute('placeholder') || '';
      const context = (label + placeholder).toLowerCase();

      if (context.includes('short description') || context.includes('summary')) {
        setNativeValue(input, defaultLocale.short_description);
        log('✓ 已填充: 简短描述', 'success');
        await sleep(200);
      }
    }

    log('Chrome Web Store 填充完成（部分字段可能需要手动调整）', 'info');
  }

  /**
   * Edge Partner Center 表单填充
   */
  async function fillEdgePartnerCenter(data) {
    const { scheme } = data;
    log('开始填充 Edge Partner Center 表单...', 'info');

    const defaultLocale = scheme.locales.en || Object.values(scheme.locales)[0];
    if (!defaultLocale) {
      log('未找到可用的语言数据', 'error');
      return;
    }

    const allInputs = document.querySelectorAll('input, textarea');

    for (const el of allInputs) {
      const name = el.getAttribute('name') || '';
      const id = el.id || '';
      const context = (name + id).toLowerCase();

      if (context.includes('description')) {
        setNativeValue(el, defaultLocale.description);
        log('✓ 已填充: 描述', 'success');
        await sleep(200);
      } else if (context.includes('shortdescription') || context.includes('summary')) {
        setNativeValue(el, defaultLocale.short_description);
        log('✓ 已填充: 简短描述', 'success');
        await sleep(200);
      }
    }

    // 填充隐私政策 URL
    if (scheme.global.privacy_policy_url) {
      const privacyInputs = document.querySelectorAll('input[type="url"], input[type="text"]');
      for (const input of privacyInputs) {
        const context = ((input.getAttribute('name') || '') + (input.id || '')).toLowerCase();
        if (context.includes('privacy')) {
          setNativeValue(input, scheme.global.privacy_policy_url);
          log('✓ 已填充: 隐私政策 URL', 'success');
          await sleep(200);
          break;
        }
      }
    }

    log('Edge Partner Center 填充完成（部分字段可能需要手动调整）', 'info');
  }

  /**
   * 多语言切换填充
   */
  async function fillMultipleLocales(data) {
    const { scheme } = data;
    const localeKeys = Object.keys(scheme.locales);

    if (localeKeys.length <= 1) {
      log('仅有一种语言，无需切换', 'info');
      return;
    }

    log(`检测到 ${localeKeys.length} 种语言: ${localeKeys.join(', ')}`, 'info');
    log('多语言自动切换功能正在开发中，请手动切换语言后重新点击填入。', 'info');

    // TODO: 实现自动语言切换
    // 需要根据具体商店页面的语言选择器 DOM 结构来实现
    // 使用 MutationObserver 监听语言切换后的 DOM 变化
  }

  // ===================== DOM 回读逻辑 (Tug out) =====================

  /**
   * 从 Chrome Web Store 后台读取当前表单值
   */
  function readChromeWebStore() {
    const fields = {};

    const textareas = document.querySelectorAll('textarea');
    const inputs = document.querySelectorAll('input[type="text"]');

    for (const textarea of textareas) {
      const label = textarea.getAttribute('aria-label') || '';
      const placeholder = textarea.getAttribute('placeholder') || '';
      const context = (label + placeholder).toLowerCase();

      if ((context.includes('description') || context.includes('detailed description')) && textarea.value) {
        fields.description = textarea.value.trim();
      }
    }

    for (const input of inputs) {
      const label = input.getAttribute('aria-label') || '';
      const placeholder = input.getAttribute('placeholder') || '';
      const context = (label + placeholder).toLowerCase();

      if ((context.includes('short description') || context.includes('summary')) && input.value) {
        fields.short_description = input.value.trim();
      }
      if (context.includes('name') && !context.includes('description') && input.value) {
        fields.name = input.value.trim();
      }
    }

    // 尝试读取隐私政策等 URL 字段
    const urlInputs = document.querySelectorAll('input[type="url"], input[type="text"]');
    for (const input of urlInputs) {
      const context = ((input.getAttribute('aria-label') || '') + (input.getAttribute('placeholder') || '')).toLowerCase();
      if (context.includes('privacy') && input.value) {
        fields.privacy_policy_url = input.value.trim();
      }
      if (context.includes('homepage') || context.includes('home page') || context.includes('website')) {
        if (input.value) fields.home_page_url = input.value.trim();
      }
      if (context.includes('support') && context.includes('email') && input.value) {
        fields.support_email = input.value.trim();
      }
    }

    return fields;
  }

  /**
   * 从 Edge Partner Center 后台读取当前表单值
   */
  function readEdgePartnerCenter() {
    const fields = {};

    const allInputs = document.querySelectorAll('input, textarea');

    for (const el of allInputs) {
      const name = el.getAttribute('name') || '';
      const id = el.id || '';
      const context = (name + id).toLowerCase();

      if (context.includes('description') && !context.includes('short') && el.value) {
        fields.description = el.value.trim();
      } else if ((context.includes('shortdescription') || context.includes('summary')) && el.value) {
        fields.short_description = el.value.trim();
      } else if (context.includes('name') && !context.includes('description') && el.value) {
        fields.name = el.value.trim();
      } else if (context.includes('privacy') && el.value) {
        fields.privacy_policy_url = el.value.trim();
      } else if (context.includes('support') && context.includes('email') && el.value) {
        fields.support_email = el.value.trim();
      } else if ((context.includes('homepage') || context.includes('website')) && el.value) {
        fields.home_page_url = el.value.trim();
      }
    }

    return fields;
  }

  /**
   * 处理 Tug out (读出) 操作
   */
  async function handlePull() {
    const btn = document.getElementById('tug-pull-btn');
    btn.disabled = true;
    btn.textContent = '⏳ 正在读取...';
    setStatus('loading');

    try {
      const store = detectStore();
      log(`正在从 ${store} 后台读取表单数据...`, 'info');

      let fields;
      switch (store) {
        case 'chrome':
          fields = readChromeWebStore();
          break;
        case 'edge':
          fields = readEdgePartnerCenter();
          break;
        default:
          fields = readChromeWebStore();
      }

      const fieldCount = Object.keys(fields).length;
      if (fieldCount === 0) {
        log('未在页面上读取到任何表单数据', 'error');
        setStatus('connected');
        return;
      }

      log(`✓ 读取到 ${fieldCount} 个字段`, 'success');
      Object.entries(fields).forEach(([k, v]) => {
        const preview = String(v).length > 40 ? String(v).substring(0, 40) + '...' : v;
        log(`  ${k}: ${preview}`, 'info');
      });

      // 检测当前语言 (优先用户手动输入，其次自动识别)
      const locale = detectCurrentLocale();

      const pullData = {
        store,
        locale,
        fields,
      };

      log(`正在回传数据到 tug pull (locale: ${locale})...`, 'info');
      await tugPost(TUG_PULL_ENDPOINT, pullData);
      log(`✓ [${locale}] 数据已成功回传并写入 tug.yml`, 'success');
      log('🎉 Tug out 完成', 'success');

      setStatus('connected');
    } catch (err) {
      setStatus('disconnected');
      log(`✗ 读出失败: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '📤 Tug out (读出当前语言)';
    }
  }

  /**
   * 尝试检测当前页面的语言环境
   */
  function detectCurrentLocale() {
    const overrideInput = document.getElementById('tug-locale-override');
    if (overrideInput && overrideInput.value.trim()) {
      return overrideInput.value.trim();
    }

    // 尝试从 URL 中提取语言代码
    const url = window.location.href;

    // Chrome Web Store URL 中可能包含语言参数
    const langMatch = url.match(/[?&]hl=([a-zA-Z_-]+)/);
    if (langMatch) return langMatch[1].replace('-', '_');

    // 尝试从页面的语言选择器中读取
    const langSelector = document.querySelector('[data-language], [data-locale], select[name*="lang"]');
    if (langSelector) {
      const val = langSelector.value || langSelector.getAttribute('data-language') || langSelector.getAttribute('data-locale');
      if (val) return val.replace('-', '_');
    }

    // 默认返回 en
    return 'en';
  }

  /**
   * 批量扫描并回传多语言
   */
  async function handleBatchPull() {
    const btn = document.getElementById('tug-batch-pull-btn');
    btn.disabled = true;
    btn.textContent = '⏳ 正在扫描多语言...';
    setStatus('loading');

    try {
      const store = detectStore();
      log('开始扫描多语言切换菜单...', 'info');

      // 寻找语言选择下拉菜单或切换器
      const selectElements = Array.from(document.querySelectorAll('select'));
      const localeSelect = selectElements.find(sel => {
        const name = (sel.name || sel.id || sel.getAttribute('aria-label') || '').toLowerCase();
        return name.includes('lang') || name.includes('locale');
      });

      if (localeSelect && localeSelect.options.length > 0) {
        const options = Array.from(localeSelect.options);
        log(`发现语言选择器，共 ${options.length} 个语言选项`, 'info');

        for (let i = 0; i < options.length; i++) {
          const opt = options[i];
          const localeCode = (opt.value || opt.text || `lang_${i}`).replace('-', '_');
          log(`[${i + 1}/${options.length}] 正在切换至语言: ${localeCode}`, 'info');

          // 触发语言切换
          localeSelect.value = opt.value;
          localeSelect.dispatchEvent(new Event('change', { bubbles: true }));
          await sleep(1500); // 等待页面 DOM 渲染对应语言的内容

          let fields = store === 'chrome' ? readChromeWebStore() : readEdgePartnerCenter();
          if (Object.keys(fields).length > 0) {
            await tugPost(TUG_PULL_ENDPOINT, {
              store,
              locale: localeCode,
              fields,
              batch: {
                total: options.length,
                index: i + 1,
                isLast: i === options.length - 1
              }
            });
            log(`✓ [${localeCode}] 回传成功`, 'success');
          }
        }
        log('🎉 批量多语言回传完毕！', 'success');
      } else {
        log('未检测到原生语言切换器下拉框，执行当前页语言回传...', 'info');
        const locale = detectCurrentLocale();
        let fields = store === 'chrome' ? readChromeWebStore() : readEdgePartnerCenter();
        await tugPost(TUG_PULL_ENDPOINT, {
          store,
          locale,
          fields,
          batch: { total: 1, index: 1, isLast: true }
        });
        log(`✓ [${locale}] 回传完成`, 'success');
      }

      setStatus('connected');
    } catch (err) {
      setStatus('disconnected');
      log(`✗ 批量同步失败: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '🌐 批量扫描并回传多语言';
    }
  }

  // ===================== 主流程 =====================

  async function checkConnection() {
    setStatus('loading');
    log('正在检查与 tug dock 的连接...', 'info');

    try {
      await tugFetch(TUG_HEALTH_ENDPOINT);
      setStatus('connected');
      log('✓ 连接成功', 'success');
      document.getElementById('tug-fill-btn').disabled = false;
      document.getElementById('tug-pull-btn').disabled = false;
      document.getElementById('tug-batch-pull-btn').disabled = false;
      return true;
    } catch (err) {
      setStatus('disconnected');
      log(`✗ 连接失败: ${err.message}`, 'error');
      log('请确认已执行 tug dock 启动本地服务', 'error');
      document.getElementById('tug-fill-btn').disabled = true;
      document.getElementById('tug-pull-btn').disabled = true;
      document.getElementById('tug-batch-pull-btn').disabled = true;
      return false;
    }
  }

  async function handleFill() {
    const btn = document.getElementById('tug-fill-btn');
    btn.disabled = true;
    btn.textContent = '⏳ 正在填充...';
    setStatus('loading');

    try {
      log('正在从 tug dock 拉取数据...', 'info');
      const data = await tugFetch(TUG_DATA_ENDPOINT);
      log(`✓ 数据拉取成功 (${Object.keys(data.scheme.locales).length} 种语言)`, 'success');

      const store = detectStore();
      log(`检测到商店: ${store}`, 'info');

      switch (store) {
        case 'chrome':
          await fillChromeWebStore(data);
          break;
        case 'edge':
          await fillEdgePartnerCenter(data);
          break;
        default:
          log('未识别的商店页面，尝试通用填充...', 'info');
          await fillChromeWebStore(data);
      }

      await fillMultipleLocales(data);

      setStatus('connected');
      log('🎉 填充流程完成', 'success');
    } catch (err) {
      setStatus('disconnected');
      log(`✗ 填充失败: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '⚓ Tug in (填入)';
    }
  }

  // ===================== 初始化 =====================

  function init() {
    createFloatingPanel();

    document.getElementById('tug-check-btn').addEventListener('click', checkConnection);
    document.getElementById('tug-fill-btn').addEventListener('click', handleFill);
    document.getElementById('tug-pull-btn').addEventListener('click', handlePull);
    document.getElementById('tug-batch-pull-btn').addEventListener('click', handleBatchPull);

    // 自动检查连接
    setTimeout(checkConnection, 1000);

    log('Tug Injector 已加载', 'info');
    log(`目标: ${detectStore()} 商店`, 'info');
  }

  init();
})();
