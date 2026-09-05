/**
 * Local Server 模块
 * 基于 Koa 提供本地 HTTP 接口，供浏览器注入端拉取数据
 */
import Koa from 'koa';
import Router from 'koa-router';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import type { TugScheme } from '../schema/tug-scheme.js';
import type { ManifestData } from './manifest.js';

/** injector 回传的表单数据结构 */
export interface PulledFormData {
  store: 'chrome' | 'edge' | 'unknown';
  locale: string;
  fields: {
    name?: string;
    short_description?: string;
    description?: string;
    changelog?: string;
    privacy_policy_url?: string;
    home_page_url?: string;
    support_email?: string;
    category?: string;
  };
  /** 批量拉取元信息 */
  batch?: {
    /** 本次批量的总语言数 */
    total: number;
    /** 当前是第几个 (1-based) */
    index: number;
    /** 是否为最后一个语言 */
    isLast: boolean;
  };
}

export type OnPullCallback = (data: PulledFormData) => void | Promise<void>;

export interface ServerOptions {
  port?: number;
  host?: string;
  /** 当 injector 回传数据时的回调 */
  onPull?: OnPullCallback;
}

export interface TugPayload {
  scheme: TugScheme;
  manifest: ManifestData;
  /** Base64 编码的图片数据 */
  assets: Record<string, string | string[]>;
}

export class LocalServer {
  private app: Koa;
  private router: Router;
  private port: number;
  private host: string;
  private payload: TugPayload | null = null;
  private onPull: OnPullCallback | null = null;

