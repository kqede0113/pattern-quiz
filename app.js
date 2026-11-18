(() => {
  "use strict";
  const DATA = window.QUIZ_DATA;
  const STORE_KEY = "pattern-quiz:v1";
  const $ = (id) => document.getElementById(id);

  if (!DATA || !DATA.sections) {
    document.querySelector("main").innerHTML =
      '<div class="panel">data.js が読み込めませんでした。<code>python3 build.py</code> を実行してください。</div>';
    return;
  }

  // ---------- 保存 ----------
  const store = (() => {
    let s;
    try { s = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { s = {}; }
    s.status = s.status || {};   // id -> "ok" | "ng"
    s.drafts = s.drafts || {};   // id -> 記述解答の下書き
    s.settings = s.settings || {};
    return s;
  })();
  const save = () => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* 容量超過などは無視 */ }
  };

  // ---------- データ ----------
  const allCards = [];
  DATA.sections.forEach((sec) => sec.cards.forEach((c) => allCards.push({ ...c, sec })));
  const statusOf = (id) => store.status[id] || "new";
  const STATUS_LABEL = { ok: "覚えた", ng: "まだ", new: "未学習" };

  // ---------- テキスト整形（エスケープ＋最低限のMarkdown） ----------
  const esc = (t) => t.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const inline = (t) => esc(t)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  function md(text) {
    const blocks = text.split(/\n{2,}/);
    return blocks.map((b) => {
      const lines = b.split("\n").filter((l) => l.trim() !== "");
      if (lines.length && lines.every((l) => /^\s*([-*・]|\d+[.)])\s+/.test(l))) {
        return "<ul>" + lines.map((l) => "<li>" + inline(l.replace(/^\s*([-*・]|\d+[.)])\s+/, "")) + "</li>").join("") + "</ul>";
      }
      return "<p>" + lines.map(inline).join("<br>") + "</p>";
    }).join("");
  }

  // ---------- ホーム ----------
  $("app-title").textContent = "パターン認識 暗記カード";
  document.title = DATA.title || document.title;
  const selected = new Set(store.settings.sections || DATA.sections.map((s) => s.id));
  // データ差し替えで消えた節は除外
  [...selected].forEach((id) => { if (!DATA.sections.some((s) => s.id === id)) selected.delete(id); });
  if (store.settings.mode) {
    const r = document.querySelector(`input[name=mode][value=${store.settings.mode}]`);
    if (r) r.checked = true;
  }
  if (typeof store.settings.shuffle === "boolean") $("opt-shuffle").checked = store.settings.shuffle;

  const getMode = () => document.querySelector("input[name=mode]:checked").value;
  const modeFilter = (c, mode) => {
    if (mode === "ng") return statusOf(c.id) === "ng";
    if (mode === "weak") return statusOf(c.id) !== "ok";
    if (mode === "important") return !!c.important;
    if (mode === "ex3") return !!c.ex3;
    return true;
  };

  function renderHome() {
    const counts = { ok: 0, ng: 0, new: 0 };
    allCards.forEach((c) => counts[statusOf(c.id)]++);
    $("summary").innerHTML =
      `<div class="stat ok"><b>${counts.ok}</b><span>覚えた</span></div>` +
      `<div class="stat ng"><b>${counts.ng}</b><span>まだ</span></div>` +
      `<div class="stat new"><b>${counts.new}</b><span>未学習</span></div>`;

    $("section-list").innerHTML = DATA.sections.map((s) => {
      const n = s.cards.length;
      const ok = s.cards.filter((c) => statusOf(c.id) === "ok").length;
      const ng = s.cards.filter((c) => statusOf(c.id) === "ng").length;
      return `<li><label>
        <input type="checkbox" value="${s.id}" ${selected.has(s.id) ? "checked" : ""}>
        <div>
          <div class="sec-name"><span class="num">${esc(s.num)}</span>${esc(s.short)}${s.written ? '<span class="tag">記述</span>' : ""}${s.cards.some((c)=>c.ex3) ? '<span class="tag-ex3">演習③</span>' : ""}${s.cards.some((c)=>c.important) ? '<span class="tag-imp">重要</span>' : ""}</div>
          <div class="sec-bar"><i class="b-ok" style="width:${(ok / n) * 100}%"></i><i class="b-ng" style="width:${(ng / n) * 100}%"></i></div>
          <div class="sec-stat">${n}問 ・ 覚えた ${ok} ・ まだ ${ng}</div>
        </div></label></li>`;
    }).join("");
    updateStartCount();
    $("data-info").textContent = `収録: ${DATA.sections.length}節 / ${allCards.length}問（データ版 ${DATA.version || "-"}）`;
  }

  function buildDeck(mode = getMode()) {
    return allCards.filter((c) => selected.has(c.sec.id) && modeFilter(c, mode));
  }
  function updateStartCount() {
    const n = buildDeck().length;
    $("start-count").textContent = `（${n}問）`;
    $("btn-start").disabled = n === 0;
  }
  function persistSettings() {
    store.settings.sections = [...selected];
    store.settings.mode = getMode();
    store.settings.shuffle = $("opt-shuffle").checked;
    save();
  }

  $("section-list").addEventListener("change", (e) => {
    if (e.target.type !== "checkbox") return;
    e.target.checked ? selected.add(e.target.value) : selected.delete(e.target.value);
    persistSettings(); updateStartCount();
  });
  $("sec-all").onclick = () => { DATA.sections.forEach((s) => selected.add(s.id)); persistSettings(); renderHome(); };
  $("sec-none").onclick = () => { selected.clear(); persistSettings(); renderHome(); };
  $("mode-group").addEventListener("change", () => { persistSettings(); updateStartCount(); });
  $("opt-shuffle").addEventListener("change", persistSettings);
  $("btn-reset").onclick = () => {
    if (!confirm("「覚えた/まだ」の記録と、記述問題の下書きをすべて消します。よろしいですか？")) return;
    store.status = {}; store.drafts = {}; save(); renderHome();
  };

  // ---------- 学習 ----------
  let deck = [], idx = 0, revealed = false, lastRange = null;

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function startDeck(cards) {
    deck = $("opt-shuffle").checked ? shuffle([...cards]) : [...cards];
    if (!deck.length) { alert("該当する問題がありません。"); return; }
    idx = 0;
    show("study");
    renderCard();
  }

  function show(view) {
    ["home", "study", "done"].forEach((v) => ($("view-" + v).hidden = v !== view));
    $("btn-home").hidden = view === "home";
    $("top-count").textContent = "";
    if (view === "home") renderHome();
    window.scrollTo(0, 0);
  }

  function renderCard() {
    const c = deck[idx];
    revealed = false;
    const isW = c.type === "written";
    $("card").classList.toggle("written", isW);
    $("card-sec").textContent = `${c.sec.num}. ${c.sec.short}`;
    const items = (c.items && c.items.length) ? c.items : (c.sec.num ? [Number(c.sec.num)] : []);
    const tags = [];
    if (items.length) tags.push(`<span class="tag-item">項目${items.join("・")}</span>`);
    if (c.ex3) tags.push('<span class="tag-ex3">演習③</span>');
    if (c.important) tags.push('<span class="tag-imp">重要</span>');
    $("card-tags").innerHTML = tags.join("");
    $("card-label").textContent = isW ? `予想記述 ${c.label.replace(/^問題/, "問題 ")}` : c.label;
    $("card-q").innerHTML = md(c.q);
    $("card-a-body").innerHTML = md(c.a);
    $("a-head").textContent = isW ? "模範解答の骨子" : "答え";
    $("card-a").hidden = true;
    $("written-box").hidden = !isW;
    if (isW) {
      $("draft").value = store.drafts[c.id] || "";
      $("draft-len").textContent = $("draft").value.length;
    }
    $("flip-hint").hidden = false;
    $("flip-hint").textContent = isW ? "書けたら「骨子を見る」で模範解答と比べよう" : "タップして答えを見る";
    $("btn-reveal").textContent = isW ? "骨子を見る" : "答えを見る";
    $("btn-reveal").disabled = false;
    $("btn-prev").disabled = idx === 0;
    $("btn-next").textContent = idx === deck.length - 1 ? "結果へ →" : "次へ →";
    $("top-count").textContent = `${idx + 1} / ${deck.length}`;
    $("progress-bar").style.width = `${(idx / deck.length) * 100}%`;
    renderStatus();
  }
  function renderStatus() {
    const st = statusOf(deck[idx].id);
    const b = $("card-status");
    b.textContent = STATUS_LABEL[st];
    b.className = "badge s-" + st;
    $("btn-ok").classList.toggle("on", st === "ok");
    $("btn-ng").classList.toggle("on", st === "ng");
  }
  function reveal() {
    if (revealed) return;
    revealed = true;
    $("card-a").hidden = false;
    $("flip-hint").hidden = true;
    $("btn-reveal").disabled = true;
    if (deck[idx].type === "written") $("card-a").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function next() {
    if (idx < deck.length - 1) { idx++; renderCard(); window.scrollTo(0, 0); }
    else finish();
  }
  function prev() { if (idx > 0) { idx--; renderCard(); window.scrollTo(0, 0); } }
  let judging = false;
  function judge(st) {
    if (judging) return;
    judging = true;
    store.status[deck[idx].id] = st;
    save();
    renderStatus();
    setTimeout(() => { judging = false; next(); }, 180);
  }
  function finish() {
    lastRange = deck.slice();
    const ok = deck.filter((c) => statusOf(c.id) === "ok").length;
    const ng = deck.filter((c) => statusOf(c.id) === "ng").length;
    const rest = deck.length - ok - ng;
    $("done-text").innerHTML = `${deck.length}問 中、<b style="color:var(--ok)">覚えた ${ok}</b> ・ <b style="color:var(--ng)">まだ ${ng}</b>` +
      (rest ? ` ・ 未判定 ${rest}` : "");
    $("btn-retry-ng").disabled = ng === 0;
    show("done");
    $("progress-bar").style.width = "100%";
  }

  $("card").addEventListener("click", (e) => {
    if (deck[idx].type === "written") return; // 記述問題は入力欄があるのでボタンでめくる
    if (e.target.closest("a, button, textarea")) return;
    reveal();
  });
  $("btn-reveal").onclick = reveal;
  $("btn-next").onclick = next;
  $("btn-prev").onclick = prev;
  $("btn-ok").onclick = () => judge("ok");
  $("btn-ng").onclick = () => judge("ng");
  $("draft").addEventListener("input", (e) => {
    const c = deck[idx];
    if (e.target.value) store.drafts[c.id] = e.target.value; else delete store.drafts[c.id];
    $("draft-len").textContent = e.target.value.length;
    save();
  });
  $("btn-start").onclick = () => { persistSettings(); startDeck(buildDeck()); };
  $("btn-home").onclick = () => show("home");
  $("btn-done-home").onclick = () => show("home");
  $("btn-retry-all").onclick = () => startDeck(lastRange || []);
  $("btn-retry-ng").onclick = () => startDeck((lastRange || []).filter((c) => statusOf(c.id) === "ng"));

  document.addEventListener("keydown", (e) => {
    if ($("view-study").hidden || e.target.tagName === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === " " || k === "Enter") {
      if (e.target.tagName === "BUTTON") return; // フォーカス中のボタンは通常どおり押させる
      e.preventDefault(); reveal();
    }
    else if (k === "ArrowRight") next();
    else if (k === "ArrowLeft") prev();
    else if (k === "1" || k === "o" || k === "O") judge("ok");
    else if (k === "2" || k === "x" || k === "X") judge("ng");
    else if (k === "Escape") show("home");
  });

  show("home");
})();
