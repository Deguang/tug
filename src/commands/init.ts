/**
 * tug init 命令 (Mole 交互风格重构版)
 * 提供平滑的向导式初始化交互
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import * as p from '@clack/prompts';
import { printStatusRow } from '../modules/ui.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function initCommand(): Promise<void> {
  p.intro(chalk.bgCyan.black.bold(' ⚓ TUG INIT ') + chalk.dim(' 初始化扩展上架编排配置'));

  const targetPath = path.resolve(process.cwd(), 'tug.yml');

  if (fs.existsSync(targetPath)) {
    p.log.warn(`检测到当前目录已存在 ${chalk.bold('tug.yml')}`);
    const shouldOverwrite = await p.confirm({
      message: '是否覆盖现有 tug.yml 文件？',
      initialValue: false,
    });

    if (p.isCancel(shouldOverwrite) || !shouldOverwrite) {
      p.cancel('已取消初始化，保留原文件。');
      return;
    }
  }

  // 尝试自动从 manifest.json 提取部分默认字段
  let defaultCategory = 'developer_tools';
  let defaultName = '';
  const manifestPath = path.resolve(process.cwd(), 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (manifest.name) defaultName = manifest.name;
    } catch {
      // 忽略
    }
  }

  // 读取模板文件
  const templatePath = path.resolve(__dirname, '../../templates/tug.template.yml');
  let content = '';

  if (fs.existsSync(templatePath)) {
    content = fs.readFileSync(templatePath, 'utf-8');
  } else {
    content = `version: "1.0"
source:
  repository: ""
  changelog_locale: "en"

global:
  category: "developer_tools"
  support_email: ""
  privacy_policy_url: ""
  home_page_url: ""

privacy:
  permissions: {}
  host_permissions: {}
  data_usage:
    single_purpose: true
    sell_data: false

assets:
  icon_128: "./assets/icon-128.png"
  screenshots:
    - "./assets/screenshot-1.png"
  promo_small: ""
  promo_large: ""

locales:
  en:
    name: "${defaultName}"
    short_description: ""
    description: |
      
    changelog: |
      
`;
  }

  fs.writeFileSync(targetPath, content, 'utf-8');

  p.note(
    `1. ${chalk.cyan('tug sync')}  -> 自动拉取远端 Release 日志与信息\n` +
    `2. ${chalk.cyan('tug scan')}  -> 校验配置文件与图片尺寸规格\n` +
    `3. ${chalk.cyan('tug dock')}  -> 挂载服务，浏览器注入一键填表`,
    '后续操作指引'
  );

  p.outro(chalk.green.bold('✔ tug.yml 创建成功！'));
}
