// 离线数据包加载：public/data/{pinyin,components,common}.json（同源 fetch，断网可用）
export interface DataCtx {
  pinyin: Map<string, string[]>;
  components: Map<string, [form: string, rest: string, group: string]>;
  common: Set<string>;
  loaded: boolean;
  loadError?: string;
}

export const EMPTY_CTX: DataCtx = { pinyin: new Map(), components: new Map(), common: new Set(), loaded: false };

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  return typeof v === 'string' ? [v] : [];
}

export async function loadDataCtx(base = ''): Promise<DataCtx> {
  const ctx: DataCtx = { ...EMPTY_CTX };
  const load = async (file: string) => {
    const res = await fetch(`${base}data/${file}`, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    return res.json();
  };
  try {
    const [py, comp, common] = await Promise.all([load('pinyin.json'), load('components.json'), load('common.json')]);
    for (const [k, v] of Object.entries(py as Record<string, unknown>)) ctx.pinyin.set(k, asArray(v));
    for (const [k, v] of Object.entries(comp as Record<string, unknown>)) {
      if (Array.isArray(v) && v.length >= 2) ctx.components.set(k, [String(v[0]), String(v[1]), String(v[2] ?? v[0])]);
    }
    for (const k of Object.keys(common as Record<string, unknown>)) ctx.common.add(k);
    ctx.loaded = ctx.pinyin.size > 0;
  } catch (e) {
    ctx.loadError = e instanceof Error ? e.message : String(e);
  }
  return ctx;
}

/** 同音（不含声调）候选表：谐音格展示用，惰性构建 */
export function buildHomophoneIndex(ctx: DataCtx): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const [ch, pys] of ctx.pinyin) {
    for (const py of pys) {
      const key = py.replace(/[1-5]$/, '');
      const arr = idx.get(key) || [];
      if (!arr.includes(ch)) arr.push(ch);
      idx.set(key, arr);
    }
  }
  return idx;
}

export function homophonesOf(ch: string, ctx: DataCtx, idx: Map<string, string[]>): string[] {
  const pys = ctx.pinyin.get(ch);
  if (!pys) return [];
  const out = new Set<string>();
  for (const py of pys) {
    const key = py.replace(/[1-5]$/, '');
    for (const c of idx.get(key) || []) if (c !== ch) out.add(c);
  }
  return [...out].slice(0, 8);
}
