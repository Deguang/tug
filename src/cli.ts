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
import { dockCommand } from './commands/dock.js';
import { pullCommand } from './commands/pull.js';
import { syncCommand } from './commands/sync.js';
import { upgradeCommand } from './commands/upgrade.js';
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
  .command('dock')
  .description('启动本地服务，等待浏览器注入端拉取数据')
  .option('-p, --port <port>', '服务端口号', '4321')
  .action(dockCommand);

program
  .command('pull')
  .description('启动服务并等待浏览器回传表单数据，写入 tug.yml')
  .option('-p, --port <port>', '服务端口号', '4321')
  .action(pullCommand);

program
  .command('sync')
  .description('从插件发版源同步最新发版详情与 Changelog，增量更新本地 tug.yml')
  .option('-r, --repo <owner/repo>', '指定远端仓库地址')
  .option('-l, --locale <locale>', '更新对应语言的 Changelog (默认 en)')
  .action(syncCommand);

program
  .command('upgrade')
  .description('检查并升级 tug CLI 工具自身')
  .action(upgradeCommand);

// 当没有传递任何参数时，启动 Mole 风格交互式菜单
if (process.argv.length <= 2) {
  console.log(banner);

  (async () => {
    const action = await p.select({
      message: '请选择要执行的操作:',
      options: [
        { value: 'scan', label: '🔍 tug scan', hint: '校验本地配置、物料尺寸与权限' },
        { value: 'dock', label: '⚓ tug dock', hint: '启动本地服务，开始浏览器一键填表' },
        { value: 'sync', label: '🔄 tug sync', hint: '从远端发版源拉取最新 Changelog' },
        { value: 'pull', label: '📥 tug pull', hint: '接收浏览器端已填表单，回写至本地配置' },
        { value: 'init', label: '✨ tug init', hint: '初始化生成 tug.yml 模板' },
        { value: 'upgrade', label: '🚀 tug upgrade', hint: '检查并升级 tug CLI 工具自身' },
      ],
    });

    if (p.isCancel(action)) {
      p.cancel('已退出 tug。');
      process.exit(0);
    }

    switch (action) {
      case 'scan':
        await scanCommand();
        break;
      case 'dock':
        await dockCommand({});
        break;
      case 'sync':
        await syncCommand({});
        break;
      case 'pull':
        await pullCommand({});
        break;
      case 'init':
        await initCommand();
        break;
      case 'upgrade':
        await upgradeCommand();
        break;
    }
  })();
} else {
  program.parse();
}
