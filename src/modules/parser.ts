/**
 * Parser 模块
 * 负责读取 tug.yml 并通过 Zod 校验
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import chalk from 'chalk';
import { TugSchemeSchema, type TugScheme } from '../schema/tug-scheme.js';

export class Parser {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.resolve(process.cwd(), 'tug.yml');
  }

  /**
   * 检查 tug.yml 是否存在
   */
  exists(): boolean {
    return fs.existsSync(this.configPath);
  }

  /**
   * 读取并校验 tug.yml
   */
  parse(): TugScheme {
    if (!this.exists()) {
      throw new Error(
        `未找到配置文件: ${this.configPath}\n` +
        `请先执行 ${chalk.cyan('tug init')} 初始化项目。`
      );
    }

    const raw = fs.readFileSync(this.configPath, 'utf-8');
    let data: unknown;

    try {
      data = yaml.load(raw);
    } catch (err) {
      throw new Error(`tug.yml 解析失败，请检查 YAML 语法：${(err as Error).message}`);
    }

    const result = TugSchemeSchema.safeParse(data);

    if (!result.success) {
      const errors = result.error.issues
        .map((issue) => `  ${chalk.red('✗')} ${issue.path.join('.')}: ${issue.message}`)
        .join('\n');
      throw new Error(`tug.yml 校验失败:\n${errors}`);
    }

    return result.data;
  }

  /**
   * 获取 tug.yml 所在目录（用于解析相对路径）
   */
  getBaseDir(): string {
    return path.dirname(this.configPath);
  }
}
