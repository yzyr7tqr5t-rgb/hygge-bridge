// Zoekt de hoes bij een nummer dat op de radio speelt ("ARTIEST - Titel").
// Bronnen (gratis, zonder sleutel): iTunes Search API, daarna Deezer. Alleen een treffer waarbij zowel
// artiest als titel goed overeenkomen wordt gebruikt; anders blijft het zenderlogo staan.

const COUNTRY = 'BE';
const TIMEOUT_MS = 4000;
const HIT_TTL_MS = 24 * 3600_000;
const MISS_TTL_MS = 60 * 60_000;
const ERROR_TTL_MS = 2 * 60_000;
const MAX_CACHE = 500;
const UNWANTED = /\b(remix|live|karaoke|instrumental|tribute|cover version|made famous|originally performed|8d|sped up|slowed)\b/i;

/** 'ARTIEST - Titel' -> { artist, track }, of null als het geen nummer lijkt. */
export function parseTrack(text) {
  const i = String(text ?? '').indexOf(' - ');
  if (i < 1) return null;
  const artist = text.slice(0, i).trim();
  const track = text.slice(i + 3).trim();
  return artist && track ? { artist, track } : null;
}

const norm = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/\(.*?\)|\[.*?\]/g, ' ') // (Remastered), [Live], ...
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const tokens = (s) => norm(s).split(' ').filter(Boolean);

/** Komen de artiesten overeen? (volgorde en 'feat.' maken niet uit) */
function artistMatches(wanted, got) {
  const a = norm(wanted);
  const b = norm(got);
  if (!a || !b) return false;
  if (a === b || b.includes(a) || a.includes(b)) return true;
  const wt = tokens(wanted);
  const gt = new Set(tokens(got));
  return wt.length > 0 && wt.filter((t) => gt.has(t)).length / wt.length >= 0.7;
}

/** Komt de titel overeen? ('Conga' en 'Conga (Spanish Version)' horen bij elkaar) */
function trackMatches(wanted, got) {
  const a = norm(wanted);
  const b = norm(got);
  return Boolean(a && b && (a === b || b.startsWith(`${a} `) || a.startsWith(`${b} `)));
}

/** Kiest de beste treffer: eerst een gewone uitgave, anders de eerste die klopt. */
export function pickBest(wanted, candidates) {
  const ok = candidates.filter((c) => artistMatches(wanted.artist, c.artist) && trackMatches(wanted.track, c.track));
  const wantsVariant = UNWANTED.test(wanted.track);
  return ok.find((c) => wantsVariant || !UNWANTED.test(c.track)) ?? ok[0] ?? null;
}

async function getJson(fetchImpl, url) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'hygge-bridge/1.0' } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function fromItunes(fetchImpl, { artist, track }) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(`${artist} ${track}`)}&entity=song&limit=8&country=${COUNTRY}`;
  const json = await getJson(fetchImpl, url);
  return (json.results ?? []).map((r) => ({
    artist: r.artistName, track: r.trackName, url: (r.artworkUrl100 ?? '').replace(/\/\d+x\d+bb\./, '/600x600bb.'),
  })).filter((c) => c.url);
}

export async function fromDeezer(fetchImpl, { artist, track }) {
  const json = await getJson(fetchImpl, `https://api.deezer.com/search?q=${encodeURIComponent(`${artist} ${track}`)}&limit=8`);
  return (json.data ?? []).map((r) => ({ artist: r.artist?.name, track: r.title, url: r.album?.cover_xl || r.album?.cover_big })).filter((c) => c.url);
}

/**
 * Geeft een functie (titel) -> Promise<{ url, source } | null>, met onthouden resultaten en zonder dubbele aanvragen.
 */
export function createCoverFinder({ fetchImpl = fetch, now = Date.now } = {}) {
  const cache = new Map(); // genormaliseerde titel -> { value, until }
  const inflight = new Map();
  const sources = [['iTunes', fromItunes], ['Deezer', fromDeezer]];

  async function search(wanted) {
    let failed = false;
    for (const [source, fn] of sources) {
      try {
        const hit = pickBest(wanted, await fn(fetchImpl, wanted));
        if (hit) return { value: { url: hit.url, source }, ttl: HIT_TTL_MS };
      } catch {
        failed = true; // bron onbereikbaar: volgende proberen, en later opnieuw
      }
    }
    return { value: null, ttl: failed ? ERROR_TTL_MS : MISS_TTL_MS };
  }

  return async function findCover(title) {
    const wanted = parseTrack(title);
    if (!wanted) return null;
    const key = `${norm(wanted.artist)}|${norm(wanted.track)}`;
    const cached = cache.get(key);
    if (cached && cached.until > now()) return cached.value;
    if (inflight.has(key)) return inflight.get(key);

    const job = search(wanted).then(({ value, ttl }) => {
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
      cache.set(key, { value, until: now() + ttl });
      return value;
    }).finally(() => inflight.delete(key));
    inflight.set(key, job);
    return job;
  };
}
