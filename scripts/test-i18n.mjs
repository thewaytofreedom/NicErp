import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import ts from 'typescript';
const filename = resolve('apps/web/src/lib/i18n.ts');
const source = readFileSync(filename, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled)(
  createRequire(filename),
  module,
  module.exports,
);
const { translate, validLocale, formatMoney } = module.exports;
test('Chinese remains unchanged; English translates static and parameterized messages', () => {
  assert.equal(translate('zh-CN', '第 {0} 行产品', { 0: 3 }), '第 3 行产品');
  assert.equal(translate('en', '第 {0} 行产品', { 0: 3 }), 'Line 3 product');
  assert.equal(translate('en', '邮箱或密码不正确'), 'Incorrect email or password');
  assert.equal(
    translate('en', 'quantity 必须是最多 4 位小数的数值'),
    'quantity must be a number with at most 4 decimal places',
  );
  assert.equal(
    translate('en', '第 3 行：编号未匹配有效产品，保留为自由明细'),
    'Row 3: No active product matched; kept as a free-text line',
  );
  assert.equal(translate('en', 'Business data / 客户自定义内容'), 'Business data / 客户自定义内容');
  assert.equal(translate('en', '供应商单价'), 'Supplier unit price');
});
test('unknown preferences default to Chinese; money retains four-decimal prices', () => {
  assert.equal(validLocale('fr'), 'zh-CN');
  assert.equal(validLocale('en'), 'en');
  assert.equal(formatMoney('19.995', 'en', 4), '19.995');
  assert.equal(formatMoney('1234.5', 'en'), '1,234.50');
});
