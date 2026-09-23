// 打印排版：按卡纸尺寸与 A4 可用区计算每页行列、间距与实际卡片尺寸（PRD §8）
import type { PrintSetup } from '../types';

export const PAGE_W_MM = 210;
export const PAGE_H_MM = 297;
export const PAGE_MARGIN_MM = 10;
export const GAP_MM = 4;

export interface PrintLayout {
  cols: number;
  rows: number;
  perPage: number;      // 实际每页条数（cols*rows，≥ setup.perPage 的最小整除组合）
  cardW: number;        // 实际卡片宽（可能自动缩小）
  cardH: number;
  gap: number;
  adjusted: boolean;    // 是否因版面被缩小
  warning?: string;
}

function available(cols: number, rows: number, gap: number): { w: number; h: number } {
  const usableW = PAGE_W_MM - 2 * PAGE_MARGIN_MM;
  const usableH = PAGE_H_MM - 2 * PAGE_MARGIN_MM;
  return {
    w: (usableW - (cols - 1) * gap) / cols,
    h: (usableH - (rows - 1) * gap) / rows,
  };
}

export function calcLayout(setup: PrintSetup, gap = GAP_MM): PrintLayout {
  const want = Math.max(1, Math.min(12, Math.floor(setup.perPage)));
  let best: PrintLayout | null = null;
  // 枚举列数 1..6，行数 = ceil(want/cols)，取卡片面积最大者（面积相同取更方的）
  for (let cols = 1; cols <= 6; cols++) {
    const rows = Math.ceil(want / cols);
    if (cols * rows < want) continue;
    const avail = available(cols, rows, gap);
    const w = Math.min(setup.cardWmm, avail.w);
    const h = Math.min(setup.cardHmm, avail.h);
    if (w <= 10 || h <= 10) continue;
    const area = w * h;
    if (!best || area > best.cardW * best.cardH + 0.01) {
      const adjusted = w < setup.cardWmm - 0.05 || h < setup.cardHmm - 0.05;
      best = {
        cols, rows, perPage: cols * rows, cardW: round2(w), cardH: round2(h), gap, adjusted,
        warning: adjusted
          ? `卡片 ${setup.cardWmm}×${setup.cardHmm}mm 超出每页 ${want} 条的 A4 版面，已自动缩小为 ${round2(w)}×${round2(h)}mm`
          : undefined,
      };
    }
  }
  if (!best) {
    const avail = available(1, 1, gap);
    best = {
      cols: 1, rows: 1, perPage: 1,
      cardW: Math.min(setup.cardWmm, round2(avail.w)),
      cardH: Math.min(setup.cardHmm, round2(avail.h)),
      gap, adjusted: true,
      warning: '版面参数过小或过大，已回退为单条/页',
    };
  }
  return best;
}

export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
