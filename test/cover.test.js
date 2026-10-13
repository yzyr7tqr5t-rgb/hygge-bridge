import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrack, pickBest, createCoverFinder } from '../src/cover.js';

test('parseTrack splitst artiest en titel en herkent geen nummers zonder streepje', () => {
  assert.deepEqual(parseTrack('BLONDIE - Maria'), { artist: 'BLONDIE', track: 'Maria' });
  assert.deepEqual(parseTrack('DOLLY DOTS - Love me - just a little bit more'), { artist: 'DOLLY DOTS', track: 'Love me - just a little bit more' });
  assert.equal(parseTrack('Elke dag telt voor 2'), null);
  assert.equal(parseTrack('- iets'), null);
  assert.equal(parseTrack(''), null);
});

const c = (artist, track, url = 'u') => ({ artist, track, url });

test('pickBest accepteert overeenkomende artiest en titel', () => {
  const wanted = { artist: 'BLONDIE', track: 'Maria' };
  assert.equal(pickBest(wanted, [c('Blondie', 'Maria', 'a')]).url, 'a');
  assert.equal(pickBest(wanted, [c('Blondie', 'Maria (Remastered 2001)', 'b')]).url, 'b');
  assert.equal(pickBest({ artist: 'MIAMI SOUND MACHINE', track: 'Conga' }, [c('Miami Sound Machine & Gloria Estefan', 'Conga (Spanish Version)', 'c')]).url, 'c');
  assert.equal(pickBest({ artist: 'Mr. Probz', track: 'Waves' }, [c('Mr. Probz', 'Waves', 'd')]).url, 'd');
});

test('pickBest weigert een andere artiest of titel', () => {
  const wanted = { artist: 'BART HERMAN', track: 'Vintage & oldskool' };
  assert.equal(pickBest(wanted, [c('Iemand Anders', 'Vintage & Oldskool')]), null);
  assert.equal(pickBest(wanted, [c('Bart Herman', 'Heel ander nummer')]), null);
  assert.equal(pickBest(wanted, []), null);
});

test('pickBest verkiest een gewone uitgave boven een remix, maar neemt een remix als dat de enige is', () => {
  const wanted = { artist: 'MAROON 5', track: 'Sugar' };
  assert.equal(pickBest(wanted, [c('Maroon 5', 'Sugar (Remix)', 'remix'), c('Maroon 5', 'Sugar', 'origineel')]).url, 'origineel');
  assert.equal(pickBest(wanted, [c('Maroon 5', 'Sugar - Live', 'live')]).url, 'live');
  assert.equal(pickBest({ artist: 'X', track: 'Song remix' }, [c('X', 'Song remix', 'r')]).url, 'r');
});

function net(handlers) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    const h = handlers.find((x) => String(url).includes(x.match));
    if (!h) throw new Error('niet bereikbaar');
    if (h.fail) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => h.body };
  };
  return { fetchImpl, calls };
}
const itunes = (...r) => ({ match: 'itunes.apple.com', body: { results: r.map(([a, t]) => ({ artistName: a, trackName: t, artworkUrl100: `https://x/${t}/100x100bb.jpg` })) } });
const deezer = (...r) => ({ match: 'api.deezer.com', body: { data: r.map(([a, t]) => ({ artist: { name: a }, title: t, album: { cover_xl: `https://dz/${t}.jpg` } })) } });

test('createCoverFinder: iTunes eerst, en de hoes wordt groter gevraagd', async () => {
  const n = net([itunes(['Blondie', 'Maria'])]);
  const find = createCoverFinder({ fetchImpl: n.fetchImpl });
  assert.deepEqual(await find('BLONDIE - Maria'), { url: 'https://x/Maria/600x600bb.jpg', source: 'iTunes' });
  assert.equal(n.calls.length, 1);
});

test('createCoverFinder: Deezer als iTunes niets passends heeft, en nul bij geen treffer', async () => {
  const n = net([itunes(['Iemand', 'Anders']), deezer(['Blondie', 'Maria'])]);
  const find = createCoverFinder({ fetchImpl: n.fetchImpl });
  assert.equal((await find('BLONDIE - Maria')).source, 'Deezer');
  const none = net([itunes(), deezer()]);
  assert.equal(await createCoverFinder({ fetchImpl: none.fetchImpl })('NIEMAND - Niets'), null);
});

test('createCoverFinder onthoudt resultaten en voert gelijktijdige aanvragen samen', async () => {
  const n = net([itunes(['Blondie', 'Maria'])]);
  const find = createCoverFinder({ fetchImpl: n.fetchImpl });
  const [a, b] = await Promise.all([find('BLONDIE - Maria'), find('Blondie - maria')]);
  assert.equal(a.url, b.url);
  await find('BLONDIE - Maria');
  assert.equal(n.calls.length, 1); // één zoekopdracht voor drie vragen
});

test('createCoverFinder: geen zoekopdracht voor tekst die geen nummer is', async () => {
  const n = net([itunes(['Blondie', 'Maria'])]);
  assert.equal(await createCoverFinder({ fetchImpl: n.fetchImpl })('Elke dag telt voor 2'), null);
  assert.equal(n.calls.length, 0);
});

test('createCoverFinder: een fout wordt kort onthouden, een gemiste treffer langer, en later opnieuw geprobeerd', async () => {
  let t = 0;
  const bad = net([{ match: 'itunes.apple.com', fail: true }, { match: 'api.deezer.com', fail: true }]);
  const find = createCoverFinder({ fetchImpl: bad.fetchImpl, now: () => t });
  assert.equal(await find('A - B'), null);
  await find('A - B');
  assert.equal(bad.calls.length, 2); // binnen de wachttijd: niet opnieuw
  t += 3 * 60_000;
  await find('A - B');
  assert.equal(bad.calls.length, 4); // na 3 min wel opnieuw (fouten verlopen snel)
});
