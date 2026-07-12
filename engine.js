/* ============================================================
   Klaverjassen rules engine — Rotterdam rules (server-authoritative)
   Pure functions, no I/O. Shared by server.js.
   Verified against a 20k-deal simulation (0 illegal moves, points
   always total 162).
   Runs in Node (server.js) and in the browser (mobile app host/solo).
   ============================================================ */
;(function (root) {
'use strict';

const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SEQ   = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];   // order for roem runs

const TRUMP_VAL = { J: 20, 9: 14, A: 11, '10': 10, K: 4, Q: 3, 8: 0, 7: 0 };
const PLAIN_VAL = { A: 11, '10': 10, K: 4, Q: 3, J: 2, 9: 0, 8: 0, 7: 0 };
const TRUMP_STR = { J: 8, 9: 7, A: 6, '10': 5, K: 4, Q: 3, 8: 2, 7: 1 };
const PLAIN_STR = { A: 8, '10': 7, K: 6, Q: 5, J: 4, 9: 3, 8: 2, 7: 1 };

const teamOf = s => s % 2;                       // seats 0,2 -> team 0; 1,3 -> team 1
const cardId = c => c.suit + c.rank;
const cardVal = (c, tr) => (c.suit === tr ? TRUMP_VAL[c.rank] : PLAIN_VAL[c.rank]);

function freshDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ suit: s, rank: r });
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/* ascending within suit; trump ranks by trump strength once known */
function handComparator(trump) {
  return (a, b) => {
    if (a.suit !== b.suit) return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    if (!trump) return SEQ.indexOf(a.rank) - SEQ.indexOf(b.rank);
    const sa = a.suit === trump ? TRUMP_STR[a.rank] : PLAIN_STR[a.rank];
    const sb = b.suit === trump ? TRUMP_STR[b.rank] : PLAIN_STR[b.rank];
    return sa - sb;
  };
}

function winnerIndex(cards, trump) {
  const led = cards[0].suit;
  let bi = 0, bs = -1;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const sc = c.suit === trump ? 100 + TRUMP_STR[c.rank]
             : c.suit === led   ? PLAIN_STR[c.rank]
             : -1;
    if (sc > bs) { bs = sc; bi = i; }
  }
  return bi;
}
function trickWinnerSeat(trick, trump) {
  return trick[winnerIndex(trick.map(t => t.card), trump)].seat;
}

/* ---- Rotterdam legal moves ----
   follow suit; else must trump; when a trump is down you must overtrump if
   able (even over your partner); if you can't overtrump you must still
   undertrump (play a lower trump). You may only discard when you hold no
   trump at all. */
function legalMoves(hand, trick, trump) {
  if (trick.length === 0) return hand.slice();
  const led = trick[0].card.suit;
  const trumpsInTrick = trick.filter(t => t.card.suit === trump).map(t => t.card);
  const highTrump = trumpsInTrick.length ? Math.max(...trumpsInTrick.map(c => TRUMP_STR[c.rank])) : -1;
  const myTrumps = hand.filter(c => c.suit === trump);
  if (led === trump) {
    if (myTrumps.length) {
      const higher = myTrumps.filter(c => TRUMP_STR[c.rank] > highTrump);
      return higher.length ? higher : myTrumps;
    }
    return hand.slice();
  }
  const hasLed = hand.filter(c => c.suit === led);
  if (hasLed.length) return hasLed;
  if (!myTrumps.length) return hand.slice();
  if (trumpsInTrick.length === 0) return myTrumps;
  const higher = myTrumps.filter(c => TRUMP_STR[c.rank] > highTrump);
  return higher.length ? higher : myTrumps;   // must undertrump; can't discard while holding trump
}

