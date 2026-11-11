// Правила стола, без DOM и сети. Подключается и со страницы, и из node-тестов.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KtoTable = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function flag(v) {
    if (v === true || v === false) return v;
    if (v === "true") return true;
    if (v === "false") return false;
    return null;
  }
  function genderOf(v) {
    const s = String(v || "").trim().toLowerCase();
    return s === "male" || s === "female" || s === "other" ? s : null;
  }
  function tagsOf(v) {
    const list = Array.isArray(v) ? v : (typeof v === "string" && v.trim() ? v.split(",") : []);
    return list.map(t => String(t).trim()).filter(Boolean).slice(0, 12).map(t => t.slice(0, 32));
  }
  // Карточка из базы или из presence. Новая форма: name, theme, gender, alive, real_person, tags.
  // Старая форма name + source тоже остаётся карточкой.
  function validCard(c) {
    if (!c || typeof c !== "object") return null;
    const name = c.n != null ? c.n : c.name;
    if (name == null) return null;
    const key = c.k != null && String(c.k) !== "" ? c.k : (c.id != null ? c.id : name);
    const theme = c.theme != null ? c.theme : (c.theme_id != null ? c.theme_id : "");
    return {
      k: String(key),
      n: String(name).slice(0, 60),
      s: String(c.s != null ? c.s : (c.source || "")).slice(0, 60),
      theme: String(theme || "").slice(0, 32),
      gender: genderOf(c.gender != null ? c.gender : c.g),
      alive: flag(c.alive != null ? c.alive : c.a),
      real_person: flag(c.real_person != null ? c.real_person : c.r),
      tags: tagsOf(c.tags),
    };
  }

  function dealOf(p) {
    const deal = {};
    if (!p || !p.deal || typeof p.deal !== "object") return deal;
    for (const id in p.deal) {
      const c = validCard(p.deal[id]);
      if (c) deal[id] = c;
    }
    return deal;
  }

  function clean(m) {
    if (!m || typeof m !== "object") return null;
    return {
      id: String(m.id || ""),
      name: String(m.name || "Игрок").slice(0, 24),
      at: Number(m.at) || 0,
      score: Number(m.score) || 0,
      revealed: !!m.revealed,
      card: validCard(m.card),
      round: Number(m.round) || 0,
      phase: m.phase === "play" ? "play" : "lobby",
      themes: Array.isArray(m.themes) ? m.themes.map(String).slice(0, 50) : [],
      deal: dealOf(m),
    };
  }

  const before = (a, b) => a.at < b.at || (a.at === b.at && a.id < b.id);
  function hostOf(list) { return list.reduce((a, b) => before(b, a) ? b : a); }
  function stateOf(list) {
    return list.reduce((a, b) => (b.round > a.round || (b.round === a.round && before(b, a))) ? b : a);
  }

  // Новый игрок садится после всех, кто уже за столом, даже если часы устройства отстают.
  function clampAt(now, others) {
    let floor = now;
    for (const p of others || []) {
      const at = Number(p.at);
      if (Number.isFinite(at) && at + 1 > floor) floor = at + 1;
    }
    return floor;
  }

  function cardTaken(deal, key) {
    if (key == null || key === "") return false;
    const want = String(key);
    return Object.keys(deal || {}).some(id => deal[id] && String(deal[id].k) === want);
  }

  function dealSignature(deal) {
    const d = deal || {};
    return Object.keys(d).sort().map(id => id + "=" + (d[id] ? d[id].k : "")).join("|");
  }

  // Уже выданная карточка остаётся за игроком. Один персонаж не уходит двум людям.
  function mergeDeal(base, incoming) {
    const deal = dealOf({ deal: base });
    const used = new Set(Object.keys(deal).map(id => deal[id].k));
    const extra = dealOf({ deal: incoming });
    for (const id of Object.keys(extra)) {
      if (deal[id] || used.has(extra[id].k)) continue;
      deal[id] = extra[id];
      used.add(extra[id].k);
    }
    return deal;
  }

  function adoptPlayer(me, st, saved) {
    const liveDeal = st.phase === "play" ? dealOf(st) : null;
    const next = {
      id: me.id,
      name: me.name,
      at: me.at,
      score: me.score || 0,
      round: st.round,
      phase: st.phase,
      themes: Array.isArray(st.themes) ? st.themes.slice() : [],
      deal: liveDeal,
      revealed: false,
      card: null,
    };
    if (st.phase !== "play") return next;
    const sameRound = !!(saved && Number(saved.round) === st.round && saved.phase === "play");
    const savedCard = sameRound ? validCard(saved.card) : null;
    const mine = liveDeal[me.id];
    if (mine) {
      next.card = mine;
      next.revealed = !!(savedCard && saved.revealed && savedCard.k === mine.k);
      return next;
    }
    if (savedCard && !cardTaken(liveDeal, savedCard.k)) {
      next.card = savedCard;
      next.revealed = !!saved.revealed;
    }
    return next;
  }

  function resumePlayer(me, saved, now) {
    const card = validCard(saved && saved.card);
    const phase = saved && saved.phase === "play" && card ? "play" : "lobby";
    return {
      id: me.id,
      name: me.name,
      at: Number(saved && saved.at) || now,
      score: Number(saved && saved.score) || 0,
      revealed: phase === "play" && !!(saved && saved.revealed),
      card: phase === "play" ? card : null,
      round: Number(saved && saved.round) || 0,
      phase,
      themes: Array.isArray(saved && saved.themes) ? saved.themes.map(String).slice(0, 50) : [],
      deal: phase === "play" ? dealOf(saved) : null,
    };
  }

  // Если за столом уже кто-то есть, их раунд важнее сохранённого на устройстве.
  function openingState(me, saved, others, now) {
    const score = Number(saved && saved.score) || 0;
    if (others && others.length) {
      return adoptPlayer({
        id: me.id, name: me.name, at: clampAt(now, others), score,
      }, stateOf(others), saved);
    }
    return resumePlayer({ id: me.id, name: me.name, score }, saved, now);
  }

  function reconcilePlayer(me, others) {
    if (!me || !others || !others.length) return { me, changed: false };
    const st = stateOf(others.concat([me]));
    if (!st || st.id === me.id) return { me, changed: false };
    if (st.round > me.round || (st.round === me.round && st.phase !== me.phase)) {
      const kept = st.round === me.round ? { round: me.round, phase: me.phase, card: me.card, revealed: me.revealed } : null;
      return { me: adoptPlayer(me, st, kept), changed: true };
    }
    if (st.phase !== "play") return { me, changed: false };
    const incoming = dealOf(st);
    if (!Object.keys(incoming).length) return { me, changed: false };
    const deal = mergeDeal(me.deal, incoming);
    let card = me.card;
    let revealed = me.revealed;
    let changed = dealSignature(deal) !== dealSignature(me.deal);
    const assigned = deal[me.id];
    if (assigned && (!card || card.k !== assigned.k)) {
      card = assigned;
      revealed = false;
      changed = true;
    }
    if (!changed) return { me, changed: false };
    return { me: Object.assign({}, me, { deal, card, revealed }), changed: true };
  }

  function planDeal(deal, seated, pool) {
    const visible = {};
    const known = dealOf({ deal });
    for (const p of seated || []) {
      const card = validCard(p.card);
      if (!card || known[p.id]) continue;
      visible[p.id] = card;
    }
    let next = mergeDeal(known, visible);
    const used = new Set(Object.keys(next).map(id => next[id].k));
    const avail = (pool || []).map(validCard).filter(c => c && !used.has(c.k));
    for (const p of seated || []) {
      if (validCard(p.card) || next[p.id] || !avail.length) continue;
      const c = avail.pop();
      next[p.id] = c;
      used.add(c.k);
    }
    return next;
  }

  function needsDeal(deal, seated) {
    const next = planDeal(deal, seated, []);
    if (dealSignature(next) !== dealSignature(deal)) return true;
    return (seated || []).some(p => !validCard(p.card) && !next[p.id]);
  }

  return {
    validCard, clean, before, hostOf, stateOf, clampAt, mergeDeal, dealSignature,
    openingState, reconcilePlayer, planDeal, needsDeal,
  };
});
