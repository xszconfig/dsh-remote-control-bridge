#!/usr/bin/env bash
# lint.sh —— dsh-remote-control-bridge lint 统一入口
#
# 用法:
#   scripts/lint.sh p0   只查 P0 高风险规则（超大函数/超长参数/圈复杂度），命中即 exit 1
#   scripts/lint.sh      全量 eslint（默认，风格级告警为建议项，不阻塞 commit）
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MODE="${1:-all}"
case "$MODE" in
  p0)
    pnpm lint:p0
    ;;
  all|full|"")
    pnpm lint
    ;;
  *)
    echo "用法: $0 [p0|all]" >&2
    exit 2
    ;;
esac
