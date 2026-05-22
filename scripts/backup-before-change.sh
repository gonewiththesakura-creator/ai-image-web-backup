#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: $PROJECT_DIR is not a git repository" >&2
  exit 1
fi

stamp="$(date +%Y%m%d-%H%M%S)"

git add -A
if ! git diff --cached --quiet; then
  git commit -m "backup: pre-change ${stamp}"
else
  echo "No uncommitted changes to commit; tagging current HEAD."
fi

tag="rollback-pre-change-${stamp}"
git tag -a "$tag" -m "Rollback point before AI image web change at ${stamp}"
git push origin main --tags

echo "Backup ready: $(git rev-parse --short HEAD) tagged as ${tag}"
