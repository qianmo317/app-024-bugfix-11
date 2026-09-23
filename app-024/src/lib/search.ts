// 谜库筛选（性能：2000 条 < 100ms，纯函数便于基准测试）
import type { Riddle, RiddleCategory, RiddleFormat, Verdict } from '../types';
import { normalizeText } from './normalize';

export interface RiddleFilters {
  q: string;
  category: RiddleCategory | '';
  format: RiddleFormat | '';
  difficulty: 0 | 1 | 2 | 3; // 0 = 全部
  verdict: Verdict | '';
  tag: string;
}

export const EMPTY_FILTERS: RiddleFilters = { q: '', category: '', format: '', difficulty: 0, verdict: '', tag: '' };

export function filterRiddles(list: Riddle[], f: RiddleFilters): Riddle[] {
  const q = f.q.trim().toLowerCase();
  const qn = q ? normalizeText(f.q) : '';
  const out: Riddle[] = [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (f.category && r.category !== f.category) continue;
    if (f.format && r.format !== f.format) continue;
    if (f.difficulty && r.difficulty !== f.difficulty) continue;
    if (f.verdict && r.check.verdict !== f.verdict) continue;
    if (f.tag && !r.tags.includes(f.tag)) continue;
    if (q) {
      if (
        !r.surface.toLowerCase().includes(q) &&
        !r.answer.toLowerCase().includes(q) &&
        !(r.author ?? '').toLowerCase().includes(q) &&
        !(r.source ?? '').toLowerCase().includes(q) &&
        !String(r.no).includes(q) &&
        !r.tags.some((t) => t.toLowerCase().includes(q)) &&
        // 中文查询走归一化（去标点/繁简）
        !(qn && (normalizeText(r.surface).includes(qn) || normalizeText(r.answer).includes(qn)))
      ) continue;
    }
    out.push(r);
  }
  return out;
}

export function allTags(list: Riddle[]): string[] {
  const set = new Set<string>();
  for (const r of list) for (const t of r.tags) set.add(t);
  return [...set].sort();
}
