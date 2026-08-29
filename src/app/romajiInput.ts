// ローマ字入力の複数入力方式（ヘボン式・訓令式・小さい文字の x/l 入力など）に対応するための
// 変換・判定エンジン。
//
// words.json の `romaji` フィールドは訓令式ベースの単一表記（例:「しゅ」なら "syu"）で
// 書かれている。この単一表記を「かな1音ごとの候補表記リスト（チャンク）」に分割し、
// タイピング中はチャンクごとに複数の表記（例: しゅ = syu / shu / sixyu / silyu）を
// 同時に受け付けられるようにする。

export type Chunk = { candidates: string[] };

export type TypingState = {
  chunkIndex: number;
  partial: string;
  typedTotal: string;
};

// 拗音（3文字, 訓令式表記をキーに複数方式を登録）
const YOUON_TABLE: Record<string, string[]> = {
  kya: ['kya'], kyu: ['kyu'], kyo: ['kyo'],
  sya: ['sya', 'sha', 'sixya', 'silya'],
  syu: ['syu', 'shu', 'sixyu', 'silyu'],
  syo: ['syo', 'sho', 'sixyo', 'silyo'],
  tya: ['tya', 'cha', 'tixya', 'tilya', 'cixya', 'cilya'],
  tyu: ['tyu', 'chu', 'tixyu', 'tilyu', 'cixyu', 'cilyu'],
  tyo: ['tyo', 'cho', 'tixyo', 'tilyo', 'cixyo', 'cilyo'],
  nya: ['nya'], nyu: ['nyu'], nyo: ['nyo'],
  hya: ['hya'], hyu: ['hyu'], hyo: ['hyo'],
  mya: ['mya'], myu: ['myu'], myo: ['myo'],
  rya: ['rya'], ryu: ['ryu'], ryo: ['ryo'],
  gya: ['gya'], gyu: ['gyu'], gyo: ['gyo'],
  zya: ['zya', 'ja', 'zixya', 'zilya', 'jixya', 'jilya'],
  zyu: ['zyu', 'ju', 'zixyu', 'zilyu', 'jixyu', 'jilyu'],
  zyo: ['zyo', 'jo', 'zixyo', 'zilyo', 'jixyo', 'jilyo'],
  bya: ['bya'], byu: ['byu'], byo: ['byo'],
  pya: ['pya'], pyu: ['pyu'], pyo: ['pyo'],
  // 外来語音（訓令式に対応表記がないため、IMEで一般的な表記をキーにする）
  tye: ['tye', 'che', 'cye', 'tixe', 'tile'], // チェ
  thi: ['thi', 'texi', 'teli'],               // ティ
  dhu: ['dhu', 'dexyu', 'delyu'],             // デュ
};

// 五十音（2文字, 訓令式表記をキーに複数方式を登録）
const MORA_TABLE: Record<string, string[]> = {
  ka: ['ka'], ki: ['ki'], ku: ['ku'], ke: ['ke'], ko: ['ko'],
  sa: ['sa'], si: ['si', 'shi', 'ci'], su: ['su'], se: ['se', 'ce'], so: ['so'],
  ta: ['ta'], ti: ['ti', 'chi'], tu: ['tu', 'tsu'], te: ['te'], to: ['to'],
  na: ['na'], ni: ['ni'], nu: ['nu'], ne: ['ne'], no: ['no'],
  ha: ['ha'], hi: ['hi'], hu: ['hu', 'fu'], he: ['he'], ho: ['ho'],
  fo: ['fo', 'fuxo', 'fulo', 'huxo', 'hulo'], // フォ（外来語音）
  ma: ['ma'], mi: ['mi'], mu: ['mu'], me: ['me'], mo: ['mo'],
  ya: ['ya'], yu: ['yu'], yo: ['yo'],
  ra: ['ra'], ri: ['ri'], ru: ['ru'], re: ['re'], ro: ['ro'],
  wa: ['wa'], wo: ['wo', 'o'],
  ga: ['ga'], gi: ['gi'], gu: ['gu'], ge: ['ge'], go: ['go'],
  za: ['za'], zi: ['zi', 'ji'], zu: ['zu'], ze: ['ze'], zo: ['zo'],
  da: ['da'], di: ['di', 'ji'], du: ['du', 'zu'], de: ['de'], do: ['do'],
  ba: ['ba'], bi: ['bi'], bu: ['bu'], be: ['be'], bo: ['bo'],
  pa: ['pa'], pi: ['pi'], pu: ['pu'], pe: ['pe'], po: ['po'],
};

