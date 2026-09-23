// 生成离线数据包：public/data/pinyin.json + components.json
// 拼音源：mozillazg/pinyin-data（全量多音字）；部件源：Make Me a Hanzi（带 IDS 拆分）
// 本地一次性生成，运行时零外网请求。用法：node scripts/gen-data.mjs /tmp/pinyin.txt /tmp/mmh-dict.txt
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pinyinFile = process.argv[2] || '/tmp/pinyin.txt';
const mmhFile = process.argv[3] || '/tmp/mmh-dict.txt';
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
mkdirSync(outDir, { recursive: true });

// 带调字母 -> 无调字母 + 声调号（轻声/无标记 -> 5）
const TONE = { 'ā':['a','1'],'á':['a','2'],'ǎ':['a','3'],'à':['a','4'],
  'ē':['e','1'],'é':['e','2'],'ě':['e','3'],'è':['e','4'],
  'ī':['i','1'],'í':['i','2'],'ǐ':['i','3'],'ì':['i','4'],
  'ō':['o','1'],'ó':['o','2'],'ǒ':['o','3'],'ò':['o','4'],
  'ū':['u','1'],'ú':['u','2'],'ǔ':['u','3'],'ù':['u','4'],
  'ǖ':['v','1'],'ǘ':['v','2'],'ǚ':['v','3'],'ǜ':['v','4'],'ü':['v','5'],
  'ń':['n','2'],'ň':['n','3'],'ǹ':['n','4'],'ḿ':['m','2'],
  'ế':['ê','2'],'ề':['ê','4'],'ê':['ê','5'] };
function toToneNum(syll) {
  let letters = '', tone = '5';
  for (const ch of syll.toLowerCase()) {
    const hit = TONE[ch];
    if (hit) { letters += hit[0]; tone = hit[1]; }
    else letters += ch;
  }
  return letters + tone;
}

const isCJK = (c) => c.length === 1 && c >= '\u4E00' && c <= '\u9FFF';

// ---- 拼音（mozillazg：U+4E2D: zhōng,zhòng  # 中）----
const pinyin = {};
for (const line of readFileSync(pinyinFile, 'utf8').split('\n')) {
  const m = line.match(/^U\+([0-9A-Fa-f]+):\s*(.+?)\s*(?:#.*)?$/);
  if (!m) continue;
  const cp = parseInt(m[1], 16);
  if (cp < 0x4E00 || cp > 0x9FFF) continue;
  const ch = String.fromCodePoint(cp);
  const pys = [...new Set(m[2].split(',').map((s) => toToneNum(s.trim())).filter((p) => /^[a-z]{1,7}[1-5]$/.test(p)))];
  if (pys.length) pinyin[ch] = pys.length === 1 ? pys[0] : pys;
}

// ---- 部件（MMH：顶层 ⿰/⿱/⿲ 拆分，其中一部 = 部首）----
const VARIANT = { '水':'氵','心':'忄','手':'扌','犬':'犭','金':'钅','糸':'纟','言':'讠',
  '示':'礻','衣':'衤','火':'灬','邑':'阝','阜':'阝','食':'饣','鳥':'鸟','魚':'鱼','馬':'马','門':'门','頁':'页' };
const components = {};
function splitIDS2(s) {
  const chars = Array.from(s);
  if (chars.length < 2) return null;
  return [chars[0], chars.slice(1).join('')];
}
function splitIDS3(s) {
  const chars = Array.from(s);
  if (chars.length < 3) return null;
  return [chars[0], chars[1], chars.slice(2).join('')];
}
for (const line of readFileSync(mmhFile, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let rec;
  try { rec = JSON.parse(line); } catch { continue; }
  const ch = rec.character;
  if (!isCJK(ch)) continue;
  const dec = rec.decomposition || '';
  const m = dec.match(/^(⿰|⿱|⿲)(.+)$/u);
  if (!m || !rec.radical || rec.radical === '？') continue;
  let form = null, remainder = null;
  if (m[1] === '⿲') {
    const [a, b, c] = splitIDS3(m[2]) || [];
    if (a === rec.radical) { form = a; remainder = b + (c || ''); }
    else if (c === rec.radical) { form = c; remainder = a + b; }
  } else {
    const two = splitIDS2(m[2]);
    if (two) {
      if (two[0] === rec.radical) { form = two[0]; remainder = two[1]; }
      else if (two[1] === rec.radical) { form = two[1]; remainder = two[0]; }
    }
  }
  if (form && remainder) components[ch] = [form, remainder, VARIANT[form] || form];
}

// ---- 常用字表（MMH 收录字集，生僻字检测的代理）----
const commonSet = {};
for (const line of readFileSync(mmhFile, 'utf8').split('\n')) {
  try {
    const ch = JSON.parse(line).character;
    if (isCJK(ch)) commonSet[ch] = 1;
  } catch { /* skip */ }
}

writeFileSync(join(outDir, 'pinyin.json'), JSON.stringify(pinyin));
writeFileSync(join(outDir, 'components.json'), JSON.stringify(components));
writeFileSync(join(outDir, 'common.json'), JSON.stringify(commonSet));
console.log(`pinyin: ${Object.keys(pinyin).length} 字, components: ${Object.keys(components).length} 字, common: ${Object.keys(commonSet).length} 字`);
console.log('样例 湖=', components['湖'], ' 蝙=', components['蝙'], ' 想=', components['想'],
  ' pinyin 重=', pinyin['重'], ' 的=', pinyin['的'], ' 中=', pinyin['中'], ' 行=', pinyin['行']);
