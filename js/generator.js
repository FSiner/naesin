/* 규칙 기반 내신 문제 생성기 (API 키·서버 불필요)
 * 입력: 학습지 텍스트(OCR 결과 또는 직접 입력) → 출력: 문제 배열
 * 유형: blank_mc(빈칸 객관식) / blank_short(빈칸 단답형) / notmatch(옳지 않은 것) / match(옳은 것) / define(용어 찾기)
 */
(function (root) {
  'use strict';

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, r) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  const STRONG = ['에서는', '으로는', '이라고', '에서', '으로', '에게', '까지', '부터', '입니다', '이다', '이며', '이고', '라고', '이란', '과는', '와는', '은', '는', '을', '를'];
  const WEAK = ['이', '가', '의', '에', '로', '과', '와', '도', '만'];
  const STOP = new Set(('이것 그것 저것 때문 대한 위한 통해 따라 있는 하는 되는 같은 다른 이러한 그러한 그러나 하지만 또한 그리고 따라서 그래서 즉 다음 경우 매우 가장 모든 여러 각각 이후 이전 동안 사이 정도 때문에 것이다 것으로 있다 한다 된다 있으며 하였다 되었다 이루어 이루어진 대해 대하여 관한 관련 우리 사람 사람들 내용 부분 결과 과정 방법 문제 이유 상태 시기 당시 현재 오늘날 다양 다양한 중요 중요한 통하여 의하여 이에 이를 그는 그의 그를 또는 및 등의 등을 등이 하여 하고 하며 하면 해서 위해 위하여 전반 크게 가운데 일부 대부분 주요 이후로').split(/\s+/));
  const VERBISH = /(다|며|고|서|게|히|한|된|할|될|던|는데|지만|으며|하여|하고|하는|있는|없는|같은|위한|대한|통한|따른|인한|라는|이라는|도록|하기|어난|들이|들은|적|하|지는|라서)$/;
  const AMBIG = /(이|가|의|에|로|도|만|과|와)$/;
  const BLANK = '(      )';
  const NUMRE = /\d[\d,\.]*(?:\s?(?:년|월|일|명|개|%|퍼센트|세기|원|배|도|℃|km|cm|kg|ml|m|g|L))?/;
  const TOKRE = new RegExp('(' + NUMRE.source + ')|([가-힣]{2,})|([A-Za-z][A-Za-z\\-]{2,})', 'g');
  const BULLET = /^\s*(?:[\-•ㆍ·○●▶■□◆◇*※]|\d+[\.\)]|[①-⑩]|\(\d+\)|[가-힣][\.\)])\s*/;
  const DEFRE = /^(.{2,25}?)\s*(?:은|는|이란|란)\s+(.{6,}?)\s*(?:을|를)?\s*(?:말한다|뜻한다|의미한다|가리킨다|이라고\s?한다|라고\s?한다|라\s?한다|이다)\.?$/;

  function splitSentences(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n').map(function (l) { return l.replace(/\s+/g, ' ').trim(); });
    const out = []; let buf = '';
    const flush = function () { if (buf.trim()) out.push(buf.trim()); buf = ''; };
    const END = /([.!?。]|다|함|음|임|됨|것|죠|요)$/;
    lines.forEach(function (line) {
      if (!line) { flush(); return; }
      if (BULLET.test(line)) { flush(); line = line.replace(BULLET, ''); }
      if (!buf && line.length <= 18 && !END.test(line)) return; // 제목줄
      buf += (buf ? ' ' : '') + line;
      if (END.test(line)) flush();
    });
    flush();
    const res = [];
    out.forEach(function (p) {
      p.split(/(?<=[.!?。])\s+/).forEach(function (s) {
        s = s.trim();
        const hg = (s.match(/[가-힣]/g) || []).length;
        if (s.length >= 12 && s.length <= 160 && hg >= 6) res.push(s);
      });
    });
    return Array.from(new Set(res));
  }

  function stem(w, set) {
    for (const p of STRONG) if (w.length - p.length >= 2 && w.endsWith(p)) return w.slice(0, -p.length);
    for (const p of WEAK) if (w.length - p.length >= 2 && w.endsWith(p)) { const s = w.slice(0, -p.length); if (set.has(s)) return s; }
    return w;
  }

  function extractTerms(s, rawSet, rawCount) {
    const terms = []; const seen = new Set();
    const add = function (text, kind, bonus) {
      text = text.trim().replace(/[.,]+$/, '');
      if (!text || seen.has(text)) return;
      seen.add(text); terms.push({ text: text, kind: kind, bonus: bonus || 0 });
    };
    let m; TOKRE.lastIndex = 0;
    while ((m = TOKRE.exec(s))) {
      if (m[1]) {
        const t = m[1].replace(/[.,]+$/, '');
        const digits = (t.match(/\d/g) || []).length;
        if (digits >= 2 || /[가-힣%℃a-zA-Z]/.test(t)) add(t, 'num', 2.5);
      } else if (m[2]) {
        const st = stem(m[2], rawSet);
        if (st.length < 2 || STOP.has(st) || VERBISH.test(st)) continue;
        if (st.length === 2 && /[은는을를]$/.test(st)) continue;
        // 조사일 수 있는 끝글자: 학습지에서 같은 형태로 2번 이상 나올 때만 용어로 인정
        if (AMBIG.test(st) && st.length >= 3 && (rawCount.get(st) || 0) < 2) continue;
        add(st, 'word', 0);
      } else if (m[3]) add(m[3], 'word', 0.5);
    }
    const q = /[『「'"‘“(（\[【]([^'"’”)）\]】』」]{2,15})['"’”)）\]】』」]/g; let qm;
    while ((qm = q.exec(s))) {
      const c = qm[1].trim();
      if (/[가-힣A-Za-z]/.test(c) && !/^\d+$/.test(c) && s.indexOf(c) >= 0) {
        const ex = terms.find(function (t) { return t.text === c; });
        if (ex) ex.bonus += 3; else add(c, /\d/.test(c) ? 'num' : 'word', 3);
      }
    }
    return terms;
  }

  function analyze(text) {
    const sents = splitSentences(text);
    const rawSet = new Set();
    const rawCount = new Map();
    sents.forEach(function (s) { (s.match(/[가-힣]{2,}/g) || []).forEach(function (w) { rawSet.add(w); rawCount.set(w, (rawCount.get(w) || 0) + 1); }); });
    const freq = new Map();
    const items = sents.map(function (s, i) {
      const terms = extractTerms(s, rawSet, rawCount);
      terms.forEach(function (t) { freq.set(t.text, (freq.get(t.text) || 0) + 1); });
      let def = null; const dm = s.match(DEFRE);
      if (dm) {
        const subj = dm[1].replace(/\s+/g, ' ').trim();
        if (/^[가-힣A-Za-z0-9·\-]+( [가-힣A-Za-z0-9·\-]+)?$/.test(subj) && dm[2].indexOf(subj) < 0) {
          def = { term: subj, desc: dm[2].trim() };
          const ex = terms.find(function (t) { return t.text === subj; });
          if (ex) ex.bonus += 4; else terms.push({ text: subj, kind: 'word', bonus: 4 });
          if (!freq.has(subj)) freq.set(subj, 1);
        }
      }
      return { i: i, text: s, terms: terms, def: def };
    });
    const pool = new Map();
    items.forEach(function (it) {
      it.terms.forEach(function (t) {
        t.score = Math.min((freq.get(t.text) || 1) - 1, 3) + Math.min(t.text.length, 6) * 0.4 + t.bonus;
        if (!pool.has(t.text) || pool.get(t.text).score < t.score) pool.set(t.text, t);
      });
    });
    return { sents: items, pool: Array.from(pool.values()) };
  }

  function numNear(term, r) {
    const m = term.match(/^(\d[\d,\.]*)(.*)$/);
    if (!m) return [];
    const raw = m[1].replace(/,/g, ''); const unit = m[2];
    const v = parseFloat(raw); if (isNaN(v)) return [];
    const dec = (raw.split('.')[1] || '').length;
    const isYear = /년/.test(unit) && v >= 100 && v <= 2200;
    const deltas = isYear ? [-50, -10, -5, -3, -2, -1, 1, 2, 3, 5, 10, 50] : (dec ? [-1, -0.5, -0.1, 0.1, 0.5, 1, 2] : [-10, -5, -2, -1, 1, 2, 5, 10]);
    let c = deltas.map(function (d) { return v + d; });
    if (!isYear && !dec && v >= 2) { c.push(v * 2); if (v % 2 === 0) c.push(v / 2); }
    c = c.filter(function (x) { return x >= 0 && x !== v; });
    return shuffle(Array.from(new Set(c)), r).map(function (x) { return (dec ? x.toFixed(dec) : String(x)) + unit; });
  }

  function distractors(term, sentence, A, r, n) {
    n = n || 4; const out = []; const used = new Set([term.text]);
    const push = function (t) { if (t && !used.has(t) && sentence.indexOf(t) < 0 && out.length < n) { used.add(t); out.push(t); } };
    if (term.kind === 'num') {
      numNear(term.text, r).slice(0, 3).forEach(push);
      shuffle(A.pool.filter(function (t) { return t.kind === 'num'; }), r).forEach(function (t) { push(t.text); });
      numNear(term.text, r).forEach(push);
    } else {
      const c = shuffle(A.pool.filter(function (t) { return t.kind === 'word' && t.text !== term.text; }), r)
        .map(function (t) { return { t: t.text, k: Math.abs(t.text.length - term.text.length) + r() * 2 - Math.min(t.score, 4) * 0.2 }; })
        .sort(function (a, b) { return a.k - b.k; });
      c.forEach(function (x) { push(x.t); });
    }
    return out.length >= n ? out : null;
  }

  function bestTerm(it, r) {
    const c = it.terms.filter(function (t) { return it.text.split(t.text).length - 1 <= 2; })
      .map(function (t) { return { t: t, k: t.score + r() * 1.2 }; })
      .sort(function (a, b) { return b.k - a.k; });
    return c.length ? c[0].t : null;
  }
  function batchim(w) {
    const c = w.charCodeAt(w.length - 1);
    if (c < 0xAC00 || c > 0xD7A3) return null;
    const j = (c - 0xAC00) % 28; return j === 0 ? 0 : (j === 8 ? 8 : 1);
  }
  function replaceTerm(s, from, to) {
    const b = batchim(to);
    const re = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(은|는|이|가|을|를|과|와|으로|로)?', 'g');
    return s.replace(re, function (m, p) {
      if (!p || b === null) return to + (p || '');
      const map = { '은': b ? '은' : '는', '는': b ? '은' : '는', '이': b ? '이' : '가', '가': b ? '이' : '가', '을': b ? '을' : '를', '를': b ? '을' : '를',
        '과': b ? '과' : '와', '와': b ? '과' : '와', '으로': (b && b !== 8) ? '으로' : '로', '로': (b && b !== 8) ? '으로' : '로' };
      return to + map[p];
    });
  }
  function blankOut(s, term) { return s.split(term).join(BLANK); }
  const CIRC = '①②③④⑤';
  function mkChoices(correct, wrongs, r) {
    const all = shuffle([correct].concat(wrongs), r);
    return { choices: all, answer: all.indexOf(correct) + 1 };
  }
  function pickUnused(A, st, key, filter) {
    st[key] = st[key] || new Set();
    st.all = st.all || new Set();
    const base = A.sents.filter(function (it) { return !st[key].has(it.i) && (!filter || filter(it)); });
    if (key === 'stmt') return base;
    const fresh = base.filter(function (it) { return !st.all.has(it.i); });
    return fresh.length ? fresh : base;
  }

  const MK = {
    blank_mc: function (A, r, st) {
      const c = shuffle(pickUnused(A, st, 'blank', function (it) { return it.terms.length; }), r);
      for (const it of c) {
        const t = bestTerm(it, r); if (!t) continue;
        const d = distractors(t, it.text, A, r); if (!d) continue;
        st.blank.add(it.i); st.all.add(it.i);
        const ch = mkChoices(t.text, d, r);
        return { type: 'mc', q: '다음 글의 빈칸에 들어갈 말로 가장 적절한 것은?\n\n' + blankOut(it.text, t.text), choices: ch.choices, answer: ch.answer,
          explain: '정답은 ' + CIRC[ch.answer - 1] + ' "' + t.text + '"입니다.\n학습지 원문: ' + it.text };
      }
      return null;
    },
    blank_short: function (A, r, st) {
      const c = shuffle(pickUnused(A, st, 'blank', function (it) { return it.terms.length; }), r);
      for (const it of c) {
        const t = bestTerm(it, r); if (!t) continue;
        st.blank.add(it.i); st.all.add(it.i);
        return { type: 'short', q: '다음 글의 빈칸에 알맞은 말을 쓰시오.\n\n' + blankOut(it.text, t.text), choices: [], answer: t.text,
          explain: '정답: ' + t.text + '\n학습지 원문: ' + it.text };
      }
      return null;
    },
    notmatch: function (A, r, st) { return mkStatement(A, r, st, false); },
    match: function (A, r, st) { return mkStatement(A, r, st, true); },
    define: function (A, r, st) {
      const c = shuffle(pickUnused(A, st, 'def', function (it) { return it.def; }), r);
      for (const it of c) {
        const others = A.pool.filter(function (t) { return t.kind === 'word' && t.text !== it.def.term && it.def.desc.indexOf(t.text) < 0; });
        const defTerms = A.sents.filter(function (x) { return x.def && x.def.term !== it.def.term; }).map(function (x) { return x.def.term; });
        const wr = []; shuffle(defTerms, r).concat(shuffle(others, r).map(function (t) { return t.text; })).forEach(function (t) { if (wr.indexOf(t) < 0 && wr.length < 4) wr.push(t); });
        if (wr.length < 4) continue;
        st.def.add(it.i); st.all.add(it.i);
        const ch = mkChoices(it.def.term, wr, r);
        return { type: 'mc', q: '다음 설명에 해당하는 용어로 가장 적절한 것은?\n\n"' + it.def.desc + '"', choices: ch.choices, answer: ch.answer,
          explain: '정답은 ' + CIRC[ch.answer - 1] + ' "' + it.def.term + '"입니다.\n학습지 원문: ' + it.text };
      }
      return null;
    }
  };

  function falsify(it, A, r) {
    const cands = it.terms.filter(function (t) { return it.text.split(t.text).length - 1 === 1; })
      .map(function (t) { return { t: t, k: t.score + r() }; }).sort(function (a, b) { return b.k - a.k; });
    for (const x of cands) {
      const d = distractors(x.t, it.text, A, r, 1);
      if (d) return { text: replaceTerm(it.text, x.t.text, d[0]), from: x.t.text, to: d[0] };
    }
    return null;
  }
  function mkStatement(A, r, st, wantTrue) {
    const key = 'stmt';
    let c = shuffle(pickUnused(A, st, key, function (it) { return it.text.length >= 15 && it.text.length <= 90 && it.terms.length; }), r);
    if (c.length < 5) return null;
    const need = wantTrue ? 4 : 1;       // 만들어야 하는 거짓 문장 수
    const odd = [];                      // 거짓(변형) 문장
    const rest = [];
    for (const it of c) {
      if (odd.length < need) { const f = falsify(it, A, r); if (f) { odd.push({ it: it, f: f }); continue; } }
      rest.push(it);
    }
    if (odd.length < need) return null;
    const truesNeeded = 5 - need;
    if (rest.length < truesNeeded) return null;
    const trues = rest.slice(0, truesNeeded);
    const items = shuffle(odd.map(function (o) { return { text: o.f.text, mark: 'F', o: o }; })
      .concat(trues.map(function (t) { return { text: t.text, mark: 'T', it: t }; })), r);
    odd.forEach(function (o) { st[key].add(o.it.i); }); trues.forEach(function (t) { st[key].add(t.i); });
    const ansMark = wantTrue ? 'T' : 'F';
    const ai = items.findIndex(function (x) { return x.mark === ansMark; });
    const ex = wantTrue ? items[ai].it.text : items[ai].o.f.from;
    return {
      type: 'mc',
      q: wantTrue ? '다음 중 학습지의 내용과 일치하는 것은?' : '다음 중 학습지의 내용과 일치하지 않는 것은?',
      choices: items.map(function (x) { return x.text; }), answer: ai + 1,
      explain: wantTrue ? '정답은 ' + CIRC[ai] + '입니다. 나머지 보기는 학습지 내용의 핵심어를 바꾼 것입니다.'
        : '정답은 ' + CIRC[ai] + '입니다. "' + items[ai].o.f.to + '"은(는) 학습지에서 "' + items[ai].o.f.from + '"입니다.\n학습지 원문: ' + items[ai].o.it.text
    };
  }

  function generate(text, opt) {
    opt = opt || {};
    const count = opt.count || 5;
    const types = (opt.types && opt.types.length ? opt.types : Object.keys(MK)).filter(function (t) { return MK[t]; });
    const r = rng(opt.seed != null ? opt.seed : (Date.now() ^ Math.floor(Math.random() * 1e9)));
    const A = analyze(text); const st = {}; const qs = [];
    let guard = 0, i = 0, fails = 0;
    while (qs.length < count && guard < count * 12 && fails < types.length * 3) {
      const t = types[i++ % types.length]; guard++;
      const q = MK[t](A, r, st);
      if (q) { q.kind = t; qs.push(q); fails = 0; } else fails++;
    }
    return { questions: qs, stats: { sentences: A.sents.length, terms: A.pool.length, definitions: A.sents.filter(function (s) { return s.def; }).length } };
  }

  const api = { generate: generate, analyze: analyze, splitSentences: splitSentences, TYPES: { blank_mc: '빈칸 객관식', blank_short: '빈칸 단답형', notmatch: '옳지 않은 것 고르기', match: '옳은 것 고르기', define: '용어 찾기' } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NaesinGen = api;
})(typeof window !== 'undefined' ? window : globalThis);
