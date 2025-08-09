export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Require admin session
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(c=>{
    const [k,v] = c.trim().split('=');
    return [k, decodeURIComponent(v||'')];
  }));
  if (cookies.admin_session !== 'ok') return res.status(401).json({ error: 'Not authenticated' });

  const { name, section } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Missing item name' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  try {
    const prompt = `You are a concise menu copywriter. Write mouthwatering yet realistic item descriptions.
Item name: "${name}"
Section: "${section || 'general'}"
Rules:
- Output valid JSON only with keys: ar, en
- ar: Modern Arabic (MSA, not dialect), 1–2 short sentences, max 160 chars, no emojis
- en: Natural English, 1–2 short sentences, max 160 chars, no emojis
- No medical/health claims, no superlatives like "the best", no prices, no allergens unless typical
- Focus on taste, texture, temperature, and key ingredients
Return JSON only.`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 256 }
      })
    });
    if (!resp.ok) return res.status(500).json({ error: 'Gemini request failed' });
    const data = await resp.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts.map(p => p.text).filter(Boolean).join('\n').trim();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = null; }
    if (!payload || !payload.ar || !payload.en) {
      payload = {
        ar: `${name} — وصف قصير ولذيذ يبرز النكهة والقوام بطريقة جذابة.`,
        en: `${name} — a short, appetizing description highlighting flavor and texture.`
      };
    }
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: 'AI suggestion failed' });
  }
}

