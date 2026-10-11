import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
export async function runBrowser(fixture) {
  const origin = 'http://127.0.0.1:3100';
  const child = spawn(
    process.execPath,
    [
      resolve('node_modules/next/dist/bin/next'),
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3100',
    ],
    {
      cwd: resolve('apps/web'),
      env: { ...process.env, API_BASE_URL: fixture.apiUrl },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let logs = '';
  child.stdout.on('data', (d) => (logs += d));
  child.stderr.on('data', (d) => (logs += d));
  let browser, page;
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(origin + '/login')).ok) {
          ready = true;
          break;
        }
      } catch {}
      if (child.exitCode !== null) throw Error(logs);
      await delay(300);
    }
    if (!ready) throw Error('Browser test server did not start: ' + logs);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => {
      Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    });
    page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin);
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('邮箱').fill(fixture.email);
    await page.getByLabel('密码', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByRole('heading', { name: '管理工作台', exact: true })).toBeVisible();
    if ((await page.getByLabel('切换公司').inputValue()) !== fixture.companyId) {
      await Promise.all([
        page.waitForEvent('load'),
        page.getByLabel('切换公司').selectOption(fixture.companyId),
      ]);
      await expect(page.getByLabel('切换公司')).toHaveValue(fixture.companyId);
    }
    await mkdir('artifacts', { recursive: true });
    await page.screenshot({ path: 'artifacts/dashboard.png', fullPage: true });
    console.log('PASS browser login, secure cookie session and dashboard');
    await page.goto(origin + '/modules/products');
    await expect(page.getByText('PART-01', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '＋ 新建', exact: true }).click();
    await page.getByLabel('产品编号 / 零件号').fill('BROWSER-01');
    await page.getByLabel(/^名称/).fill('浏览器新增产品');
    await page.getByLabel('参考售价 (SGD)').fill('25.5');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('textbox', { name: '搜索', exact: true }).fill('BROWSER-01');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(page.getByText('浏览器新增产品', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByLabel(/^名称/).fill('浏览器编辑产品');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText('浏览器编辑产品', { exact: true })).toBeVisible();
    console.log('PASS browser product creation, search and edit');
    await page.goto(origin + '/documents/new?kind=QUOTE');
    await page.getByLabel('往来单位').selectOption({ label: '测试客户' });
    await page.getByLabel('第 1 行产品', { exact: true }).fill('UNKNOWN-NUMBER');
    await page.getByLabel('第 1 行产品', { exact: true }).press('Enter');
    await expect(page.getByText('没有匹配的有效产品', { exact: true })).toBeVisible();
    await page.getByLabel('第 1 行产品', { exact: true }).fill('LATE-ALT');
    await page.getByLabel('第 1 行产品', { exact: true }).press('Enter');
    await page.getByRole('button', { name: /ZZZ-1000 · 大量产品匹配测试/ }).click();
    await expect(
      page.getByText('已匹配：ZZZ-1000 · 大量产品匹配测试', { exact: true }),
    ).toBeVisible();
    await page.getByLabel('第 1 行产品', { exact: true }).fill('ALT-PART-01');
    await page.getByLabel('第 1 行产品', { exact: true }).press('Enter');
    await expect(page.getByText('已匹配：PART-01 · 过滤器', { exact: true })).toBeVisible();
    await page.getByLabel('选择第 1 行', { exact: true }).check();
    await page.getByLabel('批量百分比', { exact: true }).fill('10');
    await page.getByRole('button', { name: '降低选中行单价', exact: true }).click();
    await expect(page.getByLabel('第 1 行 unitPrice', { exact: true })).toHaveValue('17.9955');
    await page.getByLabel('第 1 行 unitPrice', { exact: true }).fill('19.995');
    await page.getByLabel('第 1 行 quantity', { exact: true }).fill('2');
    await page.getByRole('button', { name: '保存草稿', exact: true }).click();
    await expect(page).toHaveURL(/\/documents\/[0-9a-f-]+$/);
    await page.getByRole('button', { name: '确认单据', exact: true }).click();
    await expect(page.getByRole('button', { name: '转销售订单', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '转销售订单', exact: true }).click();
    await expect(page.getByRole('button', { name: '确认单据', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '确认单据', exact: true }).click();
    await page.getByRole('button', { name: '登记发货', exact: true }).click();
    await page.locator('select[name="warehouseId"]').selectOption({ label: '主仓' });
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('h1 .status')).toHaveText('已完成');
    await page.screenshot({ path: 'artifacts/sales-order.png', fullPage: true });
    console.log('PASS browser quote → sale → shipment workflow');
    await page.goto(origin + '/documents/new?kind=QUOTE');
    await page.getByLabel('往来单位').selectOption({ label: '测试客户' });
    await page.getByLabel('第 1 行产品', { exact: true }).fill('PART-01');
    await page.getByLabel('第 1 行产品', { exact: true }).press('Enter');
    await expect(page.getByText('已匹配：PART-01 · 过滤器', { exact: true })).toBeVisible();
    await page.getByLabel('第 1 行描述', { exact: true }).fill('序号第一行');
    await expect(page.getByLabel('第 1 行序号', { exact: true })).toHaveValue('1');
    for (const [index, description] of [
      [2, '序号第二行'],
      [3, '序号第三行'],
    ]) {
      await page.getByRole('button', { name: '＋ 自由明细', exact: true }).click();
      await expect(page.getByLabel(`第 ${index} 行序号`, { exact: true })).toHaveValue(
        String(index),
      );
      await page.getByLabel(`第 ${index} 行描述`, { exact: true }).fill(description);
    }
    await page.getByLabel('第 1 行序号', { exact: true }).fill('10');
    await page.getByLabel('第 1 行序号', { exact: true }).press('Enter');
    await expect(page.getByLabel('第 1 行描述', { exact: true })).toHaveValue('序号第二行');
    await expect(page.getByLabel('第 2 行描述', { exact: true })).toHaveValue('序号第三行');
    await expect(page.getByLabel('第 3 行序号', { exact: true })).toHaveValue('10');
    await page.getByLabel('第 1 行序号', { exact: true }).fill('3');
    await page.getByLabel('第 1 行序号', { exact: true }).press('Enter');
    await expect(page.locator('.error[role="alert"]')).toContainText('已存在');
    expect(
      await page
        .getByLabel('第 1 行序号', { exact: true })
        .evaluate((input) => input.validity.valid),
    ).toBe(false);
    await page.getByLabel('第 1 行序号', { exact: true }).fill('2');
    await page.getByLabel('第 1 行序号', { exact: true }).press('Enter');
    await page.getByRole('button', { name: '＋ 自由明细', exact: true }).click();
    await expect(page.getByLabel('第 4 行序号', { exact: true })).toHaveValue('11');
    await page.getByLabel('第 4 行描述', { exact: true }).fill('序号新增行');
    await page
      .locator('.line-editor tbody tr')
      .nth(0)
      .getByRole('button', { name: '复制', exact: true })
      .click();
    await expect(page.getByLabel('第 2 行序号', { exact: true })).toHaveValue('3');
    await expect(page.getByLabel('第 3 行序号', { exact: true })).toHaveValue('4');
    await page.getByRole('button', { name: '移除第 2 行', exact: true }).click();
    await page
      .locator('.line-editor tbody tr')
      .nth(1)
      .getByRole('button', { name: '上移', exact: true })
      .click();
    await expect(page.getByLabel('第 1 行描述', { exact: true })).toHaveValue('序号第三行');
    await page
      .locator('.line-editor tbody tr')
      .nth(0)
      .getByRole('button', { name: '下移', exact: true })
      .click();
    await expect(page.getByLabel('第 1 行描述', { exact: true })).toHaveValue('序号第二行');
    await page.getByRole('button', { name: '保存草稿', exact: true }).click();
    await expect(page).toHaveURL(/\/documents\/[0-9a-f-]+$/);
    const sequenceUrl = page.url();
    await expect(page.getByRole('columnheader', { name: '序号', exact: true })).toBeVisible();
    for (const [index, serial] of [2, 4, 10, 11].entries())
      await expect(
        page.locator('.table-wrap tbody tr').nth(index).getByRole('cell').nth(0),
      ).toHaveText(String(serial));
    await page.goto(sequenceUrl + '/edit');
    await expect(page.getByLabel('第 3 行序号', { exact: true })).toHaveValue('10');
    await page.goto(sequenceUrl + '/print');
    await expect(page.getByRole('columnheader', { name: '序号', exact: true })).toBeVisible();
    await expect(
      page.locator('.print-document tbody tr').nth(2).getByRole('cell').nth(0),
    ).toHaveText('10');
    await page.pdf({ path: 'artifacts/quote-sequence.pdf', format: 'A4' });
    console.log(
      'PASS browser quote sequence edit, numeric sort, duplicate validation, add/copy/move/delete, persistence and print',
    );
    await page.goto(origin + `/documents/${fixture.invoiceId}`);
    await page.getByRole('button', { name: '登记收款', exact: true }).click();
    await page.getByLabel('资金账户').selectOption({ label: 'SGD 银行 (SGD)' });
    await page.getByLabel('金额 (SGD)').fill('25');
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('111.35', { exact: true })).toBeVisible();
    console.log('PASS browser invoice payment');
    for (const slug of ['partners', 'purchasing', 'inventory', 'finance', 'content', 'settings']) {
      await page.goto(origin + '/modules/' + slug);
      await expect(page.locator('.table-empty').filter({ hasText: '加载中' })).toHaveCount(0);
      await expect(page.locator('.error')).toHaveCount(0);
    }
    await page.goto(origin + `/posts/${fixture.postId}`);
    await expect(
      page.getByText('安全正文 <script>alert(1)</script>', { exact: true }),
    ).toBeVisible();
    await page.goto(origin + `/documents/${fixture.invoiceId}/print`);
    await expect(page.locator('.print-document')).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: 'artifacts/invoice.pdf', format: 'A4' });
    await page.emulateMedia({ media: 'screen' });
    await page.goto(origin + `/documents/${fixture.parity.groupedQuoteId}/print`);
    await expect(page.locator('.print-document').getByText('外层', { exact: true })).toBeVisible();
    await expect(page.locator('.print-document').getByText('内层', { exact: true })).toHaveCount(0);
    await expect(page.getByText('内部信息不打印', { exact: true })).toHaveCount(0);
    await page.goto(origin + '/modules/partners');
    await page.getByRole('tab', { name: '联系人', exact: true }).click();
    await expect(page.getByText('报价联系人', { exact: true })).toBeVisible();
    await page.goto(origin + '/modules/purchasing');
    await page.getByRole('tab', { name: '供应商价目表', exact: true }).click();
    await expect(page.getByText('V-GENUINE', { exact: true })).toHaveCount(2);
    await page.goto(origin + '/modules/finance');
    await page.getByRole('tab', { name: '毛利统计', exact: true }).click();
    await expect(page.getByLabel('毛利分组')).toBeVisible();
    await page.getByRole('tab', { name: '资金收支与对账', exact: true }).click();
    await page.getByRole('button', { name: '＋ 新建', exact: true }).click();
    await page.getByLabel(/^资金账户/).selectOption({ label: 'PARITY 银行 A' });
    await page.getByLabel(/^方向/).selectOption('OUT');
    await page.getByLabel(/^金额/).fill('1');
    await page.getByLabel('参考号', { exact: true }).fill('BROWSER-FEE');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const bankRow = page.getByRole('row').filter({ hasText: 'BROWSER-FEE' });
    await expect(bankRow).toBeVisible();
    page.once('dialog', (dialog) => void dialog.accept('BROWSER-ST'));
    await bankRow.getByRole('button', { name: '对账', exact: true }).click();
    await expect(bankRow.getByText('BROWSER-ST', { exact: true })).toBeVisible();
    await bankRow.getByRole('button', { name: '取消对账', exact: true }).click();
    await expect(bankRow.getByRole('button', { name: '对账', exact: true })).toBeVisible();
    await bankRow.getByRole('button', { name: '冲销操作', exact: true }).click();
    await expect(bankRow.getByRole('button', { name: '冲销操作', exact: true })).toHaveCount(0);
    await page.goto(origin + '/modules/inventory');
    await page.getByRole('tab', { name: '组合可用库存', exact: true }).click();
    await expect(page.getByText('PARITY-K2', { exact: true })).toBeVisible();
    console.log(
      'PASS browser parity bulk pricing, grouped printing, private notes, contacts, supplier tiers and margins',
    );
    await page.goto(origin + '/modules/settings');
    await page.getByRole('tab', { name: '用户权限', exact: true }).click();
    await expect(page.getByRole('columnheader', { name: '账号启用', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '＋ 新建', exact: true }).click();
    await page.getByLabel(/^姓名/).fill('浏览器启停用户');
    await page.getByLabel(/^邮箱/).fill('browser-lifecycle@nicerp.test');
    await page.getByLabel(/^初始密码/).fill(fixture.password);
    await page.getByLabel(/^公司角色/).selectOption('VIEWER');
    await expect(page.getByLabel(/^账号启用/)).toBeChecked();
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const lifecycleRow = page.getByRole('row').filter({ hasText: 'browser-lifecycle@nicerp.test' });
    const userContext = await browser.newContext();
    try {
      const userPage = await userContext.newPage();
      const userLogin = async () => {
        await userPage.goto(origin + '/login');
        await userPage.getByLabel('邮箱').fill('browser-lifecycle@nicerp.test');
        await userPage.getByLabel('密码', { exact: true }).fill(fixture.password);
        await userPage.getByRole('button', { name: '登录', exact: true }).click();
        await expect(
          userPage.getByRole('heading', { name: '管理工作台', exact: true }),
        ).toBeVisible();
      };
      await userLogin();
      await lifecycleRow.getByRole('button', { name: '编辑', exact: true }).click();
      await page.getByLabel(/^账号启用/).uncheck();
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(lifecycleRow.getByRole('cell').nth(3)).toHaveText('否');
      expect((await userContext.request.get(origin + '/api/backend/auth/me')).status()).toBe(401);
      expect((await userContext.cookies()).some((cookie) => cookie.name === 'nicerp_session')).toBe(
        false,
      );
      await userPage.goto(origin);
      await expect(userPage).toHaveURL(/\/login$/);
      await lifecycleRow.getByRole('button', { name: '编辑', exact: true }).click();
      await page.getByLabel(/^账号启用/).check();
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(lifecycleRow.getByRole('cell').nth(3)).toHaveText('是');
      await userLogin();
    } finally {
      await userContext.close();
    }
    console.log(
      'PASS browser user enable/disable, session rejection, cookie cleanup and new login',
    );
    const csrf = await context.request.post(origin + '/api/backend/erp/products', {
      headers: { Origin: 'https://untrusted.example' },
      data: { sku: 'CSRF', name: 'should fail' },
    });
    expect(csrf.status()).toBe(403);
    await page.goto(origin + '/modules/products');
    await page.getByLabel('切换公司').selectOption({ label: '测试公司 B' });
    await expect(page.getByRole('heading', { name: '管理工作台', exact: true })).toBeVisible();
    await page.goto(origin + '/modules/products');
    await expect(page.getByText('PART-01', { exact: true })).toHaveCount(0);
    await page.getByLabel('切换公司').selectOption({ label: '测试公司 A' });
    await expect(page.getByRole('heading', { name: '管理工作台', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('邮箱').fill(fixture.viewerEmail);
    await page.getByLabel('密码', { exact: true }).fill(fixture.viewerPassword);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByRole('heading', { name: '管理工作台', exact: true })).toBeVisible();
    await page.goto(origin + '/modules/products');
    await expect(page.getByText('PART-01', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '＋ 新建', exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
    console.log(
      'PASS browser module routes, content escaping, print PDF, CSRF, company switching, mobile layout and read-only role',
    );
  } catch (error) {
    console.error('Browser failure URL:', page?.url());
    if (page) {
      console.error((await page.locator('body').innerText()).slice(0, 3500));
      await mkdir('artifacts', { recursive: true });
      await page.screenshot({ path: 'artifacts/failure.png', fullPage: true });
    }
    console.error(logs.slice(-6000));
    throw error;
  } finally {
    await browser?.close();
    child.kill('SIGTERM');
    await new Promise((r) => {
      if (child.exitCode !== null) return r();
      child.once('exit', r);
      setTimeout(() => {
        child.kill('SIGKILL');
        r();
      }, 5000).unref();
    });
  }
}
