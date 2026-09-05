// @ts-check
// ESLint flat config —— dsh-remote-control-bridge 全量 lint
//
// 规则来源（社区通用）：
//   - @eslint/js recommended（ES 通用规则）
//   - typescript-eslint recommended（TS 通用规则，非 type-checked，跑得快）
// 说明：TS 解析器只作用于 src/client 的 .ts/.tsx；test/scripts 的 .mjs 走 espree + Node 全局。
// P0 高风险规则（超大函数/超长参数/圈复杂度）以 error 级并入，与 eslint.config.p0.mjs 同阈值。
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** @type {import('eslint').Linter.RulesRecord} */
const p0Rules = {
  'max-lines-per-function': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
  'max-params': ['error', 8],
  complexity: ['error', 30],
};

export default tseslint.config(
  {
    ignores: ['lib/**', 'node_modules/**', 'coverage/**', 'tools/**', 'dist/**'],
  },

  // TypeScript 源码（src + client）：TS 解析器 + JS/TS recommended + P0
  {
    files: ['src/**/*.ts', 'client/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: p0Rules,
  },

  // 纯 JS（test/scripts 的 .mjs）：espree + JS recommended + Node 全局 + P0
  {
    files: ['test/**/*.mjs', 'scripts/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: p0Rules,
  },
);
