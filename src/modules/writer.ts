/**
 * Writer 模块
 * 负责将 injector 回传的表单数据合并写入 tug.yml
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import chalk from 'chalk';
import type { PulledFormData } from './server.js';

export class Writer {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.resolve(process.cwd(), 'tug.yml');
  }

  /**
   * 将 injector 回传的数据合并写入 tug.yml
   * 采用增量合并策略：只更新有值的字段，不会清空已有数据
   */
  async merge(pulled: PulledFormData): Promise<string[]> {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(`未找到 tug.yml: ${this.configPath}`);
    }

    const raw = fs.readFileSync(this.configPath, 'utf-8');
    const data = yaml.load(raw) as Record<string, any>;
    const changes: string[] = [];

    const locale = pulled.locale || 'en';
    const fields = pulled.fields;

    // 合并 global 字段
    if (!data.global) data.global = {};

    if (fields.privacy_policy_url) {
      data.global.privacy_policy_url = fields.privacy_policy_url;
      changes.push(`global.privacy_policy_url = ${fields.privacy_policy_url}`);
    }
    if (fields.home_page_url) {
      data.global.home_page_url = fields.home_page_url;
      changes.push(`global.home_page_url = ${fields.home_page_url}`);
    }
    if (fields.support_email) {
      data.global.support_email = fields.support_email;
      changes.push(`global.support_email = ${fields.support_email}`);
    }
    if (fields.category) {
      data.global.category = fields.category;
      changes.push(`global.category = ${fields.category}`);
    }

    // 合并 locale 字段
    if (!data.locales) data.locales = {};
    if (!data.locales[locale]) data.locales[locale] = {};

    if (fields.name) {
      data.locales[locale].name = fields.name;
      changes.push(`locales.${locale}.name = ${fields.name}`);
    }
    if (fields.short_description) {
      data.locales[locale].short_description = fields.short_description;
      changes.push(`locales.${locale}.short_description = ${fields.short_description}`);
    }
    if (fields.description) {
      data.locales[locale].description = fields.description;
      changes.push(`locales.${locale}.description = (${fields.description.length} chars)`);
    }
    if (fields.changelog) {
      data.locales[locale].changelog = fields.changelog;
      changes.push(`locales.${locale}.changelog = (${fields.changelog.length} chars)`);
    }

    if (changes.length > 0) {
      // 写入 YAML，保留多行文本格式
      const output = yaml.dump(data, {
        lineWidth: -1,        // 不自动换行
        noRefs: true,         // 不使用引用
        quotingType: '"',     // 统一使用双引号
        forceQuotes: false,
      });
      fs.writeFileSync(this.configPath, output, 'utf-8');
    }

    return changes;
  }

  /**
   * 打印合并结果
   */
  printResult(changes: string[]): void {
    if (changes.length === 0) {
      console.log(chalk.gray('  ℹ 未检测到需要更新的字段。'));
      return;
    }

    console.log(chalk.green(`\n  ✓ 已更新 ${changes.length} 个字段:\n`));
    for (const change of changes) {
      console.log(`    ${chalk.cyan('→')} ${change}`);
    }
    console.log('');
  }
}
