// 谜号编号 / 删除持久化 / 编辑字段与标签 回归测试
import { describe, it, expect } from 'vitest';
import { AppStore } from '../src/lib/store';
import * as idb from '../src/lib/idb';
import type { Riddle } from '../src/types';

type Draft = Omit<Riddle, 'id' | 'no' | 'check'>;

function draft(surface: string, extra: Partial<Draft> = {}): Draft {
  return {
    surface, answer: '底', category: 'other', format: 'none',
    difficulty: 2, tags: [], ...extra,
  };
}

// node 环境下 IndexedDB 不可用，idb 自动降级为内存存储；各用例各自清空保证隔离
async function freshStore(): Promise<AppStore> {
  const s = new AppStore();
  await s.init();
  await s.clearRiddles();
  return s;
}

describe('谜号 nextNo / saveRiddle', () => {
  it('空库从 1 开始', async () => {
    const s = await freshStore();
    expect(s.nextNo()).toBe(1);
    const r = await s.saveRiddle(draft('甲'));
    expect(r.no).toBe(1);
  });

  it('删除中间条目后新建仍取最大号 + 1，不与挂着的谜号撞号', async () => {
    const s = await freshStore();
    const a = await s.saveRiddle(draft('甲'));
    const b = await s.saveRiddle(draft('乙'));
    await s.saveRiddle(draft('丙'));
    expect([a.no, b.no]).toEqual([1, 2]);
    await s.removeRiddles([b.id]); // 删掉 2 号，库里剩 1、3
    expect(s.nextNo()).toBe(4);
    const d = await s.saveRiddle(draft('丁'));
    expect(d.no).toBe(4);
    const nos = s.getState().riddles.map((r) => r.no).sort((x, y) => x - y);
    expect(nos).toEqual([1, 3, 4]);
    expect(new Set(nos).size).toBe(nos.length);
  });

  it('编辑已有谜条保持原谜号', async () => {
    const s = await freshStore();
    const a = await s.saveRiddle(draft('甲'));
    await s.saveRiddle(draft('乙'));
    const updated = await s.saveRiddle({ ...a, answer: '改底' });
    expect(updated.id).toBe(a.id);
    expect(updated.no).toBe(1);
  });
});

describe('批量导入 addRiddles 编号', () => {
  it('分两批导入：第二批接续库内最大号，不再从 1 开始', async () => {
    const s = await freshStore();
    await s.addRiddles([draft('一'), draft('二')]);
    await s.addRiddles([draft('三'), draft('四')]);
    const nos = s.getState().riddles.map((r) => r.no).sort((a, b) => a - b);
    expect(nos).toEqual([1, 2, 3, 4]);
    expect(new Set(nos).size).toBe(nos.length);
  });

  it('导入显式带谜号时，后续自动编号越过该号', async () => {
    const s = await freshStore();
    await s.addRiddles([{ ...draft('指定'), no: 10 }, { ...draft('自动') }]);
    expect(s.getState().riddles.map((r) => r.no).sort((a, b) => a - b)).toEqual([10, 11]);
  });
});

describe('删除持久化', () => {
  it('removeRiddles 真正从 IndexedDB 删除，刷新（重新 init）后不复活', async () => {
    const s = await freshStore();
    const a = await s.saveRiddle(draft('甲'));
    const b = await s.saveRiddle(draft('乙'));
    await s.removeRiddles([a.id]);
    let inDb = await idb.getAll<Riddle>(idb.STORE_RIDDLES);
    expect(inDb.map((r) => r.id)).toEqual([b.id]);
    // 模拟刷新：新实例重新从底层存储加载
    const s2 = new AppStore();
    await s2.init();
    expect(s2.getState().riddles.map((r) => r.id)).toEqual([b.id]);
    inDb = await idb.getAll<Riddle>(idb.STORE_RIDDLES);
    expect(inDb.find((r) => r.id === a.id)).toBeUndefined();
  });
});

describe('编辑保存字段', () => {
  it('作者/出处/适用年龄/谜格补充说明/标签全部落库', async () => {
    const s = await freshStore();
    const r = await s.saveRiddle(draft('面', {
      author: '作者甲', source: '出处乙', ageGroup: 'child',
      formatNote: '倒读扣面', tags: ['儿童专区', '党史主题'],
    }));
    const inDb = (await idb.getAll<Riddle>(idb.STORE_RIDDLES)).find((x) => x.id === r.id);
    expect(inDb).toMatchObject({
      author: '作者甲', source: '出处乙', ageGroup: 'child',
      formatNote: '倒读扣面', tags: ['儿童专区', '党史主题'],
    });
  });

  it('再次编辑保存时此前的字段不丢失', async () => {
    const s = await freshStore();
    const r = await s.saveRiddle(draft('面', {
      author: '作者甲', source: '出处乙', ageGroup: 'teen', formatNote: '备注格',
    }));
    const updated = await s.saveRiddle({ ...r, answer: '新底' });
    expect(updated).toMatchObject({
      answer: '新底', author: '作者甲', source: '出处乙',
      ageGroup: 'teen', formatNote: '备注格',
    });
  });
});

describe('历史标签数据修复', () => {
  it('整串存成一条的顿号标签在加载时拆成多条并落库', async () => {
    await freshStore(); // 清空
    const legacy: Riddle = {
      id: 'legacy-1', no: 1, surface: '老谜面', answer: '底',
      category: 'other', format: 'none', difficulty: 2,
      tags: ['儿童专区、党史主题'],
      check: { verdict: 'pass', reasons: [], checkedAt: 0 },
    };
    await idb.put(idb.STORE_RIDDLES, legacy);
    const s = new AppStore();
    await s.init();
    const got = s.getState().riddles.find((r) => r.id === 'legacy-1');
    expect(got?.tags).toEqual(['儿童专区', '党史主题']);
    const inDb = (await idb.getAll<Riddle>(idb.STORE_RIDDLES)).find((r) => r.id === 'legacy-1');
    expect(inDb?.tags).toEqual(['儿童专区', '党史主题']);
  });
});
