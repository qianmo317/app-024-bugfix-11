// 谜号/删除/编辑字段回归测试（store 层，走 idb 内存降级路径）
import { describe, it, expect, beforeEach } from 'vitest';
import type { Riddle } from '../src/types';
import { store } from '../src/lib/store';
import { clearStore, getAll, STORE_RIDDLES } from '../src/lib/idb';
import { parseTags } from '../src/lib/csv';
import { filterRiddles, EMPTY_FILTERS } from '../src/lib/search';

// 强制走内存降级：这些用例不在浏览器环境，idb 本就会回退到内存 Map
type RiddleIn = Omit<Riddle, 'id' | 'no' | 'check'>;

function mk(surface: string, extra: Partial<RiddleIn> = {}): RiddleIn {
  return {
    surface, answer: 'x', category: 'char', format: 'none',
    difficulty: 2, tags: [], ...extra,
  };
}

beforeEach(async () => {
  // 每个用例一个干净库：清内存降级存储 + 清 store 内存态
  await clearStore(STORE_RIDDLES);
  await store.clearRiddles();
  store.clearSelection();
});

describe('谜号分配', () => {
  it('删除中间几条后新建，谜号取最大号+1，不与现存谜条撞号', async () => {
    await store.addRiddles([mk('甲'), mk('乙'), mk('丙')]);
    const nos = store.getState().riddles.map((r) => r.no);
    expect(nos).toEqual([1, 2, 3]);
    const [a, b] = store.getState().riddles;
    await store.removeRiddles([a.id, b.id]); // 删掉 1、2 号，剩 3 号
    expect(store.nextNo()).toBe(4);
    const r = await store.saveRiddle(mk('丁'));
    expect(r.no).toBe(4);
    const allNos = store.getState().riddles.map((x) => x.no);
    expect(new Set(allNos).size).toBe(allNos.length); // 全库谜号唯一
  });

  it('分批导入：第二批接着第一批的最大号编，不出现两段一号', async () => {
    await store.addRiddles([mk('一'), mk('二')]);
    await store.addRiddles([mk('三'), mk('四'), mk('五')]);
    expect(store.getState().riddles.map((r) => r.no)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('删除持久化', () => {
  it('删除后内存与底层存储都不再保留该记录（刷新后不会回来）', async () => {
    await store.addRiddles([mk('留'), mk('删')]);
    const victim = store.getState().riddles.find((r) => r.surface === '删')!;
    await store.removeRiddles([victim.id]);
    const persisted = await getAll<Riddle>(STORE_RIDDLES);
    expect(persisted.some((r) => r.id === victim.id)).toBe(false);
    expect(persisted.map((r) => r.surface)).toEqual(['留']);
  });
});

describe('编辑保存字段', () => {
  it('作者/出处/适用年龄/谜格补充说明保存后保留', async () => {
    const saved = await store.saveRiddle({
      ...mk('面'),
      formatNote: '白头格·首字读白字',
      author: '张三', source: '《谜汇》',
      ageGroup: 'child',
    });
    const again = await store.saveRiddle({
      ...mk('面'),
      id: saved.id, no: saved.no,
      formatNote: '更新后的说明',
      author: '李四', source: '《灯会稿》',
      ageGroup: 'adult',
    });
    expect(again.formatNote).toBe('更新后的说明');
    expect(again.author).toBe('李四');
    expect(again.source).toBe('《灯会稿》');
    expect(again.ageGroup).toBe('adult');
  });

  it('标签框用顿号分隔的多个标签拆成数组存储，可按标签筛选', async () => {
    // 编辑页保存逻辑：parseTags('儿童专区、党史主题、节日')
    const saved = await store.saveRiddle({
      ...mk('面'),
      tags: parseTags('儿童专区、党史主题、节日'),
    });
    expect(saved.tags).toEqual(['儿童专区', '党史主题', '节日']);
    const hit = filterRiddles(store.getState().riddles, { ...EMPTY_FILTERS, tag: '党史主题' });
    expect(hit.map((r) => r.id)).toEqual([saved.id]);
  });
});
