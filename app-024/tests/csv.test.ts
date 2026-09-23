// CSV 解析/导出/导入预览测试
import { describe, it, expect } from 'vitest';
import { parseCSV, stringifyCSV, withBOM, rowToRiddle, importPreview, RIDDLE_CSV_HEADERS } from '../src/lib/csv';
import type { Riddle } from '../src/types';

function mk(surface: string, category: Riddle['category'] = 'char', no = 1): Riddle {
  return {
    id: `k${no}`, no, surface, answer: '告', category, format: 'none',
    difficulty: 2, tags: [], check: { verdict: 'pass', reasons: [], checkedAt: 0 },
  };
}

describe('parseCSV', () => {
  it('基本逗号分隔', () => {
    expect(parseCSV('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });
  it('去掉 UTF-8 BOM', () => {
    expect(parseCSV('\uFEFFa,b')).toEqual([['a', 'b']]);
  });
  it('CRLF 换行', () => {
    expect(parseCSV('a,b\r\nc,d\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });
  it('引号内逗号与换行不切分', () => {
    expect(parseCSV('a,"b,1",c')).toEqual([['a', 'b,1', 'c']]);
    expect(parseCSV('a,"b\n第二行",c')).toEqual([['a', 'b\n第二行', 'c']]);
  });
  it('双引号转义', () => {
    expect(parseCSV('"he said ""hi"""')).toEqual([['he said "hi"']]);
  });
  it('空行保留空字段', () => {
    expect(parseCSV('a,,c')).toEqual([['a', '', 'c']]);
  });
});

describe('stringifyCSV / withBOM', () => {
  it('含逗号/引号/换行的字段加引号转义', () => {
    const out = stringifyCSV([['a', 'b,c', 'd"e', 'f\ng']]);
    expect(out).toBe('a,"b,c","d""e","f\ng"\r\n');
  });
  it('undefined → 空串', () => {
    expect(stringifyCSV([[undefined, undefined, 3]])).toBe(',,3\r\n');
    expect(stringifyCSV([[undefined, undefined]])).toBe(',\r\n');
  });
  it('withBOM 加 BOM（Excel 打开不乱码）', () => {
    const s = withBOM('a,b');
    expect(s.charCodeAt(0)).toBe(0xfeff);
    expect(s.slice(1)).toBe('a,b');
  });
});

describe('rowToRiddle', () => {
  it('按表头映射（乱序列）', () => {
    const p = rowToRiddle(['告', '猜一字', '一口咬掉牛尾巴'], ['谜底', '谜目', '谜面']);
    expect(p.riddle?.surface).toBe('一口咬掉牛尾巴');
    expect(p.riddle?.answer).toBe('告');
    expect(p.riddle?.category).toBe('char');
  });
  it('按固定列序（无表头）', () => {
    const p = rowToRiddle(['千里相逢', '重', '猜一字', '无格', '', '', '2', '儿童', '儿童专区', '备注x']);
    expect(p.riddle).toMatchObject({ surface: '千里相逢', answer: '重', category: 'char', format: 'none', difficulty: 2, ageGroup: 'child', tags: ['儿童专区'], note: '备注x' });
  });
  it('谜面为空报错', () => {
    expect(rowToRiddle(['', '告'], ['谜面', '谜底']).error).toContain('谜面');
  });
  it('谜底为空报错', () => {
    expect(rowToRiddle(['面', ''], ['谜面', '谜底']).error).toContain('谜底');
  });
  it('未知谜目报错', () => {
    expect(rowToRiddle(['面', '底', '猜星球'], ['谜面', '谜底', '谜目']).error).toContain('谜目');
  });
  it('未知谜格报错', () => {
    expect(rowToRiddle(['面', '底', '猜一字', '翻花格'], ['谜面', '谜底', '谜目', '谜格']).error).toContain('谜格');
  });
  it('难度非法报错', () => {
    expect(rowToRiddle(['面', '底', '猜一字', '无格', '', '', '9'], ['谜面', '谜底', '谜目', '谜格', '作者', '出处', '难度']).error).toContain('难度');
  });
  it('适用年龄非法报错', () => {
    expect(rowToRiddle(['面', '底', '猜一字', '无格', '', '', '2', '老年'], ['谜面', '谜底', '谜目', '谜格', '作者', '出处', '难度', '适用年龄']).error).toContain('年龄');
  });
  it('谜格留空默认无格、谜目留空报错', () => {
    const p = rowToRiddle(['面', '底', '猜一字', ''], ['谜面', '谜底', '谜目', '谜格']);
    expect(p.riddle?.format).toBe('none');
  });
});

describe('importPreview 两步式预览', () => {
  const headers = RIDDLE_CSV_HEADERS.join(',');
  it('表头识别 + 新增分类', () => {
    const text = `${headers}\n新谜面,新谜底,猜一字,无格,,Ծ,2,通用,,`;
    const p = importPreview(text.replace('Ծ', ''), []);
    expect(p.total).toBe(1);
    expect(p.fresh).toHaveLength(1);
    expect(p.fresh[0].surface).toBe('新谜面');
  });
  it('与库内相同谜面（不同标点）判重', () => {
    const text = `${headers}\n一口咬掉牛尾巴,告,猜一字,无格,,,,,,`;
    const p = importPreview(text, [mk('一口咬掉牛尾巴！', 'char', 7)]);
    expect(p.fresh).toHaveLength(0);
    expect(p.dups).toHaveLength(1);
    expect(p.dups[0].matchNo).toBe(7);
  });
  it('文件内重复判重', () => {
    const text = `${headers}\n面A,底A,猜一字,无格,,,,,,\n面A,底A2,猜一字,无格,,,,,,`;
    const p = importPreview(text, []);
    expect(p.fresh).toHaveLength(1);
    expect(p.dups).toHaveLength(1);
    expect(p.dups[0].matchNo).toBe(0);
  });
  it('高相似判重', () => {
    const text = `${headers}\n一口咬掉牛尾巴了,告,猜一字,无格,,,,,,`;
    const p = importPreview(text, [mk('一口咬掉牛尾巴', 'char', 3)]);
    expect(p.dups).toHaveLength(1);
    expect(p.dups[0].sim).toBeGreaterThanOrEqual(0.85);
  });
  it('不同谜目相似不误报', () => {
    const text = `${headers}\n一口咬掉牛尾巴了,告,猜成语,无格,,,,,,`;
    const p = importPreview(text, [mk('一口咬掉牛尾巴', 'char', 3)]);
    expect(p.dups).toHaveLength(0);
    expect(p.fresh).toHaveLength(1);
  });
  it('格式错误行进 errors', () => {
    const text = `${headers}\n,底,猜一字,无格,,,,,,\n面2,底2,猜星球,无格,,,,,,`;
    const p = importPreview(text, []);
    expect(p.errors).toHaveLength(2);
  });
  it('空文件 total 为 0', () => {
    expect(importPreview('', []).total).toBe(0);
  });
});
