import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const T = createRequire(import.meta.url)("./table.js");

const card = (k, n) => ({ k, n, s: n });
const player = (id, over = {}) => ({
  id, name: id, at: over.at ?? 1000, score: 0, revealed: false, card: null,
  round: 0, phase: "lobby", themes: [], deal: {}, ...over,
});

test("чужой более высокий раунд не перебивает живой стол", () => {
  const saved = { round: 5, phase: "play", card: card("a", "Нео"), score: 3, revealed: true, at: 1 };
  const live = player("host", { at: 500, round: 1, phase: "play", themes: ["films"], deal: { host: card("b", "Леон") } });
  const me = T.openingState({ id: "me", name: "Я" }, saved, [live], 9000);
  assert.equal(me.round, 1);
  assert.equal(me.phase, "play");
  assert.equal(me.card, null);
  assert.equal(me.score, 3);
  assert.ok(me.at > live.at);
});

test("в том же раунде возвращается своя карточка и очко", () => {
  const mine = card("a", "Нео");
  const saved = { round: 2, phase: "play", card: mine, score: 4, revealed: true };
  const host = player("host", { at: 10, round: 2, phase: "play", deal: { me: mine, host: card("b", "Леон") } });
  const me = T.openingState({ id: "me", name: "Я" }, saved, [host], 50);
  assert.equal(me.card.k, "a");
  assert.equal(me.revealed, true);
  assert.equal(me.score, 4);
});

test("свою карточку не вернуть, если её уже отдали другому", () => {
  const saved = { round: 2, phase: "play", card: card("a", "Нео"), revealed: true, score: 1 };
  const host = player("host", { at: 10, round: 2, phase: "play", deal: { other: card("a", "Нео") } });
  const me = T.openingState({ id: "me", name: "Я" }, saved, [host], 50);
  assert.equal(me.card, null);
  assert.equal(me.revealed, false);
});

test("пустой стол продолжает сохранённую партию", () => {
  const saved = { round: 4, phase: "play", card: card(7, "Марио"), at: 20, score: 2, themes: ["games"], deal: { me: card(7, "Марио") }, revealed: false };
  const me = T.openingState({ id: "me", name: "Я" }, saved, [], 999);
  assert.equal(me.round, 4);
  assert.equal(me.at, 20);
  assert.equal(me.card.k, "7");
  assert.equal(me.deal.me.k, "7");
});

test("отстающие часы не делают новичка хостом", () => {
  const others = [player("a", { at: 1000 }), player("b", { at: 3000 })];
  const at = T.clampAt(100, others);
  const me = player("me", { at });
  assert.equal(T.hostOf(others.concat([me])).id, "a");
  assert.ok(at > 3000);
});

test("reconcile не падает, если у авторитетной записи нет раздачи", () => {
  const me = player("me", { at: 50, round: 1, phase: "lobby", deal: null });
  const other = player("late", { at: 10, round: 4, phase: "play", deal: null, themes: ["films"] });
  const result = T.reconcilePlayer(me, [T.clean(other)]);
  assert.equal(result.changed, true);
  assert.equal(result.me.round, 4);
  assert.equal(result.me.phase, "play");
  assert.deepEqual(result.me.deal, {});
  assert.equal(result.me.card, null);
});

test("при равном раунде фаза живого стола заменяет локальную", () => {
  const me = player("me", { at: 50, round: 3, phase: "play", card: card("a", "Нео"), deal: {} });
  const host = player("host", { at: 10, round: 3, phase: "lobby", deal: {} });
  const result = T.reconcilePlayer(me, [host]);
  assert.equal(result.me.phase, "lobby");
  assert.equal(result.me.card, null);
});

test("раздача стола заменяет чужую карточку того же игрока", () => {
  const me = player("me", { at: 50, round: 2, phase: "play", card: card("a", "Нео"), revealed: true, deal: {} });
  const host = player("host", { at: 10, round: 2, phase: "play", deal: { me: card("b", "Леон") } });
  const result = T.reconcilePlayer(me, [host]);
  assert.equal(result.me.card.k, "b");
  assert.equal(result.me.revealed, false);
});

test("ушедший игрок сохраняет персонажа, новичку достаётся другой", () => {
  const gone = card("a", "Нео");
  const fresh = card("b", "Леон");
  const deal = { goneId: gone };
  const seated = [player("host", { card: card("c", "Марио") }), player("new", { card: null })];
  const next = T.planDeal(deal, seated, [gone, fresh]);
  assert.equal(next.goneId.k, "a");
  assert.equal(next.host.k, "c");
  assert.equal(next.new.k, "b");
  assert.equal(T.needsDeal({}, [player("p", { card: null })]), true);
  assert.equal(T.needsDeal(next, seated), false);
});

test("хост не откатывает раунд, который только что объявил", () => {
  const me = player("host", { at: 10, round: 3, phase: "play", card: card("a", "Нео"), deal: { host: card("a", "Нео") } });
  const other = player("p", { at: 20, round: 2, phase: "play", card: card("b", "Леон") });
  const result = T.reconcilePlayer(me, [other]);
  assert.equal(result.changed, false);
  assert.equal(result.me.round, 3);
  assert.equal(result.me.card.k, "a");
});

test("видимая карточка вернувшегося записывается и не дублируется", () => {
  const back = card("a", "Нео");
  const seated = [player("back", { card: back }), player("new", { card: null })];
  const next = T.planDeal({}, seated, [back, card("b", "Леон")]);
  assert.equal(next.back.k, "a");
  assert.equal(next.new.k, "b");
});
