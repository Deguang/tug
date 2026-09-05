/**
 * Asset Validator 模块
 * 零依赖纯 JS 校验图片物料的分辨率、长宽比和文件体积
 */
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import type { TugAssets } from '../schema/tug-scheme.js';

interface AssetRule {
  label: string;
  /** 允许的分辨率列表 [width, height] */
  allowedSizes?: [number, number][];
  /** 最大文件体积 (bytes) */
  maxSize?: number;
  required: boolean;
}

// 各物料的校验规则
const ASSET_RULES: Record<string, AssetRule> = {
  icon_128: {
    label: '图标 (128x128)',
    allowedSizes: [[128, 128]],
    maxSize: 1 * 1024 * 1024, // 1MB
    required: true,
  },
  screenshot: {
    label: '截图',
    allowedSizes: [
      [1280, 800],
      [640, 400],
    ],
    maxSize: 4 * 1024 * 1024, // 4MB
    required: true,
  },
  promo_small: {
    label: '小推广图 (440x280)',
    allowedSizes: [[440, 280]],
    maxSize: 2 * 1024 * 1024,
    required: false,
  },
  promo_large: {
    label: '大推广图 (1400x560)',
    allowedSizes: [[1400, 560]],
    maxSize: 4 * 1024 * 1024,
    required: false,
  },
};

/**
 * 纯 JS 轻量图片尺寸探测器 (零第三方/C++依赖，支持 PNG / JPEG / WEBP / GIF)
 */
function readImageDimensions(buffer: Buffer): { width: number; height: number } {
  // PNG
  if (buffer.length >= 24 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  // GIF
  if (buffer.length >= 10 && buffer.toString('ascii', 0, 3) === 'GIF') {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  // JPEG
  if (buffer.length >= 4 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xFF) break;
      const marker = buffer[offset + 1];
      if (marker === 0xD9 || marker === 0xDA) break; // EOI or SOS
      const len = buffer.readUInt16BE(offset + 2);
      if ([0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF].includes(marker)) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + len;
    }
  }
  // WEBP
  if (buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const type = buffer.toString('ascii', 12, 16);
    if (type === 'VP8 ') {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    } else if (type === 'VP8L') {
      const b = buffer.readUInt32LE(21);
      return {
        width: (b & 0x3FFF) + 1,
        height: ((b >> 14) & 0x3FFF) + 1,
      };
    } else if (type === 'VP8X') {
      return {
        width: (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)) + 1,
        height: (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)) + 1,
      };
    }
  }
  throw new Error('不支持或未识别的图片格式 (仅支持 PNG, JPEG, WEBP, GIF)');
}

export interface ValidationError {
  file: string;
  label: string;
  message: string;
}

export class AssetValidator {
  private baseDir: string;
  private errors: ValidationError[] = [];

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  /**
   * 校验单个图片文件
   */
  private async validateImage(
    filePath: string,
    rule: AssetRule
  ): Promise<void> {
    const absPath = path.resolve(this.baseDir, filePath);

    // 检查文件是否存在
    if (!fs.existsSync(absPath)) {
      if (rule.required) {
        this.errors.push({
          file: filePath,
          label: rule.label,
          message: '文件不存在',
        });
      }
      return;
    }

    // 检查文件体积
    const stat = fs.statSync(absPath);
    if (rule.maxSize && stat.size > rule.maxSize) {
      const maxMB = (rule.maxSize / 1024 / 1024).toFixed(1);
      const actualMB = (stat.size / 1024 / 1024).toFixed(2);
      this.errors.push({
        file: filePath,
        label: rule.label,
        message: `文件体积 ${actualMB}MB 超过限制 ${maxMB}MB`,
      });
    }

    // 检查分辨率 (纯 JS 零原生依赖解析)
    try {
      const buf = fs.readFileSync(absPath);
      const { width, height } = readImageDimensions(buf);

      if (rule.allowedSizes && width && height) {
        const isValid = rule.allowedSizes.some(
          ([w, h]) => w === width && h === height
        );
        if (!isValid) {
          const allowed = rule.allowedSizes
            .map(([w, h]) => `${w}x${h}`)
            .join(' 或 ');
          this.errors.push({
            file: filePath,
            label: rule.label,
            message: `分辨率 ${width}x${height} 不符合要求，允许: ${allowed}`,
          });
        }
      }
    } catch (err) {
      this.errors.push({
        file: filePath,
        label: rule.label,
        message: `无法读取图片元数据: ${(err as Error).message}`,
      });
    }
  }

  /**
   * 校验所有物料
   */
  async validate(assets: TugAssets): Promise<ValidationError[]> {
    this.errors = [];

    // 校验图标
    await this.validateImage(assets.icon_128, ASSET_RULES.icon_128);

    // 校验截图
    for (const screenshot of assets.screenshots) {
      await this.validateImage(screenshot, ASSET_RULES.screenshot);
    }

    // 校验推广图（可选）
    if (assets.promo_small) {
      await this.validateImage(assets.promo_small, ASSET_RULES.promo_small);
    }
    if (assets.promo_large) {
      await this.validateImage(assets.promo_large, ASSET_RULES.promo_large);
    }

    // 校验插件安装包（可选）
    if (assets.package) {
      const pkgPath = path.resolve(this.baseDir, assets.package);
      if (!fs.existsSync(pkgPath)) {
        this.errors.push({
          file: assets.package,
          label: '插件安装包 (package)',
          message: '文件不存在，请先打包生成 zip 文件',
        });
      } else if (!assets.package.endsWith('.zip')) {
        this.errors.push({
          file: assets.package,
          label: '插件安装包 (package)',
          message: '插件安装包必须是 .zip 格式',
        });
      } else {
        const stats = fs.statSync(pkgPath);
        if (stats.size > 200 * 1024 * 1024) { // 200MB Chrome 官方上限
          this.errors.push({
            file: assets.package,
            label: '插件安装包 (package)',
            message: `文件体积超限 (${(stats.size / 1024 / 1024).toFixed(1)}MB)，Chrome 上限为 200MB`,
          });
        }
      }
    }

    return this.errors;
  }

  /**
   * 打印校验结果
   */
  printResult(errors: ValidationError[]): void {
    if (errors.length === 0) {
      console.log(chalk.green('  ✓ 所有物料校验通过。'));
      return;
    }

    console.log(chalk.red(`\n  ✗ 发现 ${errors.length} 个物料问题:\n`));
    for (const err of errors) {
      console.log(`  ${chalk.red('✗')} [${err.label}] ${chalk.gray(err.file)}`);
      console.log(`    ${err.message}`);
    }
  }
}
