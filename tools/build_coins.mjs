// tools/build_coins.mjs  —  run: node tools/build_coins.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const SRC = 'https://kyoganken.sakura.ne.jp/bariba/index.htm';

// Canonical spelling → variants seen in the source.
const CANON = {
  'ラッティー': ['ラッティ'],
  'キュヴィ':   ['キュビィ'],
  'ビーター':   ['ピーター'],
};
const canonical = n => Object.keys(CANON).find(k => k === n || CANON[k].includes(n)) ?? n;

// mainSide is a property of the Baribii (character), not of the set.
// Source: core/drafts/20260921_scout_bariba-reverse-meta.md §2, "Order-main
// characters" / "Extreme-main characters" lists.
const ORDER_MAIN = [
  'ニャルバン', 'イグルス', 'トライガー', 'レオウ', 'カブトル', 'ラビナ', 'ペギオン',
  'コアミン', 'エルパオン', 'クマッシブ', 'パピルーナ', 'イルフィン', 'ケロット',
  'ホースター', 'ビーター', 'アランブル', 'ジャブル', 'ターチェ',
];
const EXTREME_MAIN = [
  'ラッティー', 'ガオルフ', 'ヒョードル', 'カイザーク', 'ハサムネ', 'キュヴィ',
  'オラバチ', 'ドリモグー', 'ワニキ', 'サイノス', 'ラミィ', 'ミラボル', 'モモニン',
  'チョトツ', 'ジェリル', 'ソルーピオン', 'コブランボー', 'アミラ',
];
const CHARACTER_SIDE = Object.fromEntries([
  ...ORDER_MAIN.map(c => [c, 'order']),
  ...EXTREME_MAIN.map(c => [c, 'xtreme']),
]);
const mainSideOf = name => {
  const side = CHARACTER_SIDE[name];
  if (!side) throw new Error(`No mainSide entry for character "${name}" — add it to ORDER_MAIN or EXTREME_MAIN`);
  return side;
};

// Meta coins: the two faces differ. Keyed by "rarity name".
// Values verified against the manual (see research doc §1) and the site's own
// item-description text (e.g. line 181: 「ハサムネ」X9000M7000) — NOT against
// the coinbox "M7000(o9000x5000)" strings, which are copy-paste errors on the
// source site: BBR ハサムネ's coinbox literally repeats カブトル's o/x string.
const META = {
  'BBR カブトル':  { order: 9000, xtreme: 5000 },
  'R カブトル':    { order: 7000, xtreme: 3000 },
  'BR レオウ':     { order: 8000, xtreme: 4000 },
  'BBR ハサムネ':  { order: 5000, xtreme: 9000 },
  'R ハサムネ':    { order: 3000, xtreme: 7000 },
  'BR カイザーク': { order: 4000, xtreme: 8000 },
};

// Source values the coin photographs contradict. Verified 2026-09-21.
const OVERRIDE = { '02a-h': 5500 };   // 第2転 R イグルス — source index says 4500, coin prints 5500

