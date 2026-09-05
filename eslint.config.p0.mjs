// @ts-check
// ESLint flat config —— P0 高风险规则子集（pre-commit 闸门 / pnpm lint:p0）
//
// 只启用三项 P0 规则（超大函数 / 超长参数 / 圈复杂度），全为 error 级：
// 任何命中 → eslint 退出码非 0 → pre-commit hook 据此拦截 commit。
// 阈值刻意放宽（存量告警不阻塞），收紧路径见 docs/lint-rules.md。
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
  {
    files: ['src/**/*.ts', 'client/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: p0Rules,
  },
  {
    files: ['test/**/*.mjs', 'scripts/**/*.mjs'],
    rules: p0Rules,
  },
);
