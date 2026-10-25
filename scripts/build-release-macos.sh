#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
home_dir="${HOME:?HOME must be set}"
remap_flag="--remap-path-prefix=${home_dir}=/build"

export RUSTFLAGS="${RUSTFLAGS:+${RUSTFLAGS} }${remap_flag}"

cd "${repo_root}"
npm run licenses:generate
npm run tauri build
