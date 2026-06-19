#!/usr/bin/env bash
# Install pinned Noir / Barretenberg CLI tools for relayer proving on CI/Render.
# Versions must match README toolchain lock (Nargo 1.0.0-beta.9, bb v0.87.0).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLCHAIN_BIN="$ROOT_DIR/.toolchain/bin"
NOIR_VERSION="1.0.0-beta.9"
BB_VERSION="v0.87.0"

mkdir -p "$TOOLCHAIN_BIN"

if [ -x "$TOOLCHAIN_BIN/nargo" ] && [ -x "$TOOLCHAIN_BIN/bb" ]; then
  echo "Noir toolchain already installed in $TOOLCHAIN_BIN"
  "$TOOLCHAIN_BIN/nargo" --version || true
  "$TOOLCHAIN_BIN/bb" --version || true
  exit 0
fi

install_nargo() {
  if [ -x "$TOOLCHAIN_BIN/nargo" ]; then
    return
  fi

  echo "Installing nargo $NOIR_VERSION..."
  export PATH="$HOME/.nargo/bin:$PATH"
  curl -fsSL https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
  "$HOME/.nargo/bin/noirup" -v "$NOIR_VERSION"

  if [ ! -x "$HOME/.nargo/bin/nargo" ]; then
    echo "nargo install failed — binary missing at $HOME/.nargo/bin/nargo" >&2
    exit 1
  fi

  cp "$HOME/.nargo/bin/nargo" "$TOOLCHAIN_BIN/nargo"
  chmod +x "$TOOLCHAIN_BIN/nargo"
  echo "nargo -> $TOOLCHAIN_BIN/nargo"
}

install_bb() {
  if [ -x "$TOOLCHAIN_BIN/bb" ]; then
    return
  fi

  echo "Installing bb $BB_VERSION..."
  uname_s=$(uname -s | tr '[:upper:]' '[:lower:]')
  uname_m=$(uname -m)
  case "${uname_s}_${uname_m}" in
    linux_x86_64) file="barretenberg-amd64-linux.tar.gz" ;;
    linux_aarch64) file="barretenberg-arm64-linux.tar.gz" ;;
    darwin_arm64) file="barretenberg-arm64-darwin.tar.gz" ;;
    darwin_x86_64) file="barretenberg-amd64-darwin.tar.gz" ;;
    *)
      echo "unsupported platform: ${uname_s}_${uname_m}" >&2
      exit 1
      ;;
  esac

  url="https://github.com/AztecProtocol/aztec-packages/releases/download/${BB_VERSION}/${file}"
  tmp="$(mktemp -d)"
  if ! curl -fsSL "$url" -o "$tmp/bb.tar.gz"; then
    echo "Warning: failed to download bb — relayer will use WASM proving fallback" >&2
    rm -rf "$tmp"
    return
  fi
  tar -xzf "$tmp/bb.tar.gz" -C "$tmp"
  if ! "$tmp/bb" --version >/dev/null 2>&1; then
    echo "Warning: bb binary is incompatible with this host (glibc) — relayer will use WASM proving fallback" >&2
    rm -rf "$tmp"
    return
  fi
  install -m 755 "$tmp/bb" "$TOOLCHAIN_BIN/bb"
  rm -rf "$tmp"
  echo "bb -> $TOOLCHAIN_BIN/bb"
}

install_nargo
install_bb

echo "Noir toolchain status:"
if [ -x "$TOOLCHAIN_BIN/nargo" ]; then
  "$TOOLCHAIN_BIN/nargo" --version
else
  echo "nargo: not installed (WASM proving fallback will be used)"
fi
if [ -x "$TOOLCHAIN_BIN/bb" ]; then
  "$TOOLCHAIN_BIN/bb" --version
else
  echo "bb: not installed (WASM proving fallback will be used)"
fi
