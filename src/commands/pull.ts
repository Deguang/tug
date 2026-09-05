import chalk from 'chalk';
import * as p from '@clack/prompts';
import { CdpDriver } from '../modules/cdp.js';
import { Writer } from '../modules/writer.js';
import CDP from 'chrome-remote-interface';

export async function pullCommand(options: any) {
  const port = parseInt(options.port || '9222', 10);
  p.intro(chalk.bgCyan.black(' ⚓ TUG PULL ') + chalk.cyan(' 通过 CDP 直连提取商店表单配置'));

  const s = p.spinner();
  s.start(`正在连接 Chrome 调试端口 (Port: ${port})...`);
  
  const cdp = new CdpDriver(port);
  const targets = await cdp.listTargets();
  
  if (targets.length === 0) {
    s.stop('未找到可连接的 Chrome 实例');
    const launch = await p.confirm({
      message: '未检测到开启调试端口的 Chrome，是否需要 Tug 帮你自动唤起一个独立的 Chrome 实例？',
      initialValue: true,
    });
    
    if (launch) {
      const launched = await cdp.launchBrowser();
      if (!launched) {
        p.outro(chalk.red('❌ 唤起 Chrome 失败，请检查环境'));
        process.exit(1);
      }
      p.note('独立 Chrome 实例已唤起。\n请在弹出的浏览器中登录 Google 账号，并打开 Chrome Web Store 开发者控制台的插件编辑页面，然后再次运行本命令。', chalk.yellow('等待操作'));
      p.outro(chalk.cyan('配置抽取中止，请准备好页面后再试。'));
      process.exit(0);
    } else {
      p.outro(chalk.red('❌ 请确保 Chrome 已开启 --remote-debugging-port 启动参数。'));
      process.exit(1);
    }
  }

  let targetId = await cdp.findStoreTargetId(targets);
  if (!targetId) {
    s.stop('未自动识别到商店页面');
    
    const pageSelect = await p.select({
      message: '未检测到 Chrome Web Store 或 Edge Partner Center 页面。请手动指定你要抽取的标签页：',
      options: targets.map(t => ({ value: t.id, label: t.title, hint: t.url.substring(0, 50) }))
    });
    
    if (p.isCancel(pageSelect)) {
      p.outro(chalk.red('操作已取消。'));
      process.exit(0);
    }
    
    targetId = pageSelect as string;
  } else {
    s.stop(`找到商店标签页: ${chalk.green(targets.find(t => t.id === targetId)?.title)}`);
  }

  s.start('正在连接标签页并抽取数据...');
  
  try {
    let client;
    try {
      client = await CDP({ target: targetId, port });
    } catch (e) {
      s.stop('连接标签页失败');
      p.outro(chalk.red(`❌ 无法连接到标签页，请确保该页面没有被 DevTools 打开 (${(e as Error).message})`));
      process.exit(1);
    }

    const { Runtime } = client;
    await Runtime.enable();

    // Inject JS to scrape the Chrome Web Store dashboard
    const scrapeScript = `
      (() => {
        const data = {
          locales: {}
        };
        
        // 尝试抽取 name
        const nameInput = document.querySelector('input[aria-label="Name"], input[name="name"]');
        if (nameInput) data.locales['en'] = { name: nameInput.value };
        
        // 尝试抽取 description
        const descInput = document.querySelector('textarea[aria-label="Description"], textarea[name="description"]');
        if (descInput) {
          data.locales['en'] = data.locales['en'] || {};
          data.locales['en'].description = descInput.value;
        }

        // 尝试抽取 short_description
        const summaryInput = document.querySelector('textarea[aria-label="Summary"], input[aria-label="Summary"]');
        if (summaryInput) {
          data.locales['en'] = data.locales['en'] || {};
          data.locales['en'].short_description = summaryInput.value;
        }
        
        // 返回抽取的数据
        return JSON.stringify(data);
      })();
    `;

    const evalRes = await Runtime.evaluate({
      expression: scrapeScript,
      returnByValue: true
    });

    if (evalRes.exceptionDetails) {
      throw new Error(evalRes.exceptionDetails.exception.description);
    }

    const extractedData = JSON.parse(evalRes.result.value);
    
    await client.close();
    s.stop('抽取完成！');
    
    const writer = new Writer(process.cwd());
    const writeCount = writer.merge(extractedData);
    
    if (writeCount > 0) {
      p.outro(chalk.green(`✨ 成功抽取并向 tug.yml 合并了 ${writeCount} 个字段配置。`));
    } else {
      p.outro(chalk.yellow('⚠️ 页面中未读取到有效配置，或 tug.yml 已经是最新的。'));
    }

  } catch (error) {
    s.stop('抽取失败');
    p.outro(chalk.red(`❌ 发生错误: ${(error as Error).message}`));
    process.exit(1);
  }
}
