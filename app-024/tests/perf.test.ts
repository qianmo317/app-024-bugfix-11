// 性能测试（PRD §10：2000 条谜库筛选 < 100ms）
import { describe, it, expect } from 'vitest';
import { filterRiddles, EMPTY_FILTERS } from '../src/lib/search';
import { findSimilar } from '../src/lib/duplicates';
import type { Riddle } from '../src/types';

const WORDS = ['一口咬掉牛尾巴', '风平浪静', '日近黄昏', '快刀斩乱麻', '千里相逢', '双喜临门', '儿童图书专卖店', '蜜饯黄连'];
function build(n: number): Riddle[] {
  const out: Riddle[] = [];
  for (let i = 0; i < n; i++) {
    const surface = `${WORDS[i % WORDS.length]}变体${i}号`;
    out.push({
      id: `p${i}`, no: i + 1, surface,
      answer: `答${i}`, category: (['char', 'idiom', 'object', 'place'] as const)[i % 4],
      format: 'none', difficulty: (i % 3 + 1) as 1 | 2 | 3, tags: i % 5 === 0 ? ['儿童专区'] : [],
      check: { verdict: 'pass', reasons: [], checkedAt: 0 },
    });
  }
  return out;
}

describe('性能', () => {
  it('2000 条谜库筛选 < 100ms', () => {
    const list = build(2000);
    // 预热（排除首次 JIT 干扰后仍须远低于 100ms）
    filterRiddles(list, { ...EMPTY_FILTERS, q: '风平浪静' });
    const t0 = performance.now();
    const out = filterRiddles(list, { ...EMPTY_FILTERS, q: '风平浪静', category: 'idiom', difficulty: 2 });
    const ms = performance.now() - t0;
    expect(out.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(100);
  });
  it('2000 条空筛选全量返回 < 100ms', () => {
    const list = build(2000);
    const t0 = performance.now();
    const out = filterRiddles(list, EMPTY_FILTERS);
    const ms = performance.now() - t0;
    expect(out).toHaveLength(2000);
    expect(ms).toBeLessThan(100);
  });
  it('单条查重（2000 库）< 100ms', () => {
    const list = build(2000);
    const t0 = performance.now();
    findSimilar({ id: '', surface: '风平浪静变体5号', category: 'idiom' }, list);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(100);
  });
});
