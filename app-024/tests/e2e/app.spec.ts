// E2E 全流程：谜库导入 → 校验 → 出条 → 现场登记 → 导出统计（PRD §12 验收）
// Playwright 每个用例默认全新 context：localStorage/IndexedDB 天然隔离
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE = resolve(HERE, '../../public/samples/riddles.csv');
const TOTAL = 53; // 示例谜库数据行数

async function importSample(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', SAMPLE);
  await expect(page.locator('.panel-import')).toContainText('导入预览');
  await page.click('button:has-text("确认导入")');
  await expect(page.locator('.page-head h1')).toContainText(`${TOTAL} 条`);
}

test.describe('元宵灯谜库 E2E', () => {
  test('首页加载与导航', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/元宵灯谜库/);
    await expect(page.getByRole('heading', { name: /谜库/ })).toBeVisible();
    await page.click('nav >> text=谜格说明');
    await expect(page.locator('.lib-grid .panel').first()).toContainText('无格');
    await page.click('nav >> text=设置');
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
  });

  test('导入示例 CSV（两步式预览）并自动校验', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('input[type=file]', SAMPLE);
    await expect(page.locator('.panel-import')).toContainText('导入预览');
    await expect(page.locator('.panel-import')).toContainText('新增 53');
    await expect(page.locator('.panel-import')).toContainText('格式错误 0');
    await page.click('button:has-text("确认导入")');
    await expect(page.locator('.page-head h1')).toContainText(`${TOTAL} 条`);
    // 秋千格误例（哈尔滨三字）→ 不通过
    await expect(page.locator('tr', { hasText: '误例：秋千格谜底须两字' }).locator('.verdict-fail')).toBeVisible();
    // 秋千格正例（今天→日本）→ 存疑
    await expect(page.locator('tr', { hasText: '今天' }).locator('.verdict-suspect')).toBeVisible();
    // 无格正例（一口咬掉牛尾巴→告）→ 通过
    await expect(page.locator('tr', { hasText: '一口咬掉牛尾巴' }).first().locator('.verdict-pass')).toBeVisible();
  });

  test('搜索与筛选', async ({ page }) => {
    await importSample(page);
    await page.fill('.search', '牛尾巴');
    await expect(page.locator('.riddle-table tbody tr')).toHaveCount(1);
    await page.fill('.search', '');
    await page.selectOption('.toolbar select >> nth=0', 'idiom');
    await expect(page.locator('.riddle-table tbody tr').first()).toContainText('猜成语');
  });

  test('查重：同谜面不同标点判重', async ({ page }) => {
    await importSample(page);
    const dupCsv = '谜面,谜底,谜目,谜格\n快刀斩乱麻!,迎刃而解,猜成语,无格';
    await page.setInputFiles('input[type=file]', {
      name: 'dup.csv', mimeType: 'text/csv', buffer: Buffer.from(dupCsv, 'utf8'),
    });
    await expect(page.locator('.panel-import')).toContainText('重复 1');
  });

  test('编辑页：实时校验面板 + 保存', async ({ page }) => {
    await page.goto('/');
    await page.click('a:has-text("新建谜条")');
    await page.fill('textarea', '一口咬掉牛尾巴');
    await page.fill('.edit-grid input >> nth=0', '告');
    await expect(page.locator('.check-pass').first()).toContainText('基础校验通过');
    await page.click('button:has-text("添加到谜库")');
    await expect(page.getByText('已保存')).toBeVisible();
    await page.click('a:has-text("返回谜库")');
    await expect(page.locator('.page-head h1')).toContainText('1 条');
  });

  test('批量选中出条 → 打印预览（双联/裁切线/大字谜面）', async ({ page }) => {
    await importSample(page);
    const rows = page.locator('.riddle-table tbody tr');
    await rows.first().locator('input[type=checkbox]').check();
    await rows.nth(1).locator('input[type=checkbox]').check();
    await rows.nth(2).locator('input[type=checkbox]').check();
    await page.click('button:has-text("批量出条")');
    await expect(page).toHaveURL(/#\/print/);
    await expect(page.locator('.sheet')).toHaveCount(1);
    await expect(page.locator('.card')).toHaveCount(3);
    // 双联：回收联含谜底与猜中者填写栏
    await expect(page.locator('.card-slip').first()).toContainText('猜中者姓名');
    await expect(page.locator('.slip-answer').first()).toContainText('告');
    // 谜面字号 ≥ 14pt（≈18.66px）
    const fontSize = await page.locator('.card-surface').first().evaluate((el) => getComputedStyle(el).fontSize);
    expect(parseFloat(fontSize)).toBeGreaterThanOrEqual(18.5);
  });

  test('现场登记：登记 → 重复登记提示 → 统计', async ({ page }) => {
    await importSample(page);
    await page.click('nav >> text=现场登记');
    await expect(page.locator('.stat-row')).toContainText(`${TOTAL}`);
    await page.fill('.onsite-no', '1');
    await page.click('button:has-text("查找")');
    await expect(page.locator('.onsite-current')).toContainText('一口咬掉牛尾巴');
    await page.fill('.onsite-current input.input >> nth=0', '张三');
    await page.click('button:has-text("✓ 登记猜中")');
    await expect(page.locator('.msg-ok')).toContainText('已登记');
    await expect(page.locator('.stat-ok')).toContainText('1');
    // 重复登记提示
    await page.fill('.onsite-no', '1');
    await page.click('button:has-text("查找")');
    await expect(page.locator('.msg-warn')).toContainText('已于');
    // 不存在谜号
    await page.fill('.onsite-no', '999');
    await page.click('button:has-text("查找")');
    await expect(page.locator('.msg-bad')).toContainText('找不到谜号 999');
  });

  test('大屏模式：逐条大字 + 分级提示', async ({ page }) => {
    await importSample(page);
    await page.click('nav >> text=现场登记');
    await page.click('button:has-text("大屏模式")');
    await expect(page.locator('.bigscreen-surface')).toContainText('一口咬掉牛尾巴');
    await page.click('button:has-text("分级提示")');
    await expect(page.locator('.bigscreen-hint').first()).toContainText('1 个字');
    await page.click('button:has-text("下一条")');
    await expect(page.locator('.bigscreen-surface')).toContainText('两人土上蹲');
    await page.click('button:has-text("退出大屏")');
    await expect(page.locator('.bigscreen')).toHaveCount(0);
  });

  test('兑奖号码生成', async ({ page }) => {
    await importSample(page);
    await page.click('nav >> text=现场登记');
    await page.fill('.onsite-no', '1');
    await page.click('button:has-text("查找")');
    await page.click('button:has-text("✓ 登记猜中")');
    await page.click('button:has-text("生成兑奖号码")');
    await expect(page.locator('.msg-ok')).toContainText('已生成 1 个');
    await expect(page.locator('.records-table').first()).toContainText('DJ-0001');
  });

  test('导出谜库 CSV（UTF-8 BOM）', async ({ page }) => {
    await importSample(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("导出 CSV")'),
    ]);
    const buf = readFileSync((await download.path())!);
    expect([buf[0], buf[1], buf[2]]).toEqual([0xef, 0xbb, 0xbf]);
    expect(buf.toString('utf8')).toContain('一口咬掉牛尾巴,告,猜一字,无格');
  });

  test('导出现场登记表 CSV（UTF-8 BOM）', async ({ page }) => {
    await importSample(page);
    await page.click('nav >> text=现场登记');
    await page.fill('.onsite-no', '1');
    await page.click('button:has-text("查找")');
    await page.click('button:has-text("✓ 登记猜中")');
    await page.click('button:has-text("导出登记表")');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("导出现场登记表 CSV")'),
    ]);
    const buf = readFileSync((await download.path())!);
    expect(buf[0]).toBe(0xef);
    expect(buf.toString('utf8')).toContain('谜号,谜面,谜底,猜中者');
  });

  test('哈希深链直达', async ({ page }) => {
    await page.goto('/#/library');
    await expect(page.locator('.lib-grid')).toBeVisible();
    await page.goto('/#/settings');
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
  });

  test('清空谜库（设置页）', async ({ page }) => {
    await importSample(page);
    await page.click('nav >> text=设置');
    page.once('dialog', (d) => d.accept());
    await page.click('button:has-text("清空谜库")');
    await expect(page.locator('.notice')).toContainText('谜库已清空');
    await page.click('nav >> text=谜库');
    await expect(page.locator('.empty')).toBeVisible();
  });

  test('设置持久化：保存活动信息后刷新仍保留（IndexedDB）', async ({ page }) => {
    await page.goto('/#/settings');
    const title = page.locator('.settings-grid input.input').first();
    await title.fill('测试灯会');
    await page.click('button:has-text("保存活动信息")');
    await expect(page.locator('.notice')).toContainText('已保存');
    await page.reload();
    await expect(page.locator('.settings-grid input.input').first()).toHaveValue('测试灯会');
    // 顶部品牌名不变，导航正常
    await expect(page.locator('.brand b')).toContainText('元宵灯谜库');
  });

  test('谜格说明页：9 张卡片齐全', async ({ page }) => {
    await page.goto('/#/library');
    for (const name of ['无格', '秋千格', '卷帘格', '徐妃格', '梨花格', '白头格', '粉底格', '上楼格', '下楼格']) {
      await expect(page.locator('.lib-card h3', { hasText: name })).toBeVisible();
    }
  });

  test('不存在的谜条 id：容错面板而非白屏', async ({ page }) => {
    await page.goto('/#/riddle/nonexist');
    await expect(page.locator('.empty')).toContainText('找不到该谜条');
    await page.click('a:has-text("返回谜库")');
    await expect(page).toHaveURL(/#\/$/);
  });

  test('全程无 console error', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await importSample(page);
    await page.goto('/#/print');
    await page.goto('/#/onsite');
    await page.goto('/#/library');
    await page.goto('/#/settings');
    expect(errors).toEqual([]);
  });

  test('300 张谜条分页无错位（50 页 × 6 条）', async ({ page }) => {
    // 构造 300 行 CSV（行内引号字段验证解析鲁棒性）
    const lines = ['谜面,谜底,谜目,谜格'];
    for (let i = 1; i <= 300; i++) lines.push(`批量谜面第${i}条,答${i},猜一字,无格,,批量,1,通用,,`);
    await page.goto('/');
    await page.setInputFiles('input[type=file]', {
      name: 'bulk.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n'), 'utf8'),
    });
    await page.click('button:has-text("确认导入")');
    await expect(page.locator('.page-head h1')).toContainText('300 条');
    await page.goto('/#/print');
    await page.selectOption('select >> nth=0', 'all');
    await expect(page.locator('.page-head h1')).toContainText('50 页');
    await expect(page.locator('.sheet')).toHaveCount(50);
    await expect(page.locator('.card')).toHaveCount(300);
    // 末页有 6 张卡（300 整除 6），无残缺行
    await expect(page.locator('.sheet').nth(49).locator('.card')).toHaveCount(6);
    // 谜号渲染正确（首卡 1、末卡 300）
    await expect(page.locator('.card').first()).toHaveAttribute('data-no', '1');
    await expect(page.locator('.card').last()).toHaveAttribute('data-no', '300');
  });

  test('离线状态下登记不丢失（IndexedDB 持久化）', async ({ page }) => {
    await importSample(page);
    await page.context().setOffline(true); // 断网
    await page.goto('/#/onsite');
    await expect(page.locator('.badge-offline')).toBeVisible(); // 离线徽标
    for (const no of ['1', '2', '3']) {
      await page.fill('.onsite-no', no);
      await page.click('button:has-text("查找")');
      await page.click('button:has-text("✓ 登记猜中")');
    }
    await expect(page.locator('.stat-ok')).toContainText('3');
    // 离线中直接校验登记已写入本地 IndexedDB（不依赖网络）
    const idbCount = await page.evaluate(() => new Promise<number>((res, rej) => {
      const open = indexedDB.open('app-024-lantern-riddle');
      open.onsuccess = () => {
        const db = open.result;
        try {
          const cnt = db.transaction('records', 'readonly').objectStore('records').count();
          cnt.onsuccess = () => res(cnt.result);
          cnt.onerror = () => rej(cnt.error);
        } catch (e) { rej(e); }
      };
      open.onerror = () => rej(open.error);
    }));
    expect(idbCount).toBe(3);
    await page.context().setOffline(false);
    await page.reload(); // 恢复后刷新，登记仍在（IndexedDB 持久化）
    await expect(page.locator('.stat-ok')).toContainText('3');
    await expect(page.locator('.records-table tbody tr')).toHaveCount(3);
  });
});
