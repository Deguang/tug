/**
 * tug init 命令 (全自动智能嗅探与参数自检版)
 *
 * 核心设计：
 * 1. 自动嗅探 manifest.json (name, description, default_locale, permissions, host_permissions, icons)
 * 2. 自动嗅探 package.json (author.email, homepage, repository)
 * 3. 自动嗅探 _locales/ 国际化多语言目录
 * 4. 自动匹配本地已有物料截图文件 (assets/, images/, preview/ 等)
 * 5. 交互式补齐关键必填项 (如邮箱、隐私URL)，并做即时格式校验
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import chalk from 'chalk';
import * as p from '@clack/prompts';
import { printSection, printStatusRow } from '../modules/ui.js';

export async function initCommand(): Promise<void> {
  p.intro(chalk.bgCyan.black.bold(' ⚓ TUG INIT ') + chalk.dim(' 智能嗅探插件环境并生成可用配置'));

  const cwd = process.cwd();
  const targetPath = path.resolve(cwd, 'tug.yml');

  if (fs.existsSync(targetPath)) {
    p.log.warn(`检测到当前目录已存在 ${chalk.bold('tug.yml')}`);
    const shouldOverwrite = await p.confirm({
      message: '是否覆盖现有 tug.yml 文件？',
      initialValue: false,
    });

    if (p.isCancel(shouldOverwrite) || !shouldOverwrite) {
      p.cancel('已取消初始化，保留原文件。');
      return;
    }
  }

  const s = p.spinner();
  s.start('正在嗅探当前插件工程元数据...');

  // ================= 1. 嗅探 manifest.json =================
  let manifestName = '';
  let manifestDesc = '';
  let defaultLocale = 'en';
  const manifestPermissions: Record<string, string> = {};
  const manifestHostPermissions: Record<string, string> = {};
  let icon128Path = '';

  const manifestPath = path.resolve(cwd, 'manifest.json');
  const hasManifest = fs.existsSync(manifestPath);

  if (hasManifest) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (manifest.name) manifestName = manifest.name;
      if (manifest.description) manifestDesc = manifest.description;
      if (manifest.default_locale) defaultLocale = manifest.default_locale;

      // 提取 permissions
      if (Array.isArray(manifest.permissions)) {
        for (const perm of manifest.permissions) {
          manifestPermissions[perm] = `用于${perm}相关核心扩展功能的正常运行`;
        }
      }

      // 提取 host_permissions
      if (Array.isArray(manifest.host_permissions)) {
        for (const host of manifest.host_permissions) {
          manifestHostPermissions[host] = `用于与特定目标服务器通信传输必要数据`;
        }
      }

      // 提取 icon (优先 128)
      if (manifest.icons) {
        const iconRel = manifest.icons['128'] || manifest.icons['96'] || manifest.icons['48'] || manifest.icons['16'];
        if (iconRel && fs.existsSync(path.resolve(cwd, iconRel))) {
          icon128Path = iconRel.startsWith('./') ? iconRel : `./${iconRel}`;
        }
      }
    } catch {
      // 忽略解析错误
    }
  }

  // ================= 2. 嗅探 package.json =================
  let pkgEmail = '';
  let pkgHomepage = '';
  let pkgRepo = '';

  const pkgPath = path.resolve(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (typeof pkg.author === 'string') {
        const emailMatch = pkg.author.match(/<([^>]+)>/);
        if (emailMatch) pkgEmail = emailMatch[1];
      } else if (pkg.author?.email) {
        pkgEmail = pkg.author.email;
      }

      if (pkg.homepage) pkgHomepage = pkg.homepage;

      if (typeof pkg.repository === 'string') {
        const match = pkg.repository.match(/github\.com[/:]([^/]+)\/([^/\s.]+)/);
        if (match) pkgRepo = `${match[1]}/${match[2]}`;
      } else if (pkg.repository?.url) {
        const match = pkg.repository.url.match(/github\.com[/:]([^/]+)\/([^/\s.]+)/);
        if (match) pkgRepo = `${match[1]}/${match[2].replace(/\.git$/, '')}`;
      }
    } catch {
      // 忽略
    }
  }

  // ================= 3. 嗅探本地物料目录与截图 =================
  const possibleImgDirs = ['assets', 'images', 'preview', 'screenshots', 'docs'];
  const foundScreenshots: string[] = [];

  for (const dirName of possibleImgDirs) {
    const fullDir = path.resolve(cwd, dirName);
    if (fs.existsSync(fullDir) && fs.statSync(fullDir).isDirectory()) {
      try {
        const files = fs.readdirSync(fullDir);
        for (const file of files) {
          if (/\.(png|jpg|jpeg|webp)$/i.test(file)) {
            const relPath = `./${dirName}/${file}`;
            if (!icon128Path && file.includes('128')) {
              icon128Path = relPath;
            } else if (file.toLowerCase().includes('screen') || file.toLowerCase().includes('preview') || file.toLowerCase().includes('shot')) {
              foundScreenshots.push(relPath);
            }
          }
        }
      } catch {
        // 忽略
      }
    }
  }

  // 如果仍未嗅探到图标，给个标准默认路径
  if (!icon128Path) {
    icon128Path = './assets/icon-128.png';
  }
  if (foundScreenshots.length === 0) {
    foundScreenshots.push('./assets/screenshot-1.png');
  }

  // ================= 4. 嗅探 _locales/ 多语言 =================
  const localesData: Record<string, any> = {};
  const localesDir = path.resolve(cwd, '_locales');

  if (fs.existsSync(localesDir) && fs.statSync(localesDir).isDirectory()) {
    try {
      const localeFolders = fs.readdirSync(localesDir);
      for (const loc of localeFolders) {
        const msgPath = path.resolve(localesDir, loc, 'messages.json');
        if (fs.existsSync(msgPath)) {
          try {
            const msg = JSON.parse(fs.readFileSync(msgPath, 'utf-8'));
            const extName = msg.extensionName?.message || msg.appName?.message || manifestName || 'My Extension';
            const extDesc = msg.extensionDescription?.message || msg.appDesc?.message || manifestDesc || '';
            const normalizedLocale = loc.replace('-', '_');

            localesData[normalizedLocale] = {
              name: extName,
              short_description: extDesc.substring(0, 130) || 'An extension tool.',
              description: extDesc || `Description for ${extName}`,
              changelog: 'v1.0.0: Initial release',
            };
          } catch {
            // 忽略
          }
        }
      }
    } catch {
      // 忽略
    }
  }

  // 如果没有 _locales，则生成默认语言配置
  if (Object.keys(localesData).length === 0) {
    localesData[defaultLocale] = {
      name: manifestName || 'My Extension',
      short_description: (manifestDesc.substring(0, 130)) || 'An extension tool.',
      description: manifestDesc || `${manifestName || 'Extension'} detailed description.`,
      changelog: 'v1.0.0: Initial release',
    };
  }

  s.stop(chalk.green('项目环境嗅探完成！'));

  console.log('');
  printSection('嗅探检测清单');
  printStatusRow('Manifest 规范', hasManifest ? 'manifest.json 已识别' : '未检测到 (将使用通用默认值)', hasManifest);
  printStatusRow('敏感权限 (Permissions)', `${Object.keys(manifestPermissions).length} 项已自动生成解释占位`, true);
  printStatusRow('Host 权限 (Host Perms)', `${Object.keys(manifestHostPermissions).length} 项已自动生成解释占位`, true);
  printStatusRow('多语言环境 (_locales)', `${Object.keys(localesData).length} 种 (${Object.keys(localesData).join(', ')})`, true);
  printStatusRow('关联仓库 (Repository)', pkgRepo || '未预置', !!pkgRepo);
  printStatusRow('应用图标 (Icon 128)', icon128Path, fs.existsSync(path.resolve(cwd, icon128Path)));
  printStatusRow('截图物料 (Screenshots)', `${foundScreenshots.length} 项已发现`, foundScreenshots.length > 0);

  console.log('');

  // ================= 5. 交互式补齐关键必填项 =================
  let supportEmail = pkgEmail;
  if (!supportEmail) {
    if (!process.stdin.isTTY) {
      supportEmail = 'support@example.com';
    } else {
      const inputEmail = await p.text({
        message: '请输入开发者支持邮箱 (必填):',
        placeholder: 'support@example.com',
        validate: (val) => {
          if (!val || !val.includes('@') || !val.includes('.')) {
            return '请输入合法的邮箱格式，例如: support@example.com';
          }
        },
      });
      if (p.isCancel(inputEmail)) {
        p.cancel('初始化已中断');
        return;
      }
      supportEmail = inputEmail;
    }
  }

  let privacyUrl = '';
  const defaultPrivacy = pkgHomepage ? `${pkgHomepage.replace(/\/$/, '')}/privacy` : 'https://example.com/privacy';

  if (!process.stdin.isTTY) {
    privacyUrl = defaultPrivacy;
  } else {
    const inputPrivacy = await p.text({
      message: '请输入隐私政策网页 URL (必填，商店审核硬性要求):',
      placeholder: defaultPrivacy,
      initialValue: defaultPrivacy,
      validate: (val) => {
        if (!val || !val.startsWith('http://') && !val.startsWith('https://')) {
          return '请输入合法的完整 URL (需以 http:// 或 https:// 开头)';
        }
      },
    });

    if (p.isCancel(inputPrivacy)) {
      p.cancel('初始化已中断');
      return;
    }
    privacyUrl = inputPrivacy;
  }

  // ================= 6. 组装最终合规 tug.yml =================
  const tugData = {
    version: '1.0',
    source: {
      repository: pkgRepo || '',
      changelog_locale: defaultLocale,
    },
    global: {
      category: 'developer_tools',
      support_email: supportEmail,
      privacy_policy_url: privacyUrl,
      home_page_url: pkgHomepage || (privacyUrl.startsWith('http') ? new URL(privacyUrl).origin : ''),
    },
    privacy: {
      permissions: manifestPermissions,
      host_permissions: manifestHostPermissions,
      data_usage: {
        single_purpose: true,
        sell_data: false,
      },
    },
    assets: {
      icon_128: icon128Path,
      screenshots: foundScreenshots,
      promo_small: '',
      promo_large: '',
    },
    locales: localesData,
  };

  const yamlContent = yaml.dump(tugData, {
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });

  fs.writeFileSync(targetPath, yamlContent, 'utf-8');

  console.log('');
  p.note(
    `1. ${chalk.cyan.bold('tug scan')}  -> 校验生成的配置与图片尺寸（已填好核心必填项）\n` +
    `2. ${chalk.cyan.bold('tug fill')}  -> 直连 Chrome 自动填表挂载物料（免装扩展）\n` +
    `3. ${chalk.cyan.bold('tug dock')}  -> 启动本地服务协同（支持油猴/书签模式）`,
    '接下来你可以运行'
  );

  p.outro(chalk.green.bold('✔ tug.yml 智能初始化完成！参数已自检校准。'));
}
