# tug - 浏览器插件上架助手

> 本地数据编排 CLI 与浏览器端填表脚本协同的工程化工具

## 概述

`tug` 帮助浏览器扩展开发者自动化应用商店上架流程。它由两部分组成：

- **tug-cli**: 本地 Node.js CLI，读取配置、校验物料、启动数据服务
- **tug-injector**: 浏览器端 Tampermonkey 脚本，自动填充商店表单

## 安装方式 (脱离 npm 独立分发)

`tug` 采用 GitHub 独立分发，避免公网 npm 包名冲突与安全隐患：

### 方式 1：一键 Shell 脚本安装（推荐）
```bash
curl -fsSL https://raw.githubusercontent.com/Deguang/tug/main/scripts/install.sh | bash
```

### 方式 2：Homebrew 安装
```bash
brew install Deguang/tap/tug
```

### 方式 3：直接通过 GitHub 仓库安装
```bash
npm install -g Deguang/tug
```

### 方式 4：免安装即刻运行
```bash
npx github:Deguang/tug fill
```

### 使用流程

```bash
# 1. 在扩展项目根目录初始化
tug init

# 2. 编辑 tug.yml 填写扩展信息

# 3. 校验配置和物料
tug scan

# 4. 启动本地服务
tug dock
```

### 安装浏览器注入脚本

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展
2. 创建新脚本，将 `src/injector/tug-injector.user.js` 的内容粘贴进去
3. 保存并启用

### 方案 A：CDP 自动化填报【推荐·免安装任何扩展】

1. 用调试端口启动常用 Chrome（保留你的已登录账号）：
   ```bash
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
   ```
2. 打开 Chrome Web Store 或 Edge 后台插件详情页。
3. 在终端执行：
   ```bash
   tug fill
   ```
   CDP 将自动接管并模拟原生输入，**同时原生挂载本地截图等图片物料**，无需人工干预！

### 方案 B：油猴脚本注入填报 (Tug in)

1. 执行 `tug dock` 启动本地服务
2. 打开 Chrome Web Store 或 Edge Partner Center 开发者后台
3. 在页面右下角的 Tug 控制台点击 "⚓ Tug in (填入当前语言)"

### 反向读取与多语言同步 (Tug out)

1. 在插件源码根目录运行 `tug pull`
2. 在浏览器后台打开任意插件详情页，Tug 控制台会自动亮起绿灯：
   - **单语言同步**：切换到目标语言页面（或在面板中指定语言代码如 `zh_CN`），点击 "📤 Tug out (读出当前语言)"
   - **多语言批量同步**：点击 "🌐 批量扫描并回传多语言"，脚本将自动遍历下拉菜单中的所有语言并依次拉取回写入本地 [tug.yml](file:///Users/duyu/Documents/Codespaces/tug/templates/tug.template.yml)
3. 终端会实时提示收录进度和字段变动。

## CLI 命令

| 命令 | 说明 |
|------|------|
| `tug fill` | **【推荐】** 通过 CDP 直连 Chrome 自动填表与挂载本地物料 (免装扩展) |
| `tug init` | 生成 `tug.yml` 配置文件 |
| `tug scan` | 校验配置、比对权限、检查物料 |
| `tug dock` | 启动本地 HTTP 服务 (默认端口 4321) |
| `tug dock -p 8080` | 指定端口启动服务 |
| `tug pull` | 启动服务并等待浏览器回传表单数据，写入 tug.yml |
| `tug sync` | 从插件发版源同步最新发版详情与 Changelog，增量更新本地 tug.yml |
| `tug upgrade` | 检查并升级 tug CLI 工具自身 |

## 配置文件 (tug.yml)

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

locales:
  en:
    name: "My Extension"
    short_description: "A useful tool"  # 限 132 字符
    description: |
      Detailed description here.
```

## 项目结构

```
tug/
├── src/
│   ├── cli.ts                  # CLI 入口
│   ├── schema/
│   │   └── tug-scheme.ts       # Zod Schema 定义
│   ├── modules/
│   │   ├── parser.ts           # YAML 解析 + 校验
│   │   ├── manifest.ts         # manifest.json 读取 + Diff
│   │   ├── validator.ts        # 图片物料校验 (sharp)
│   │   ├── server.ts           # 本地 HTTP 服务 (Koa)
│   │   ├── writer.ts           # 回传数据合并写入 tug.yml
│   │   └── updater.ts          # 远端发版日志拉取与增量合并
│   ├── commands/
│   │   ├── init.ts             # tug init
│   │   ├── scan.ts             # tug scan
│   │   ├── dock.ts             # tug dock
│   │   ├── pull.ts             # tug pull
│   │   ├── sync.ts             # tug sync (业务发版同步)
│   │   └── upgrade.ts          # tug upgrade (CLI自身升级)
│   └── injector/
│       └── tug-injector.user.js  # Tampermonkey 脚本
└── templates/
    └── tug.template.yml        # 初始化模板
```

## 支持的商店

- ✅ Chrome Web Store
- ✅ Edge Partner Center (Microsoft Edge Add-ons)

## License

MIT
