// 集中式应用状态：数据读写全部在此，UI 只做展示与动作调用
import type { AppSettings, OnsiteRecord, Riddle } from '../types';
import { validateRiddle } from './validate';
import { EMPTY_CTX, loadDataCtx, type DataCtx } from './datafiles';
import * as idb from './idb';
import { parseTags } from './csv';
import { formatDate } from './format';

const KV_SETTINGS = 'settings';

export const DEFAULT_SETTINGS: AppSettings = {
  event: { id: 'event-default', title: '元宵灯会', host: '', date: '', riddleIds: [] },
  print: {
    cardWmm: 63, cardHmm: 135, perPage: 6,
    showAnswerSlip: true, showCutLine: true,
    hostLine: '',
  },
  prizes: ['参与奖', '三等奖', '二等奖', '一等奖'],
};

export interface AppState {
  ready: boolean;
  riddles: Riddle[];
  records: OnsiteRecord[];
  settings: AppSettings;
  ctx: DataCtx; // 拼音/部件离线数据
  selected: Set<string>; // 批量出条选中（会话级，不持久化）
}

type Listener = () => void;

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export class AppStore {
  private state: AppState = {
    ready: false,
    riddles: [],
    records: [],
    settings: DEFAULT_SETTINGS,
    ctx: EMPTY_CTX,
    selected: new Set<string>(),
  };
  private listeners = new Set<Listener>();
  private initPromise: Promise<void> | null = null;

  getState = (): AppState => this.state;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private emit() {
    this.state = { ...this.state };
    for (const l of this.listeners) l();
  }

  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const [riddles, records, settings, ctx] = await Promise.all([
          idb.getAll<Riddle>(idb.STORE_RIDDLES),
          idb.getAll<OnsiteRecord>(idb.STORE_RECORDS),
          idb.getKV<AppSettings>(KV_SETTINGS),
          loadDataCtx(import.meta.env.BASE_URL),
        ]);
        // 历史数据修复：旧版本把「、分隔」的多个标签整串存成一条，导致按标签筛选查不到；
        // 加载时按统一规则拆开（去重），有改动的落库一次
        const repaired: Riddle[] = [];
        const normalized = riddles.map((r) => {
          const tags = [...new Set((r.tags ?? []).flatMap((t) => parseTags(t)))];
          if (tags.length === (r.tags?.length ?? 0) && tags.every((t, i) => t === r.tags[i])) return r;
          const nr = { ...r, tags };
          repaired.push(nr);
          return nr;
        });
        if (repaired.length) await idb.putMany(idb.STORE_RIDDLES, repaired);
        this.state.riddles = normalized.sort((a, b) => a.no - b.no);
        this.state.records = records.sort((a, b) => b.at - a.at);
        if (settings) {
          this.state.settings = {
            event: { ...DEFAULT_SETTINGS.event, ...settings.event },
            print: { ...DEFAULT_SETTINGS.print, ...settings.print },
            prizes: settings.prizes?.length ? settings.prizes : DEFAULT_SETTINGS.prizes,
          };
        }
        if (!this.state.settings.print.hostLine && this.state.settings.event.host) {
          this.state.settings.print.hostLine = `${this.state.settings.event.host}`;
        }
        this.state.ctx = ctx;
        this.state.ready = true;
        this.emit();
      })();
    }
    return this.initPromise;
  }

  // ---- 谜库 ----
  // 谜号取库内最大号 + 1（空库为 1）。不能用 length + 1：
  // 中间删过条目后 length+1 会与仍挂着的谜号撞号，现场对号会记到别的谜上。
  nextNo(): number {
    let max = 0;
    for (const r of this.state.riddles) if (r.no > max) max = r.no;
    return max + 1;
  }

  /** 新增/保存：自动计算谜格校验结果 */
  async saveRiddle(patch: Omit<Riddle, 'id' | 'no' | 'check'> & { id?: string; no?: number }): Promise<Riddle> {
    const id = patch.id ?? uid();
    const existing = patch.id ? this.state.riddles.find((r) => r.id === patch.id) : undefined;
    const no = patch.no ?? existing?.no ?? this.nextNo();
    const check = validateRiddle(patch, this.state.ctx);
    const riddle: Riddle = {
      ...patch,
      id,
      no,
      check: { ...check, checkedAt: Date.now() },
      tags: patch.tags ?? [],
      difficulty: patch.difficulty ?? 2,
    };
    if (existing) {
      this.state.riddles = this.state.riddles.map((r) => (r.id === id ? riddle : r));
    } else {
      this.state.riddles = [...this.state.riddles, riddle];
    }
    this.state.riddles.sort((a, b) => a.no - b.no);
    await idb.put(idb.STORE_RIDDLES, riddle);
    this.emit();
    return riddle;
  }

  /** 批量导入（去重后的新增项）：接续库内最大谜号往下编，跨批次不再从 1 重复编号 */
  async addRiddles(items: (Omit<Riddle, 'id' | 'no' | 'check'> & Partial<Pick<Riddle, 'no'>>)[]): Promise<number> {
    const now = Date.now();
    let next = this.nextNo();
    const riddles: Riddle[] = items.map((it) => {
      // 导入数据显式带谜号时尊重其编号；否则接续当前最大号
      const no = it.no && it.no > 0 ? it.no : next;
      if (no >= next) next = no + 1;
      return {
        ...it,
        id: uid(),
        no,
        tags: it.tags ?? [],
        difficulty: it.difficulty ?? 2,
        check: { ...validateRiddle(it, this.state.ctx), checkedAt: now },
      };
    });
    this.state.riddles = [...this.state.riddles, ...riddles];
    this.state.riddles.sort((a, b) => a.no - b.no);
    await idb.putMany(idb.STORE_RIDDLES, riddles);
    this.emit();
    return riddles.length;
  }

  async recheckAll(): Promise<void> {
    const now = Date.now();
    const riddles = this.state.riddles.map((r) => ({
      ...r,
      check: { ...validateRiddle(r, this.state.ctx), checkedAt: now },
    }));
    this.state.riddles = riddles.sort((a, b) => a.no - b.no);
    await idb.putMany(idb.STORE_RIDDLES, riddles);
    this.emit();
  }

  async removeRiddles(ids: string[]): Promise<void> {
    const set = new Set(ids);
    this.state.riddles = this.state.riddles.filter((r) => !set.has(r.id));
    // 必须从 IndexedDB 删除，否则刷新后旧记录又被 getAll 读回来（只回写剩余条目不会删掉库里的旧条目）
    await Promise.all(ids.map((id) => idb.del(idb.STORE_RIDDLES, id)));
    this.emit();
  }

  async clearRiddles(): Promise<void> {
    this.state.riddles = [];
    this.state.settings.event.riddleIds = [];
    await idb.clearStore(idb.STORE_RIDDLES);
    await this.saveSettings(this.state.settings);
    this.emit();
  }

  async loadSample(samples: Omit<Riddle, 'id' | 'no' | 'check'>[]): Promise<number> {
    return this.addRiddles(samples);
  }

  // ---- 批量选中（会话级）----
  toggleSelect(id: string): void {
    const s = new Set(this.state.selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    this.state.selected = s;
    this.emit();
  }

  selectMany(ids: string[], on: boolean): void {
    const s = new Set(this.state.selected);
    for (const id of ids) { if (on) s.add(id); else s.delete(id); }
    this.state.selected = s;
    this.emit();
  }

  clearSelection(): void {
    this.state.selected = new Set();
    this.emit();
  }

  // ---- 现场登记 ----
  recordsOf(riddleId: string): OnsiteRecord[] {
    return this.state.records.filter((r) => r.riddleId === riddleId);
  }

  async addRecord(rec: Omit<OnsiteRecord, 'id' | 'at'> & { at?: number }): Promise<OnsiteRecord> {
    const full: OnsiteRecord = { ...rec, id: uid(), at: rec.at ?? Date.now() };
    this.state.records = [full, ...this.state.records];
    await idb.put(idb.STORE_RECORDS, full);
    this.emit();
    return full;
  }

  async removeRecord(id: string): Promise<void> {
    this.state.records = this.state.records.filter((r) => r.id !== id);
    await idb.del(idb.STORE_RECORDS, id);
    this.emit();
  }

  async clearRecords(): Promise<void> {
    this.state.records = [];
    await idb.clearStore(idb.STORE_RECORDS);
    this.emit();
  }

  /** 兑奖号码生成：按登记时间顺序生成 DJ-xxxx（仅生成号码，不做在线抽奖） */
  async generatePrizeCodes(): Promise<number> {
    let n = 0;
    const sorted = [...this.state.records].sort((a, b) => a.at - b.at);
    for (const r of sorted) {
      if (!r.code) {
        n++;
        r.code = `DJ-${String(n).padStart(4, '0')}`;
        await idb.put(idb.STORE_RECORDS, r);
      }
    }
    if (n) this.emit();
    return n;
  }

  // ---- 设置 ----
  async saveSettings(patch: Partial<AppSettings>): Promise<void> {
    this.state.settings = {
      event: { ...this.state.settings.event, ...patch.event },
      print: { ...this.state.settings.print, ...patch.print },
      prizes: patch.prizes ?? this.state.settings.prizes,
    };
    await idb.setKV(KV_SETTINGS, this.state.settings);
    this.emit();
  }

  // ---- 统计 ----
  stats(): { total: number; solved: number; remaining: number; prizes: number } {
    const solvedSet = new Set(this.state.records.map((r) => r.riddleId));
    return {
      total: this.state.riddles.length,
      solved: solvedSet.size,
      remaining: this.state.riddles.length - solvedSet.size,
      prizes: this.state.records.filter((r) => r.prize.trim()).length,
    };
  }

  riddleByNo(no: number): Riddle | undefined {
    return this.state.riddles.find((r) => r.no === no);
  }
}

export const store = new AppStore();

// ---- 导出辅助（供各页面/导出模块复用）----
export function exportFileName(prefix: string, ext: string): string {
  const ev = store.getState().settings.event;
  const base = ev.title ? `${ev.title}-` : '';
  return `${prefix}-${base}${formatDate(new Date())}.${ext}`;
}
