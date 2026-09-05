/**
 * tug sync 命令 (Mole 交互风格重构版)
 * 从插件发版源同步最新发版详情与 Changelog，增量更新本地 tug.yml
 */
import chalk from 'chalk';
import * as p from '@clack/prompts';
import { Parser } from '../modules/parser.js';
import { Updater } from '../modules/updater.js';
import { printStatusRow, printSection } from '../modules/ui.js';

export interface SyncCommandOptions {
  repo?: string;
  locale?: string;
}

export async function syncCommand(options: SyncCommandOptions): Promise<void> {
  p.intro(chalk.bgCyan.black.bold(' ⚓ TUG SYNC ') + chalk.dim(' 同步插件远端发版日志与元数据'));

  const s = p.spinner();

  s.start('解析本地 tug.yml 配置...');
  const parser = new Parser();
  let scheme;
  try {
    scheme = parser.parse();
    s.stop(chalk.green('tug.yml 加载完成'));
  } catch (err) {
    s.stop(chalk.red('tug.yml 解析失败'));
    p.cancel((err as Error).message);
    process.exit(1);
  }

  const updater = new Updater();
  let repoInfo: { owner: string; repo: string } | null = null;

  if (options.repo) {
    const parts = options.repo.split('/');
    if (parts.length === 2 && parts[0] && parts[1]) {
      repoInfo = { owner: parts[0], repo: parts[1] };
    } else {
      p.cancel('指定的仓库格式错误，请使用 owner/repo 格式');
      process.exit(1);
    }
  } else {
    repoInfo = updater.resolveRepository(scheme);
  }

  if (!repoInfo) {
    p.log.warn('未检测到仓库源信息');
    p.note(
      `在 tug.yml 中添加:\n  source:\n    repository: "owner/repo"\n\n或运行: tug sync -r owner/repo`,
      '如何配置'
    );
    p.cancel('同步流程中止');
    process.exit(1);
  }

  const targetLocale = options.locale || scheme.source?.changelog_locale || 'en';

  printSection('同步目标');
  printStatusRow('远端仓库', `${repoInfo.owner}/${repoInfo.repo}`, true);
  printStatusRow('目标语言', targetLocale, true);

  s.start(`正在拉取 ${repoInfo.owner}/${repoInfo.repo} 的最新发版信息...`);

  try {
    const release = await updater.fetchLatestRelease(repoInfo.owner, repoInfo.repo);
    s.stop(chalk.green(`成功获取 Release: ${release.tagName}`));

    printSection('Release 信息');
    printStatusRow('版本 Tag', release.tagName, true);
    printStatusRow('标题', release.name || '无标题', true);
    if (release.publishedAt) {
      printStatusRow('发布时间', new Date(release.publishedAt).toLocaleString(), true);
    }

    s.start('增量合并 Changelog 到 tug.yml...');
    const changes = await updater.updateFromRelease(release, targetLocale);
    s.stop(chalk.green('写入完毕'));

    if (changes.length > 0) {
      p.note(
        changes.map((c) => `• ${c}`).join('\n'),
        '变动记录'
      );
    } else {
      p.log.info('Changelog 已与最新发版保持一致，无需更改。');
    }

    p.outro(chalk.green.bold('✔ 插件发版信息同步完成！可执行 ') + chalk.cyan.bold('tug scan') + chalk.green.bold(' 进行复查。'));
  } catch (err) {
    s.stop(chalk.red('拉取失败'));
    p.cancel((err as Error).message);
    process.exit(1);
  }
}
