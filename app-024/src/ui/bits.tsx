// 小型展示组件：校验徽标（图标+文字，不单靠颜色）与难度星
import type { Verdict } from '../types';
import { VERDICT_ICON, VERDICT_LABEL } from '../types';
import { stars } from '../lib/format';

export function VerdictBadge({ verdict, size }: { verdict: Verdict; size?: 'lg' }) {
  return (
    <span className={`verdict verdict-${verdict}${size ? ' verdict-lg' : ''}`}>
      <span aria-hidden className="verdict-icon">{VERDICT_ICON[verdict]}</span>
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

export function Stars({ n }: { n: 1 | 2 | 3 }) {
  return <span className="stars" title={`难度 ${n}`}>{stars(n)}</span>;
}
