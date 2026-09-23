// 谜格校验规则引擎单元测试（48+ 用例，PRD §10：40 条用例含正例/误例/无法自动判定）
import { describe, it, expect } from 'vitest';
import { validateRiddle } from '../src/lib/validate';
import type { DataCtx } from '../src/lib/datafiles';
import type { RiddleCategory, RiddleFormat } from '../src/types';

// 合成数据上下文：可控、确定性
function mkCtx(): DataCtx {
  const pinyin = new Map<string, string[]>([
    ['告', ['gao4']], ['白', ['bai2']], ['百', ['bai3']], ['柏', ['bai3', 'bo2']],
    ['日', ['ri4']], ['本', ['ben3']],
    ['芙', ['fu2']], ['蓉', ['rong2']],
    ['河', ['he2']], ['山', ['shan1']],
    ['乐', ['le4', 'yue4']], ['长', ['chang2', 'zhang3']],
    ['燚', ['yi4']], ['龘', ['da2']],
    ['孤', ['gu1']], // 唯一读音，无同音字候选（构造用）
  ]);
  const components = new Map<string, [string, string, string]>([
    ['芙', ['艹', '夫', '艹']], ['蓉', ['艹', '容', '艹']], ['慕', ['艹', '莫', '艹']],
    ['骆', ['马', '各', '马']], ['驼', ['马', '它', '马']], ['骡', ['马', '累', '马']],
    ['河', ['氵', '可', '氵']], ['湖', ['氵', '胡', '氵']], ['山', ['山', '山', '山']],
  ]);
  const common = new Set(['告', '白', '百', '日', '本', '芙', '蓉', '河', '山', '乐', '长', '四', '分', '五', '裂']);
  return { pinyin, components, common, loaded: true };
}

function check(surface: string, answer: string, category: RiddleCategory, format: RiddleFormat, ctx = mkCtx()) {
  return validateRiddle({ surface, answer, category, format }, ctx);
}

describe('无格谜：基础校验', () => {
  const ctx = mkCtx();
  it('正常无格字谜 → 通过', () => {
    const r = check('一口咬掉牛尾巴', '告', 'char', 'none', ctx);
    expect(r.verdict).toBe('pass');
  });
  it('通过时给出基础校验说明', () => {
    const r = check('一口咬掉牛尾巴', '告', 'char', 'none', ctx);
    expect(r.reasons.join()).toContain('基础校验通过');
  });
  it('猜一字但谜底两字 → 不通过', () => {
    const r = check('字数误例', '告白', 'char', 'none', ctx);
    expect(r.verdict).toBe('fail');
    expect(r.reasons.join()).toContain('1 个字');
  });
  it('猜成语但谜底三字 → 不通过', () => {
    const r = check('成语字数误例', '四分五', 'idiom', 'none', ctx);
    expect(r.verdict).toBe('fail');
  });
  it('猜成语四字 → 通过', () => {
    const r = check('一块变九块', '四分五裂', 'idiom', 'none', ctx);
    expect(r.verdict).toBe('pass');
  });
  it('猜一物不限字数 → 通过', () => {
    const r = check('千条线万条线', '雨', 'object', 'none', ctx);
    expect(r.verdict).toBe('pass');
  });
  it('谜底含 1 个生僻字 → 仅 info，仍通过', () => {
    const r = check('生僻一个', '告燚', 'other', 'none', ctx);
    expect(r.verdict).toBe('pass');
    expect(r.reasons.join()).toContain('燚');
  });
  it('谜底含 2 个生僻字 → 存疑并说明', () => {
    const r = check('生僻两个', '燚龘', 'other', 'none', ctx);
    expect(r.verdict).toBe('suspect');
    expect(r.reasons.join()).toContain('生僻字');
  });
  it('谜底含多音字 → info 提示，不影响结论', () => {
    const r = check('多音示例', '乐', 'other', 'none', ctx);
    expect(r.verdict).toBe('pass');
    expect(r.reasons.join()).toContain('多音字');
  });
  it('谜面为空 → 不通过', () => {
    const r = check('', '告', 'char', 'none', ctx);
    expect(r.verdict).toBe('fail');
  });
  it('谜底为空 → 不通过', () => {
    const r = check('面在底空', '', 'char', 'none', ctx);
    expect(r.verdict).toBe('fail');
  });
  it('数据未加载时不做生僻字判定，仍可通过', () => {
    const empty: DataCtx = { pinyin: new Map(), components: new Map(), common: new Set(), loaded: false };
    const r = check('数据未加载', '告', 'char', 'none', empty);
    expect(r.verdict).toBe('pass');
    expect(r.reasons.join()).not.toContain('生僻');
  });
  it('谜底空白字符被去除后计数', () => {
    const r = check('空白裁剪', ' 告 ', 'char', 'none', ctx);
    expect(r.verdict).toBe('pass');
  });
});

