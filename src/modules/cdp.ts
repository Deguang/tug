import os from 'node:os';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import CDP from 'chrome-remote-interface';
import path from 'node:path';
import type { TugScheme } from '../schema/tug-scheme.js';

export interface CdpTargetInfo {
  id: string;
  title: string;
  url: string;
  type: string;
}

export interface CdpFillReport {
  textFieldsFilled: number;
  filesUploaded: number;
  targetUrl: string;
  selectedPackage?: string;
  localesFilled: string[];
  pageErrors: string[];
}

export class CdpDriver {
  private port: number;
  private host: string;
  private profileDir: string;

  constructor(port = 9222, host = '127.0.0.1') {
    this.port = port;
    this.host = host;
    // 使用固定的用户配置目录，避免 Chrome 136+ 默认目录拒绝开启调试端口，且只需登录一次
    this.profileDir = path.join(os.homedir(), '.tug', 'chrome-profile');

    // 确保 127.0.0.1 和 localhost 绕过任何代理环境变量，避免 CDP 请求被本地科学上网代理拦截产生 502/400
    const bypass = '127.0.0.1,localhost';
    process.env.NO_PROXY = process.env.NO_PROXY ? `${process.env.NO_PROXY},${bypass}` : bypass;
    process.env.no_proxy = process.env.no_proxy ? `${process.env.no_proxy},${bypass}` : bypass;
  }

  getProfileDir(): string {
    return this.profileDir;
  }

  /**
   * 扫描工程中所有潜在的 ZIP 安装包候选列表
   */
  findZipCandidates(baseDir: string): { file: string; absPath: string; mtime: Date; size: number }[] {
    const searchDirs = ['.', 'dist', 'build', 'out', 'release', 'packages'];
    const candidates: { file: string; absPath: string; mtime: Date; size: number }[] = [];
    const seen = new Set<string>();

    for (const dir of searchDirs) {
      const fullDir = path.resolve(baseDir, dir);
      if (fs.existsSync(fullDir) && fs.statSync(fullDir).isDirectory()) {
        try {
          const files = fs.readdirSync(fullDir);
          for (const f of files) {
            if (f.endsWith('.zip') && !f.startsWith('.')) {
              const absPath = path.resolve(fullDir, f);
              if (!seen.has(absPath)) {
                seen.add(absPath);
                const stats = fs.statSync(absPath);
                const relPath = path.relative(baseDir, absPath);
                candidates.push({
                  file: relPath.startsWith('.') ? relPath : `./${relPath}`,
                  absPath,
                  mtime: stats.mtime,
                  size: stats.size,
                });
              }
            }
          }
        } catch {
          // 忽略无权限目录
        }
      }
    }

    // 按修改时间从新到旧排序
    return candidates.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  }

  /**
   * 自动抓取 Chrome 页面上的错误与警告提示 (如 The image size is incorrect、必填项错误等)
   */
  async scanPageErrors(Runtime: any): Promise<string[]> {
    const errorScript = `
      (() => {
        const errorMessages = new Set();
        // 抓取常见错误样式容器与 aria-invalid / role="alert" 元素
        const selectors = [
          '[role="alert"]',
          '[aria-invalid="true"]',
          '.error-message',
          '.error',
          '[class*="error"]',
          '[class*="Error"]',
          '[class*="warning"]',
          '.mdc-text-field-helper-text--validation-msg',
          'div[style*="color: red"]',
          'div[style*="color: rgb(217"]', // Google Red
        ];

        selectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            const txt = (el.textContent || '').trim();
            // 过滤无意义字符与超长文本
            if (txt && txt.length > 2 && txt.length < 200) {
              // 忽略一些普通的说明文字
              if (
                txt.includes('Error') ||
                txt.includes('error') ||
                txt.includes('incorrect') ||
                txt.includes('required') ||
                txt.includes('错误') ||
                txt.includes('不合规') ||
                txt.includes('请') ||
                txt.includes('必须') ||
                txt.includes('Invalid') ||
                txt.includes('invalid')
              ) {
                errorMessages.add(txt);
              }
            }
          });
        });

        return Array.from(errorMessages);
      })()
    `;

    try {
      const result = await Runtime.evaluate({
        expression: errorScript,
        returnByValue: true,
      });
      return (result.result.value as string[]) || [];
    } catch {
      return [];
    }
  }

