/**
 * tug.yml 的 Zod Schema 定义
 * 用于校验配置文件的合法性
 */
import { z } from 'zod';

// 全局配置
export const GlobalSchema = z.object({
  category: z.string().min(1, '商店分类不能为空'),
  support_email: z.string().email('支持邮箱格式不合法'),
  privacy_policy_url: z.string().url('隐私政策 URL 格式不合法'),
  home_page_url: z.string().url('首页 URL 格式不合法').optional(),
  repository: z.string().optional(), // 仓库地址或 owner/repo
});

// 数据源配置 (可选)
export const SourceSchema = z.object({
  repository: z.string().optional(),
  release_tag: z.string().optional(),
  changelog_locale: z.string().default('en'),
}).optional();

// 数据用途声明
export const DataUsageSchema = z.object({
  single_purpose: z.boolean(),
  sell_data: z.boolean(),
});

// 隐私与合规
export const PrivacySchema = z.object({
  permissions: z.record(z.string(), z.string()).default({}),
  host_permissions: z.record(z.string(), z.string()).default({}),
  data_usage: DataUsageSchema,
});

// 物料路径
export const AssetsSchema = z.object({
  icon_128: z.string().min(1, 'icon_128 路径不能为空'),
  screenshots: z.array(z.string()).min(1, '至少需要一张截图').max(5, '截图最多 5 张'),
  promo_small: z.string().optional(),
  promo_large: z.string().optional(),
});

// 单语言元数据
export const LocaleSchema = z.object({
  name: z.string().min(1, '扩展名称不能为空'),
  short_description: z.string().min(1, '简短描述不能为空').max(132, '简短描述不能超过 132 字符'),
  description: z.string().min(1, '详细描述不能为空'),
  changelog: z.string().optional(),
});

// 完整的 tug.yml Schema
export const TugSchemeSchema = z.object({
  version: z.string().default('1.0'),
  source: SourceSchema,
  global: GlobalSchema,
  privacy: PrivacySchema,
  assets: AssetsSchema,
  locales: z.record(z.string(), LocaleSchema).refine(
    (locales) => Object.keys(locales).length > 0,
    { message: '至少需要一种语言的元数据' }
  ),
});

// 导出类型
export type TugScheme = z.infer<typeof TugSchemeSchema>;
export type TugLocale = z.infer<typeof LocaleSchema>;
export type TugAssets = z.infer<typeof AssetsSchema>;
export type TugPrivacy = z.infer<typeof PrivacySchema>;
export type TugGlobal = z.infer<typeof GlobalSchema>;
