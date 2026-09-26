// 集中式应用状态：数据读写全部在此，UI 只做展示与动作调用
import type { AppSettings, OnsiteRecord, Riddle } from '../types';
import { validateRiddle } from './validate';
import { EMPTY_CTX, loadDataCtx, type DataCtx } from './datafiles';
import * as idb from './idb';
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

function maxNo(riddles: Riddle[]): number {
  let m = 0;
  for (const r of riddles) if (Number.isFinite(r.no) && r.no > m) m = r.no;
  return m;
}

/**
 * 修复历史脏数据中的重复/缺失谜号：每个号只保留最早校验（即最早入库）的一条，
 * 其余依次改派到当前最大号之后。谜条 id 不变，现场登记等外键引用不受影响。
 * 返回被改号的谜条（需要落库）。
 */
function repairDuplicateNos(riddles: Riddle[]): Riddle[] {
  const taken = new Set<number>();
  let next = maxNo(riddles) + 1;
  const repaired: Riddle[] = [];
  // 保持谜号小者优先：同一号里 checkedAt 更早的（先入库）保留原号
  const ordered = [...riddles].sort((a, b) => a.no - b.no || a.check.checkedAt - b.check.checkedAt);
  for (const r of ordered) {
    if (Number.isFinite(r.no) && r.no > 0 && !taken.has(r.no)) {
      taken.add(r.no);
      continue;
    }
    while (taken.has(next)) next++;
    taken.add(next);
    repaired.push({ ...r, no: next });
    next++;
  }
  return repaired;
}

class AppStore {
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
        this.state.riddles = riddles.sort((a, b) => a.no - b.no);
        // 修复旧版本遗留的重复/缺失谜号（如多批导入都从 1 编号）
        const repaired = repairDuplicateNos(this.state.riddles);
        if (repaired.length) {
          for (const r of repaired) {
            const i = this.state.riddles.findIndex((x) => x.id === r.id);
            if (i >= 0) this.state.riddles[i] = r;
          }
          this.state.riddles.sort((a, b) => a.no - b.no);
          await idb.putMany(idb.STORE_RIDDLES, repaired);
        }
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
  // 谜号必须单调递增、全库唯一（现场对号登记依赖此约定），
  // 因此取下一个号用「现存最大号 + 1」，而不是「条数 + 1」：
  // 删掉中间几条后条数会变小，后者会与仍挂着的谜条撞号。
  nextNo(): number {
    return maxNo(this.state.riddles) + 1;
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

  /** 批量导入（去重后的新增项）：谜号接在全库最大号之后，避免第二批导入又从 1 开始 */
  async addRiddles(items: (Omit<Riddle, 'id' | 'no' | 'check'> & Partial<Pick<Riddle, 'no'>>)[]): Promise<number> {
    const now = Date.now();
    let no = maxNo(this.state.riddles) + 1;
    const riddles: Riddle[] = items.map((it) => {
      const r: Riddle = {
        ...it,
        id: uid(),
        no: no++,
        tags: it.tags ?? [],
        difficulty: it.difficulty ?? 2,
        check: { ...validateRiddle(it, this.state.ctx), checkedAt: now },
      };
      return r;
    });
    this.state.riddles = [...this.state.riddles, ...riddles].sort((a, b) => a.no - b.no);
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
    // 必须真正 delete：旧实现用 putMany 回写剩余列表，IDB 里被删的记录原封不动，
    // 刷新页面后又会回来。
    await idb.deleteMany(idb.STORE_RIDDLES, ids);
    // 顺手清掉活动出条清单里对已删谜条的悬挂引用
    const kept = this.state.settings.event.riddleIds.filter((rid) => !set.has(rid));
    if (kept.length !== this.state.settings.event.riddleIds.length) {
      await this.saveSettings({ event: { ...this.state.settings.event, riddleIds: kept } });
    }
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
