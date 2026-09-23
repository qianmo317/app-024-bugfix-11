// 谜格校验规则引擎（PRD §4.2 / §8）
// 每格一条规则：输入 (谜面, 谜底, 谜目)，输出 verdict + reasons。
// 能力边界诚实：能自动判的判；语义对应判不了 → 一律「存疑」并说明原因，绝不误报「通过」。
import type { Riddle, RiddleCategory, RiddleFormat, Verdict } from '../types';
import type { DataCtx } from './datafiles';
import { homophonesOf, buildHomophoneIndex } from './datafiles';

export interface CheckResult {
  verdict: Verdict;
  reasons: string[];
}

const homoIdxCache = new WeakMap<DataCtx, Map<string, string[]>>();
function homoIdx(ctx: DataCtx): Map<string, string[]> {
  let m = homoIdxCache.get(ctx);
  if (!m) { m = buildHomophoneIndex(ctx); homoIdxCache.set(ctx, m); }
  return m;
}

function categoryLengthNote(cat: RiddleCategory): string {
  switch (cat) {
    case 'char': return '（猜一字应 1 字）';
    case 'idiom': return '（成语应 4 字）';
    default: return '';
  }
}

export function validateRiddle(
  r: Pick<Riddle, 'surface' | 'answer' | 'category' | 'format'>,
  ctx: DataCtx,
): CheckResult {
  const reasons: string[] = [];
  let failed = false;
  let suspected = false;
  const surface = r.surface.trim();
  const answer = r.answer.trim();
  const chars = Array.from(answer.replace(/\s+/g, ''));

  const fail = (msg: string) => { failed = true; reasons.push(msg); };
  const suspect = (msg: string) => { if (!failed) suspected = true; reasons.push(msg); };
  const info = (msg: string) => reasons.push(msg);

  if (!surface || !answer) {
    if (!surface) reasons.push('谜面为空，无法校验');
    if (!answer) reasons.push('谜底为空，无法校验');
    return { verdict: 'fail', reasons };
  }

  // ---- 通用：谜底字数与谜目匹配（无格/有格都查，PRD §4.2）----
  if (r.category === 'char' && chars.length !== 1) {
    fail(`谜目为「猜一字」，谜底应为 1 个字，当前 ${chars.length} 个字`);
  }
  if (r.category === 'idiom' && chars.length !== 4) {
    fail(`谜目为「猜成语」，谜底通常为四字，当前 ${chars.length} 个字`);
  }

  const reversed = [...chars].reverse().join('');

  switch (r.format) {
    // ---- 无格：只做基础校验，不做谜格规则判定 ----
    case 'none': {
      if (ctx.loaded) {
        const rare = chars.filter((c) => /[\u4E00-\u9FFF]/.test(c) && !ctx.common.has(c));
        if (rare.length >= 2) {
          suspect(`谜底含 ${rare.length} 个生僻字（${rare.slice(0, 4).join('、')}），现场猜射可读性存疑`);
        } else if (rare.length === 1) {
          info(`谜底含较少用字「${rare[0]}」，请确认现场可读`);
        }
        const poly = chars.filter((c) => (ctx.pinyin.get(c)?.length ?? 0) > 1);
        if (poly.length) info(`谜底含多音字：${poly.join('、')}（现场报谜底时注意读音）`);
      }
      if (!failed && !suspected) info(`基础校验通过：谜底 ${chars.length} 字与谜目匹配${categoryLengthNote(r.category)}`);
      break;
    }

    // ---- 秋千格：谜底限两字，倒读扣合谜面 ----
    case 'qiqian': {
      if (chars.length !== 2) {
        fail(`秋千格谜底须为两字（倒读扣面），当前 ${chars.length} 个字`);
      } else {
        suspect(`秋千格谜底倒读为「${reversed}」，与谜面「${surface}」是否扣合需人工确认（语义对应无法自动判定）`);
      }
      break;
    }

    // ---- 卷帘格：谜底三字及以上，倒序读 ----
    case 'juanlian': {
      if (chars.length < 3) {
        fail(`卷帘格谜底须三字及以上（倒序读扣面），当前 ${chars.length} 个字`);
      } else {
        suspect(`卷帘格谜底倒序读为「${reversed}」，与谜面「${surface}」是否扣合需人工确认（语义对应无法自动判定）`);
      }
      break;
    }

    // ---- 徐妃格：各字去相同偏旁（半妆）后读 ----
    case 'xufei': {
      if (chars.length < 2) {
        fail('徐妃格谜底须两字及以上（各字同旁去半读）');
      } else if (!ctx.loaded) {
        suspect('汉字部件数据未加载，无法自动拆字，需人工确认');
      } else {
        const missing = chars.filter((c) => !ctx.components.has(c));
        if (missing.length) {
          suspect(`「${missing.join('、')}」缺少部件拆分数据，无法自动判定去旁读法，需人工确认`);
        } else {
          const strips = chars.map((c) => ctx.components.get(c)!);
          const groups = new Set(strips.map((s) => s[2]));
          if (groups.size !== 1) {
            fail(`谜底各字偏旁不一（${chars.map((c, i) => `${c}·${strips[i][0]}`).join('、')}），不符徐妃格「各字同旁」规则`);
          } else {
            const stripped = strips.map((s) => s[1]).join('');
            suspect(`谜底各字去「${strips[0][0]}」旁读作「${stripped}」，与谜面「${surface}」是否扣合需人工确认（语义对应无法自动判定）`);
          }
        }
      }
      break;
    }

    // ---- 梨花格：谜底每字均谐音读 ----
    case 'lihua': {
      if (chars.length < 2) {
        fail('梨花格谜底须两字及以上（每字均谐音读）');
      } else if (!ctx.loaded) {
        suspect('拼音数据未加载，无法给出谐音候选，需人工确认');
      } else {
        suspect('梨花格要求谜底每字均读谐音、不取本义，谐音后与谜面的对应无法自动判定，需人工确认');
        const c0 = chars[0];
        const cands = homophonesOf(c0, ctx, homoIdx(ctx));
        info(`首字「${c0}」谐音候选：${cands.length ? cands.slice(0, 6).join('、') : '（无同音字）'}`);
      }
      break;
    }

    // ---- 白头格：谜底首字谐音读 ----
    case 'baitou': {
      if (chars.length < 2) {
        fail('白头格谜底须两字及以上（首字谐音读）');
      } else if (!ctx.loaded || !ctx.pinyin.has(chars[0])) {
        suspect(`首字「${chars[0]}」缺少拼音数据，无法给出谐音候选，需人工确认`);
      } else {
        suspect(`白头格首字「${chars[0]}」须读别音（谐音）扣合谜面，是否成立需人工确认`);
        const cands = homophonesOf(chars[0], ctx, homoIdx(ctx));
        info(`首字「${chars[0]}」谐音候选：${cands.length ? cands.join('、') : '（无同音字）'}`);
      }
      break;
    }

    // ---- 粉底格：谜底末字谐音读 ----
    case 'fendi': {
      const last = chars[chars.length - 1];
      if (chars.length < 2) {
        fail('粉底格谜底须两字及以上（末字谐音读）');
      } else if (!ctx.loaded || !ctx.pinyin.has(last)) {
        suspect(`末字「${last}」缺少拼音数据，无法给出谐音候选，需人工确认`);
      } else {
        suspect(`粉底格末字「${last}」须读别音（谐音）扣合谜面，是否成立需人工确认`);
        const cands = homophonesOf(last, ctx, homoIdx(ctx));
        info(`末字「${last}」谐音候选：${cands.length ? cands.join('、') : '（无同音字）'}`);
      }
      break;
    }

    // ---- 上楼格：末字移至最前读 ----
    case 'shanglou': {
      if (chars.length < 3) {
        fail(`上楼格谜底须三字及以上（末字移首读），当前 ${chars.length} 个字`);
      } else {
        const moved = chars[chars.length - 1] + chars.slice(0, -1).join('');
        suspect(`上楼格谜底末字移首读作「${moved}」，与谜面「${surface}」是否扣合需人工确认（语义对应无法自动判定）`);
      }
      break;
    }

    // ---- 下楼格：首字移至末尾读 ----
    case 'xialou': {
      if (chars.length < 3) {
        fail(`下楼格谜底须三字及以上（首字移尾读），当前 ${chars.length} 个字`);
      } else {
        const moved = chars.slice(1).join('') + chars[0];
        suspect(`下楼格谜底首字移尾读作「${moved}」，与谜面「${surface}」是否扣合需人工确认（语义对应无法自动判定）`);
      }
      break;
    }
  }

  return { verdict: failed ? 'fail' : suspected ? 'suspect' : 'pass', reasons };
}