const N_CANDIDATES = ['n', 'nn', 'xn'];
const SOKUON_CONSONANTS = new Set(['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'p', 'r', 's', 't', 'w', 'y', 'z']);
const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);

// 単一のローマ字表記（words.jsonのromajiフィールド）を、かな1音ごとのチャンクへ分割する
export function buildChunks(romaji: string): Chunk[] {
  const s = romaji.toLowerCase();
  const chunks: Chunk[] = [];
  let i = 0;

  while (i < s.length) {
    const three = s.slice(i, i + 3);
    if (YOUON_TABLE[three]) {
      chunks.push({ candidates: YOUON_TABLE[three] });
      i += 3;
      continue;
    }

    // 促音(っ): 同じ子音が連続する箇所(nを除く)を1音として扱う
    const c0 = s[i];
    const c1 = s[i + 1];
    if (c0 === c1 && SOKUON_CONSONANTS.has(c0)) {
      chunks.push({ candidates: [c0, 'xtu', 'ltu'] });
      i += 1;
      continue;
    }

    const two = s.slice(i, i + 2);
    if (MORA_TABLE[two]) {
      chunks.push({ candidates: MORA_TABLE[two] });
      i += 2;
      continue;
    }

    if (c0 === 'n') {
      // 「ん」の直後に文字がない(語末)、または直後も'n'(な行が続く等)の場合、
      // 'nn'を候補に含めると語末確定や次のチャンクとの境界判定が衝突するため除外する。
      // (例:「てんの」= te+n+no を "tenn"+"o" と誤認識してしまう)
      const next = s[i + 1];
      let candidates: string[];
      if (next === undefined) {
        candidates = ['n'];
      } else if (next === 'n') {
        candidates = ['n', 'xn'];
      } else {
        candidates = N_CANDIDATES;
      }
      chunks.push({ candidates });
      i += 1;
      continue;
    }

    if (VOWELS.has(c0)) {
      chunks.push({ candidates: [c0] });
      i += 1;
      continue;
    }

    // 記号や英数字（CSS, java など）はそのまま1文字ずつ要求する
    chunks.push({ candidates: [c0] });
    i += 1;
  }

  return chunks;
}

export function createTypingState(): TypingState {
  return { chunkIndex: 0, partial: '', typedTotal: '' };
}

export type TypeResult =
  | { success: true; state: TypingState; wordCompleted: boolean }
  | { success: false };

// 1文字分の入力を試み、現在のチャンクの候補と照合する。
// 「ん」の直後に母音が続く場合など、現在のチャンクが確定候補と一致していれば
// 次のチャンクへ確定させてから同じ文字で再試行する。
export function typeChar(chunks: Chunk[], state: TypingState, char: string): TypeResult {
  const chunk = chunks[state.chunkIndex];
  if (!chunk) return { success: false };

  const attempted = state.partial + char;
  const viable = chunk.candidates.filter((c) => c.startsWith(attempted));

  if (viable.length > 0) {
    const exact = viable.includes(attempted);
    const hasLonger = viable.some((c) => c.length > attempted.length);

    if (exact && !hasLonger) {
      const nextState: TypingState = {
        chunkIndex: state.chunkIndex + 1,
        partial: '',
        typedTotal: state.typedTotal + char,
      };
      return { success: true, state: nextState, wordCompleted: nextState.chunkIndex >= chunks.length };
    }

    const nextState: TypingState = {
      chunkIndex: state.chunkIndex,
      partial: attempted,
      typedTotal: state.typedTotal + char,
    };
    return { success: true, state: nextState, wordCompleted: false };
  }

  // 現在のチャンクの表記が既に確定候補なら、次のチャンクとして同じ文字を再試行する
  if (state.partial.length > 0 && chunk.candidates.includes(state.partial)) {
    const advanced: TypingState = { chunkIndex: state.chunkIndex + 1, partial: '', typedTotal: state.typedTotal };
    return typeChar(chunks, advanced, char);
  }

  return { success: false };
}

// 表示用の文字列と、そのうち何文字を「入力済み」として色付けするかを返す
export function getRenderInfo(chunks: Chunk[], state: TypingState): { display: string; coloredLength: number } {
  let display = '';
  let coloredLength = 0;

  for (let i = 0; i < chunks.length; i++) {
    if (i < state.chunkIndex) {
      const def = chunks[i].candidates[0];
      display += def;
      coloredLength += def.length;
    } else if (i === state.chunkIndex) {
      const candidate = chunks[i].candidates.find((c) => c.startsWith(state.partial)) || chunks[i].candidates[0];
      display += candidate;
      coloredLength += state.partial.length;
    } else {
      display += chunks[i].candidates[0];
    }
  }

  return { display, coloredLength };
}
