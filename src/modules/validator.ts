/**
 * Asset Validator 模块
 * 基于 sharp 校验图片物料的分辨率、长宽比和文件体积
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
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

    // 检查分辨率
    try {
      const metadata = await sharp(absPath).metadata();
      const { width, height } = metadata;

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
