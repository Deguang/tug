/**
 * tug upgrade 命令
 * 从 GitHub Releases 检查并升级 tug CLI 工具自身 (脱离 npm Registry 依赖)
 */
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import * as p from '@clack/prompts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 语义化版本比对 (SemVer Comparison)
 * 返回 true 当且仅当 latest 严格高于 current
 */
export function isNewerVersion(latest: string, current: string): boolean {
  const cleanLatest = latest.replace(/^v/, '').trim();
  const cleanCurrent = current.replace(/^v/, '').trim();

  const lParts = cleanLatest.split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const cParts = cleanCurrent.split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);

  for (let i = 0; i < Math.max(lParts.length, cParts.length, 3); i++) {
    const lVal = lParts[i] || 0;
    const cVal = cParts[i] || 0;
    if (lVal > cVal) return true;
    if (lVal < cVal) return false;
  }
  return false;
}

/**
 * 判断版本差异类型 (Patch / Minor / Major)
 */
export function getVersionTier(latest: string, current: string): 'Major' | 'Minor' | 'Patch' | 'Same' {
  const l = latest.replace(/^v/, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const c = current.replace(/^v/, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);

  if ((l[0] || 0) > (c[0] || 0)) return 'Major';
  if ((l[1] || 0) > (c[1] || 0)) return 'Minor';
  if ((l[2] || 0) > (c[2] || 0)) return 'Patch';
  return 'Same';
}

/**
 * 自动原地执行升级
 */
async function executeAutoUpgrade(repo: string, latestTag: string): Promise<void> {
  const s = p.spinner();

  if (process.env.TUG_MOCK_LATEST_VERSION) {
    s.start(`[仿真测试] 正在模拟自动拉取并安装 ${latestTag}...`);
    await new Promise((r) => setTimeout(r, 1200));
    s.stop(chalk.green(`✔ [仿真测试] 自动升级完成！已平滑迁移至 ${latestTag}`));
    p.outro(chalk.green.bold(`🎉 恭喜！tug 已完成自我升级，可随时输入 tug 体验新特性。`));
    return;
  }

  s.start(`正在自动升级 tug 至 ${latestTag}...`);

  // 1. 检查是否为 Homebrew 环境
  try {
    const brewCheck = execSync('brew list tug 2>/dev/null', { encoding: 'utf-8' });
    if (brewCheck && brewCheck.includes('tug')) {
      s.message('检测到 Homebrew 环境，正在执行 brew upgrade tug...');
      execSync('brew upgrade tug', { stdio: 'pipe' });
      s.stop(chalk.green(`✔ 升级成功！已通过 Homebrew 更新至 ${latestTag}`));
      p.outro(chalk.green.bold('🎉 恭喜！tug 已完成自动升级。'));
      return;
    }
  } catch {}

  // 2. 检查是否可以通过 npm 全局升级 (npm install -g Deguang/tug)
  try {
    s.message(`正在通过 GitHub 更新全局 CLI (${repo})...`);
    execSync(`npm install -g ${repo}`, { stdio: 'pipe' });
    s.stop(chalk.green(`✔ 升级成功！已全局更新至 ${latestTag}`));
    p.outro(chalk.green.bold('🎉 恭喜！tug 已完成自动升级。'));
    return;
  } catch (err) {
    // 3. 降级：通过官方一键脚本覆盖更新
    try {
      s.message('正在通过官方安装脚本执行快速覆盖升级...');
      execSync(`curl -fsSL https://raw.githubusercontent.com/${repo}/main/scripts/install.sh | bash`, { stdio: 'pipe' });
      s.stop(chalk.green(`✔ 升级成功！已更新至 ${latestTag}`));
      p.outro(chalk.green.bold('🎉 恭喜！tug 已完成自动升级。'));
      return;
    } catch (e) {
      s.stop(chalk.red('自动执行升级遇到异常'));
      p.note(
        `• 错误信息: ${(e as Error).message || (err as Error).message}\n` +
        `• 备用方案: 请尝试手动执行 npm install -g ${repo}`,
        '手动升级提示'
      );
      p.cancel('自动升级流程未完成。');
    }
  }
}

export interface UpgradeCommandOptions {
  yes?: boolean;
}

export async function upgradeCommand(options: UpgradeCommandOptions = {}): Promise<void> {
  console.log(chalk.bold('\n🚀 tug upgrade - 检查并执行 CLI 自我升级 (GitHub Releases)\n'));

  let currentVersion = '0.1.0';
  let repo = 'Deguang/tug';

  try {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.version) currentVersion = pkg.version;
      if (pkg.repository?.url) {
        const m = pkg.repository.url.match(/github\.com[/:]([^/]+)\/([^/\s.]+)/);
        if (m) repo = `${m[1]}/${m[2]}`;
      }
    }
  } catch {
    // 降级使用默认
  }

  console.log(chalk.gray(`  当前安装版本: v${currentVersion}`));
  console.log(chalk.cyan(`  正在检查 GitHub (${repo}) 远端发版状态...`));

  try {
    let latestTag = '';
    let releaseName = '';
    let publishedAt = '';

    // 支持测试/仿真注入 (用于验证小版本升级流程)
    if (process.env.TUG_MOCK_LATEST_VERSION) {
      latestTag = process.env.TUG_MOCK_LATEST_VERSION;
      releaseName = 'Release ' + latestTag + ' (Test Patch Update)';
      publishedAt = new Date().toISOString();
      console.log(chalk.magenta(`  [DEBUG/TEST] 模拟远端最新发版: ${latestTag}`));
    } else {
      const headers: Record<string, string> = {
        'User-Agent': 'tug-cli',
        'Accept': 'application/vnd.github.v3+json',
      };
      if (process.env.GITHUB_TOKEN) {
        headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
      }

      const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });

      if (res.status === 404) {
        console.log(chalk.green(`\n  ✓ 当前已经是最新版本 (v${currentVersion})！(远端暂无更高 Release)\n`));
        return;
      }

      if (!res.ok) {
        throw new Error(`GitHub API 返回 HTTP ${res.status}: ${res.statusText}`);
      }

      const data = (await res.json()) as {
        tag_name?: string;
        name?: string;
        published_at?: string;
        body?: string;
      };

      latestTag = data.tag_name || '';
      releaseName = data.name || '';
      publishedAt = data.published_at || '';
    }

    const latestVersion = latestTag.replace(/^v/, '');

    if (latestVersion && isNewerVersion(latestVersion, currentVersion)) {
      const tier = getVersionTier(latestVersion, currentVersion);
      const tierLabel =
        tier === 'Patch'
          ? chalk.bgGreen.black.bold(' 补丁小版本 (Patch) ')
          : tier === 'Minor'
          ? chalk.bgCyan.black.bold(' 功能小版本 (Minor) ')
          : chalk.bgYellow.black.bold(' 重大版本 (Major) ');

      console.log(chalk.green(`\n  发现新版本: v${latestVersion} ${tierLabel} (当前: v${currentVersion})`));
      if (releaseName) console.log(chalk.gray(`  发布说明: ${releaseName}`));
      if (publishedAt) {
        console.log(chalk.gray(`  发布时间: ${new Date(publishedAt).toLocaleString()}`));
      }
      console.log('');

      // 直接自动执行升级
      let shouldProceed = options.yes;
      if (!shouldProceed) {
        const answer = await p.confirm({
          message: `是否立即自动升级至 v${latestVersion}？`,
          initialValue: true,
        });
        if (p.isCancel(answer)) {
          p.cancel('已取消升级。');
          return;
        }
        shouldProceed = Boolean(answer);
      }

      if (shouldProceed) {
        await executeAutoUpgrade(repo, latestTag);
        return;
      }

      console.log(chalk.yellow('\n  已跳过自动升级。若后续需要手动安装，可执行:'));
      console.log(chalk.cyan(`    • Homebrew: brew upgrade tug`));
      console.log(chalk.cyan(`    • 一键脚本: curl -fsSL https://raw.githubusercontent.com/${repo}/main/scripts/install.sh | bash`));
      console.log(chalk.cyan(`    • 源码安装: npm install -g ${repo}\n`));
      return;
    }

    console.log(chalk.green(`\n  ✓ 当前已经是最新版本 (v${currentVersion})！\n`));
  } catch (err) {
    console.log(chalk.yellow(`\n  ⚠ 检查更新失败: ${(err as Error).message}`));
    console.log(chalk.gray(`  你可以手动执行以下命令尝试更新:\n    npm install -g ${repo}\n`));
  }
}
