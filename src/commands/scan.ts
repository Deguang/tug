/**
 * tug scan 命令 (Mole 交互风格重构版)
 * 读取配置、校验物料、比对权限并以精美状态清单形式展示
 */
import chalk from 'chalk';
import * as p from '@clack/prompts';
import { Parser } from '../modules/parser.js';
import { ManifestReader } from '../modules/manifest.js';
import { AssetValidator } from '../modules/validator.js';
import { printHeader, printStatusRow, printSection } from '../modules/ui.js';

export async function scanCommand(): Promise<void> {
  p.intro(chalk.bgCyan.black.bold(' ⚓ TUG SCAN ') + chalk.dim(' 正在扫描并核查插件物料与合规性'));

  const s = p.spinner();

  // 1. 解析 tug.yml
  s.start('解析本地 tug.yml 配置文件...');
  const parser = new Parser();
  let scheme;
  try {
    scheme = parser.parse();
    s.stop(chalk.green('tug.yml 规范检查通过'));
  } catch (err) {
    s.stop(chalk.red('tug.yml 校验失败'));
    p.cancel((err as Error).message);
    process.exit(1);
  }

  // 概览
  printSection('扩展信息概览');
  const locales = Object.keys(scheme.locales);
  printStatusRow('支持语言数', `${locales.length} 种 (${locales.join(', ')})`, true);
  printStatusRow('分类类别', scheme.global.category, true);
  printStatusRow('支持邮箱', scheme.global.support_email, true);
  printStatusRow('隐私政策', scheme.global.privacy_policy_url ? '已配置' : '未配置', !!scheme.global.privacy_policy_url);

  // 2. 权限比对
  printSection('权限与隐私声明 (Privacy Justifications)');
  const manifestReader = new ManifestReader();
  let permWarning = false;

  if (manifestReader.exists()) {
    try {
      const diff = manifestReader.diffPermissions(scheme.privacy);
      if (diff.permissions.unexplained.length > 0 || diff.hostPermissions.unexplained.length > 0) {
        permWarning = true;
        diff.permissions.unexplained.forEach((perm) => {
          printStatusRow(`未解释权限: ${perm}`, '缺少 justification 说明', false);
        });
        diff.hostPermissions.unexplained.forEach((host) => {
          printStatusRow(`未解释 Host: ${host}`, '缺少 justification 说明', false);
        });
      } else {
        printStatusRow('API 权限对齐', `${Object.keys(scheme.privacy.permissions).length} 项已合规声明`, true);
        printStatusRow('Host 权限对齐', `${Object.keys(scheme.privacy.host_permissions).length} 项已合规声明`, true);
      }
    } catch (err) {
      printStatusRow('Manifest 读取', (err as Error).message, false);
      permWarning = true;
    }
  } else {
    printStatusRow('manifest.json', '未找到 (跳过权限 Diff)', true);
  }

  // 3. 物料校验
  printSection('媒体物料规格校验 (Assets)');
  s.start('通过 sharp 计算图片分辨率与文件大小...');
  const baseDir = parser.getBaseDir();
  const validator = new AssetValidator(baseDir);
  const errors = await validator.validate(scheme.assets);
  s.stop('物料尺寸与体积扫描完毕');

  printStatusRow('图标 (icon_128)', scheme.assets.icon_128, !errors.some((e) => e.file === scheme.assets.icon_128));
  scheme.assets.screenshots.forEach((ss, idx) => {
    printStatusRow(`截图 [${idx + 1}]`, ss, !errors.some((e) => e.file === ss));
  });

  if (scheme.assets.promo_small) {
    printStatusRow('小推广图 (440x280)', scheme.assets.promo_small, !errors.some((e) => e.file === scheme.assets.promo_small));
  }
  if (scheme.assets.promo_large) {
    printStatusRow('大推广图 (1400x560)', scheme.assets.promo_large, !errors.some((e) => e.file === scheme.assets.promo_large));
  }
  if (scheme.assets.package) {
    printStatusRow('插件安装包 (ZIP)', scheme.assets.package, !errors.some((e) => e.file === scheme.assets.package));
  }

  console.log('');

  if (errors.length > 0) {
    p.note(
      errors.map((e) => `• [${e.label}] ${e.file}\n  ${chalk.dim(e.message)}`).join('\n\n'),
      chalk.red.bold(`发现 ${errors.length} 项物料不合规`)
    );
    p.outro(chalk.red('❌ 请修正物料规格后重试'));
    process.exit(1);
  }

  if (permWarning) {
    p.note(
      '建议在 tug.yml 的 privacy.permissions 中补充对应权限的使用理由，避免审核驳回。',
      chalk.yellow.bold('权限说明提醒')
    );
  }

  p.outro(chalk.green.bold('✨ 所有物料与配置核验完毕！可直接运行 ') + chalk.cyan.bold('tug dock') + chalk.green.bold(' 开始自动填表。'));
}
