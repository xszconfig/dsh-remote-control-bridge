# lint 规则库（dsh-remote-control-bridge，TypeScript ESLint）

本文档记录 lint 规则的定义、起步阈值、收紧路径与新增规则动机。是「代码质量闸门」的配套说明（见 AGENTS.md「代码质量闸门」一节）。

## 工具链

- **ESLint** 10（flat config）+ **typescript-eslint** 8（`recommended`，非 type-checked）+ **@eslint/js** recommended。
  - 选择理由：ESLint 10 为当前主线，flat config 为唯一配置格式；typescript-eslint recommended 是社区通用 TS 规则集，非 type-checked 模式跑得快、无需 tsconfig project。
- 配置：`eslint.config.mjs`（全量）、`eslint.config.p0.mjs`（P0 子集）。
- 命令：`pnpm lint`（全量）、`pnpm lint:p0`（P0 闸门）。

## P0 规则清单（起步版）

P0 = 「超大函数 / 超长参数 / 圈复杂度」等高风险项，**任何命中即 commit 闸门拦截**（pre-commit hook）。

| 规则 | 含义 | 起步阈值 | 目标值 |
| --- | --- | --- | --- |
| `max-lines-per-function` | 超大函数 | 200 行（跳过空行/注释） | 80 行 |
| `max-params` | 超长参数列表 | 8 | 4 |
| `complexity` | 圈复杂度（近似「类/模块过大」的高风险信号） | 30 | 20 |

> JS/TS 无「类过大」核心规则；`complexity` 是圈复杂度，用「单个函数逻辑过于复杂」作为「类/模块过大」在 JS/TS 侧的近似高风险信号。

## 存量豁免（P0 起步版已登记的例外）

`src/core.ts` 中 3 处历史超大函数，已用行内 `eslint-disable-next-line` 豁免，并在源码标注「TODO 拆分」：

| 位置 | 豁免规则 | 说明 |
| --- | --- | --- |
| `src/core.ts` `apply(ctx)` | `max-lines-per-function` | 启动装配超大函数（~2000 行），需拆分 |
| `src/core.ts` `handleCommand` | `max-lines-per-function`, `complexity` | 命令分派超大函数（~338 行） |
| `src/core.ts` `projectEvent` | `complexity` | 事件投影分派圈复杂度 54 |

**收紧方式**：拆分这些函数后删除对应 `eslint-disable-next-line`，再把阈值下调（200→120→80、30→20）。新增豁免必须在本文档登记，否则视为绕过闸门。

## 收紧路径（roadmap）

1. 拆分 `core.ts` 的 `apply` / `handleCommand` / `projectEvent`，删除存量豁免注释。
2. `max-lines-per-function` 200→80、`complexity` 30→20、`max-params` 8→4 分阶段下调。
3. 稳定后考虑引入 type-checked 规则集（`recommendedTypeChecked`）。

## 规则积累机制

- 新增/修改规则时：在本文档登记「规则名 + 动机 + 阈值 + 影响范围」。
- 阈值只能**收紧**（下调），不能反向放宽（除非在本文档写明理由并经 review）。
- 全量 `pnpm lint` 报告为建议项（不阻塞 commit），P0 报告为闸门（阻塞 commit）。
