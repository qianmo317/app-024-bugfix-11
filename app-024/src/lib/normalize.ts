// 谜面归一化 + 编辑距离（重复检测用）
// 繁->简 常用字映射（覆盖灯谜场景高频繁体字，非全表）
const T2S_PAIRS =
  '燈灯謎谜蘭兰會会來来時时個个們们語语說说學学體体風风雲云飛飞馬马魚鱼鳥鸟龍龙' +
  '對对開开關关東东車车門门見见聽听書书畫画頭头萬万與与為为義义樂乐無无廣广慶庆' +
  '國国圖图園园榮荣華华聲声氣气錢钱銀银鐵铁寶宝豐丰農农歷历觀观戲戏親亲舊旧麗丽' +
  '專专業业參参麼么後后裡里裏里幾几條条屬属歲岁鐘钟陽阳陰阴隻只雙双隨随顯显' +
  '營营藝艺藥药樹树橋桥飯饭飲饮館馆驚惊麵面髮发愛爱縣县鎮镇橫横滿满熱热愛爱' +
  '員员認认識识詩诗詞词調调談谈請请論论許许設设訪访證证詳详傳传傷伤價价儀仪' +
  '兒儿廳厅辦办協协單单賣卖買买實实寫写層层師师間间陣阵護护讀读變变讓让贊赞';
const T2S: Record<string, string> = {};
for (let i = 0; i < T2S_PAIRS.length; i += 2) T2S[T2S_PAIRS[i]] = T2S_PAIRS[i + 1];

const STRIP_RE = /[\s\p{P}\p{S}]+/gu;

export function normalizeText(s: string): string {
  let out = '';
  for (const ch of s) out += T2S[ch] ?? ch;
  return out.replace(STRIP_RE, '').toLowerCase();
}

/** 编辑距离（可传 max 提前剪枝：超过 max 直接返回 max+1） */
export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const len = Math.max(a.length, b.length);
  if (!len) return 0;
  return 1 - levenshtein(a, b) / len;
}