export const FORMAT_RULE_BRIEF: Record<RiddleFormat, string> = {
  none: '不作谜格变化，谜底直扣谜面；仅校验字数与谜目匹配、生僻字',
  qiqian: '谜底限两字，倒读扣合谜面（如「日本」倒读「本日」）',
  juanlian: '谜底三字及以上，倒序读扣合谜面（如卷帘倒卷）',
  xufei: '谜底各字均有相同偏旁，去半边后读（如「蝙蝠」去虫旁）',
  lihua: '谜底每字均读谐音，不取本义',
  baitou: '谜底首字读谐音（如「吴用」读「无用」）',
  fendi: '谜底末字读谐音',
  shanglou: '谜底末字移至最前连读（三字以上）',
  xialou: '谜底首字移至末尾连读（三字以上）',
};

export const FORMAT_AUTO_CAPABILITY: Record<RiddleFormat, string> = {
  none: '可自动判定：字数匹配、生僻字、多音字提示',
  qiqian: '可自动判定：字数须为两字；倒读后语义扣合只能存疑提示',
  juanlian: '可自动判定：字数须 ≥3 字；倒序后语义扣合只能存疑提示',
  xufei: '可自动判定：各字是否同旁、去旁读法（内置部件数据）；扣合语义只能存疑提示',
  lihua: '可自动判定：字数、谐音候选（内置拼音数据）；谐义对应只能存疑提示',
  baitou: '可自动判定：字数、首字谐音候选；扣合语义只能存疑提示',
  fendi: '可自动判定：字数、末字谐音候选；扣合语义只能存疑提示',
  shanglou: '可自动判定：字数须 ≥3 字、移字读法；扣合语义只能存疑提示',
  xialou: '可自动判定：字数须 ≥3 字、移字读法；扣合语义只能存疑提示',
};