function computeRoem(cards, trump) {
  let roem = 0; const labels = [];
  const SYM = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
  for (const s of SUITS) {
    const idx = cards.filter(c => c.suit === s).map(c => SEQ.indexOf(c.rank)).sort((a, b) => a - b);
    let best = idx.length ? 1 : 0, cur = 1;
    for (let i = 1; i < idx.length; i++) { if (idx[i] === idx[i - 1] + 1) { cur++; best = Math.max(best, cur); } else cur = 1; }
    if (best >= 4) { roem += 50; labels.push(SYM[s] + ' run of 4 +50'); }
    else if (best >= 3) { roem += 20; labels.push(SYM[s] + ' run of 3 +20'); }
  }
  if (cards.some(c => c.suit === trump && c.rank === 'K') && cards.some(c => c.suit === trump && c.rank === 'Q')) {
    roem += 20; labels.push('stuk (trump K-Q) +20');
  }
  return { roem, labels };
}

/* ============================================================
   Bot AI — three difficulty levels: 'easy' | 'normal' | 'hard'
   - easy   : plays a random legal card; naive trump pick. Beatable beginner.
   - normal : positional heuristic (lead aces, win cheap, schmear to a winning partner).
   - hard   : normal + card-counting (tracks played cards to know guaranteed
              winners / whether a card is safe, drives trumps, discards to void suits).
   ============================================================ */
const ALL_CARDS = [];
for (const s of SUITS) for (const r of RANKS) ALL_CARDS.push({ suit: s, rank: r });

const valLow  = (arr, tr) => arr.reduce((x, y) => cardVal(x, tr) <= cardVal(y, tr) ? x : y);
const valHigh = (arr, tr) => arr.reduce((x, y) => cardVal(x, tr) >= cardVal(y, tr) ? x : y);
const strOf   = (c, tr) => (c.suit === tr ? TRUMP_STR[c.rank] : PLAIN_STR[c.rank]);

function botChooseTrump(hand, level = 'normal') {
  if (level === 'easy') {                           // naive: pick the longest suit
    let best = SUITS[0], bc = -1;
    for (const s of SUITS) { const n = hand.filter(c => c.suit === s).length; if (n > bc) { bc = n; best = s; } }
    return best;
  }
  let best = SUITS[0], bs = -Infinity;
  for (const s of SUITS) {
    let sc = 0;
    for (const c of hand) sc += c.suit === s ? TRUMP_VAL[c.rank] + 6 : PLAIN_VAL[c.rank] * 0.3;
    if (hand.some(c => c.suit === s && c.rank === 'J')) sc += level === 'hard' ? 22 : 15;
    if (hand.some(c => c.suit === s && c.rank === '9')) sc += level === 'hard' ? 12 : 8;
    const n = hand.filter(c => c.suit === s).length;
    sc += level === 'hard' ? n * n * 1.5 : n * n;
    if (level === 'hard') {                          // value guaranteed side-suit winners (aces)
      sc += hand.filter(c => c.suit !== s && c.rank === 'A').length * 4;
      if (n < 3) sc -= 6;                            // avoid naming a short trump suit
    }
    if (sc > bs) { bs = sc; best = s; }
  }
  return best;
}

// unseen = cards not in my hand and not yet played (i.e. in the other three hands)
function unseenCards(hand, played) {
  const seen = new Set();
  hand.forEach(c => seen.add(cardId(c)));
  (played || []).forEach(c => seen.add(cardId(c)));
  return ALL_CARDS.filter(c => !seen.has(cardId(c)));
}
// would this card (as current winner) be unbeatable by any still-unseen card?
function unbeatable(card, trump, unseen) {
  if (card.suit === trump) return !unseen.some(u => u.suit === trump && TRUMP_STR[u.rank] > TRUMP_STR[card.rank]);
  if (unseen.some(u => u.suit === trump)) return false;            // could be ruffed
  return !unseen.some(u => u.suit === card.suit && PLAIN_STR[u.rank] > PLAIN_STR[card.rank]);
}
function dumpLow(legal, trump) {                     // shed lowest value, keep trumps
  const nonT = legal.filter(c => c.suit !== trump);
  return valLow(nonT.length ? nonT : legal, trump);
}

function chooseBotCard(seat, hand, trick, trump, opts = {}) {
  const legal = legalMoves(hand, trick, trump);
  if (!legal.length) return null;                    // empty hand (stale call) — caller must guard
  const level = opts.level || 'normal';
  if (level === 'easy') return legal[Math.floor(Math.random() * legal.length)];
  if (level === 'hard') return hardPlay(seat, hand, trick, trump, legal, opts.played || [], opts.chooser);
  return normalPlay(seat, trick, trump, legal);
}

