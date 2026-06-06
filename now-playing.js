// api/now-playing.js — Vercel Serverless Function
// Proxies Spotify's "currently playing" endpoint with CORS headers
// so your GitHub Pages portfolio can call it from the browser.

const CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;

const TOKEN_URL    = 'https://accounts.spotify.com/api/token';
const NOW_PLAYING  = 'https://api.spotify.com/v1/me/player/currently-playing';
const RECENT_TRACK = 'https://api.spotify.com/v1/me/player/recently-played?limit=1';

// ── Get a fresh access token using the stored refresh token ──────────────
async function getAccessToken() {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: REFRESH_TOKEN,
    }),
  });
  const data = await res.json();
  return data.access_token;
}

// ── Main handler ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS — allow your GitHub Pages domain (and localhost for dev)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  try {
    const token = await getAccessToken();

    // Try currently playing first
    const nowRes = await fetch(NOW_PLAYING, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // 204 = nothing playing right now
    if (nowRes.status === 204) {
      // Fall back to most recently played track
      const recentRes = await fetch(RECENT_TRACK, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const recentData = await recentRes.json();
      const track = recentData.items?.[0]?.track;

      if (!track) return res.status(200).json({ isPlaying: false, track: null });

      return res.status(200).json({
        isPlaying: false,
        track: {
          title:   track.name,
          artist:  track.artists.map(a => a.name).join(', '),
          url:     track.external_urls.spotify,
          albumArt: track.album.images?.[1]?.url ?? null,
        },
      });
    }

    // Something is playing
    const data  = await nowRes.json();
    const track = data.item;

    if (!track) return res.status(200).json({ isPlaying: false, track: null });

    return res.status(200).json({
      isPlaying: true,
      track: {
        title:   track.name,
        artist:  track.artists.map(a => a.name).join(', '),
        url:     track.external_urls.spotify,
        albumArt: track.album.images?.[1]?.url ?? null,
        progress: data.progress_ms,
        duration: track.duration_ms,
      },
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch Spotify data' });
  }
}
