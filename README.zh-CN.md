<div align="center">
  <img src="docs/assets/logo/tug-logo.jpg" alt="Tug Logo" width="120" style="border-radius: 24px; box-shadow: 0 8px 24px rgba(0,0,0,0.12);" />
  <h1>Tug ⚓</h1>
  <p><strong>现代化浏览器插件声明式发版 CLI · 本地数据编排与 CDP 原生自动化协同工具</strong></p>

  <p>
    <a href="./README.md">English</a> •
    <a href="./README.zh-CN.md"><b>简体中文</b></a>
  </p>

  <p>
    <a href="https://github.com/Deguang/tug/releases"><img src="https://img.shields.io/github/v/release/Deguang/tug?color=FA541C&label=release" alt="Release"></a>
    <a href="https://github.com/Deguang/tug/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
    <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-emerald.svg" alt="Node">
    <img src="https://img.shields.io/badge/automation-Native%20CDP-orange.svg" alt="CDP">
  </p>
</div>

---

## 💡 为什么叫 Tug？

在繁忙的海运港口中，巨大的远洋货轮无法自行安全靠泊或调头，必须依靠小巧、机动且马力巨大的**拖船（Tugboat）**将其安全稳妥地牵引推进码头。

现代各主流浏览器插件应用商店（Chrome Web Store、Edge Partner Center）的后台操作日渐臃肿繁琐：多语言下拉菜单反复切换、像素尺寸校验严苛、缺少 Git 版本追溯。**Tug** 就像开发者身边的机动拖船，手握亮橙色缆绳，连接你的本地 Git 工作区与云端商店后台，替你承担机械笨重的发版苦差事。

---

## ✨ 核心卖点与效率价值

- ⚡ **秒级铺满多语言，省去 90% 机械搬运**：告别在十几个语言下拉框之间来回切换、逐段复制粘贴的噩梦。本地一份 YAML 清单，一键秒级填入所有语种的图文介绍、支持渠道与隐私政策。
- 🛡️ **提审前自动拦截尺寸硬伤，杜绝驳回重审**：上传前全自动核验截图分辨率、封面图比例与字符长度限制。在提交前精准排查格式错误，绝不因为相差 1 像素而浪费数天的审核等待。
- 🔑 **免配置云端 API 密钥，开箱即用零心智负担**：无需前往 Google Cloud 配置繁琐的 OAuth 凭据，无需管理易过期的 Token。本地直连当前已登录的浏览器，0 分钟环境准备，0 凭据泄露风险。
- 🌐 **一套清单多商店通用，版本演进全 Git 追溯**：同一份配置无缝适配 Chrome Web Store、Edge Add-ons 与 Firefox AMO。商店文案与发版更新日志随代码进 Git 严格版本审计，提审发版如同 `git push` 般清晰掌控。
- 👁️ **人工最终肉眼复核机制 (Human-in-the-Loop)**：表单填充与素材挂载均在真实浏览器草稿中完成，最终由开发者亲自核对无误后再点击“提交审核”，既享高效又 100% 放心安全。

---

## 📦 安装方式 (脱离 npm 独立分发)

`tug` 采用 GitHub 独立分发，避免公网 npm 包名冲突与安全隐患：

### 方式 1：一键 Shell 脚本安装
```bash
curl -fsSL https://raw.githubusercontent.com/Deguang/tug/main/scripts/install.sh | bash
```

### 方式 2：Homebrew 安装
```bash
brew install Deguang/tap/tug
```

### 方式 3：通过 GitHub 源码全局安装
```bash
npm install -g Deguang/tug
```

### 方式 4：免安装即刻运行
```bash
npx github:Deguang/tug fill
```

---

## 🚀 快速上手

### 1. 初始化项目
在插件项目根目录下运行：
```bash
tug init
```
这将在当前目录生成声明式配置文件 `tug.yml`。

### 2. 物料预检与规则校验
编辑 `tug.yml` 后，在提审前运行：
```bash
tug scan
```
Tug 将自动比对 `manifest.json` 权限、校验各语言字段长度，并对本地图片尺寸进行毫秒级二进制流校验。

### 3. 一键提审与物料挂载 (推荐 CDP 模式)

1. 用调试端口启动常用 Chrome（保留已登录的开发者账号）：
   ```bash
   # macOS 示例
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
   ```
2. 打开 Chrome Web Store 开发者后台的插件详情草稿页。
3. 在终端运行：
   ```bash
   tug fill -z ./release/my-extension-v1.0.0.zip
   ```
   Tug 将通过 CDP 原生直驱浏览器，在几秒内自动切换并注入各语言文本，同时将本地图标与宣传截图挂载入表单！

---

## 🛠️ CLI 命令一览

| 命令 | 描述 |
|------|------|
| `tug fill` | **【核心推荐】** 通过 CDP 直连 Chrome 自动填表与原生挂载本地物料 (免安装任何扩展) |
| `tug init` | 在当前目录生成标准 `tug.yml` 配置文件模板 |
| `tug scan` | 毫秒级预检配置完整性、权限比对与图片物料尺寸合规性 |
| `tug sync` | 从远程发版源 (如 GitHub Releases) 提取最新 Tag 与 Changelog 并增量同步到 `tug.yml` |
| `tug upgrade` | 检查并自动升级 Tug CLI 工具自身 |

---

## ⚙️ 配置文件示例 (`tug.yml`)

```yaml
version: "1.0"

global:
  category: "developer_tools"
  support_email: "support@example.com"
  privacy_policy_url: "https://example.com/privacy"

privacy:
  permissions:
    storage: "用于本地保存用户偏好设置"
  data_usage:
    single_purpose: true
    sell_data: false

assets:
  icon_128: "./assets/icon-128.png"
  screenshots:
    - "./assets/screenshot-1.png"   # 1280x800 或 640x400
  promo_small: "./assets/promo-440x280.png"
  promo_large: "./assets/promo-1400x560.png"

locales:
  en:
    name: "My Extension"
    short_description: "A productivity tool for developers"  # 限 132 字符
    description: |
      Detailed description in markdown or plaintext.
    changelog: "Bug fixes and performance improvements."
  zh_CN:
    name: "我的插件"
    short_description: "面向开发者的生产力助手"
    description: |
      多语言详细介绍文案...
    changelog: "修复已知问题，优化使用体验。"
```

---

## 🌐 支持的应用商店

- ✅ **Chrome Web Store** (全功能原生 CDP 注入 & 物料自动挂载)
- ✅ **Microsoft Edge Partner Center** (自动化支持)
- 🚧 **Firefox AMO** (路线图中)

---

## 📄 License

MIT © [Deguang](https://github.com/Deguang)
