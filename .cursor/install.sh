#!/usr/bin/env bash
# Idempotent Cloud Agent Build install for Quins Club Hub.
#
# npm's global prefix on Cursor cloud VMs is `/` (node is
# /exec-daemon/node), so a bare `npm install -g` EACCES-fails. Install
# into $HOME/.local instead, put `graft` on PATH, then build the
# structural index. Never `graft build --deep` (no LLM, no API key).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npm ci --include=dev

PREFIX="${HOME}/.local"
mkdir -p "$PREFIX/bin"
npm install -g --prefix "$PREFIX" @nanonets/graft

# Builds keep disk, not exported vars. Persist PATH for later shells,
# and drop a shim onto nvm's bin when that directory is already on PATH.
path_line='export PATH="$HOME/.local/bin:$PATH"'
for rc in "${HOME}/.profile" "${HOME}/.bashrc"; do
  if [ ! -f "$rc" ] || ! grep -F '.local/bin' "$rc" >/dev/null 2>&1; then
    printf '\n%s\n' "$path_line" >> "$rc"
  fi
done

if [ -d "${HOME}/.nvm/versions/node" ]; then
  nvm_bin="$(ls -d "${HOME}/.nvm/versions/node/"*/bin 2>/dev/null | tail -n 1 || true)"
  if [ -n "$nvm_bin" ] && [ -w "$nvm_bin" ] && [ -x "${PREFIX}/bin/graft" ]; then
    ln -sfn "${PREFIX}/bin/graft" "${nvm_bin}/graft"
  fi
fi

export PATH="${PREFIX}/bin:${PATH}"
# npx so a missing `graft` binary cannot skip the index
npx -y @nanonets/graft build
