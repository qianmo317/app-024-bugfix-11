// CSV 解析/导出（UTF-8 with BOM，Excel 打开不乱码）
import type { AgeGroup, Riddle, RiddleCategory, RiddleFormat } from '../types';
import { AGE_FROM_LABEL, CATEGORY_FROM_LABEL, FORMAT_FROM_LABEL, FORMAT_LABEL, CATEGORY_LABEL, AGE_LABEL } from '../types';
import { normalizeText, similarity } from './normalize';

export const RIDDLE_CSV_HEADERS = ['谜面', '谜底', '谜目', '谜格', '作者', '出处', '难度', '适用年龄', '标签', '备注'];

/** 解析 CSV：支持 BOM、CRLF、引号内逗号/换行/双引号转义 */
export function parseCSV(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function stringifyCSV(rows: (string | number | undefined)[][]): string {
  return rows.map((row) => row.map((cell) => {
    const s = cell === undefined || cell === null ? '' : String(cell);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n') + '\r\n';
}

/** 带导出 BOM 的 CSV 下载内容 */
export function withBOM(csv: string): string {
  return '\uFEFF' + csv;
}

export function riddleToRow(r: Riddle): (string | number)[] {
  return [
    r.surface, r.answer, CATEGORY_LABEL[r.category], FORMAT_LABEL[r.format],
    r.author ?? '', r.source ?? '', r.difficulty, r.ageGroup ? AGE_LABEL[r.ageGroup] : '',
    r.tags.join('、'), r.note ?? '',
  ];
}

export function parseDifficulty(v: string): 1 | 2 | 3 | null {
  const n = parseInt(v.trim(), 10);
  if (n === 1 || n === 2 || n === 3) return n;
  return null;
}

export function parseTags(v: string): string[] {
  return v.split(/[、,，/|]+/).map((s) => s.trim()).filter(Boolean);
}

export interface ParsedRiddle {
  riddle?: Omit<Riddle, 'id' | 'no' | 'check'> & Partial<Pick<Riddle, 'no'>>;
  error?: string;
  surfaceNorm: string;
}

export function rowToRiddle(row: string[], headers?: string[]): ParsedRiddle {
  // 表头映射或按固定列序
  let surface = '', answer = '', cat = '', fmt = '', author = '', source = '', diff = '', age = '', tags = '', note = '';
  if (headers && headers.length) {
    const get = (name: string) => {
      const idx = headers.findIndex((h) => h.trim() === name);
      return idx >= 0 ? (row[idx] ?? '') : '';
    };
    surface = get('谜面'); answer = get('谜底'); cat = get('谜目'); fmt = get('谜格');
    author = get('作者'); source = get('出处'); diff = get('难度'); age = get('适用年龄'); tags = get('标签'); note = get('备注');
  } else {
    [surface = '', answer = '', cat = '', fmt = '', author = '', source = '', diff = '', age = '', tags = '', note = ''] = row;
  }
  surface = surface.trim(); answer = answer.trim();
  if (!surface) return { error: '谜面为空', surfaceNorm: '' };
  if (!answer) return { error: '谜底为空', surfaceNorm: normalizeText(surface) };

  const category = (CATEGORY_FROM_LABEL[cat.trim()] ?? (cat.trim() ? undefined : 'other')) as RiddleCategory | undefined;
  if (!category) return { error: `未知谜目「${cat.trim() || '空'}」`, surfaceNorm: normalizeText(surface) };
  const format = (FORMAT_FROM_LABEL[fmt.trim()] ?? (fmt.trim() ? undefined : 'none')) as RiddleFormat | undefined;
  if (!format) return { error: `未知谜格「${fmt.trim()}」`, surfaceNorm: normalizeText(surface) };

  const difficulty = diff.trim() ? parseDifficulty(diff) : 2;
  if (diff.trim() && !difficulty) return { error: `难度须为 1~3，当前「${diff.trim()}」`, surfaceNorm: normalizeText(surface) };
  const ageGroup = age.trim() ? (AGE_FROM_LABEL[age.trim()] as AgeGroup | undefined) : 'all';
  if (age.trim() && !ageGroup) return { error: `未知适用年龄「${age.trim()}」`, surfaceNorm: normalizeText(surface) };

  return {
    riddle: {
      surface, answer, category, format,
      author: author.trim() || undefined,
      source: source.trim() || undefined,
      difficulty: difficulty ?? 2,
      ageGroup: ageGroup ?? 'all',
      tags: parseTags(tags),
      note: note.trim() || undefined,
    },
    surfaceNorm: normalizeText(surface),
  };
}

export interface ImportPreview {
  headers?: string[];
  fresh: (Omit<Riddle, 'id' | 'no' | 'check'> & Partial<Pick<Riddle, 'no'>>)[];
  dups: { rowIndex: number; surface: string; answer: string; matchNo: number; sim: number }[];
  errors: { rowIndex: number; error: string; surface: string }[];
  total: number;
}

/** 两步式导入预览：分类为 新增 / 重复 / 格式错误 */
export function importPreview(text: string, existing: Riddle[], threshold = 0.85): ImportPreview {
  const rows = parseCSV(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (!rows.length) return { fresh: [], dups: [], errors: [], total: 0 };
  let headers: string[] | undefined;
  let body = rows;
  if (rows[0].some((c) => c.includes('谜面') || c.includes('谜底'))) {
    headers = rows[0];
    body = rows.slice(1);
  }
  const normExisting = new Map<string, number[]>();
  for (const r of existing) {
    const n = normalizeText(r.surface);
    if (n) {
      const arr = normExisting.get(n) || [];
      arr.push(r.no);
      normExisting.set(n, arr);
    }
  }
  const preview: ImportPreview = { headers, fresh: [], dups: [], errors: [], total: body.length };
  const seenInFile = new Set<string>();
  body.forEach((row, i) => {
    const parsed = rowToRiddle(row, headers);
    if (parsed.error || !parsed.riddle) {
      preview.errors.push({ rowIndex: i + 1, error: parsed.error ?? '解析失败', surface: (row[0] ?? '').slice(0, 30) });
      return;
    }
    const n = parsed.surfaceNorm;
    // 文件内重复
    if (seenInFile.has(n)) {
      preview.dups.push({ rowIndex: i + 1, surface: parsed.riddle.surface, answer: parsed.riddle.answer, matchNo: 0, sim: 1 });
      return;
    }
    // 与谜库重复：完全相同（归一化）或同谜目高相似
    const exact = normExisting.get(n);
    if (exact) {
      preview.dups.push({ rowIndex: i + 1, surface: parsed.riddle.surface, answer: parsed.riddle.answer, matchNo: exact[0], sim: 1 });
      return;
    }
    let matched: { no: number; sim: number } | null = null;
    for (const r of existing) {
      if (r.category !== parsed.riddle.category) continue;
      const sim = similarity(n, normalizeText(r.surface));
      if (sim >= threshold && (!matched || sim > matched.sim)) matched = { no: r.no, sim };
    }
    if (matched) {
      const m = matched as { no: number; sim: number };
      preview.dups.push({ rowIndex: i + 1, surface: parsed.riddle.surface, answer: parsed.riddle.answer, matchNo: m.no, sim: m.sim });
      return;
    }
    seenInFile.add(n);
    preview.fresh.push(parsed.riddle);
  });
  return preview;
}
