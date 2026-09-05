#!/usr/bin/env node
/**
 * tug CLI 入口
 * 浏览器插件上架助手 (支持 Mole 风格交互菜单)
 */
import { Command } from 'commander';
import chalk from 'chalk';
import * as p from '@clack/prompts';
import { initCommand } from './commands/init.js';
import { scanCommand } from './commands/scan.js';
import { syncCommand } from './commands/sync.js';
import { upgradeCommand } from './commands/upgrade.js';
import { fillCommand } from './commands/fill.js';
import { pullCommand } from './commands/pull.js';
import { banner } from './modules/ui.js';

const program = new Command();

program
  .name('tug')
  .description('浏览器插件上架助手 - 本地数据编排 CLI')
  .version('0.1.0');

program
  .command('init')
  .description('在当前目录初始化 tug.yml 配置文件')
  .action(initCommand);

program
  .command('scan')
  .description('扫描并校验 tug.yml 配置和图片物料')
  .action(scanCommand);

program
  .command('fill')
  .description('通过 CDP 协议直连 Chrome 自动填表与挂载物料 (免安装任何扩展)')
  .option('-p, --port <port>', 'Chrome 远程调试端口', '9222')
  .option('-l, --locale <locale>', '指定填充的单个语言版本 (如 en, zh_CN)')
  .option('-a, --all-locales', '自动循环切换并录入 tug.yml 中配置的所有语言文案 (默认开启)')
  .option('-z, --package <path>', '指定待上传的 ZIP 扩展安装包路径')
  .option('-o, --launch', '若未检测到调试实例，自动唤起 Chrome 浏览器')
  .action(fillCommand);

program
  .command('sync')
  .description('从插件发版源同步最新发版详情与 Changelog，增量更新本地 tug.yml')
  .option('-r, --repo <owner/repo>', '指定远端仓库地址')
  .option('-l, --locale <locale>', '更新对应语言的 Changelog (默认 en)')
  .action(syncCommand);

program
  .command('upgrade')
  .description('检查并自动升级 tug CLI 工具自身')
  .option('-y, --yes', '跳过确认直接自动执行升级')
  .action(upgradeCommand);

// 当没有传递任何参数时，启动 Mole 风格交互式菜单
if (process.argv.length <= 2) {
  console.log(banner);

  (async () => {
    const action = await p.select({
      message: '请选择要执行的操作:',
      options: [
        { value: 'fill', label: '⚡ tug fill', hint: '【推荐】通过 CDP 直连 Chrome 自动填表与挂载物料' },
        { value: 'scan', label: '🔍 tug scan', hint: '校验本地配置、物料尺寸与权限' },
        { value: 'sync', label: '🔄 tug sync', hint: '从远端发版源拉取最新 Changelog' },
        { value: 'init', label: '✨ tug init', hint: '初始化生成 tug.yml 模板' },
        { value: 'pull', label: '📥 tug pull', hint: '通过 CDP 直连提取现有线上配置回写本地' },
        { value: 'upgrade', label: '🚀 tug upgrade', hint: '检查并升级 tug CLI 工具自身' },
      ],
    });

    if (p.isCancel(action)) {
      p.cancel('已退出 tug。');
      process.exit(0);
    }

    switch (action) {
      case 'fill':
        await fillCommand({});
        break;
      case 'scan':
        await scanCommand();
        break;
      case 'sync':
        await syncCommand({});
        break;
      case 'init':
        await initCommand();
        break;
      case 'pull':
        await pullCommand({});
        break;
      case 'upgrade':
        await upgradeCommand();
        break;
    }
  })();
} else {
  program.parse();
}
