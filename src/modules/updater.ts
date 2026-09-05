/**
 * Updater 模块
 * 负责从远端仓库发布渠道 (如 GitHub Releases) 拉取最新的发版详情与 Changelog，
 * 并将其安全合并更新到本地 tug.yml，不修改项目版本号或提交代码。
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import chalk from 'chalk';
import type { TugScheme } from '../schema/tug-scheme.js';

export interface RemoteReleaseInfo {
  tagName: string;
  name: string;
  body: string;
  publishedAt?: string;
  htmlUrl?: string;
}

export class Updater {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.resolve(process.cwd(), 'tug.yml');
  }

  /**
   * 解析仓库标识 (owner/repo)
   * 优先顺序:
   * 1. tug.yml 的 source.repository
   * 2. tug.yml 的 global.repository
   * 3. 本地 package.json 中的 repository 字段
   * 4. 本地 git remote get-url origin
   */
  resolveRepository(scheme?: TugScheme): { owner: string; repo: string } | null {
    let repoUrl = scheme?.source?.repository || scheme?.global?.repository;

    if (!repoUrl) {
      // 尝试从 package.json 中读取
      const pkgPath = path.resolve(path.dirname(this.configPath), 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          if (typeof pkg.repository === 'string') {
            repoUrl = pkg.repository;
          } else if (pkg.repository?.url) {
            repoUrl = pkg.repository.url;
          }
        } catch {
          // 忽略解析错误
        }
      }
    }

    if (!repoUrl) {
      // 尝试从本地 .git/config 读取
      const gitConfigPath = path.resolve(path.dirname(this.configPath), '.git/config');
      if (fs.existsSync(gitConfigPath)) {
        const content = fs.readFileSync(gitConfigPath, 'utf-8');
        const match = content.match(/url\s*=\s*.*github\.com[/:]([^/]+)\/([^/\s.]+)/);
        if (match) {
          return { owner: match[1], repo: match[2] };
        }
      }
    }

    if (!repoUrl) return null;

    // 清洗 URL，例如 git+https://github.com/owner/repo.git 或 https://github.com/owner/repo
    const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/\s.]+)/);
    if (match) {
      return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
    }

    // 形如 "owner/repo"
    const simpleMatch = repoUrl.match(/^([^/\s]+)\/([^/\s]+)$/);
    if (simpleMatch) {
      return { owner: simpleMatch[1], repo: simpleMatch[2] };
    }

    return null;
  }

  /**
   * 拉取指定仓库的最新发布信息
   */
  async fetchLatestRelease(owner: string, repo: string): Promise<RemoteReleaseInfo> {
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    const headers: Record<string, string> = {
      'User-Agent': 'tug-cli',
      'Accept': 'application/vnd.github.v3+json',
    };

    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`仓库 ${owner}/${repo} 未找到 Release 发版记录。`);
      }
      throw new Error(`获取远端发布信息失败 (${response.status}): ${response.statusText}`);
    }

    const data = await response.json() as {
      tag_name: string;
      name: string;
      body: string;
      published_at?: string;
      html_url?: string;
    };

    return {
      tagName: data.tag_name,
      name: data.name,
      body: data.body || '',
      publishedAt: data.published_at,
      htmlUrl: data.html_url,
    };
  }

  /**
   * 将远端发版数据合并至 tug.yml
   * 注意：根据用户规则，不主动修改插件版本号，只更新发版元信息及对应语言的 changelog。
   */
  async updateFromRelease(
    release: RemoteReleaseInfo,
    targetLocale = 'en'
  ): Promise<string[]> {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(`未找到配置文件: ${this.configPath}`);
    }

    const raw = fs.readFileSync(this.configPath, 'utf-8');
    const data = yaml.load(raw) as Record<string, any>;
    const changes: string[] = [];

    if (!data.locales) data.locales = {};
    if (!data.locales[targetLocale]) data.locales[targetLocale] = {};

    // 格式化 changelog: 保留 tag 及发版内容
    const cleanedBody = release.body.trim();
    const changelogText = `${release.tagName}:\n${cleanedBody}`;

    const currentChangelog = data.locales[targetLocale].changelog;
    if (currentChangelog !== changelogText) {
      data.locales[targetLocale].changelog = changelogText;
      changes.push(`locales.${targetLocale}.changelog -> 最新发版 ${release.tagName} (${cleanedBody.length} 字符)`);
    }

    // 记录最新同步的 release tag 元数据（方便后续追溯，但不擅自更改插件核心版本）
    if (!data.source) data.source = {};
    data.source.release_tag = release.tagName;

    if (changes.length > 0) {
      const output = yaml.dump(data, {
        lineWidth: -1,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false,
      });
      fs.writeFileSync(this.configPath, output, 'utf-8');
    }

    return changes;
  }
}