describe('秋千格（两字倒读）', () => {
  const ctx = mkCtx();
  it('两字 → 存疑（语义无法自动判定）', () => {
    const r = check('今天', '日本', 'other', 'qiqian', ctx);
    expect(r.verdict).toBe('suspect');
    expect(r.reasons.join()).toContain('倒读');
  });
  it('倒读结果展示正确（日本→本日）', () => {
    const r = check('今天', '日本', 'other', 'qiqian', ctx);
    expect(r.reasons.join()).toContain('本日');
  });
  it('一字 → 不通过', () => {
    expect(check('秋千一字', '告', 'other', 'qiqian', ctx).verdict).toBe('fail');
  });
  it('三字 → 不通过', () => {
    expect(check('秋千三字', '哈尔滨', 'other', 'qiqian', ctx).verdict).toBe('fail');
  });
  it('绝不误报通过', () => {
    expect(check('今天', '日本', 'other', 'qiqian', ctx).verdict).not.toBe('pass');
  });
});

describe('卷帘格（三字以上倒序）', () => {
  const ctx = mkCtx();
  it('三字 → 存疑', () => {
    const r = check('卷帘三字', '山河水', 'other', 'juanlian', ctx);
    expect(r.verdict).toBe('suspect');
    expect(r.reasons.join()).toContain('倒序');
  });
  it('倒序读法展示正确', () => {
    const r = check('卷帘三字', '山河水', 'other', 'juanlian', ctx);
    expect(r.reasons.join()).toContain('水河山');
  });
  it('两字 → 不通过', () => {
    expect(check('卷帘两字', '上海', 'other', 'juanlian', ctx).verdict).toBe('fail');
  });
  it('四字 → 存疑不通过误报', () => {
    expect(check('卷帘四字', '山河水云', 'other', 'juanlian', ctx).verdict).toBe('suspect');
  });
  it('空白不计入字数', () => {
    expect(check('卷帘空格', '山 河 水', 'other', 'juanlian', ctx).verdict).toBe('suspect');
  });
});

describe('徐妃格（同旁去半读）', () => {
  const ctx = mkCtx();
  it('同旁两字（芙蓉去艹） → 存疑并给出去旁读法', () => {
    const r = check('丈夫模样', '芙蓉', 'object', 'xufei', ctx);
    expect(r.verdict).toBe('suspect');
    expect(r.reasons.join()).toContain('夫容');
    expect(r.reasons.join()).toContain('艹');
  });
  it('不同旁（河山） → 不通过', () => {
    const r = check('徐妃误例', '河山', 'other', 'xufei', ctx);
    expect(r.verdict).toBe('fail');
    expect(r.reasons.join()).toContain('偏旁不一');
  });
  it('一字 → 不通过', () => {
    expect(check('徐妃一字', '河', 'other', 'xufei', ctx).verdict).toBe('fail');
  });
  it('缺部件数据的字 → 存疑（不是 fail 也不是 pass）', () => {
    const r = check('缺数据示例', '河天', 'other', 'xufei', ctx);
    expect(r.verdict).toBe('suspect');
    expect(r.reasons.join()).toContain('缺少部件');
  });
  it('数据未加载 → 存疑', () => {
    const empty: DataCtx = { pinyin: new Map(), components: new Map(), common: new Set(), loaded: false };
    const r = check('未加载', '芙蓉', 'object', 'xufei', empty);
    expect(r.verdict).toBe('suspect');
  });
  it('三字同旁 → 存疑（结构成立）', () => {
    const r = check('徐妃三字', '骆驼骡', 'object', 'xufei', ctx);
    expect(r.verdict).toBe('suspect');
    expect(r.reasons.join()).toContain('各它累');
  });
});

