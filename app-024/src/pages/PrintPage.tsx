// 谜条打印：版式配置 + 实时预览 + 裁切线 + 同页双联（上联挂灯笼/下联回收）
import { useMemo, useState } from 'react';
import { useAppState } from '../ui/router';
import { calcLayout, pageCount } from '../lib/print';
import { scanDuplicates } from '../lib/duplicates';
import { CATEGORY_LABEL, FORMAT_LABEL, type Riddle } from '../types';
import { store } from '../lib/store';

export function PrintPage() {
  const state = useAppState();
  const { print } = state.settings;
  const [scope, setScope] = useState<'selected' | 'all'>('selected');
  const [excludeDup, setExcludeDup] = useState(false);
  const [showAnswer, setShowAnswer] = useState(true); // 预览时显示谜底（便于核对）

  const chosen = useMemo(() => {
    const sel = state.riddles.filter((r) => state.selected.has(r.id));
    const list = scope === 'selected' && sel.length ? sel : state.riddles;
    if (!excludeDup || list.length < 2) return list;
    const dupMap = scanDuplicates(list);
    return list.filter((r) => !dupMap.has(r.id));
  }, [state.riddles, state.selected, scope, excludeDup]);

  const layout = useMemo(() => calcLayout(print), [print]);
  const sheets = useMemo(() => {
    const out: Riddle[][] = [];
    for (let i = 0; i < chosen.length; i += layout.perPage) out.push(chosen.slice(i, i + layout.perPage));
    return out;
  }, [chosen, layout.perPage]);

  const setPrint = (patch: Partial<typeof print>) => { void store.saveSettings({ print: { ...print, ...patch } }); };

  return (
    <div>
      <div className="page-head no-print">
        <h1>出条打印 <small>{chosen.length} 条 · 每页 {layout.perPage} 条 · 共 {pageCount(chosen.length, layout.perPage)} 页</small></h1>
        <button className="btn btn-primary" onClick={() => window.print()} disabled={!chosen.length}>🖨 打印 / 存 PDF</button>
      </div>

      <div className="panel no-print">
        <div className="field-row">
          <label className="field">
            <span>出条范围</span>
            <select className="input" value={scope} onChange={(e) => setScope(e.target.value as 'selected' | 'all')}>
              <option value="selected">选中的谜条（{state.selected.size}）</option>
              <option value="all">全部谜条（{state.riddles.length}）</option>
            </select>
          </label>
          <label className="field">
            <span>每页条数</span>
            <select className="input" value={print.perPage} onChange={(e) => setPrint({ perPage: Number(e.target.value) })}>
              {[4, 6, 8, 9, 12].map((n) => <option key={n} value={n}>{n} 条/页</option>)}
            </select>
          </label>
          <label className="field">
            <span>卡片宽（mm）</span>
            <input className="input" type="number" min={30} max={200} value={print.cardWmm}
              onChange={(e) => setPrint({ cardWmm: Math.max(20, Number(e.target.value) || 0) })} />
          </label>
          <label className="field">
            <span>卡片高（mm）</span>
            <input className="input" type="number" min={30} max={290} value={print.cardHmm}
              onChange={(e) => setPrint({ cardHmm: Math.max(20, Number(e.target.value) || 0) })} />
          </label>
        </div>
        <div className="btn-row wrap">
          <label className="check-inline"><input type="checkbox" checked={print.showAnswerSlip} onChange={(e) => setPrint({ showAnswerSlip: e.target.checked })} /> 同页双联回收联（含谜底）</label>
          <label className="check-inline"><input type="checkbox" checked={print.showCutLine} onChange={(e) => setPrint({ showCutLine: e.target.checked })} /> 裁切线</label>
          <label className="check-inline"><input type="checkbox" checked={excludeDup} onChange={(e) => setExcludeDup(e.target.checked)} /> 排除重复谜面</label>
          <label className="check-inline"><input type="checkbox" checked={showAnswer} onChange={(e) => setShowAnswer(e.target.checked)} /> 预览时显示谜底（不打印）</label>
        </div>
        <label className="field">
          <span>主办方落款</span>
          <input className="input" value={print.hostLine} onChange={(e) => setPrint({ hostLine: e.target.value })} placeholder="例：××社区工会 · 元宵灯会" />
        </label>
        {layout.adjusted && layout.warning && <p className="warn-text">{layout.warning}</p>}
        {!chosen.length && <p className="warn-text">没有可打印的谜条：先在谜库勾选，或把范围改为「全部」。</p>}
        <p className="muted small">实际排版：{layout.cols} 列 × {layout.rows} 行，卡片 {layout.cardW}×{layout.cardH}mm。谜面字号 ≥ 14pt，黑白打印清晰。</p>
      </div>

      <div className="print-area" data-testid="print-area">
        {sheets.map((sheet, si) => (
          <section className="sheet" key={si} style={{ contentVisibility: si > 2 ? 'auto' : 'visible', containIntrinsicSize: '297mm' }}>
            {Array.from({ length: layout.perPage }, (_, ci) => {
              const r = sheet[ci];
              if (!r) return <div className="card-slot" key={ci} style={{ width: `${layout.cardW}mm`, height: `${layout.cardH}mm` }} />;
              return (
                <article
                  className={`card${print.showCutLine ? ' card-cut' : ''}`}
                  key={ci}
                  style={{ width: `${layout.cardW}mm`, height: `${layout.cardH}mm` }}
                  data-no={r.no}
                >
                  <div className="card-up">
                    <div className="card-no">{r.no}</div>
                    <div className="card-surface">{r.surface}</div>
                    <div className="card-meta">
                      （{CATEGORY_LABEL[r.category]}{r.format !== 'none' ? ` · ${FORMAT_LABEL[r.format]}${r.formatNote ? `：${r.formatNote}` : ''}` : r.formatNote ? ` · ${r.formatNote}` : ''}）
                    </div>
                    <div className="card-host">{print.hostLine}</div>
                  </div>
                  {print.showAnswerSlip && (
                    <>
                      <div className="card-tear" aria-hidden>✂</div>
                      <div className="card-slip">
                        <div className="slip-row"><span className="card-no slip-no">{r.no}</span>
                          <span className="slip-answer">{showAnswer ? r.answer : '谜底见上联'}</span></div>
                        <div className="slip-fill">猜中者姓名：＿＿＿＿＿＿　时间：＿＿＿＿＿</div>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
