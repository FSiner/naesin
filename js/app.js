/* 내신 기출 문제 메이커 – 화면/저장/관리자 로직 (프레임워크·서버 불필요) */
(function () {
  'use strict';

  var CFG = Object.assign({ schoolName: '우리 학교', adminPasswordHash: '', accessCodeHash: '', contentUrl: 'data/content.json' }, window.APP_CONFIG || {});
  var DEFAULT_SUBJECTS = ['국어', '수학', '영어', '과학', '사회', '한국사'];
  var CIRC = '①②③④⑤';
  var TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

  var S = null, cur = '', isAdmin = false, adminTab = 'sheets';
  var ans = {}, shown = {}, drafts = {}, gopts = {}, editing = null, impN = 8;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };

  /* ---------- 알림 / 모달 (alert·prompt 대신 화면 안에서 처리) ---------- */
  var toastTimer;
  function toast(msg) {
    var t = $('#toast'); if (!t) return;
    t.textContent = msg; t.hidden = false; clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }
  function modal(html, cls) {
    var o = document.createElement('div'); o.className = 'overlay ' + (cls || '');
    o.innerHTML = '<div class="modal">' + html + '</div>'; document.body.appendChild(o); return o;
  }
  function ask(msg, opt) {
    opt = opt || {};
    return new Promise(function (res) {
      var o = modal('<p>' + esc(msg) + '</p>' + (opt.input ? '<input id="mi" type="' + (opt.password ? 'password' : 'text') + '" value="' + esc(opt.value || '') + '">' : '') +
        '<div class="row end"><button class="btn ghost" data-m="c">취소</button><button class="btn" data-m="o">확인</button></div>');
      var inp = $('#mi', o); if (inp) setTimeout(function () { inp.focus(); }, 30);
      function done(v) { o.remove(); res(v); }
      o.addEventListener('click', function (e) {
        var m = e.target.getAttribute && e.target.getAttribute('data-m');
        if (m === 'o') done(opt.input ? inp.value : true); else if (m === 'c') done(opt.input ? null : false);
      });
      if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') done(inp.value); if (e.key === 'Escape') done(null); });
    });
  }
  window.addEventListener('error', function (e) { toast('오류: ' + (e.message || e)); });
  window.addEventListener('unhandledrejection', function (e) { toast('오류: ' + ((e.reason && e.reason.message) || e.reason)); });

  /* ---------- SHA-256 (crypto.subtle 없을 때 대비) ---------- */
  function sha256js(str) {
    var bytes = new TextEncoder().encode(str), primes = [];
    for (var n = 2; primes.length < 64; n++) { if (primes.every(function (p) { return n % p; })) primes.push(n); }
    var K = primes.map(function (p) { return Math.floor((Math.cbrt(p) % 1) * 4294967296); });
    var h = primes.slice(0, 8).map(function (p) { return Math.floor((Math.sqrt(p) % 1) * 4294967296); });
    var rr = function (v, a) { return (v >>> a) | (v << (32 - a)); };
    var l = bytes.length, padLen = ((l + 9 + 63) >> 6) << 6, buf = new Uint8Array(padLen);
    buf.set(bytes); buf[l] = 0x80;
    var dv = new DataView(buf.buffer); dv.setUint32(padLen - 4, (l * 8) >>> 0); dv.setUint32(padLen - 8, Math.floor(l * 8 / 4294967296));
    var w = new Array(64);
    for (var o = 0; o < padLen; o += 64) {
      var i;
      for (i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (i = 16; i < 64; i++) {
        var s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (i = 0; i < 64; i++) {
        var S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25), ch = (e & f) ^ (~e & g), t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
        var S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22), maj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h = [h[0] + a, h[1] + b, h[2] + c, h[3] + d, h[4] + e, h[5] + f, h[6] + g, h[7] + hh].map(function (x) { return x | 0; });
    }
    return h.map(function (x) { return (x >>> 0).toString(16).padStart(8, '0'); }).join('');
  }
  function sha256(t) {
    if (window.crypto && crypto.subtle) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)).then(function (b) {
        return Array.prototype.map.call(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, '0'); }).join('');
      }).catch(function () { return sha256js(t); });
    }
    return Promise.resolve(sha256js(t));
  }

  /* ---------- 저장소: IndexedDB → localStorage → 메모리 순으로 자동 대체 ---------- */
  var store = (function () {
    var mode = 'mem', db = null, mem = null;
    function openDb() {
      return new Promise(function (res, rej) {
        if (!window.indexedDB) return rej(new Error('no idb'));
        var r = indexedDB.open('naesin-maker', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); }; r.onblocked = function () { rej(new Error('blocked')); };
      });
    }
    function init() {
      return Promise.race([openDb(), new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 2000); })])
        .then(function (d) { db = d; mode = 'idb'; })
        .catch(function () { try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); mode = 'ls'; } catch (e) { mode = 'mem'; } });
    }
    function get() {
      if (mode === 'idb') return new Promise(function (res) { try { var q = db.transaction('kv').objectStore('kv').get('state'); q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { res(null); }; } catch (e) { res(null); } });
      if (mode === 'ls') { try { return Promise.resolve(JSON.parse(localStorage.getItem('naesin_state') || 'null')); } catch (e) { return Promise.resolve(null); } }
      return Promise.resolve(mem);
    }
    function set(v) {
      if (mode === 'idb') return new Promise(function (res, rej) { try { var t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, 'state'); t.oncomplete = function () { res(); }; t.onerror = function () { rej(t.error); }; } catch (e) { rej(e); } });
      if (mode === 'ls') { try { localStorage.setItem('naesin_state', JSON.stringify(v)); return Promise.resolve(); } catch (e) { return Promise.reject(e); } }
      mem = v; return Promise.resolve();
    }
    return { init: init, get: get, set: set, mode: function () { return mode; } };
  })();

  function normalize(d) {
    d = d || {};
    return {
      version: 1, updated: d.updated || '',
      subjects: (Array.isArray(d.subjects) && d.subjects.length) ? d.subjects : DEFAULT_SUBJECTS.slice(),
      sheets: Array.isArray(d.sheets) ? d.sheets : [], questions: Array.isArray(d.questions) ? d.questions : [],
      pw: d.pw || null, fromRepo: !!d.fromRepo
    };
  }
  function commit() {                       // 관리자가 내용을 바꿀 때: 이 브라우저에 저장
    S.fromRepo = false; S.updated = new Date().toISOString();
    return store.set(S).catch(function (e) { toast('저장 실패: 저장 공간이 부족할 수 있습니다 (' + (e && e.message || e) + ')'); });
  }
  function setAdminFlag(v) { try { sessionStorage.setItem('naesin_admin', v ? '1' : '0'); } catch (e) { } }

  /* ---------- 이미지 / OCR ---------- */
  function loadImg(src) { return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = src; }); }
  function readFile(f) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(f); }); }
  function shrink(src, max, q) {
    return loadImg(src).then(function (im) {
      var k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q);
    });
  }
  function prepOcr(src) {
    return loadImg(src).then(function (im) {
      var k = im.width < 1800 ? 1800 / im.width : 1, c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      var x = c.getContext('2d'); x.drawImage(im, 0, 0, c.width, c.height);
      var d = x.getImageData(0, 0, c.width, c.height), p = d.data;
      for (var i = 0; i < p.length; i += 4) { var g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; g = Math.max(0, Math.min(255, (g - 128) * 1.5 + 128 + 10)); p[i] = p[i + 1] = p[i + 2] = g; }
      x.putImageData(d, 0, 0); return c.toDataURL('image/png');
    });
  }
  function loadScript(url) {
    return new Promise(function (res, rej) {
      if (window.Tesseract) return res();
      var s = document.createElement('script'); s.src = url; s.onload = res; s.onerror = function () { rej(new Error('OCR 엔진을 불러오지 못했습니다. 인터넷 연결을 확인하세요.')); }; document.head.appendChild(s);
    });
  }
  function download(name, text) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- 채점 ---------- */
  var norm = function (s) { return String(s == null ? '' : s).toLowerCase().replace(/[\s\.\,\(\)·]/g, ''); };
  function isCorrect(q, a) {
    if (a == null || a === '') return false;
    if (q.type === 'mc') return Number(a) === Number(q.answer);
    return String(q.answer).split(/\s*\/\s*/).some(function (x) { return norm(x) === norm(a); });
  }
  function ansText(q) { return q.type === 'mc' ? (CIRC[q.answer - 1] || q.answer) + ' ' + esc((q.choices || [])[q.answer - 1] || '') : esc(q.answer); }

  /* ---------- 화면 ---------- */
  function render() {
    var warn = store.mode() === 'mem' ? '<div class="warn">⚠️ 이 환경에서는 브라우저 저장소를 사용할 수 없어, 페이지를 닫으면 관리자가 올린 내용이 사라집니다. 일반 브라우저(Chrome/Edge/Safari)에서 주소로 직접 열어 주세요.</div>' : '';
    var tabs = '<div class="tabs">' + S.subjects.map(function (s) { return '<button class="tab' + (s === cur ? ' on' : '') + '" data-act="subj" data-v="' + esc(s) + '">' + esc(s) + '</button>'; }).join('') + '</div>';
    $('#app').innerHTML = '<header><div class="brand">📚 ' + esc(CFG.schoolName) + ' 내신 기출 문제</div>' + (isAdmin ? '<span class="badge">관리자 모드</span>' : '') +
      '<button class="btn white sm" data-act="adminToggle">' + (isAdmin ? '🔓 관리자 종료' : '🔒 관리자') + '</button></header><main>' + warn + tabs + (isAdmin ? adminView() : studentView()) + '</main>';
  }

  function studentView() {
    var qs = S.questions.filter(function (q) { return q.subject === cur; });
    var sh = S.sheets.filter(function (x) { return x.subject === cur; });
    var h = '<div class="card"><div class="row" style="margin:0"><b style="flex:1">' + esc(cur) + ' · 문제 ' + qs.length + '개 · 학습지 ' + sh.length + '장</b>' +
      (qs.length ? '<button class="btn" data-act="gradeAll">전체 채점</button><button class="btn ghost" data-act="resetAns">다시 풀기</button>' : '') + '</div>';
    var done = qs.length && qs.every(function (q) { return shown[q.id]; });
    if (done) { var sc = qs.filter(function (q) { return isCorrect(q, ans[q.id]); }).length; h += '<div class="score">점수: ' + sc + ' / ' + qs.length + '</div>'; }
    h += '</div>';
    var imgs = sh.filter(function (x) { return x.img; });
    if (imgs.length) h += '<div class="card"><h3>학습지</h3><div class="thumbs">' + imgs.map(function (x) { return '<img src="' + x.img + '" alt="' + esc(x.name) + '" data-act="img" data-id="' + x.id + '">'; }).join('') + '</div></div>';
    if (!qs.length) return h + '<div class="card muted">아직 등록된 문제가 없습니다.</div>';
    return h + qs.map(function (q, i) { return qCard(q, i); }).join('');
  }
  function qCard(q, i) {
    var a = ans[q.id], sh = shown[q.id], h = '<div class="card q"><span class="num">' + (i + 1) + '.</span><span class="tag">' + (q.type === 'mc' ? '객관식' : '단답형') + '</span><div class="qt">' + esc(q.q) + '</div>';
    if (q.type === 'mc') {
      h += (q.choices || []).map(function (c, j) {
        var cls = ''; if (sh) { if (j + 1 === Number(q.answer)) cls = ' right'; else if (Number(a) === j + 1) cls = ' wrong'; }
        return '<label class="ch' + cls + '"><input type="radio" name="q_' + q.id + '" data-change="pick" data-q="' + q.id + '" data-v="' + (j + 1) + '"' + (Number(a) === j + 1 ? ' checked' : '') + '><span>' + CIRC[j] + ' ' + esc(c) + '</span></label>';
      }).join('');
    } else h += '<div class="row"><input type="text" data-change="pick" data-q="' + q.id + '" value="' + esc(a || '') + '" placeholder="정답 입력"></div>';
    if (sh) h += '<div>' + (isCorrect(q, a) ? '<span class="ok">✔ 정답!</span>' : '<span class="no">✘ 오답</span>') + ' 정답: <b>' + ansText(q) + '</b></div>' + (q.explain ? '<div class="expl">' + esc(q.explain) + '</div>' : '');
    else h += '<div class="row"><button class="btn ghost sm" data-act="check" data-q="' + q.id + '">정답 확인</button></div>';
    return h + '</div>';
  }

  /* ----- 관리자 ----- */
  function adminView() {
    var T = [['sheets', '📷 학습지·문제 생성'], ['qs', '📝 문제 관리'], ['imp', '🤖 AI 앱에서 가져오기'], ['set', '⚙️ 설정·배포']];
    var h = '<div class="card row" style="margin-top:0">' + T.map(function (t) { return '<button class="btn' + (adminTab === t[0] ? '' : ' ghost') + '" data-act="tab" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
    h += '<div class="muted" style="margin:-4px 4px 10px">데이터 상태: ' + (S.fromRepo ? '저장소(content.json) 내용 그대로' : '이 브라우저에서 수정됨 (학생에게 공개하려면 ‘설정·배포’에서 내보내기)') + '</div>';
    if (adminTab === 'sheets') return h + adminSheets();
    if (adminTab === 'qs') return h + adminQs();
    if (adminTab === 'imp') return h + adminImp();
    return h + adminSet();
  }

  function adminSheets() {
    var sh = S.sheets.filter(function (x) { return x.subject === cur; });
    var h = '<div class="card"><h3>' + esc(cur) + ' 학습지 추가</h3><div class="row"><label class="btn">📷 사진 선택(여러 장 가능)<input type="file" accept="image/*" multiple hidden data-change="upload"></label>' +
      '<button class="btn ghost" data-act="addTextSheet">📝 텍스트로 추가</button></div><div class="muted">사진은 이 브라우저에 저장되어 페이지를 나갔다 와도 유지됩니다. 사진 → [글자 인식] → 내용 확인·수정 → [문제 만들기] 순서로 진행하세요.</div></div>';
    if (!sh.length) return h + '<div class="card muted">이 과목에는 아직 학습지가 없습니다.</div>';
    return h + sh.map(function (x) {
      var o = gopts[x.id] || { types: Object.keys(NaesinGen.TYPES), count: 5 };
      var types = Object.keys(NaesinGen.TYPES).map(function (k) { return '<label class="chk"><input type="checkbox" name="ty_' + x.id + '" value="' + k + '"' + (o.types.indexOf(k) >= 0 ? ' checked' : '') + '>' + NaesinGen.TYPES[k] + '</label>'; }).join('');
      var cnt = [3, 5, 8, 10, 15, 20].map(function (n) { return '<option' + (n === o.count ? ' selected' : '') + '>' + n + '</option>'; }).join('');
      return '<div class="card sheet"><div>' + (x.img ? '<img class="th" src="' + x.img + '" data-act="img" data-id="' + x.id + '" alt="">' : '<div class="muted">텍스트 학습지</div>') + '</div><div class="body">' +
        '<b>' + esc(x.name) + '</b><div class="row">' + (x.img ? '<button class="btn" data-act="ocr" data-id="' + x.id + '">🔍 글자 인식(OCR)</button>' : '') + '<span class="muted" id="prog_' + x.id + '"></span></div>' +
        '<textarea id="tx_' + x.id + '" rows="7" data-change="saveText" data-id="' + x.id + '" placeholder="글자 인식 결과(또는 학습지 내용)를 여기에 붙여넣거나 수정하세요. 줄바꿈·‘-’ 목록 형태가 좋습니다.">' + esc(x.text || '') + '</textarea>' +
        '<div class="row">' + types + '</div><div class="row">문제 수 <select id="cnt_' + x.id + '">' + cnt + '</select> <button class="btn" data-act="gen" data-id="' + x.id + '">⚙️ 문제 만들기</button> <button class="btn danger sm" data-act="delSheet" data-id="' + x.id + '">학습지 삭제</button></div>' +
        draftHtml(x.id) + '</div></div>';
    }).join('');
  }
  function draftHtml(id) {
    var d = drafts[id]; if (!d) return '';
    if (!d.list.length) return '<div class="muted">모든 초안을 제외했습니다.</div>';
    return '<div class="expl" style="white-space:normal"><b>미리보기 ' + d.list.length + '문제</b> <span class="muted">(글 ' + d.stats.sentences + '문장 · 용어 ' + d.stats.terms + '개 분석)</span>' +
      d.list.map(function (q, i) {
        return '<div style="margin:8px 0;padding-top:8px;border-top:1px dashed #d9cf90"><b>' + (i + 1) + '.</b> <span class="tag">' + esc(NaesinGen.TYPES[q.kind] || '') + '</span> <button class="btn ghost sm" data-act="dropDraft" data-id="' + id + '" data-q="' + q.id + '">제외</button>' +
          '<div style="white-space:pre-wrap">' + esc(q.q) + '</div>' + (q.type === 'mc' ? q.choices.map(function (c, j) { return '<div class="muted">' + CIRC[j] + ' ' + esc(c) + '</div>'; }).join('') : '') +
          '<div class="ok">정답: ' + ansText(q) + '</div></div>';
      }).join('') +
      '<div class="row"><button class="btn" data-act="addDraft" data-id="' + id + '">✅ 문제 은행에 추가</button><button class="btn ghost" data-act="gen" data-id="' + id + '">🔄 다시 만들기</button></div></div>';
  }

  function adminQs() {
    var qs = S.questions.filter(function (q) { return q.subject === cur; });
    var h = '<div class="card"><div class="row" style="margin:0"><b style="flex:1">' + esc(cur) + ' 문제 ' + qs.length + '개</b><button class="btn" data-act="newQ">＋ 문제 직접 추가</button>' +
      (qs.length ? '<button class="btn danger sm" data-act="delAllQ">이 과목 문제 전체 삭제</button>' : '') + '</div></div>';
    if (editing) h += editor();
    return h + qs.map(function (q, i) {
      return '<div class="card q"><span class="num">' + (i + 1) + '.</span><span class="tag">' + (q.type === 'mc' ? '객관식' : '단답형') + '</span><div class="qt">' + esc(q.q) + '</div>' +
        (q.type === 'mc' ? (q.choices || []).map(function (c, j) { return '<div class="muted">' + CIRC[j] + ' ' + esc(c) + '</div>'; }).join('') : '') +
        '<div class="ok">정답: ' + ansText(q) + '</div>' + (q.explain ? '<div class="muted">해설: ' + esc(q.explain) + '</div>' : '') +
        '<div class="row"><button class="btn ghost sm" data-act="editQ" data-q="' + q.id + '">수정</button><button class="btn danger sm" data-act="delQ" data-q="' + q.id + '">삭제</button></div></div>';
    }).join('');
  }
  function editor() {
    var q = editing;
    return '<div class="card" style="border-color:var(--c)"><h3>' + (q.isNew ? '문제 추가' : '문제 수정') + '</h3>' +
      '<div class="row"><select id="eT"><option value="mc"' + (q.type === 'mc' ? ' selected' : '') + '>객관식</option><option value="short"' + (q.type !== 'mc' ? ' selected' : '') + '>단답형</option></select></div>' +
      '<textarea id="eQ" rows="4" placeholder="문제">' + esc(q.q) + '</textarea>' +
      '<textarea id="eC" rows="5" placeholder="보기 (객관식: 한 줄에 하나씩, 2~5개)">' + esc((q.choices || []).join('\n')) + '</textarea>' +
      '<div class="row"><input type="text" id="eA" value="' + esc(q.answer) + '" placeholder="정답 (객관식은 번호, 단답형은 답. 여러 정답은 / 로 구분)" style="flex:1"></div>' +
      '<textarea id="eE" rows="3" placeholder="해설 (선택)">' + esc(q.explain || '') + '</textarea>' +
      '<div class="row"><button class="btn" data-act="saveQ">저장</button><button class="btn ghost" data-act="cancelQ">취소</button></div></div>';
  }

  function aiPrompt(n) {
    return "첨부한 사진은 고등학교 '" + cur + "' 수업 학습지입니다. 사진에 있는 내용만 근거로 고등학교 내신 기출 스타일 문제 " + n + "개를 만들어 주세요.\n" +
      "- 객관식(5지선다)과 단답형을 섞고, 자료 해석·적용형 문제도 포함하세요.\n- 사진에 없는 내용은 만들지 마세요.\n- 설명 없이 아래 JSON 형식만 출력하세요.\n" +
      '{"questions":[{"type":"mc","q":"문제","choices":["보기1","보기2","보기3","보기4","보기5"],"answer":3,"explain":"해설"},{"type":"short","q":"문제","answer":"정답","explain":"해설"}]}\n' +
      "(mc의 answer는 1~5 정수, short의 answer는 문자열)";
  }
  function adminImp() {
    return '<div class="card"><h3>API 키 없이 AI 품질로 만들기</h3><ol class="muted" style="margin:0;padding-left:20px"><li>아래 프롬프트를 복사합니다.</li><li>ChatGPT·Gemini·Claude 등 <b>이미 쓰는 AI 앱</b>에 학습지 사진과 함께 붙여넣어 보냅니다.</li><li>AI가 출력한 JSON을 아래 칸에 붙여넣고 [가져오기]를 누릅니다. (현재 과목: <b>' + esc(cur) + '</b>)</li></ol>' +
      '<div class="row">문제 수 <input type="number" id="impN" min="1" max="30" value="' + impN + '" style="width:80px" data-change="impN"></div>' +
      '<textarea id="pm" rows="9" readonly>' + esc(aiPrompt(impN)) + '</textarea><div class="row"><button class="btn" data-act="copyPrompt">📋 프롬프트 복사</button></div>' +
      '<textarea id="jsonIn" rows="8" placeholder="AI가 준 JSON을 여기에 붙여넣기"></textarea><div class="row"><button class="btn" data-act="importJson">가져오기</button></div></div>';
  }

  function adminSet() {
    var h = '<div class="card"><h3>과목 관리</h3><div class="row"><input type="text" id="ns" placeholder="새 과목명 (예: 물리학Ⅰ)"><button class="btn" data-act="addSub">추가</button></div>' +
      S.subjects.map(function (s) { return '<div class="row" style="margin:2px 0">' + esc(s) + ' <button class="btn danger sm" data-act="delSub" data-v="' + esc(s) + '">삭제</button></div>'; }).join('') + '</div>';
    h += '<div class="card"><h3>학생에게 공개 (GitHub에 올릴 데이터)</h3><div class="muted">이 브라우저에서 만든 문제를 <code>data/content.json</code> 파일로 내보내 저장소에 덮어쓰기(커밋)하면, 배포 후 모든 학생에게 보입니다.</div>' +
      '<div class="row"><label class="chk"><input type="checkbox" id="incImg"> 학습지 사진도 포함 (저작권·용량 주의, 공개 사이트에 노출됨)</label></div>' +
      '<div class="row"><button class="btn" data-act="exportContent">⬇ content.json 내보내기</button><label class="btn ghost">⬆ 파일 불러오기<input type="file" accept=".json,application/json" hidden data-change="importFile"></label>' +
      '<button class="btn ghost" data-act="resetRepo">↺ 저장소 데이터로 되돌리기</button></div></div>';
    h += '<div class="card"><h3>관리자 비밀번호</h3>' + (CFG.adminPasswordHash ? '<div class="muted">config.js의 비밀번호 해시를 사용 중입니다. 바꾸려면 config.js를 수정하세요.</div>' :
      '<div class="row"><input type="password" id="np" placeholder="새 비밀번호 (4자 이상)"><button class="btn" data-act="setPw">변경</button></div><div class="muted">이 비밀번호는 이 브라우저에만 저장됩니다.</div>') + '</div>';
    h += '<div class="card"><h3>해시 만들기 (config.js용)</h3><div class="muted">관리자 비밀번호 또는 학교 접속 코드를 SHA-256 해시로 바꿔 config.js에 붙여넣으세요.</div><div class="row"><input type="text" id="hin" placeholder="비밀번호/접속 코드"><button class="btn" data-act="makeHash">해시 생성</button></div><div id="hout" class="muted"></div></div>';
    h += '<div class="card muted">저장 방식: ' + ({ idb: 'IndexedDB (정상)', ls: 'localStorage (대체)', mem: '메모리 (닫으면 사라짐)' }[store.mode()]) + '</div>';
    return h;
  }

  /* ---------- 동작 ---------- */
  var A = {}, C = {};
  var sheetOf = function (id) { return S.sheets.filter(function (x) { return x.id === id; })[0]; };
  var qOf = function (id) { return S.questions.filter(function (x) { return x.id === id; })[0]; };

  A.subj = function (el) { cur = el.dataset.v; editing = null; render(); };
  A.tab = function (el) { adminTab = el.dataset.v; editing = null; render(); };
  A.img = function (el) { var x = sheetOf(el.dataset.id); var o = modal('<img src="' + x.img + '" alt="">', 'img'); o.addEventListener('click', function () { o.remove(); }); };
  A.check = function (el) { if (ans[el.dataset.q] == null || ans[el.dataset.q] === '') return toast('먼저 답을 고르거나 입력하세요'); shown[el.dataset.q] = true; render(); };
  A.gradeAll = function () { S.questions.filter(function (q) { return q.subject === cur; }).forEach(function (q) { shown[q.id] = true; }); render(); window.scrollTo(0, 0); };
  A.resetAns = function () { S.questions.filter(function (q) { return q.subject === cur; }).forEach(function (q) { delete ans[q.id]; delete shown[q.id]; }); render(); window.scrollTo(0, 0); };
  C.pick = function (el) { ans[el.dataset.q] = el.type === 'radio' ? Number(el.dataset.v) : el.value; if (shown[el.dataset.q]) { delete shown[el.dataset.q]; render(); } };

  A.adminToggle = function () {
    if (isAdmin) { isAdmin = false; setAdminFlag(false); render(); return; }
    var hash = CFG.adminPasswordHash || S.pw;
    if (!hash) {
      return ask('처음 사용입니다. 이 기기에서 사용할 관리자 비밀번호를 정하세요 (4자 이상)', { input: true, password: true }).then(function (p) {
        if (!p) return; if (p.length < 4) return toast('4자 이상으로 정해 주세요');
        return ask('비밀번호를 한 번 더 입력하세요', { input: true, password: true }).then(function (p2) {
          if (p2 !== p) return toast('비밀번호가 서로 다릅니다');
          return sha256(p).then(function (h) { S.pw = h; return store.set(S); }).then(function () { isAdmin = true; setAdminFlag(true); render(); toast('관리자 모드가 켜졌습니다'); });
        });
      });
    }
    return ask('관리자 비밀번호를 입력하세요', { input: true, password: true }).then(function (p) {
      if (p === null) return;
      return sha256(p).then(function (h) { if (h !== hash) return toast('비밀번호가 틀렸습니다'); isAdmin = true; setAdminFlag(true); render(); });
    });
  };

  C.upload = function (el) {
    var files = Array.prototype.slice.call(el.files || []); if (!files.length) return;
    toast('사진 처리 중…');
    return files.reduce(function (p, f) {
      return p.then(function () { return readFile(f).then(function (d) { return shrink(d, 1800, 0.82); }).then(function (img) { S.sheets.push({ id: uid(), subject: cur, name: f.name, img: img, text: '' }); }); });
    }, Promise.resolve()).then(commit).then(function () { render(); toast(files.length + '장 업로드 완료'); });
  };
  A.addTextSheet = function () { S.sheets.push({ id: uid(), subject: cur, name: '텍스트 학습지 ' + (S.sheets.length + 1), img: '', text: '' }); return commit().then(render); };
  A.delSheet = function (el) { return ask('이 학습지를 삭제할까요? (이미 만든 문제는 유지됩니다)').then(function (ok) { if (!ok) return; S.sheets = S.sheets.filter(function (x) { return x.id !== el.dataset.id; }); delete drafts[el.dataset.id]; return commit().then(render); }); };
  C.saveText = function (el) { var x = sheetOf(el.dataset.id); if (x) { x.text = el.value; return commit(); } };

  A.ocr = function (el) {
    var id = el.dataset.id, x = sheetOf(id), prog = $('#prog_' + id);
    prog.textContent = 'OCR 엔진 불러오는 중… (처음 한 번, 수십 초 걸릴 수 있어요)'; el.disabled = true;
    return loadScript(TESS_URL).then(function () { return prepOcr(x.img); }).then(function (img) {
      return Tesseract.recognize(img, 'kor+eng', { logger: function (m) { if (m.status === 'recognizing text') prog.textContent = '글자 인식 중… ' + Math.round(m.progress * 100) + '%'; else if (m.status) prog.textContent = '준비 중… (' + m.status + ')'; } });
    }).then(function (res) {
      x.text = (res.data.text || '').replace(/[ \t]+\n/g, '\n').trim();
      return commit().then(function () { render(); toast('글자 인식 완료! 내용을 확인하고 잘못된 글자를 고쳐 주세요'); });
    }).catch(function (e) { prog.textContent = '실패: ' + (e.message || e); el.disabled = false; });
  };

  A.gen = function (el) {
    var id = el.dataset.id, x = sheetOf(id), ta = $('#tx_' + id);
    if (ta) x.text = ta.value;
    var typeEls = $$('input[name="ty_' + id + '"]:checked'), cnt = $('#cnt_' + id);
    var types = typeEls.map(function (i) { return i.value; }), count = cnt ? Number(cnt.value) : 5;
    if (!typeEls.length && $$('input[name="ty_' + id + '"]').length) return toast('문제 유형을 하나 이상 선택하세요');
    gopts[id] = { types: types.length ? types : Object.keys(NaesinGen.TYPES), count: count };
    if (!(x.text || '').trim()) return toast('학습지 내용이 비어 있습니다. 글자 인식을 하거나 직접 입력하세요');
    var r = NaesinGen.generate(x.text, { count: count, types: gopts[id].types });
    if (!r.questions.length) { drafts[id] = { list: [], stats: r.stats }; render(); return toast('문제를 만들기에 글이 부족합니다. 문장 단위(~이다/~하였다)로 된 내용이 5문장 이상 필요해요'); }
    drafts[id] = { stats: r.stats, list: r.questions.map(function (q) { return Object.assign({}, q, { id: uid(), subject: x.subject, sheetId: id }); }) };
    return commit().then(function () { render(); if (r.questions.length < count) toast(r.questions.length + '문제만 만들어졌어요 (글 분량 부족)'); });
  };
  A.dropDraft = function (el) { var d = drafts[el.dataset.id]; d.list = d.list.filter(function (q) { return q.id !== el.dataset.q; }); render(); };
  A.addDraft = function (el) {
    var d = drafts[el.dataset.id]; if (!d || !d.list.length) return;
    d.list.forEach(function (q) { var c = Object.assign({}, q); delete c.kind; S.questions.push(c); });
    var n = d.list.length; delete drafts[el.dataset.id]; adminTab = 'qs';
    return commit().then(function () { render(); toast(n + '문제를 추가했습니다. 내용을 검수해 주세요'); });
  };

  A.newQ = function () { editing = { isNew: true, type: 'mc', q: '', choices: ['', '', '', '', ''], answer: '', explain: '' }; render(); };
  A.editQ = function (el) { var q = qOf(el.dataset.q); editing = Object.assign({}, q, { choices: (q.choices || []).slice() }); render(); window.scrollTo(0, 0); };
  A.cancelQ = function () { editing = null; render(); };
  A.saveQ = function () {
    var type = $('#eT').value, o = { type: type, q: $('#eQ').value.trim(), choices: type === 'mc' ? $('#eC').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean) : [], answer: $('#eA').value.trim(), explain: $('#eE').value.trim() };
    if (!o.q) return toast('문제를 입력하세요');
    if (!o.answer) return toast('정답을 입력하세요');
    if (type === 'mc') {
      if (o.choices.length < 2) return toast('보기를 2개 이상 입력하세요');
      var n = parseInt(o.answer, 10); if (isNaN(n) || n < 1 || n > o.choices.length) return toast('정답은 1~' + o.choices.length + ' 사이 번호로 입력하세요'); o.answer = n;
    }
    if (editing.isNew) S.questions.push(Object.assign({ id: uid(), subject: cur }, o)); else Object.assign(qOf(editing.id), o);
    editing = null; return commit().then(function () { render(); toast('저장했습니다'); });
  };
  A.delQ = function (el) { return ask('이 문제를 삭제할까요?').then(function (ok) { if (!ok) return; S.questions = S.questions.filter(function (q) { return q.id !== el.dataset.q; }); return commit().then(render); }); };
  A.delAllQ = function () { return ask(cur + ' 과목의 문제를 모두 삭제할까요?').then(function (ok) { if (!ok) return; S.questions = S.questions.filter(function (q) { return q.subject !== cur; }); return commit().then(render); }); };

  C.impN = function (el) { impN = Math.max(1, Math.min(30, Number(el.value) || 8)); var pm = $('#pm'); if (pm) pm.value = aiPrompt(impN); };
  A.copyPrompt = function () {
    var pm = $('#pm'), done = function () { toast('복사했습니다'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(pm.value).then(done, function () { pm.select(); document.execCommand('copy'); done(); });
    else { pm.select(); document.execCommand('copy'); done(); }
  };
  function parseQuestions(text) {
    var t = String(text).replace(/```(?:json)?/gi, '').trim(), s = t.search(/[\[{]/), e = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    if (s < 0 || e < s) throw new Error('JSON을 찾을 수 없습니다');
    var d = JSON.parse(t.slice(s, e + 1)), arr = Array.isArray(d) ? d : d.questions;
    if (!Array.isArray(arr)) throw new Error('questions 배열이 없습니다');
    var out = [];
    arr.forEach(function (q) {
      if (!q || !q.q) return;
      var ch = Array.isArray(q.choices) ? q.choices.map(String) : [], isMc = ch.length >= 2 && q.type !== 'short';
      var a = q.answer; if (isMc) { a = parseInt(a, 10); if (isNaN(a) || a < 1 || a > ch.length) return; } else a = String(a == null ? '' : a); if (!isMc && !a) return;
      out.push({ type: isMc ? 'mc' : 'short', q: String(q.q), choices: isMc ? ch : [], answer: a, explain: String(q.explain || '') });
    });
    if (!out.length) throw new Error('쓸 수 있는 문제가 없습니다');
    return out;
  }
  A.importJson = function () {
    try {
      var qs = parseQuestions($('#jsonIn').value);
      qs.forEach(function (q) { S.questions.push(Object.assign({ id: uid(), subject: cur }, q)); });
      adminTab = 'qs'; return commit().then(function () { render(); toast(qs.length + '문제를 ' + cur + ' 과목에 추가했습니다'); });
    } catch (e) { toast('가져오기 실패: ' + e.message); }
  };

  A.addSub = function () { var v = $('#ns').value.trim(); if (!v) return; if (S.subjects.indexOf(v) >= 0) return toast('이미 있는 과목입니다'); S.subjects.push(v); return commit().then(function () { render(); }); };
  A.delSub = function (el) {
    var s = el.dataset.v; if (S.subjects.length <= 1) return toast('과목은 최소 1개 필요합니다');
    return ask("'" + s + "' 과목과 그 학습지·문제를 모두 삭제할까요?").then(function (ok) {
      if (!ok) return; S.subjects = S.subjects.filter(function (x) { return x !== s; }); S.sheets = S.sheets.filter(function (x) { return x.subject !== s; }); S.questions = S.questions.filter(function (x) { return x.subject !== s; });
      if (cur === s) cur = S.subjects[0]; return commit().then(render);
    });
  };
  A.setPw = function () { var v = $('#np').value; if (v.length < 4) return toast('4자 이상 입력하세요'); return sha256(v).then(function (h) { S.pw = h; return store.set(S); }).then(function () { $('#np').value = ''; toast('비밀번호를 바꿨습니다'); }); };
  A.makeHash = function () { var v = $('#hin').value; if (!v) return; return sha256(v).then(function (h) { $('#hout').innerHTML = '해시: <code>' + h + '</code>'; }); };

  A.exportContent = function () {
    var inc = $('#incImg').checked;
    return S.sheets.reduce(function (p, s) {
      return p.then(function (arr) { return (inc && s.img ? shrink(s.img, 1100, 0.7) : Promise.resolve('')).then(function (img) { arr.push({ id: s.id, subject: s.subject, name: s.name, img: img, text: '' }); return arr; }); });
    }, Promise.resolve([])).then(function (sheets) {
      download('content.json', JSON.stringify({ version: 1, updated: new Date().toISOString(), subjects: S.subjects, sheets: sheets, questions: S.questions }));
      toast('content.json 저장됨 → 저장소의 data/content.json 에 덮어쓰기(커밋) 하세요');
    });
  };
  C.importFile = function (el) {
    var f = el.files && el.files[0]; if (!f) return;
    return f.text().then(function (t) {
      var d = JSON.parse(t); if (!d.questions) throw new Error('올바른 content.json이 아닙니다');
      return ask('현재 데이터를 이 파일 내용으로 덮어쓸까요?').then(function (ok) {
        if (!ok) return; var n = normalize(d); S.subjects = n.subjects; S.sheets = n.sheets; S.questions = n.questions; cur = S.subjects[0];
        return commit().then(function () { render(); toast('불러왔습니다'); });
      });
    }).catch(function (e) { toast('불러오기 실패: ' + e.message); });
  };
  A.resetRepo = function () {
    return ask('이 브라우저에서 수정한 내용을 버리고 저장소(content.json) 데이터로 되돌릴까요?').then(function (ok) {
      if (!ok) return; var pw = S.pw; S.fromRepo = true;
      return store.set(Object.assign({}, S, { fromRepo: true, sheets: [], questions: [] })).then(function () { return loadRepo(pw); }).then(function () { render(); toast('저장소 데이터로 되돌렸습니다'); });
    });
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-act]'); if (!el || !A[el.dataset.act]) return;
    Promise.resolve().then(function () { return A[el.dataset.act](el, e); }).catch(function (err) { toast('오류: ' + (err && err.message || err)); });
  });
  document.addEventListener('change', function (e) {
    var el = e.target.closest && e.target.closest('[data-change]'); if (!el || !C[el.dataset.change]) return;
    Promise.resolve().then(function () { return C[el.dataset.change](el, e); }).catch(function (err) { toast('오류: ' + (err && err.message || err)); });
  });

  /* ---------- 시작 ---------- */
  function gate() {
    if (!CFG.accessCodeHash) return Promise.resolve(true);
    var ok = false; try { ok = localStorage.getItem('naesin_access') === CFG.accessCodeHash; } catch (e) { }
    if (ok) return Promise.resolve(true);
    return new Promise(function (res) {
      $('#app').innerHTML = '<div class="lock card"><h3>🔒 ' + esc(CFG.schoolName) + '</h3><p class="muted">학교에서 안내받은 접속 코드를 입력하세요.</p><input type="password" id="ac" style="width:100%"><div class="row" style="justify-content:center"><button class="btn" id="acb">입장</button></div><div id="acm" class="no"></div></div>';
      var go = function () { sha256($('#ac').value.trim()).then(function (h) { if (h === CFG.accessCodeHash) { try { localStorage.setItem('naesin_access', h); } catch (e) { } res(true); } else $('#acm').textContent = '코드가 올바르지 않습니다.'; }); };
      $('#acb').onclick = go; $('#ac').onkeydown = function (e) { if (e.key === 'Enter') go(); };
    });
  }
  function loadRepo(pw) {
    return fetch(CFG.contentUrl + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('no content'); return r.json(); })
      .then(function (d) { S = normalize(Object.assign({}, d, { fromRepo: true, pw: pw || (S && S.pw) })); return store.set(S).catch(function () { }); })
      .catch(function () { if (!S) S = normalize({ fromRepo: true, pw: pw }); });
  }
  function boot() {
    return store.init().then(gate).then(function () { return store.get(); }).then(function (local) {
      if (local && !local.fromRepo) { S = normalize(local); return; }
      S = local ? normalize(local) : null;
      return loadRepo(local && local.pw);
    }).then(function () {
      cur = S.subjects[0];
      try { isAdmin = sessionStorage.getItem('naesin_admin') === '1'; } catch (e) { }
      render();
    });
  }
  boot().catch(function (e) { $('#app').innerHTML = '<div class="card" style="margin:20px">시작 중 오류가 발생했습니다: ' + esc(e && e.message || e) + '</div>'; });

  window.__naesin = { sha256js: sha256js, parseQuestions: parseQuestions };
})();
