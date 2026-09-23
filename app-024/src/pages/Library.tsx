// 谜格说明与示例（能力边界诚实说明）
import { FORMAT_LABEL, type RiddleFormat } from '../types';
import { FORMAT_RULE_BRIEF, FORMAT_AUTO_CAPABILITY } from '../lib/validate';

const ORDER: RiddleFormat[] = ['none', 'qiqian', 'juanlian', 'xufei', 'lihua', 'baitou', 'fendi', 'shanglou', 'xialou'];

const EXAMPLES: Record<RiddleFormat, { surface: string; answer: string; note: string }> = {
  none: { surface: '一口咬掉牛尾巴', answer: '告', note: '无格直扣：口咬「牛」去尾成「告」' },
  qiqian: { surface: '今天（秋千格·猜一国名）', answer: '日本', note: '两字倒读：「日本」→「本日」即「今天」' },
  juanlian: { surface: '儿童图书专卖店（卷帘格·猜成语）', answer: '小题大做', note: '倒序读：「做大题小」呼应谜面场景' },
  xufei: { surface: '丈夫模样（徐妃格·猜一花卉）', answer: '芙蓉', note: '各字去草字头：「夫容」扣合谜面' },
  lihua: { surface: '岂有此理（梨花格·猜两字词）', answer: '奇谈', note: '每字读谐音：「奇谈」谐「岂谈」' },
  baitou: { surface: '日近黄昏（白头格·猜一地名）', answer: '洛阳', note: '首字谐音：「洛阳」读「落阳」' },
  fendi: { surface: '久居沙漠（粉底格·猜一地名）', answer: '长沙', note: '末字谐音：「长沙」读「常沙」' },
  shanglou: { surface: '示范课（上楼格·猜成语）', answer: '好为人师', note: '末字移首读：「师好为人」' },
  xialou: { surface: '一言为重（下楼格·猜成语）', answer: '言而有信', note: '首字移尾读：「而有信言」' },
};

export function Library() {
  return (
    <div>
      <div className="page-head"><h1>谜格说明与示例</h1></div>
      <div className="panel">
        <p>
          灯谜有「格」，谜底须按格规变化后再与谜面扣合。本工具对每种格实现<b>规则引擎</b>：
          字数结构、偏旁同异、谐音候选等<b>可自动判定</b>的部分会给出确定结论；
          语义扣合无法自动判定的一律标「存疑」并说明原因，<b>绝不误报「通过」</b>。
        </p>
      </div>
      <div className="lib-grid">
        {ORDER.map((f) => (
          <section className="panel lib-card" key={f}>
            <h3>{FORMAT_LABEL[f]}</h3>
            <p><b>规则：</b>{FORMAT_RULE_BRIEF[f]}</p>
            <p className="example"><b>示例：</b>{EXAMPLES[f].surface} → 谜底「{EXAMPLES[f].answer}」<br /><span className="muted">{EXAMPLES[f].note}</span></p>
            <p className="muted small"><b>自动判定能力：</b>{FORMAT_AUTO_CAPABILITY[f]}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
