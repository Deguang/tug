/**
 * tug upgrade 命令
 * 检查并提示/升级 tug CLI 工具自身 (Update Self)
 */
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function upgradeCommand(): Promise<void> {
  console.log(chalk.bold('\n🚀 tug upgrade - 检查 CLI 自身升级\n'));

  // 读取当前 CLI package.json 的版本号
  let currentVersion = '0.1.0';
  try {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.version) currentVersion = pkg.version;
    }
  } catch {
    // 降级使用默认
  }

  console.log(chalk.gray(`  当前版本: v${currentVersion}`));
  console.log(chalk.cyan('  正在检查远端最新版本...'));

  try {
    // 检查 npm registry 上 tug 发布的最新版本
    const res = await fetch('https://registry.npmjs.org/tug/latest', {
      headers: { 'Accept': 'application/json' },
    });

    if (res.ok) {
      const data = await res.json() as { version?: string };
      const latestVersion = data.version;

      if (latestVersion && latestVersion !== currentVersion) {
        console.log(chalk.green(`\n  发现新版本: v${latestVersion} (当前: v${currentVersion})`));
        console.log(chalk.yellow('\n  请运行以下命令进行升级:'));
        console.log(`    ${chalk.cyan('npm install -g tug@latest')}\n`);
        return;
      }
    }

    console.log(chalk.green(`\n  ✓ 当前已经是最新版本 (v${currentVersion})！\n`));
  } catch (err) {
    console.log(chalk.yellow(`\n  ⚠ 检查更新失败: ${(err as Error).message}`));
    console.log(chalk.gray('  你可以手动运行: npm install -g tug@latest 进行尝试。\n'));
  }
}