// Raw HTML comment labels, in document order, mapped to canonical display
// names. Labels repeat (コロコロ付録 x2, コミック特典 x2, コインセット7月エクストリーム x2)
// with DIFFERENT canonical meanings each time — confirmed against the coin
// contents under each comment, not just the label text. This is why the
// mapping is positional (a parallel array) rather than a name-keyed object.
// See task-1-report.md for the position-by-position verification.
const RAW_TO_CANONICAL = [
  ['第１転オーダー',                 '第1転 ～秩序を統べる者たち～'],
  ['第１転エクストリーム',           '第1転 ～自由を求める者たち～'],
  ['バインダー1o',                   'バリバインダー第1巻'],
  ['バインダー1x',                   'バリバインダー第1巻'],
  ['コロコロ付録',                   'コロコロ5月号付録'],
  ['第２転',                         '第2転 ～表裏を司る者たち～'],
  ['第２転オーダー',                 '第2転 ～表裏を司る者たち～'],
  ['第２転エクストリーム',           '第2転 ～表裏を司る者たち～'],
  ['コインセット7月オーダー',        'コインセット ～最強を誇る～'],
  ['コインセット7月エクストリーム',  'コインセット ～最凶を貪る～'],
  ['第３転オーダー',                 '第3転 ～最強を誇る者たち～'],
  ['第３転エクストリーム',           '第3転 ～最凶を貪る者たち～'],
  ['店頭キャンペーン',               'コロコロ8月号 / 店頭CP'],
  ['コミック特典',                   'コミックス第1巻特装版'],
  ['コロコロ付録',                   'コロコロ8月号 / 店頭CP'],   // NOT 5月号 — content is バディぬいVER., matches the 8月号/店頭CP bucket
  ['コミック特典',                   'コミックス第1巻特装版'],
  ['コロフェス限定セットオーダー',   'コロフェス2026 ～まじめななつやすみ～'],
  ['コインセット7月エクストリーム',  'コロフェス2026 ～じゆうななつやすみ～'],  // mislabelled at source — actually the コロフェス limited extreme set
];

const res = await fetch(SRC);
const html = await res.text();
const section = html.slice(html.indexOf('バリバコイン一覧'), html.indexOf('キャラ別'));

const out = [];
const blocks = section.split(/<!--(.*?)-->/s);
let pos = 0;
for (let i = 1; i < blocks.length; i += 2) {
  const rawLabel = blocks[i].trim();
  const expected = RAW_TO_CANONICAL[pos];
  if (!expected) throw new Error(`Unexpected extra HTML comment block "${rawLabel}" at position ${pos} — source page structure changed, update RAW_TO_CANONICAL`);
  if (expected[0] !== rawLabel) throw new Error(`Comment label mismatch at position ${pos}: expected "${expected[0]}", got "${rawLabel}" — source page structure changed, update RAW_TO_CANONICAL`);
  const setName = expected[1];
  pos++;

  const boxes = blocks[i + 1].matchAll(/<div class="coinbox1">(.*?)<\/div>/gs);
  for (const [, box] of boxes) {
    const text = box.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const href = box.match(/href="img1\/([^/]+)\/([a-z])01\.jpg"/);
    const id = href ? `${href[1]}-${href[2]}` : null;

    // "BBR ニャルバン 7000"  |  "RR シークレット (ニャルバン8000)"  |  "BBR カブトル M7000(o9000x5000)"
    let m = text.match(/^(RR|BBR|BR|BKR|R|C)\s+(\S+)\s+(\d+)$/);
    let unverified = false;
    if (!m) {
      const metaM = text.match(/^(RR|BBR|BR|BKR|R|C)\s+(\S+)\s+M(\d+)\(o\d+x\d+\)$/);
      if (metaM) m = metaM;
    }
    if (!m) {
      const sec = text.match(/^(RR|BKR)\s+シークレット\s*\((\S+?)(\d+)\)$/);
      if (!sec) continue;
      m = sec;
      unverified = true;
    }
    const [, rarity, rawName, oxStr] = m;
    const name = canonical(rawName);
    const key = `${rarity} ${name}`;
    const flat = OVERRIDE[id] ?? Number(oxStr);
    const faces = META[key] ?? { order: flat, xtreme: flat };

    out.push({
      id: id ?? `${setName}-${rarity}-${name}`,
      name,
      variants: CANON[name] ?? [],
      rarity,
      set: setName,
      mainSide: mainSideOf(name),
      faces: {
        order:  { label: `${name}O`, ox: faces.order },
        xtreme: { label: `${name}X`, ox: faces.xtreme },
      },
      ...(unverified ? { unverified: true } : {}),
    });
  }
}

if (pos !== RAW_TO_CANONICAL.length) {
  throw new Error(`Expected ${RAW_TO_CANONICAL.length} HTML comment blocks, found ${pos} — source page structure changed`);
}

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/coins.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(`wrote ${out.length} coins`);