  constructor(options: ServerOptions = {}) {
    this.port = options.port || 4321;
    this.host = options.host || '127.0.0.1';
    this.onPull = options.onPull || null;
    this.app = new Koa();
    this.router = new Router();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * 设置 CORS 中间件
   */
  private setupMiddleware(): void {
    this.app.use(async (ctx, next) => {
      const allowedOrigins = [
        'https://chrome.google.com',
        'https://chromewebstore.google.com',
        'https://partner.microsoft.com',
      ];

      const origin = ctx.get('Origin');
      if (allowedOrigins.includes(origin)) {
        ctx.set('Access-Control-Allow-Origin', origin);
      } else {
        // 开发阶段也允许本地访问
        ctx.set('Access-Control-Allow-Origin', '*');
      }

      ctx.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      ctx.set('Access-Control-Allow-Headers', 'Content-Type');

      if (ctx.method === 'OPTIONS') {
        ctx.status = 204;
        return;
      }

      await next();
    });

    // JSON body 解析中间件
    this.app.use(async (ctx, next) => {
      if (ctx.method === 'POST' && ctx.is('application/json')) {
        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          ctx.req.on('data', (chunk: Buffer) => chunks.push(chunk));
          ctx.req.on('end', resolve);
          ctx.req.on('error', reject);
        });
        try {
          (ctx as any).requestBody = JSON.parse(Buffer.concat(chunks).toString());
        } catch {
          ctx.status = 400;
          ctx.body = { error: 'JSON 解析失败' };
          return;
        }
      }
      await next();
    });
  }

  /**
   * 设置路由
   */
  private setupRoutes(): void {
    // 主数据接口
    this.router.get('/api/tug-data', (ctx) => {
      if (!this.payload) {
        ctx.status = 503;
        ctx.body = { error: '数据尚未加载，请稍候...' };
        return;
      }
      ctx.body = this.payload;
    });

    // 健康检查
    this.router.get('/api/health', (ctx) => {
      ctx.body = { status: 'ok', timestamp: new Date().toISOString() };
    });

    // 获取指定物料的原始二进制数据
    this.router.get('/api/asset/:name', (ctx) => {
      if (!this.payload) {
        ctx.status = 503;
        ctx.body = { error: '数据尚未加载' };
        return;
      }

      const assetName = ctx.params.name;
      const assetData = this.payload.assets[assetName];

      if (!assetData || typeof assetData !== 'string') {
        ctx.status = 404;
        ctx.body = { error: `物料 ${assetName} 不存在` };
        return;
      }

      // 返回 base64 解码后的二进制数据
      const buffer = Buffer.from(assetData, 'base64');
      ctx.set('Content-Type', 'image/png');
      ctx.body = buffer;
    });

    // 接收 injector 回传的表单数据 (Tug out)
    this.router.post('/api/tug-pull', async (ctx) => {
      const body = (ctx as any).requestBody as PulledFormData | undefined;
      if (!body || !body.fields) {
        ctx.status = 400;
        ctx.body = { error: '请求体格式不正确，需要 { store, locale, fields }' };
        return;
      }

      if (this.onPull) {
        try {
          await this.onPull(body);
          ctx.body = { success: true, message: '数据已接收并写入' };
        } catch (err) {
          ctx.status = 500;
          ctx.body = { error: `写入失败: ${(err as Error).message}` };
        }
      } else {
        ctx.status = 501;
        ctx.body = { error: '当前模式不支持 pull，请使用 tug pull 命令启动服务' };
      }
    });

    // 静态暴露油猴脚本供直接点击安装或书签调用 (解决问题 4)
    this.router.get(['/injector.user.js', '/injector.js', '/install'], (ctx) => {
      // 兼容源码运行和打包运行 (dist 目录与 src 目录)
      const possiblePaths = [
        path.resolve(process.cwd(), 'src/injector/tug-injector.user.js'),
        path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/injector/tug-injector.user.js'),
        path.resolve(path.dirname(new URL(import.meta.url).pathname), 'injector/tug-injector.user.js'),
      ];

      const scriptPath = possiblePaths.find((p) => fs.existsSync(p));
      if (!scriptPath) {
        ctx.status = 404;
        ctx.body = '// tug-injector.user.js not found';
        return;
      }

      ctx.set('Content-Type', 'application/javascript; charset=utf-8');
      ctx.body = fs.readFileSync(scriptPath, 'utf-8');
    });

    this.app.use(this.router.routes());
    this.app.use(this.router.allowedMethods());
  }

  /**
   * 加载数据到内存
   */
  loadPayload(scheme: TugScheme, manifest: ManifestData, baseDir: string): void {
    const assets: Record<string, string | string[]> = {};

    const readAsBase64 = (filePath: string): string => {
      const absPath = path.resolve(baseDir, filePath);
      if (!fs.existsSync(absPath)) return '';
      return fs.readFileSync(absPath).toString('base64');
    };

    assets.icon_128 = readAsBase64(scheme.assets.icon_128);
    assets.screenshots = scheme.assets.screenshots.map(readAsBase64);
    if (scheme.assets.promo_small) {
      assets.promo_small = readAsBase64(scheme.assets.promo_small);
    }
    if (scheme.assets.promo_large) {
      assets.promo_large = readAsBase64(scheme.assets.promo_large);
    }

    this.payload = { scheme, manifest, assets };
  }

  /**
   * 启动服务
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, this.host, () => {
        console.log(`\n  ${chalk.bgCyan.black.bold(' ⚓ DOCK ONLINE ')} ${chalk.dim(`服务已挂载于 http://${this.host}:${this.port}`)}`);
        console.log(chalk.dim('  ┌─────────────────────────────────────────────────────────────┐'));
        console.log(`  │  ${chalk.cyan('数据接口')}  ${chalk.dim('.....................')} http://${this.host}:${this.port}/api/tug-data   │`);
        console.log(`  │  ${chalk.cyan('健康探针')}  ${chalk.dim('.....................')} http://${this.host}:${this.port}/api/health     │`);
        console.log(`  │  ${chalk.cyan('回传通道')}  ${chalk.dim('.....................')} http://${this.host}:${this.port}/api/tug-pull   │`);
        console.log(`  │  ${chalk.cyan('油猴脚本')}  ${chalk.dim('.....................')} http://${this.host}:${this.port}/injector.user.js│`);
        console.log(chalk.dim('  └─────────────────────────────────────────────────────────────┘'));
        console.log(`\n  ${chalk.yellow('💡 油猴安装')}：浏览器直接访问 ${chalk.underline(`http://${this.host}:${this.port}/injector.user.js`)} 即可一键弹窗安装。`);
        console.log(`  ${chalk.green('⚡ 免扩展模式')}：推荐直接另开终端运行 ${chalk.cyan.bold('tug fill')}，直连 CDP 自动化更顺畅！\n`);
        resolve();
      });
    });
  }
}
