/**
 * tug dock 命令 (Mole 风格交互重构版)
 * 启动本地 HTTP 服务，等待浏览器注入端拉取数据
 */
import chalk from 'chalk';
import * as p from '@clack/prompts';
import { Parser } from '../modules/parser.js';
import { ManifestReader } from '../modules/manifest.js';
import { AssetValidator } from '../modules/validator.js';
import { LocalServer } from '../modules/server.js';
import { printStatusRow } from '../modules/ui.js';

export async function dockCommand(options: { port?: string }): Promise<void> {
  p.intro(chalk.bgCyan.black.bold(' ⚓ TUG DOCK ') + chalk.dim(' 准备挂载本地数据服务'));

  const s = p.spinner();

  // 1. 解析配置
  s.start('读取本地 tug.yml 配置...');
  const parser = new Parser();
  let scheme;
  try {
    scheme = parser.parse();
    s.stop(chalk.green('tug.yml 加载成功'));
  } catch (err) {
    s.stop(chalk.red('tug.yml 加载失败'));
    p.cancel((err as Error).message);
    process.exit(1);
  }

  // 2. 读取 manifest.json
  s.start('读取 manifest.json 元信息...');
  const manifestReader = new ManifestReader();
  let manifest;
  try {
    manifest = manifestReader.read();
    s.stop(chalk.green(`manifest.json 加载成功 (${manifest.name} v${manifest.version})`));
  } catch (err) {
    s.stop(chalk.red('manifest.json 加载失败'));
    p.cancel((err as Error).message);
    process.exit(1);
  }

  // 3. 快速校验物料
  s.start('快速验证物料完整性...');
  const baseDir = parser.getBaseDir();
  const validator = new AssetValidator(baseDir);
  const errors = await validator.validate(scheme.assets);
  if (errors.length > 0) {
    s.stop(chalk.red('物料校验未通过'));
    validator.printResult(errors);
    p.cancel('请先修复物料问题再启动 dock 服务。可通过 tug scan 查看详情。');
    process.exit(1);
  }
  s.stop(chalk.green('物料校验通过'));

  // 4. 启动服务
  const port = options.port ? parseInt(options.port, 10) : 4321;
  const server = new LocalServer({ port });
  server.loadPayload(scheme, manifest, baseDir);
  await server.start();
}
