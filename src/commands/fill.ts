/**
 * tug fill 命令
 * 通过 Chrome DevTools Protocol (CDP) 直连浏览器，免装扩展自动填表并挂载物料
 */
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import * as p from '@clack/prompts';
import { Parser } from '../modules/parser.js';
import { CdpDriver } from '../modules/cdp.js';
import { printStatusRow, printSection } from '../modules/ui.js';

export interface FillCommandOptions {
  port?: string;
  locale?: string;
  allLocales?: boolean;
  launch?: boolean;
  package?: string;
}

export async function fillCommand(options: FillCommandOptions): Promise<void> {
  p.intro(chalk.bgCyan.black.bold(' ⚡ TUG CDP FILL ') + chalk.dim(' 免扩展直连 Chrome 自动化填表'));

  const port = options.port ? parseInt(options.port, 10) : 9222;
  const cdp = new CdpDriver(port);

  const s = p.spinner();

  // 1. 读取并校验配置
  s.start('读取本地 tug.yml 配置...');
  const parser = new Parser();
  let scheme;
  try {
    scheme = parser.parse();
    s.stop(chalk.green('tug.yml 验证通过'));
  } catch (err) {
    s.stop(chalk.red('tug.yml 校验失败'));
    p.cancel((err as Error).message);
    process.exit(1);
  }

  // 2. 检测 Chrome 调试端口
  s.start(`正在检测 Chrome 调试端口 (127.0.0.1:${port})...`);
  let isConnected = await cdp.checkConnection();

  if (!isConnected) {
    if (options.launch) {
      s.start(`正在自动唤起 Chrome 并开启调试端口 (${port})...`);
      const launched = await cdp.launchChrome('https://chromewebstore.google.com/devconsole');
      if (launched) {
        isConnected = true;
        s.stop(chalk.green('Chrome 成功唤起并就绪！'));
      } else {
        s.stop(chalk.red('自动唤起 Chrome 超时'));
      }
    } else {
      s.stop(chalk.yellow('未检测到开启远程调试的 Chrome 实例'));
      const shouldLaunch = await p.confirm({
        message: '是否由 tug 自动为你启动带调试端口的 Chrome？(首次需登录一次 Google 账号)',
        initialValue: true,
      });

      if (!p.isCancel(shouldLaunch) && shouldLaunch) {
        s.start(`正在自动唤起 Chrome 并打开商店后台 (port: ${port})...`);
        const launched = await cdp.launchChrome('https://chromewebstore.google.com/devconsole');
        if (launched) {
          isConnected = true;
          s.stop(chalk.green('Chrome 成功唤起并就绪！'));
        } else {
          s.stop(chalk.red('自动唤起 Chrome 失败'));
        }
      }
    }
  }

  if (!isConnected) {
    console.log('');
    const profileDir = cdp.getProfileDir();
    p.note(
      `Chrome 默认配置目录不允许开启调试端口，请手动使用独立配置目录启动:\n\n` +
      `  ${chalk.cyan(`/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=${port} --user-data-dir="${profileDir}"`)}\n\n` +
      `或者直接由 tug 托管唤起: ${chalk.bold('tug fill --launch')}`,
      'Chrome 远程调试启动指引'
    );
    p.cancel('流程中止');
    process.exit(1);
  }

  s.stop(chalk.green(`成功连接到 Chrome 调试端口 (port ${port})`));

  // 3. 查找商店后台标签页
  s.start('正在检索 Chrome Web Store / Edge 开发者后台标签页...');
  let target = await cdp.findStoreTarget();

  if (!target) {
    s.stop(chalk.yellow('未自动匹配到商店后台页面'));
    const allTargets = await cdp.listPageTargets();

    if (allTargets.length === 0) {
      p.cancel('未检测到任何打开的网页标签，请先在 Chrome 中打开目标页面。');
      process.exit(1);
    }

    // 提供交互式选择标签页
    const selectedId = await p.select({
      message: '请选择你要填充的 Chrome 标签页:',
      options: allTargets.map((t) => ({
        value: t.id,
        label: t.title.substring(0, 50) || t.url.substring(0, 50),
        hint: t.url.substring(0, 60),
      })),
    });

    if (p.isCancel(selectedId)) {
      p.cancel('操作已取消');
      process.exit(0);
    }

    target = allTargets.find((t) => t.id === selectedId) || null;
  } else {
    s.stop(chalk.green(`匹配到商店后台: ${target.title.substring(0, 40)}`));
  }

  if (!target) {
    p.cancel('未找到有效的目标页面');
    process.exit(1);
  }

  const baseDir = parser.getBaseDir();

  // 4. 嗅探并确认 ZIP 安装包
  let chosenZipPath = options.package
    ? path.resolve(baseDir, options.package)
    : scheme.assets.package
    ? path.resolve(baseDir, scheme.assets.package)
    : undefined;

  if (chosenZipPath && !fs.existsSync(chosenZipPath)) {
    p.cancel(`指定的安装包文件不存在: ${chosenZipPath}`);
    process.exit(1);
  }

  const zipCandidates = cdp.findZipCandidates(baseDir);

  if (!chosenZipPath && zipCandidates.length > 0) {
    if (zipCandidates.length === 1) {
      chosenZipPath = zipCandidates[0].absPath;
    } else {
      // 存在多个 zip 包，交互式让开发者选择
      const selectedZip = await p.select({
        message: `检测到当前工程存在 ${zipCandidates.length} 个 ZIP 安装包，请选择要上传的目标包:`,
        options: zipCandidates.map((c) => ({
          value: c.absPath,
          label: `${c.file} (${(c.size / 1024 / 1024).toFixed(2)} MB)`,
          hint: `修改时间: ${c.mtime.toLocaleTimeString()}`,
        })),
      });

      if (p.isCancel(selectedZip)) {
        p.cancel('操作已取消');
        process.exit(0);
      }
      chosenZipPath = selectedZip as string;
    }
  }

  const availableLocales = Object.keys(scheme.locales);
  const isAllLocales = options.allLocales ?? (!options.locale || options.locale === 'all');
  const targetLocale = options.locale;

  printSection('执行方案');
  printStatusRow('目标页面', target.title || target.url, true);
  if (isAllLocales && availableLocales.length > 1) {
    printStatusRow('多语言录入', `自动循环切换并录入 ${availableLocales.length} 种语言 (${availableLocales.join(', ')})`, true);
  } else {
    printStatusRow('目标语言', targetLocale || 'en', true);
  }
  printStatusRow('物料注入', `${scheme.assets.screenshots.length} 张截图准备挂载`, true);
  if (chosenZipPath) {
    printStatusRow('上传安装包', path.relative(baseDir, chosenZipPath), true);
  }

  // 5. 执行 CDP 自动化
  s.start('正在通过 CDP 协议注入表单文本、物料与安装包...');
  try {
    const report = await cdp.fill(target.id, scheme, baseDir, targetLocale, chosenZipPath, isAllLocales);
    s.stop(chalk.green('CDP 自动化注入完毕！'));

    console.log('');
    printSection('填报结果反馈');
    if (report.localesFilled.length > 1) {
      printStatusRow('多语言录入', `${report.localesFilled.length} 种语言已逐一切换录入 (${report.localesFilled.join(', ')})`, true);
    } else if (report.localesFilled.length === 1) {
      printStatusRow('录入语言', report.localesFilled[0], true);
    }
    printStatusRow('表单字段填充', `${report.textFieldsFilled} 个组件已模拟原生输入`, true);
    printStatusRow('文件原生注入', `${report.filesUploaded} 项本地资源已自动挂载`, true);
    if (report.selectedPackage) {
      printStatusRow('安装包上传', path.relative(baseDir, report.selectedPackage), true);
    }

    // 检查是否有网页端抛出的错误反馈
    if (report.pageErrors.length > 0) {
      console.log('');
      p.note(
        report.pageErrors.map((err) => `• ${err}`).join('\n'),
        chalk.red.bold(`⚠ 网页端报错反馈 (${report.pageErrors.length} 条)`)
      );
      p.outro(chalk.yellow('提示: 页面存在上述红字报错，请核对修正后再次提交。'));
    } else {
      p.outro(chalk.green.bold('🎉 恭喜！表单与物料已自动填充完毕，网页无报错提示，请在浏览器中核对并点击提交！'));
    }
  } catch (err) {
    s.stop(chalk.red('注入执行异常'));
    p.cancel((err as Error).message);
    process.exit(1);
  }
}