describe('梨花格（每字谐音）', () => {
  const ctx = mkCtx();
  it('两字 → 存疑并给谐音候选', () => {
    const r = check('梨花两字', '白百', 'other', 'lihua', ctx);
    expect(r.verdict).toBe('suspect');
    expect(r.reasons.join()).toContain('谐音');
  });
  it('首字谐音候选包含同音字', () => {
    const r = check('梨花候选', '白百', 'other', 'lihua', ctx);
    expect(r.reasons.join()).toContain('柏'); // bai 同音（去声调）
  });
  it('一字 → 不通过', () => {
    expect(check('梨花一字', '白', 'other', 'lihua', ctx).verdict).toBe('fail');
  });
  it('数据未加载 → 存疑', () => {
    const empty: DataCtx = { pinyin: new Map(), components: new Map(), common: new Set(), loaded: false };
    expect(check('未加载', '白百', 'other', 'lihua', empty).verdict).toBe('suspect');
  });
  it('无同音字时明确说明（不虚构候选）', () => {
    const r = check('孤字梨花', '孤乐', 'other', 'lihua', ctx);
    expect(r.reasons.join()).toContain('无同音字');
  });
});

describe('白头格（首字谐音）', () => {
  const ctx = mkCtx();
  it('两字 → 存疑并给候选', () => {
    const r = check('白头两字', '白告', 'other', 'baitou', ctx);
    expect(r.verdict).toBe('suspect');
    expect(r.reasons.join()).toContain('首字');
  });
  it('候选含同音去调字（百）', () => {
    const r = check('白头候选', '白告', 'other', 'baitou', ctx);
    expect(r.reasons.join()).toContain('百');
  });
  it('一字 → 不通过', () => {
    expect(check('白头一字', '白', 'other', 'baitou', ctx).verdict).toBe('fail');
  });
  it('首字无拼音数据 → 存疑', () => {
    const r = check('白头缺数据', '天告', 'other', 'baitou', ctx);
    expect(r.verdict).toBe('suspect');
    expect(r.reasons.join()).toContain('缺少拼音');
  });
});

describe('粉底格（末字谐音）', () => {
  const ctx = mkCtx();
  it('两字 → 存疑并给候选', () => {
    const r = check('粉底两字', '告百', 'other', 'fendi', ctx);
    expect(r.verdict).toBe('suspect');
    expect(r.reasons.join()).toContain('末字');
  });
  it('候选含同音去调字（柏/白）', () => {
    const r = check('粉底候选', '告百', 'other', 'fendi', ctx);
    expect(r.reasons.join()).toMatch(/柏|白/);
  });
  it('一字 → 不通过', () => {
    expect(check('粉底一字', '百', 'other', 'fendi', ctx).verdict).toBe('fail');
  });
});

describe('上楼格 / 下楼格（字位移）', () => {
  const ctx = mkCtx();
  it('上楼三字 → 存疑，末字移首展示正确', () => {
    const r = check('上楼三字', '山河水', 'other', 'shanglou', ctx);
    expect(r.verdict).toBe('suspect');
    expect(r.reasons.join()).toContain('水山河');
  });
  it('上楼两字 → 不通过', () => {
    expect(check('上楼两字', '上海', 'other', 'shanglou', ctx).verdict).toBe('fail');
  });
  it('下楼三字 → 存疑，首字移尾展示正确', () => {
    const r = check('下楼三字', '山河水', 'other', 'xialou', ctx);
    expect(r.verdict).toBe('suspect');
    expect(r.reasons.join()).toContain('河水山');
  });
  it('下楼两字 → 不通过', () => {
    expect(check('下楼两字', '上海', 'other', 'xialou', ctx).verdict).toBe('fail');
  });
});

describe('跨检查组合', () => {
  const ctx = mkCtx();
  it('秋千格 + 成语四字 → 字数双重不通过', () => {
    const r = check('跨检一', '四分五裂', 'idiom', 'qiqian', ctx);
    expect(r.verdict).toBe('fail');
  });
  it('徐妃格猜一字且同旁两字 → 字数优先判 fail', () => {
    const r = check('跨检二', '芙蓉', 'char', 'xufei', ctx);
    expect(r.verdict).toBe('fail');
  });
  it('fail 与 suspect 同时存在 → 最终 fail', () => {
    const r = check('跨检三', '河山', 'char', 'xufei', ctx); // 偏旁不一 + 字数超
    expect(r.verdict).toBe('fail');
    expect(r.reasons.length).toBeGreaterThanOrEqual(2);
  });
  it('多音字 + 单生僻字并存 → pass 且两条 info', () => {
    const r = check('跨检四', '乐燚', 'other', 'none', ctx);
    expect(r.verdict).toBe('pass');
    expect(r.reasons.join()).toContain('多音字');
    expect(r.reasons.join()).toContain('燚');
  });
});
