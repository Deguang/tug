/**
 * Manifest 模块
 * 负责读取 manifest.json 并与 tug.yml 的 privacy 节点做 Diff
 */
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import type { TugPrivacy } from '../schema/tug-scheme.js';

export interface ManifestData {
  name: string;
  version: string;
  manifest_version: number;
  permissions?: string[];
  host_permissions?: string[];
  [key: string]: unknown;
}

export interface PermissionDiff {
  /** 在 manifest.json 中存在但 tug.yml 未解释的权限 */
  unexplained: string[];
  /** 在 tug.yml 中存在但 manifest.json 未声明的权限（多余的解释） */
  orphaned: string[];
}

export class ManifestReader {
  private manifestPath: string;

  constructor(baseDir?: string) {
    this.manifestPath = path.resolve(baseDir || process.cwd(), 'manifest.json');
  }

  /**
   * 检查 manifest.json 是否存在
   */
  exists(): boolean {
    return fs.existsSync(this.manifestPath);
  }

  /**
   * 读取 manifest.json
   */
  read(): ManifestData {
    if (!this.exists()) {
      throw new Error(
        `未找到 manifest.json: ${this.manifestPath}\n` +
        `请确认当前目录是浏览器扩展项目的根目录。`
      );
    }

    const raw = fs.readFileSync(this.manifestPath, 'utf-8');
    try {
      return JSON.parse(raw) as ManifestData;
    } catch {
      throw new Error('manifest.json 解析失败，请检查 JSON 语法。');
    }
  }

  /**
   * 将 manifest.json 的权限与 tug.yml 的 privacy 节点做 Diff
   */
  diffPermissions(privacy: TugPrivacy): {
    permissions: PermissionDiff;
    hostPermissions: PermissionDiff;
  } {
    const manifest = this.read();

    const manifestPerms = new Set(manifest.permissions || []);
    const tugPerms = new Set(Object.keys(privacy.permissions));

    const manifestHostPerms = new Set(manifest.host_permissions || []);
    const tugHostPerms = new Set(Object.keys(privacy.host_permissions));

    return {
      permissions: {
        unexplained: [...manifestPerms].filter((p) => !tugPerms.has(p)),
        orphaned: [...tugPerms].filter((p) => !manifestPerms.has(p)),
      },
      hostPermissions: {
        unexplained: [...manifestHostPerms].filter((p) => !tugHostPerms.has(p)),
        orphaned: [...tugHostPerms].filter((p) => !manifestHostPerms.has(p)),
      },
    };
  }

  /**
   * 打印 Diff 结果
   */
  printDiff(diff: ReturnType<ManifestReader['diffPermissions']>): boolean {
    let hasIssues = false;

    const printSection = (label: string, diffData: PermissionDiff) => {
      if (diffData.unexplained.length > 0) {
        hasIssues = true;
        console.log(chalk.yellow(`\n⚠ ${label} - 以下权限在 manifest.json 中声明但未在 tug.yml 中解释:`));
        diffData.unexplained.forEach((p) => console.log(`  ${chalk.red('✗')} ${p}`));
      }
      if (diffData.orphaned.length > 0) {
        console.log(chalk.gray(`\nℹ ${label} - 以下权限在 tug.yml 中有解释但 manifest.json 未声明（可清理）:`));
        diffData.orphaned.forEach((p) => console.log(`  ${chalk.gray('○')} ${p}`));
      }
    };

    printSection('permissions', diff.permissions);
    printSection('host_permissions', diff.hostPermissions);

    if (!hasIssues) {
      console.log(chalk.green('  ✓ 所有权限均已在 tug.yml 中解释。'));
    }

    return hasIssues;
  }
}
