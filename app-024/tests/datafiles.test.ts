// 真实离线数据集成测试：public/data/{pinyin,components,common}.json
import { describe, it, expect } from 'vitest';
import pinyinData from '../public/data/pinyin.json';
import componentsData from '../public/data/components.json';
import commonData from '../public/data/common.json';
import { loadDataCtx } from '../src/lib/datafiles';
import { validateRiddle } from '../src/lib/validate';

const py = pinyinData as Record<string, string[] | string>;
const comp = componentsData as unknown as Record<string, [string, string, string] | [string, string]>;

describe('离线数据包', () => {
  it('拼音数据规模足够且含示例字', () => {
    expect(Object.keys(py).length).toBeGreaterThan(15000);
    expect(py['告']).toBeDefined();
    expect(py['乐']).toBeDefined();
  });
  it('部件数据含徐妃格示例字（芙蓉/茉莉 同艹组）', () => {
    for (const c of ['芙', '蓉', '茉', '莉']) expect(comp[c]).toBeDefined();
    const g = (c: string) => (comp[c].length >= 3 ? comp[c][2] : comp[c][0]);
    expect(g('芙')).toBe(g('蓉'));
    expect(g('茉')).toBe(g('莉'));
  });
  it('常用字表含常用字、不含生僻字（燚/龘）', () => {
    const common = new Set(Object.keys(commonData));
    for (const c of ['告', '白', '山', '河']) expect(common.has(c)).toBe(true);
    expect(common.has('燚')).toBe(false);
    expect(common.has('龘')).toBe(false);
  });
});

describe('真实数据端到端校验', () => {
  it('loadDataCtx 在 Node 环境降级为空（fetch 依赖浏览器）', async () => {
    const ctx = await loadDataCtx('');
    expect(ctx.loaded).toBe(false);
  });
  it('徐妃格：芙蓉（真实部件） → 存疑并给出「夫容」', () => {
    const ctx = {
      pinyin: new Map(Object.entries(py as Record<string, string[]>)),
      components: new Map(
        Object.entries(comp).map(([k, v]) => [k, [String(v[0]), String(v[1]), String(v[2] ?? v[0])] as [string, string, string]]),
      ),
      common: new Set(Object.keys(commonData)),
      loaded: true,
    };
    const r = validateRiddle({ surface: '丈夫模样', answer: '芙蓉', category: 'object', format: 'xufei' }, ctx);
    expect(r.verdict).toBe('suspect');
    expect(r.reasons.join()).toContain('夫容');
  });
  it('徐妃格：明天（日旁 vs 大旁） → 不通过', () => {
    const ctx = {
      pinyin: new Map(),
      components: new Map(
        Object.entries(comp).map(([k, v]) => [k, [String(v[0]), String(v[1]), String(v[2] ?? v[0])] as [string, string, string]]),
      ),
      common: new Set(Object.keys(commonData) as string[]),
      loaded: true,
    };
    const r = validateRiddle({ surface: '误例', answer: '明天', category: 'other', format: 'xufei' }, ctx);
    expect(r.verdict).toBe('fail');
  });
  it('无格：燚龘 生僻字 → 存疑', () => {
    const ctx = {
      pinyin: new Map(), components: new Map(), common: new Set(Object.keys(commonData)), loaded: true,
    };
    const r = validateRiddle({ surface: '火与龙的极致', answer: '燚龘', category: 'other', format: 'none' }, ctx);
    expect(r.verdict).toBe('suspect');
  });
});
