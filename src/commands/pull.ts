/**
 * tug pull 命令 (Mole 风格交互重构版)
 * 启动本地服务并等待浏览器 injector 回传表单数据，写入 tug.yml
 */
import chalk from 'chalk';
import * as p from '@clack/prompts';
import { Parser } from '../modules/parser.js';
import { LocalServer, type PulledFormData } from '../modules/server.js';
import { Writer } from '../modules/writer.js';
import { printStatusRow } from '../modules/ui.js';

export async function pullCommand(options: { port?: string }): Promise<void> {
  p.intro(chalk.bgCyan.black.bold(' ⚓ TUG PULL ') + chalk.dim(' 准备接收浏览器端表单回传'));

  const parser = new Parser();
  if (!parser.exists()) {
    p.log.warn('未找到 tug.yml，将使用接收到的数据创建新配置。');
  }

  const writer = new Writer();
  let pullCount = 0;
  const recordedLocales = new Set<string>();

  const onPull = async (data: PulledFormData): Promise<void> => {
    pullCount++;
    recordedLocales.add(data.locale);
    const batchInfo = data.batch
      ? ` [${data.batch.index}/${data.batch.total}]`
      : '';

    console.log(`\n  ${chalk.cyan('📨 收到回传')} ${chalk.dim(`(商店: ${data.store}, 语言: ${data.locale})${batchInfo}`)}`);

    try {
      const changes = await writer.merge(data);
      if (changes.length > 0) {
        changes.forEach((c) => console.log(`     ${chalk.cyan('→')} ${c}`));
      }
      printStatusRow('已收录语言', Array.from(recordedLocales).join(', '), true);

      if (data.batch?.isLast) {
        console.log(chalk.green.bold(`\n  🎉 多语言全量同步完成！共处理 ${data.batch.total} 个语言。`));
      }
    } catch (err) {
      console.log(`  ${chalk.red('✖')} 写入失败: ${(err as Error).message}`);
      throw err;
    }
  };

  const port = options.port ? parseInt(options.port, 10) : 4321;
  const server = new LocalServer({ port, onPull });
  await server.start();
}
