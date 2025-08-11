// Stateless menu assistant using Gemini 1.5 Flash via REST
// Reads menu/manifest.json (prefer GitHub for freshness), builds a compact digest,
// and returns Syrian-Arabic replies with structured suggestions.

let MENU_CACHE = { digest: null, expiresAt: 0 };
const RATE_BUCKET = new Map(); // key: sessionId|ip → { lastTs }

function nowMs() { return Date.now(); }

function rateLimit(key, minIntervalMs = 1500) {
  const rec = RATE_BUCKET.get(key) || { lastTs: 0 };
  const dt = nowMs() - rec.lastTs;
  if (dt < minIntervalMs) return false;
  rec.lastTs = nowMs();
  RATE_BUCKET.set(key, rec);
  return true;
}

async function fetchManifestFromGitHub() {
  const repo = process.env.GITHUB_REPO; // owner/name
  const branch = process.env.GITHUB_BRANCH || 'main';
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) return null;
  const apiUrl = `https://api.github.com/repos/${repo}/contents/menu/manifest.json?ref=${encodeURIComponent(branch)}`;
  const r = await fetch(apiUrl, { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' } });
  if (!r.ok) return null;
  const data = await r.json();
  const content = Buffer.from(data.content, 'base64').toString('utf8');
  return JSON.parse(content);
}

async function buildMenuDigest() {
  if (MENU_CACHE.digest && MENU_CACHE.expiresAt > nowMs()) return MENU_CACHE.digest;
  let manifest = null;
  try {
    // Prefer GitHub (fresh), fallback to local file if needed
    manifest = await fetchManifestFromGitHub();
    if (!manifest) {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const file = path.join(process.cwd(), 'menu', 'manifest.json');
      const text = await fs.readFile(file, 'utf8');
      manifest = JSON.parse(text);
    }
  } catch {
    manifest = null;
  }
  const digest = { sections: {} };
  if (manifest && manifest.sections) {
    for (const [key, sec] of Object.entries(manifest.sections)) {
      const compactItems = (sec.items || []).slice(0, 200).map((it) => ({
        id: it.id,
        arName: it.arName,
        price: it.price || '',
        desc: (it.descriptionAr || it.descriptionEn || '').slice(0, 80)
      }));
      digest.sections[key] = { ar: sec.ar || key, en: sec.en || key, items: compactItems };
    }
  }
  MENU_CACHE = { digest, expiresAt: nowMs() + 5 * 60 * 1000 };
  return digest;
}

function buildPrompt(menuDigest, messages, maxSuggestions = 3) {
  const system = `أنت "ماستر"، شَخصية ودودة من بوظة ماستر كيك.
- احكي بس باللهجة السورية وبشكل مختصر (1–3 جُمل)، وإيموجي بسيط عند اللزوم (✨😋❄️).
- اقترح 1–${maxSuggestions} أصناف من القائمة أدناه حسب المزاج/الطقس/الميزانية.
- إذا المستخدم عم يدردش بس، جاوبه بلُطف وبسؤال صغير ممكن يقرب للاختيار.
- اعتمد فقط على القائمة (menuDigest). إذا ما لقيت صنف/سعر، قول بوضوح.
- بدون ادعاءات صحية أو مبالغة.
- أعد JSON حصراً:
{
  "reply": "نص باللهجة السورية",
  "suggestions": [ { "id":"...","section":"...","arName":"...","price":"..." } ],
  "followUpQuestion": "سؤال بسيط"
}`;

  const digestText = JSON.stringify(menuDigest);
  const chat = (messages || []).slice(-8).map(m => `${m.role}: ${m.content}`).join('\n');
  const fewShot = `مثال:
User: بردانة شوي
Assistant(JSON): {"reply":"جربي شي دافئ هيك بيدفّي على هالبرد 😋","suggestions":[{"id":"hot-chocolate","section":"hot_drinks","arName":"شوكولا ساخنة","price":""}],"followUpQuestion":"بتفضّلي نكهة شوكولا ولا قهوة؟"}`;

  return `SYSTEM:\n${system}\n\nmenuDigest:${digestText}\n\n${fewShot}\n\nChat:\n${chat}\n\nAssistant(JSON only):`;
}

async function callGemini(apiKey, prompt) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 300 } })
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map(p => p.text).filter(Boolean).join('\n').trim();
  return text;
}

function coerceResponse(text, digest, maxSuggestions) {
  const m = text && text.match(/\{[\s\S]*\}/);
  let out = null;
  if (m) {
    try { out = JSON.parse(m[0]); } catch { out = null; }
  }
  if (!out || typeof out !== 'object') {
    return {
      reply: 'شلونك؟ إذا حابب فيني اقترح لك شي طيب من قائمتنا ✨',
      suggestions: [],
      followUpQuestion: 'بدك شي بارد ولا ساخن؟'
    };
  }
  // Filter suggestions to valid items
  const valid = [];
  const secs = digest.sections || {};
  for (const s of Array.isArray(out.suggestions) ? out.suggestions : []) {
    const sec = secs[s.section];
    if (!sec) continue;
    const exists = (sec.items || []).find(it => it.id === s.id);
    if (exists) {
      valid.push({ id: exists.id, section: s.section, arName: exists.arName || s.arName || '', price: exists.price || s.price || '' });
      if (valid.length >= (out.maxSuggestions || maxSuggestions)) break;
    }
  }
  return {
    reply: String(out.reply || 'تمام! بتحب اقترح لك شي حسب مزاجك؟').slice(0, 400),
    suggestions: valid,
    followUpQuestion: String(out.followUpQuestion || 'مزاجك اليوم بارد ولا ساخن؟').slice(0, 140)
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { sessionId, messages = [], maxSuggestions = 3 } = await req.json?.() || await new Response(req.body).json?.() || req.body || {};
  } catch {}

  let body;
  try { body = await (async()=>{ try{ return await req.json(); }catch{ return req.body; } })(); } catch { body = req.body; }
  const sessionId = body?.sessionId || '';
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const maxSuggestions = Number(body?.maxSuggestions || 3);

  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
  const key = `${sessionId || 'anon'}|${ip}`;
  if (!rateLimit(key, 1500)) return res.status(429).json({ error: 'Too Many Requests' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  const digest = await buildMenuDigest();
  const prompt = buildPrompt(digest, messages, maxSuggestions);
  const raw = await callGemini(apiKey, prompt);
  const json = coerceResponse(raw || '', digest, maxSuggestions);
  res.status(200).json(json);
}