  /**
   * 自动唤起带远程调试端口的 Chrome 浏览器
   * @param targetUrl 可选打开的目标网址 (如应用商店后台)
   */
  async launchChrome(targetUrl = 'https://chromewebstore.google.com/devconsole'): Promise<boolean> {
    const defaultMacPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    let chromeExecutable = '';

    if (process.platform === 'darwin' && fs.existsSync(defaultMacPath)) {
      chromeExecutable = defaultMacPath;
    } else if (process.platform === 'win32') {
      const winPaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      ];
      chromeExecutable = winPaths.find((p) => fs.existsSync(p)) || 'chrome';
    } else {
      chromeExecutable = 'google-chrome';
    }

    if (!fs.existsSync(this.profileDir)) {
      fs.mkdirSync(this.profileDir, { recursive: true });
    }

    const args = [
      `--remote-debugging-port=${this.port}`,
      `--user-data-dir=${this.profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      targetUrl,
    ];

    try {
      const child = spawn(chromeExecutable, args, {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      // 轮询等待端口就绪 (最多等待 10 秒)
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await this.checkConnection()) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * 检查 CDP 调试端口是否可用
   */
  async checkConnection(): Promise<boolean> {
    try {
      const version = await CDP.Version({ host: this.host, port: this.port });
      return !!version;
    } catch {
      return false;
    }
  }

  /**
   * 寻找当前 Chrome 中打开的 Chrome Web Store / Edge 开发者后台标签页
   */
  async findStoreTarget(): Promise<CdpTargetInfo | null> {
    const targets = (await CDP.List({ host: this.host, port: this.port })) as CdpTargetInfo[];
    const storeTarget = targets.find(
      (t) =>
        t.type === 'page' &&
        (t.url.includes('chromewebstore.google.com') ||
          t.url.includes('chrome.google.com/webstore/devconsole') ||
          t.url.includes('partner.microsoft.com'))
    );
    return storeTarget || null;
  }

  /**
   * 列出所有打开的页面标签
   */
  async listPageTargets(): Promise<CdpTargetInfo[]> {
    const targets = (await CDP.List({ host: this.host, port: this.port })) as CdpTargetInfo[];
    return targets.filter((t) => t.type === 'page');
  }

  /**
   * 对指定的标签页执行自动填表与物料挂载
   */
  async fill(
    targetId: string,
    scheme: TugScheme,
    baseDir: string,
    targetLocale?: string,
    chosenZipPath?: string,
    allLocales = true
  ): Promise<CdpFillReport> {
    const client = await CDP({ host: this.host, port: this.port, target: targetId });
    const { Runtime, DOM, Page } = client;

    try {
      await Runtime.enable();
      await DOM.enable();
      await Page.enable();

      // 准备待填充的语言列表
      const localesToFill =
        allLocales && (!targetLocale || targetLocale === 'all')
          ? Object.keys(scheme.locales)
          : [targetLocale || Object.keys(scheme.locales)[0] || 'en'];
      const localesFilled: string[] = [];

      const primaryLocale = localesToFill[0] || 'en';
      const localeData = scheme.locales[primaryLocale] || Object.values(scheme.locales)[0];

      // 选定的 zip 插件包
      const zipPackagePath = chosenZipPath || (scheme.assets.package ? path.resolve(baseDir, scheme.assets.package) : null);

      // 准备各物料真实物理绝对路径
      const iconPath = scheme.assets.icon_128 ? path.resolve(baseDir, scheme.assets.icon_128) : null;
      const screenshotPaths = scheme.assets.screenshots
        .map((s) => path.resolve(baseDir, s))
        .filter((p) => fs.existsSync(p));
      const promoSmallPath = scheme.assets.promo_small ? path.resolve(baseDir, scheme.assets.promo_small) : null;
      const promoLargePath = scheme.assets.promo_large ? path.resolve(baseDir, scheme.assets.promo_large) : null;

      let filesUploaded = 0;
      let textFieldsFilled = 0;
      const pageErrors: string[] = [];

      // 检查当前页面是否为 Chrome Web Store 开发者后台编辑页面
      const targetList = (await CDP.List({ host: this.host, port: this.port })) as CdpTargetInfo[];
      const curTarget = targetList.find((t) => t.id === targetId);
      const curUrl = curTarget?.url || '';
      const editBaseMatch = curUrl.match(/^(https:\/\/[^\/]+\/webstore\/devconsole\/[^\/]+\/[^\/]+\/edit)/);
      const editBase = editBaseMatch ? editBaseMatch[1] : null;

      if (editBase) {
        // ================= 【CWS 专享全流程】 =================

        // 1. 优先上传 ZIP 安装包 (在 /edit/package 页面)
        if (zipPackagePath && fs.existsSync(zipPackagePath)) {
          const packageUrl = `${editBase}/package`;
          const currentLoc = (await Runtime.evaluate({ expression: 'location.href' })).result.value as string;
          if (!currentLoc.includes('/edit/package')) {
            await Page.navigate({ url: packageUrl });
            await new Promise((r) => setTimeout(r, 2000));
          }

          // 点击 "Upload new package" 唤起文件上传对话框
          await Runtime.evaluate({
            expression: `(() => {
              const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Upload new package'));
              if (btn) btn.click();
            })()`,
          });
          await new Promise((r) => setTimeout(r, 1500));

          const pkgDoc = await DOM.getDocument({ depth: -1 });
          const pkgInputs = await DOM.querySelectorAll({
            nodeId: pkgDoc.root.nodeId,
            selector: 'input[type="file"]',
          });

          for (const nodeId of pkgInputs.nodeIds) {
            try {
              await DOM.setFileInputFiles({ nodeId, files: [zipPackagePath] });
              filesUploaded += 1;
              // 等待上传和解析完成
              await new Promise((r) => setTimeout(r, 3500));
              break;
            } catch {
              // 忽略非目标
            }
          }

          const pkgErrors = await this.scanPageErrors(Runtime);
          for (const err of pkgErrors) {
            if (!pageErrors.includes(err)) pageErrors.push(err);
          }
        }

        // 2. 填充隐私与权限理由 (在 /edit/privacy 页面)
        if (scheme.privacy) {
          const privacyUrl = `${editBase}/privacy`;
          await Page.navigate({ url: privacyUrl });
          await new Promise((r) => setTimeout(r, 2000));

          const privacyScript = `
            (() => {
              let filledCount = 0;

              function triggerNativeInput(el, val) {
                try {
                  el.focus();
                  if (typeof el.select === 'function') el.select();
                  const execSuccess = document.execCommand('insertText', false, val);
                  if (execSuccess && el.value === val) {
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.dispatchEvent(new Event('blur', { bubbles: true }));
                    filledCount++;
                    return;
                  }
                } catch {}

                const proto = Object.getPrototypeOf(el);
                const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set || Object.getOwnPropertyDescriptor(el, 'value')?.set;
                if (setter) {
                  setter.call(el, val);
                } else {
                  el.value = val;
                }
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
                filledCount++;
              }

              const permissions = ${JSON.stringify(scheme.privacy.permissions || {})};
              const hostPermissions = ${JSON.stringify(scheme.privacy.host_permissions || {})};
              const hostJustification = Object.values(hostPermissions).join(' ');

              document.querySelectorAll('textarea').forEach(el => {
                let p = el.parentElement;
                let text = '';
                for (let i = 0; i < 6 && p; i++) {
                  text += ' ' + (p.textContent || '');
                  p = p.parentElement;
                }
                const lower = text.toLowerCase();

                for (const [perm, just] of Object.entries(permissions)) {
                  if (lower.includes(perm.toLowerCase()) && lower.includes('justification')) {
                    triggerNativeInput(el, just);
                    return;
                  }
                }
                if ((lower.includes('host') || lower.includes('website')) && lower.includes('justification') && hostJustification) {
                  triggerNativeInput(el, hostJustification);
                  return;
                }
              });

              return filledCount;
            })()
          `;

          const privacyEval = await Runtime.evaluate({ expression: privacyScript, returnByValue: true });
          textFieldsFilled += (privacyEval.result.value as number) || 0;

          // 点击保存隐私草稿
          await Runtime.evaluate({
            expression: `(() => {
              const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Save draft'));
              if (btn && !btn.disabled) btn.click();
            })()`,
          });
          await new Promise((r) => setTimeout(r, 1500));

          const privErrors = await this.scanPageErrors(Runtime);
          for (const err of privErrors) {
            if (!pageErrors.includes(err)) pageErrors.push(err);
          }
        }

        // 3. 上传图片物料与多语言文案 (在 /edit/listing 页面作为最终交付页)
        const listingUrl = `${editBase}/listing`;
        await Page.navigate({ url: listingUrl });
        await new Promise((r) => setTimeout(r, 2500));

        const listingDoc = await DOM.getDocument({ depth: -1 });
        const listingInputs = await DOM.querySelectorAll({
          nodeId: listingDoc.root.nodeId,
          selector: 'input[type="file"]',
        });

        if (listingInputs.nodeIds.length > 0) {
          const inspectScript = `
            (() => {
              const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
              return inputs.map(input => {
                let curr = input.parentElement;
                let foundRole = 'unknown';
                while (curr && curr !== document.body) {
                  const text = (curr.textContent || '').toLowerCase();
                  if (text.includes('128x128') || text.includes('128 x 128') || text.includes('store icon') || text.includes('商店图标')) {
                    foundRole = 'icon'; break;
                  }
                  if (text.includes('global screenshots') || text.includes('全局屏幕截图') || text.includes('全局截图')) {
                    foundRole = 'screenshot_global'; break;
                  }
                  if (text.includes('localized screenshots') || text.includes('本地化屏幕截图') || text.includes('本地化截图')) {
                    foundRole = 'screenshot_localized'; break;
                  }
                  if (text.includes('1280x800') || text.includes('1280 x 800') || text.includes('640x400') || text.includes('screenshot') || text.includes('屏幕截图')) {
                    foundRole = 'screenshot'; break;
                  }
                  if (text.includes('440x280') || text.includes('440 x 280') || text.includes('small promo') || text.includes('small tile') || text.includes('小宣传图') || text.includes('小推广图')) {
                    foundRole = 'promo_small'; break;
                  }
                  if (text.includes('1400x560') || text.includes('1400 x 560') || text.includes('marquee promo') || text.includes('large tile') || text.includes('banner') || text.includes('大宣传图') || text.includes('大推广图')) {
                    foundRole = 'promo_large'; break;
                  }
                  curr = curr.parentElement;
                }
                return foundRole;
              });
            })()
          `;

          const inspectResult = await Runtime.evaluate({ expression: inspectScript, returnByValue: true });
          const inputRoles = (inspectResult.result.value as string[]) || [];
          const targetScreenshotRole = inputRoles.includes('screenshot_global')
            ? 'screenshot_global'
            : (inputRoles.includes('screenshot') ? 'screenshot' : 'screenshot_localized');

          let iconUploaded = false;
          let promoSmallUploaded = false;
          let promoLargeUploaded = false;
          let screenshotsUploaded = false;

          for (let i = 0; i < listingInputs.nodeIds.length; i++) {
            const nodeId = listingInputs.nodeIds[i];
            const role = inputRoles[i] || 'unknown';

            try {
              if (role === 'icon' && !iconUploaded && iconPath && fs.existsSync(iconPath)) {
                await DOM.setFileInputFiles({ nodeId, files: [iconPath] });
                filesUploaded += 1;
                iconUploaded = true;
              } else if (role === 'promo_small' && !promoSmallUploaded && promoSmallPath && fs.existsSync(promoSmallPath)) {
                await DOM.setFileInputFiles({ nodeId, files: [promoSmallPath] });
                filesUploaded += 1;
                promoSmallUploaded = true;
              } else if (role === 'promo_large' && !promoLargeUploaded && promoLargePath && fs.existsSync(promoLargePath)) {
                await DOM.setFileInputFiles({ nodeId, files: [promoLargePath] });
                filesUploaded += 1;
                promoLargeUploaded = true;
              } else if (role === targetScreenshotRole && !screenshotsUploaded && screenshotPaths.length > 0) {
                await DOM.setFileInputFiles({ nodeId, files: screenshotPaths });
                filesUploaded += screenshotPaths.length;
                screenshotsUploaded = true;
              }
            } catch {
              // 忽略非目标框
            }
          }
        }

        // 3.1 填充全局独立字段 (HomePage URL, Support Email, Privacy URL)
        const globalFillScript = `
          (() => {
            let filledCount = 0;
            function triggerNativeInput(el, val) {
              try {
                el.focus();
                if (typeof el.select === 'function') el.select();
                const execSuccess = document.execCommand('insertText', false, val);
                if (execSuccess && el.value === val) {
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                  el.dispatchEvent(new Event('blur', { bubbles: true }));
                  filledCount++;
                  return;
                }
              } catch {}

              const proto = Object.getPrototypeOf(el);
              const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set || Object.getOwnPropertyDescriptor(el, 'value')?.set;
              if (setter) setter.call(el, val);
              else el.value = val;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new Event('blur', { bubbles: true }));
              filledCount++;
            }

            const privacyUrl = ${JSON.stringify(scheme.global.privacy_policy_url || '')};
            const homeUrl = ${JSON.stringify(scheme.global.home_page_url || '')};
            const email = ${JSON.stringify(scheme.global.support_email || '')};

            document.querySelectorAll('input[type="text"], input[type="url"], input[type="email"]').forEach(el => {
              const ctx = ((el.getAttribute('aria-label') || '') + (el.placeholder || '') + (el.name || '') + el.id).toLowerCase();
              if (ctx.includes('privacy') && privacyUrl) {
                triggerNativeInput(el, privacyUrl);
              } else if ((ctx.includes('home') || ctx.includes('website')) && homeUrl) {
                triggerNativeInput(el, homeUrl);
              } else if (ctx.includes('support') && email) {
                triggerNativeInput(el, email);
              }
            });

            return filledCount;
          })()
        `;
        const globalEval = await Runtime.evaluate({ expression: globalFillScript, returnByValue: true });
        textFieldsFilled += (globalEval.result.value as number) || 0;

        // 3.2 依次切换多语言并填充各语言的 Description 与 Short Description
        for (const loc of localesToFill) {
          const locData = scheme.locales[loc];
          if (!locData) continue;

          // 尝试切换到目标语言
          const switchScript = `
            (() => {
              const target = ${JSON.stringify(loc)}.toLowerCase().replace('_', '-');
              const ul = document.querySelector('ul[role="listbox"][aria-label="Language"]');
              if (ul) {
                const options = Array.from(ul.querySelectorAll('li, [role="option"]'));
                const match = options.find(li => {
                  const val = (li.getAttribute('data-value') || '').toLowerCase().replace('_', '-');
                  const text = li.textContent.toLowerCase();
                  return val === target || val.startsWith(target) || text.includes('– ' + target) || text.includes('(' + target + ')');
                });
                if (match) {
                  match.click();
                  return { success: true, text: match.textContent.trim() };
                }
              }
              return { success: false };
            })()
          `;
          await Runtime.evaluate({ expression: switchScript });
          await new Promise((r) => setTimeout(r, 700));

          // 填充当前语言的文案
          const locDesc = locData.description || '';
          const locShortDesc = locData.short_description || '';
          const fillLocaleScript = `
            (() => {
              let filledCount = 0;
              function triggerNativeInput(el, val) {
                try {
                  el.focus();
                  if (typeof el.select === 'function') el.select();
                  const execSuccess = document.execCommand('insertText', false, val);
                  if (execSuccess && el.value === val) {
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.dispatchEvent(new Event('blur', { bubbles: true }));
                    filledCount++;
                    return;
                  }
                } catch {}

                const proto = Object.getPrototypeOf(el);
                const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set || Object.getOwnPropertyDescriptor(el, 'value')?.set;
                if (setter) setter.call(el, val);
                else el.value = val;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
                filledCount++;
              }

              const desc = ${JSON.stringify(locDesc)};
              const shortDesc = ${JSON.stringify(locShortDesc)};

              document.querySelectorAll('textarea').forEach(el => {
                let p = el.parentElement;
                let text = '';
                for (let i = 0; i < 5 && p; i++) {
                  text += ' ' + (p.textContent || '');
                  p = p.parentElement;
                }
                const ctx = ((el.getAttribute('aria-label') || '') + (el.placeholder || '') + text).toLowerCase();
                if (ctx.includes('description') || ctx.includes('详细描述') || !el.value) {
                  triggerNativeInput(el, desc);
                }
              });

              document.querySelectorAll('input[type="text"]').forEach(el => {
                const ctx = ((el.getAttribute('aria-label') || '') + (el.placeholder || '') + (el.name || '') + el.id).toLowerCase();
                if (ctx.includes('short description') || ctx.includes('summary') || ctx.includes('简短描述')) {
                  triggerNativeInput(el, shortDesc);
                }
              });

              return filledCount;
            })()
          `;

          const locEval = await Runtime.evaluate({ expression: fillLocaleScript, returnByValue: true });
          textFieldsFilled += (locEval.result.value as number) || 0;
          localesFilled.push(loc);
          await new Promise((r) => setTimeout(r, 400));
        }

        // 若循环录入了多语言，切回默认语言 (en) 供开发者直观核实
        if (localesFilled.length > 1 && localesFilled.includes('en')) {
          await Runtime.evaluate({
            expression: `(() => {
              const ul = document.querySelector('ul[role="listbox"][aria-label="Language"]');
              if (ul) {
                const match = Array.from(ul.querySelectorAll('li, [role="option"]')).find(li => (li.getAttribute('data-value') || '').toLowerCase() === 'en');
                if (match) match.click();
              }
            })()`,
          });
          await new Promise((r) => setTimeout(r, 500));
        }

        // 保存草稿
        await Runtime.evaluate({
          expression: `(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Save draft'));
            if (btn && !btn.disabled) btn.click();
          })()`,
        });
        await new Promise((r) => setTimeout(r, 1500));

        const listErrors = await this.scanPageErrors(Runtime);
        for (const err of listErrors) {
          if (!pageErrors.includes(err)) pageErrors.push(err);
        }
      } else {
        // ================= 【单页 / 通用平台兜底流程】 =================
        const doc = await DOM.getDocument({ depth: -1 });
        const fileInputs = await DOM.querySelectorAll({
          nodeId: doc.root.nodeId,
          selector: 'input[type="file"]',
        });

        if (fileInputs.nodeIds.length > 0) {
          const inspectScript = `
            (() => {
              const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
              return inputs.map(input => {
                const accept = (input.getAttribute('accept') || '').toLowerCase();
                if (accept.includes('.zip')) return 'package';

                let curr = input.parentElement;
                let foundRole = 'unknown';
                while (curr && curr !== document.body) {
                  const text = (curr.textContent || '').toLowerCase();
                  if (text.includes('package') || text.includes('程序包') || text.includes('安装包') || text.includes('zip')) {
                    foundRole = 'package'; break;
                  }
                  if (text.includes('128x128') || text.includes('128 x 128') || text.includes('store icon') || text.includes('商店图标')) {
                    foundRole = 'icon'; break;
                  }
                  if (text.includes('global screenshots') || text.includes('全局屏幕截图') || text.includes('全局截图')) {
                    foundRole = 'screenshot_global'; break;
                  }
                  if (text.includes('localized screenshots') || text.includes('本地化屏幕截图') || text.includes('本地化截图')) {
                    foundRole = 'screenshot_localized'; break;
                  }
                  if (text.includes('1280x800') || text.includes('1280 x 800') || text.includes('640x400') || text.includes('screenshot') || text.includes('屏幕截图')) {
                    foundRole = 'screenshot'; break;
                  }
                  if (text.includes('440x280') || text.includes('440 x 280') || text.includes('small promo') || text.includes('small tile') || text.includes('小宣传图') || text.includes('小推广图')) {
                    foundRole = 'promo_small'; break;
                  }
                  if (text.includes('1400x560') || text.includes('1400 x 560') || text.includes('marquee promo') || text.includes('large tile') || text.includes('banner') || text.includes('大宣传图') || text.includes('大推广图')) {
                    foundRole = 'promo_large'; break;
                  }
                  curr = curr.parentElement;
                }
                return foundRole;
              });
            })()
          `;

          const inspectResult = await Runtime.evaluate({ expression: inspectScript, returnByValue: true });
          const inputRoles = (inspectResult.result.value as string[]) || [];
          const targetScreenshotRole = inputRoles.includes('screenshot_global')
            ? 'screenshot_global'
            : (inputRoles.includes('screenshot') ? 'screenshot' : 'screenshot_localized');

          let packageUploaded = false;
          let iconUploaded = false;
          let promoSmallUploaded = false;
          let promoLargeUploaded = false;
          let screenshotsUploaded = false;

          for (let i = 0; i < fileInputs.nodeIds.length; i++) {
            const nodeId = fileInputs.nodeIds[i];
            const role = inputRoles[i] || 'unknown';

            try {
              if (role === 'package' && !packageUploaded && zipPackagePath && fs.existsSync(zipPackagePath)) {
                await DOM.setFileInputFiles({ nodeId, files: [zipPackagePath] });
                filesUploaded += 1;
                packageUploaded = true;
              } else if (role === 'icon' && !iconUploaded && iconPath && fs.existsSync(iconPath)) {
                await DOM.setFileInputFiles({ nodeId, files: [iconPath] });
                filesUploaded += 1;
                iconUploaded = true;
              } else if (role === 'promo_small' && !promoSmallUploaded && promoSmallPath && fs.existsSync(promoSmallPath)) {
                await DOM.setFileInputFiles({ nodeId, files: [promoSmallPath] });
                filesUploaded += 1;
                promoSmallUploaded = true;
              } else if (role === 'promo_large' && !promoLargeUploaded && promoLargePath && fs.existsSync(promoLargePath)) {
                await DOM.setFileInputFiles({ nodeId, files: [promoLargePath] });
                filesUploaded += 1;
                promoLargeUploaded = true;
              } else if (role === targetScreenshotRole && !screenshotsUploaded && screenshotPaths.length > 0) {
                await DOM.setFileInputFiles({ nodeId, files: screenshotPaths });
                filesUploaded += screenshotPaths.length;
                screenshotsUploaded = true;
              }
            } catch {
              // 忽略非目标框
            }
          }
        }

        const fallbackFillScript = `
          (() => {
            let filledCount = 0;
            function triggerNativeInput(el, val) {
              try {
                el.focus();
                if (typeof el.select === 'function') el.select();
                const execSuccess = document.execCommand('insertText', false, val);
                if (execSuccess && el.value === val) {
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                  el.dispatchEvent(new Event('blur', { bubbles: true }));
                  filledCount++;
                  return;
                }
              } catch {}

              const proto = Object.getPrototypeOf(el);
              const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set || Object.getOwnPropertyDescriptor(el, 'value')?.set;
              if (setter) {
                setter.call(el, val);
              } else {
                el.value = val;
              }
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new Event('blur', { bubbles: true }));
              filledCount++;
            }

            const desc = ${JSON.stringify(localeData.description)};
            const shortDesc = ${JSON.stringify(localeData.short_description)};
            const privacyUrl = ${JSON.stringify(scheme.global.privacy_policy_url || '')};
            const homeUrl = ${JSON.stringify(scheme.global.home_page_url || '')};
            const email = ${JSON.stringify(scheme.global.support_email || '')};

            document.querySelectorAll('textarea').forEach(el => {
              let p = el.parentElement;
              let text = '';
              for (let i = 0; i < 5 && p; i++) {
                text += ' ' + (p.textContent || '');
                p = p.parentElement;
              }
              const ctx = ((el.getAttribute('aria-label') || '') + (el.placeholder || '') + text).toLowerCase();
              if (ctx.includes('description') || ctx.includes('详细描述') || !el.value) {
                triggerNativeInput(el, desc);
              }
            });

            document.querySelectorAll('input[type="text"], input[type="url"], input[type="email"]').forEach(el => {
              const ctx = ((el.getAttribute('aria-label') || '') + (el.placeholder || '') + (el.name || '') + el.id).toLowerCase();
              if (ctx.includes('short description') || ctx.includes('summary') || ctx.includes('简短描述')) {
                triggerNativeInput(el, shortDesc);
              } else if (ctx.includes('privacy') && privacyUrl) {
                triggerNativeInput(el, privacyUrl);
              } else if ((ctx.includes('home') || ctx.includes('website')) && homeUrl) {
                triggerNativeInput(el, homeUrl);
              } else if (ctx.includes('support') && email) {
                triggerNativeInput(el, email);
              }
            });

            return filledCount;
          })()
        `;

        const fallbackEval = await Runtime.evaluate({ expression: fallbackFillScript, returnByValue: true });
        textFieldsFilled = (fallbackEval.result.value as number) || 0;
      }

      // 等待 1.5 秒让前端框架完成上传校验与 DOM 渲染
      await new Promise((r) => setTimeout(r, 1500));

      // 抓取页面可能出现的错误与警告反馈
      const finalErrors = await this.scanPageErrors(Runtime);
      for (const err of finalErrors) {
        if (!pageErrors.includes(err)) pageErrors.push(err);
      }

      return {
        textFieldsFilled,
        filesUploaded,
        targetUrl: curUrl,
        selectedPackage: zipPackagePath || undefined,
        localesFilled: localesFilled.length > 0 ? localesFilled : [primaryLocale],
        pageErrors,
      };
    } finally {
      await client.close();
    }
  }
}
