<div align="center">
  <img src="docs/assets/logo/tug-logo.jpg" alt="Tug Logo" width="120" style="border-radius: 24px; box-shadow: 0 8px 24px rgba(0,0,0,0.12);" />
  <h1>Tug ⚓</h1>
  <p><strong>The Declarative Browser Extension Companion CLI</strong></p>
  <p>Local YAML listing orchestration, zero-dependency asset pre-flight, and native CDP direct automation.</p>

  <p>
    <a href="./README.md"><b>English</b></a> •
    <a href="./README.zh-CN.md">简体中文</a>
  </p>

  <p>
    <a href="https://github.com/Deguang/tug/releases"><img src="https://img.shields.io/github/v/release/Deguang/tug?color=FA541C&label=release" alt="Release"></a>
    <a href="https://github.com/Deguang/tug/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
    <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-emerald.svg" alt="Node">
    <img src="https://img.shields.io/badge/automation-Native%20CDP-orange.svg" alt="CDP">
  </p>
</div>

---

## 💡 Why Tug?

In busy maritime harbors, massive container ships cannot maneuver or dock safely on their own—they depend on compact, agile **tugboats** with immense torque to guide them into port.

Similarly, modern extension store web dashboards (Chrome Web Store, Edge Partner Center) have grown bloated and tedious: repetitive multi-language dropdown clicking, fragile single-pixel rejection gates, and zero Git version history. **Tug** acts as your local CLI tugboat. Holding its signature orange towing ring, Tug bridges your local Git repo with remote store consoles, bearing the heavy mechanical friction on your behalf.

---

## ✨ Core Selling Points & Efficiency Gains

- ⚡ **1-Click Multilingual Rollout (Save 90% Manual Churn)**: Eliminate the nightmare of switching across 10+ language dropdowns and copy-pasting paragraph by paragraph. Populate complete multilingual descriptions, support channels, and metadata in seconds from a single local YAML file.
- 🛡️ **Pre-flight Verification, Zero Rejections**: Automatically audit screenshot resolutions, marquee banner aspect ratios, and character limits before uploading. Catch discrepancies in milliseconds so you never waste a multi-day review cycle on a 1-pixel mismatch.
- 🔑 **Zero-Config, No Cloud API Keys Needed**: No cumbersome Google Cloud Console project setups, OAuth client configurations, or expiring refresh tokens. Direct localhost mounting uses your already-authenticated browser session with zero credential leakage risk.
- 🌐 **Write Once, Multi-Store GitOps**: A single declarative specification targets Chrome Web Store, Microsoft Edge Add-ons, and Firefox AMO. Store listings and changelogs stay version-controlled in Git alongside your codebase.
- 👁️ **Human-in-the-Loop Safety**: Automation populates inputs and mounts media in draft mode; the final "Submit for Review" click is always confirmed by your own eyes.

---

## 📦 Installation (Independent GitHub Distribution)

Distributed directly via secure GitHub channels:

### Option 1: One-line Shell Script
```bash
curl -fsSL https://raw.githubusercontent.com/Deguang/tug/main/scripts/install.sh | bash
```

### Option 2: Homebrew
```bash
brew install Deguang/tap/tug
```

### Option 3: Global Install via GitHub Source
```bash
npm install -g Deguang/tug
```

### Option 4: Zero-Install npx
```bash
npx github:Deguang/tug fill
```

---

## 🚀 Quick Start

### 1. Initialize Listing Blueprint
Run in your extension repository root:
```bash
tug init
```
This scaffolds a standard declarative `tug.yml` configuration template.

### 2. Pre-flight Verification
Before submitting, run pre-flight checks:
```bash
tug scan
```
Tug audits `manifest.json` permission justifications, validates multilingual length limits, and parses graphic dimensions via pure JS byte streams.

### 3. Automated Form Filling & Asset Mounting (CDP Mode)

1. Launch your regular Chrome browser with remote debugging enabled (keeps your active login session):
   ```bash
   # macOS Example
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
   ```
2. Navigate to your extension's draft page on the Chrome Web Store Developer Dashboard.
3. Run in your terminal:
   ```bash
   tug fill -z ./release/my-extension-v1.0.0.zip
   ```
   Tug connects via native CDP, switches locales, populates all text fields, mounts promo images and screenshots, and uploads your zip package in seconds!

---

## 🛠️ Command Reference

| Command | Description |
|---------|-------------|
| `tug fill` | **[Core]** Connects to Chrome via native CDP to automatically populate listings and mount assets |
| `tug init` | Scaffolds a standard `tug.yml` listing configuration |
| `tug scan` | Pre-flight validation for metadata integrity, manifest diffs, and image dimensions |
| `tug pull` | Uses CDP to scrape current store configurations and sync back to `tug.yml` |
| `tug sync` | Syncs release tags and changelogs from upstream GitHub Releases incrementally into `tug.yml` |
| `tug upgrade` | Self-upgrades the Tug CLI binary directly from official GitHub Releases |

---

## ⚙️ Configuration Blueprint (`tug.yml`)

```yaml
version: "1.0"

global:
  category: "developer_tools"
  support_email: "support@example.com"
  privacy_policy_url: "https://example.com/privacy"

privacy:
  permissions:
    storage: "Used to save user preferences locally"
  data_usage:
    single_purpose: true
    sell_data: false

assets:
  icon_128: "./assets/icon-128.png"
  screenshots:
    - "./assets/screenshot-1.png"   # 1280x800 or 640x400
  promo_small: "./assets/promo-440x280.png"
  promo_large: "./assets/promo-1400x560.png"

locales:
  en:
    name: "My Extension"
    short_description: "A productivity tool for developers"  # max 132 chars
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

## 🌐 Supported Stores

- ✅ **Chrome Web Store** (Full native CDP automation & asset mounting)
- ✅ **Microsoft Edge Partner Center** (Supported)
- 🚧 **Firefox AMO** (On roadmap)

---

## 📄 License

MIT © [Deguang](https://github.com/Deguang)
