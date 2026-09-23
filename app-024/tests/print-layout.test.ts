// 打印排版测试（PRD §10：A4 每页 6/9 条两种版式；超版自动缩小并告警）
import { describe, it, expect } from 'vitest';
import { calcLayout, pageCount, PAGE_W_MM, PAGE_H_MM, PAGE_MARGIN_MM } from '../src/lib/print';
import type { PrintSetup } from '../src/types';

function setup(over: Partial<PrintSetup> = {}): PrintSetup {
  return { cardWmm: 63, cardHmm: 135, perPage: 6, showAnswerSlip: true, showCutLine: true, hostLine: '', ...over };
}

function fitsPage(l: ReturnType<typeof calcLayout>): boolean {
  return (
    l.cols * l.cardW + (l.cols - 1) * l.gap <= PAGE_W_MM - 2 * PAGE_MARGIN_MM + 0.01 &&
    l.rows * l.cardH + (l.rows - 1) * l.gap <= PAGE_H_MM - 2 * PAGE_MARGIN_MM + 0.01
  );
}

describe('calcLayout', () => {
  it('每页 6 条：3 列 × 2 行，卡片不超出 A4 可用区', () => {
    const l = calcLayout(setup({ perPage: 6 }));
    expect(l.cols).toBe(3);
    expect(l.rows).toBe(2);
    expect(l.perPage).toBe(6);
    expect(fitsPage(l)).toBe(true);
  });
  it('每页 9 条：3 列 × 3 行，卡片不超出 A4 可用区', () => {
    const l = calcLayout(setup({ perPage: 9 }));
    expect(l.cols).toBe(3);
    expect(l.rows).toBe(3);
    expect(fitsPage(l)).toBe(true);
  });
  it('63×135mm 在每页 6 条时宽度受限自动缩小并告警', () => {
    const l = calcLayout(setup({ perPage: 6 }));
    expect(l.adjusted).toBe(true);
    expect(l.warning).toBeTruthy();
    expect(l.cardW).toBeLessThan(63);
    expect(l.cardH).toBe(135);
  });
  it('小卡片（50×80）在每页 6 条时无需缩小', () => {
    const l = calcLayout(setup({ perPage: 6, cardWmm: 50, cardHmm: 80 }));
    expect(l.adjusted).toBe(false);
    expect(l.cardW).toBe(50);
    expect(l.cardH).toBe(80);
  });
  it('每页 12 条仍不越界', () => {
    const l = calcLayout(setup({ perPage: 12 }));
    expect(l.perPage).toBe(12);
    expect(fitsPage(l)).toBe(true);
  });
  it('perPage 越界钳制（0 → 1 条）', () => {
    const l = calcLayout(setup({ perPage: 0 }));
    expect(l.perPage).toBe(1);
    expect(l.cols * l.rows).toBe(1);
  });
  it('perPage 上限 12', () => {
    const l = calcLayout(setup({ perPage: 999 }));
    expect(l.perPage).toBe(12);
  });
  it('超大卡片自动缩小到可用区', () => {
    const l = calcLayout(setup({ perPage: 1, cardWmm: 300, cardHmm: 400 }));
    expect(fitsPage(l)).toBe(true);
    expect(l.adjusted).toBe(true);
  });
});

describe('pageCount', () => {
  it('向上取整', () => {
    expect(pageCount(0, 6)).toBe(1);
    expect(pageCount(1, 6)).toBe(1);
    expect(pageCount(7, 6)).toBe(2);
    expect(pageCount(300, 9)).toBe(34);
  });
});
