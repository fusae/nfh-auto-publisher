#!/bin/zsh
set -euo pipefail

workspace_root="${PWD}"
script_dir="$(cd "$(dirname "$0")" && pwd)"
skill_dir="$(cd "${script_dir}/.." && pwd)"
app_dir="${skill_dir}/assets/app"

if [[ ! -f "${workspace_root}/nfh.config.json" ]]; then
  echo "Current workspace must contain nfh.config.json." >&2
  exit 1
fi

draft_path="${1:-}"

if [[ -z "${draft_path}" ]]; then
  draft_path="$(
    find "${workspace_root}" \
      -type f -name '*.docx' \
      -not -path '*/node_modules/*' \
      -not -path '*/.git/*' \
      -not -path '*/.runtime/*' \
      -print0 | xargs -0 ls -t | head -n 1
  )"
fi

if [[ -z "${draft_path}" || ! -f "${draft_path}" ]]; then
  echo "No .docx draft found." >&2
  exit 1
fi

if [[ ! -d "${app_dir}/node_modules" ]]; then
  echo "Installing bundled app dependencies..."
  (
    cd "${app_dir}"
    npm install
    npx playwright install chromium
  )
fi

(
  cd "${workspace_root}"
  NFH_CONFIG_FILE="${workspace_root}/nfh.config.json" \
  NFH_NAVIGATION_TIMEOUT_MS="${NFH_NAVIGATION_TIMEOUT_MS:-120000}" \
  node "${app_dir}/src/cli.js" publish "${draft_path}"
)
