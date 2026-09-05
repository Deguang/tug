#!/usr/bin/env bash
set -e

# ==========================================================
#  ⚓ TUG - 一键安装脚本 (脱离 npm 独立分发)
#  支持通过 GitHub Releases 下载预编译可执行文件或通过源码安装
# ==========================================================

REPO="Deguang/tug"
INSTALL_DIR="${TUG_INSTALL_DIR:-/usr/local/bin}"

# 确保安装目录可写（若非 root 且 /usr/local/bin 不可写，降级到 ~/.local/bin）
if [ ! -w "$INSTALL_DIR" ]; then
  INSTALL_DIR="$HOME/.local/bin"
  mkdir -p "$INSTALL_DIR"
fi

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "⚠ 未知架构: $ARCH，将尝试源码安装"; ARCH="" ;;
esac

echo "🚀 正在安装 tug (Browser Extension Store Companion)..."

# 尝试从 GitHub Releases 拉取预构建独立二进制
BINARY_URL="https://github.com/${REPO}/releases/latest/download/tug-${OS}-${ARCH}"
TARGET_PATH="${INSTALL_DIR}/tug"

if [ -n "$ARCH" ] && curl --output /dev/null --silent --head --fail "$BINARY_URL"; then
  echo "📦 正在从 GitHub Releases 下载预编译单文件版本 (${OS}-${ARCH})..."
  curl -fsSL "$BINARY_URL" -o "$TARGET_PATH"
  chmod +x "$TARGET_PATH"
  echo "✔ 成功安装至: $TARGET_PATH"
else
  # 降级：若未发布单文件 binary，通过 GitHub 仓库安装
  echo "ℹ 未检测到当前平台的预编译二进制，正在从 GitHub 源码构建安装..."
  if command -v npm >/dev/null 2>&1; then
    npm install -g "${REPO}"
    echo "✔ 通过 GitHub 仓库全局安装完成！"
  else
    echo "❌ 未检测到 npm 环境，无法完成降级安装。请确保系统具有 Node.js/npm 或从 GitHub Releases 下载。"
    exit 1
  fi
fi

# 检查 PATH
if ! echo "$PATH" | grep -q "$INSTALL_DIR"; then
  echo ""
  echo "⚠ 提示: $INSTALL_DIR 不在系统 PATH 中，请将以下行加入 ~/.zshrc 或 ~/.bashrc:"
  echo "  export PATH=\"\$PATH:$INSTALL_DIR\""
fi

echo ""
echo "🎉 tug 安装成功！运行 'tug --help' 开始使用。"
