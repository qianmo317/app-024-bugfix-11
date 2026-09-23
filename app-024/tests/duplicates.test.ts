// 重复检测测试（PRD §10：同谜面不同标点必须判重；阈值以下不误报）
import { describe, it, expect } from 'vitest';
import { findSimilar, scanDuplicates, DUP_THRESHOLD } from '../src/lib/duplicates';
import type { Riddle } from '../src/types';

let seq = 0;
function mk(surface: string, category: Riddle['category'] = 'char', answer = '甲'): Riddle {
  seq++;
  return {
    id: `id${seq}`, no: seq, surface, answer, category, format: 'none',
    difficulty: 2, tags: [], check: { verdict: 'pass', reasons: [], checkedAt: 0 },
  };
}

describe('findSimilar 单条查重', () => {
  it('同一谜面不同标点必须判为重复（相似度 1）', () => {
    const list = [mk('一口咬掉牛尾巴')];
    const m = findSimilar({ id: '', surface: '一口咬掉牛尾巴。', category: 'char' }, list);
    expect(m).toHaveLength(1);
    expect(m[0].similarity).toBe(1);
  });
  it('繁简体统一后判重', () => {
    const list = [mk('灯谜大会')];
    const m = findSimilar({ id: '', surface: '燈謎大會', category: 'char' }, list);
    expect(m).toHaveLength(1);
  });
  it('高度相似（缺一字）达到阈值判重', () => {
    const list = [mk('一口咬掉牛尾巴')];
    const m = findSimilar({ id: '', surface: '一口咬掉牛尾巴了', category: 'char' }, list);
    expect(m).toHaveLength(1);
    expect(m[0].similarity).toBeGreaterThanOrEqual(DUP_THRESHOLD);
  });
  it('阈值以下不误报', () => {
    const list = [mk('一口咬掉牛尾巴')];
    const m = findSimilar({ id: '', surface: ' completely different text!! ', category: 'char' }, list);
    expect(m).toHaveLength(0);
  });
  it('谜目不同不比对', () => {
    const list = [mk('一口咬掉牛尾巴', 'idiom')];
    const m = findSimilar({ id: '', surface: '一口咬掉牛尾巴', category: 'char' }, list);
    expect(m).toHaveLength(0);
  });
  it('排除自身', () => {
    const me = mk('一口咬掉牛尾巴');
    const list = [me, mk('一口咬掉牛尾巴了')];
    const m = findSimilar({ id: me.id, surface: me.surface, category: 'char' }, list);
    expect(m.every((x) => x.id !== me.id)).toBe(true);
  });
  it('空谜面返回空', () => {
    expect(findSimilar({ id: '', surface: '  ', category: 'char' }, [mk('一口咬掉牛尾巴')])).toHaveLength(0);
  });
  it('多命中按相似度降序并限制条数', () => {
    const list = [mk('一口咬掉牛尾巴'), mk('一口咬掉牛尾巴了'), mk('一口咬掉牛尾巴呀')];
    const m = findSimilar({ id: '', surface: '一口咬掉牛尾巴', category: 'char' }, list, DUP_THRESHOLD, 5);
    expect(m.length).toBeGreaterThanOrEqual(2);
    expect(m[0].similarity).toBeGreaterThanOrEqual(m[1].similarity);
  });
});

describe('scanDuplicates 全库扫描', () => {
  it('标点不同的重复对互为命中', () => {
    const list = [mk('快刀斩乱麻'), mk('快刀、斩乱麻！')];
    const map = scanDuplicates(list);
    expect(map.get(list[0].id)).toHaveLength(1);
    expect(map.get(list[1].id)).toHaveLength(1);
    expect(map.get(list[0].id)![0].similarity).toBe(1);
  });
  it('完全不同的谜面无命中', () => {
    const list = [mk('一口咬掉牛尾巴'), mk('风平浪静打一城市再说')];
    const map = scanDuplicates(list);
    expect(map.size).toBe(0);
  });
  it('跨谜目不误报', () => {
    const list = [mk('一口咬掉牛尾巴', 'char'), mk('一口咬掉牛尾巴', 'idiom')];
    expect(scanDuplicates(list).size).toBe(0);
  });
  it('三个相似谜面形成三组两两命中', () => {
    const list = [mk('太阳西边下，月儿东边挂'), mk('太阳西边下月儿东边挂'), mk('太阳西边下，月儿东边挂！')];
    const map = scanDuplicates(list);
    expect(map.get(list[0].id)).toHaveLength(2);
  });
  it('相似度数值在 (0,1] 区间', () => {
    const list = [mk('一口咬掉牛尾巴'), mk('一口咬掉牛尾巴了')];
    for (const arr of scanDuplicates(list).values()) {
      for (const m of arr) { expect(m.similarity).toBeGreaterThan(0); expect(m.similarity).toBeLessThanOrEqual(1); }
    }
  });
});