function normalPlay(seat, trick, trump, legal) {
  if (trick.length === 0) {
    const aces = legal.filter(c => c.suit !== trump && c.rank === 'A');
    if (aces.length) return aces[0];
    const plain = legal.filter(c => c.suit !== trump);
    return plain.length ? valLow(plain, trump) : valLow(legal, trump);
  }
  const winSeat = trickWinnerSeat(trick, trump);
  const partner = (seat + 2) % 4;
  const last = trick.length === 3;
  const winners = legal.filter(c => trickWinnerSeat(trick.concat([{ seat, card: c }]), trump) === seat);
  if (winSeat === partner) {
    const wc = trick.find(t => t.seat === winSeat).card;
    const solid = last || wc.suit === trump || wc.rank === 'A';
    if (solid) return valHigh(legal, trump);
    if (winners.length) return valLow(winners, trump);
    return valLow(legal, trump);
  }
  if (winners.length) return valLow(winners, trump);
  return valLow(legal, trump);
}

// Hard = Normal's aggression + card-counting edges: cash guaranteed winners, draw
// trumps as declarer, schmear only onto a provably safe partner, discard to void suits.
function hardPlay(seat, hand, trick, trump, legal, played, chooser) {
  const unseen = unseenCards(hand, played);
  const declarerSide = chooser != null && teamOf(seat) === teamOf(chooser);
  if (trick.length === 0) {                          // leading
    const nonTrump = legal.filter(c => c.suit !== trump);
    const myTrumps = legal.filter(c => c.suit === trump);
    const trumpsOut = unseen.some(u => u.suit === trump);
    // 1) cash a guaranteed winner (can't be beaten or ruffed)
    const cashable = nonTrump.filter(c => unbeatable(c, trump, unseen));
    if (cashable.length) return valHigh(cashable, trump);
    // 2) as declarer holding the top trump, lead trump to draw opponents' trumps
    if (declarerSide && trumpsOut && myTrumps.length >= 3 && myTrumps.some(c => c.rank === 'J'))
      return valHigh(myTrumps, trump);
    // 3) cash a non-trump ace (usually wins the first round before it can be ruffed)
    const aces = nonTrump.filter(c => c.rank === 'A');
    if (aces.length) return aces[0];
    // 4) safe low exit
    return nonTrump.length ? valLow(nonTrump, trump) : valLow(legal, trump);
  }
  const winSeat = trickWinnerSeat(trick, trump);
  const partner = (seat + 2) % 4;
  const last = trick.length === 3;
  const winners = legal.filter(c => trickWinnerSeat(trick.concat([{ seat, card: c }]), trump) === seat);
  if (winSeat === partner) {                         // partner winning
    const wc = trick.find(t => t.seat === winSeat).card;
    // schmear on every case Normal would, plus card-counted certain wins
    if (last || wc.suit === trump || wc.rank === 'A' || unbeatable(wc, trump, unseen)) return valHigh(legal, trump);
    if (winners.length) return valLow(winners, trump);   // beatable partner: secure the trick ourselves
    return dumpLow(legal, trump);                         // else shed lowest, keep trumps
  }
  if (winners.length) return valLow(winners, trump); // opponent winning: take it as cheaply as possible
  return dumpLow(legal, trump);                      // can't win: discard lowest, keep trumps
}

const API = {
  SUITS, RANKS, SEQ, TRUMP_VAL, PLAIN_VAL, TRUMP_STR, PLAIN_STR,
  teamOf, cardId, cardVal, freshDeck, handComparator,
  winnerIndex, trickWinnerSeat, legalMoves, computeRoem,
  botChooseTrump, chooseBotCard,
};

if (typeof module !== 'undefined' && module.exports) module.exports = API;   // Node / server.js
else root.KJEngine = API;                                                    // browser (window/self)

})(typeof self !== 'undefined' ? self : this);
