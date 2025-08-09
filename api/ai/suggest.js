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
    const prompt = `You are a bilingual menu copywriter.
Return STRICT JSON only with this schema:
{
  "enName": string,    // English item name, title case
  "arName": string,    // Arabic item name in MSA
  "en": string,        // English description, 1–2 short sentences, max 160 chars, no emojis
  "ar": string         // Arabic description (MSA), 1–2 short sentences, max 160 chars, no emojis
}

Item name: "${name}"
Section: "${section || 'general'}"
Style rules:
- Focus on taste, texture, temperature, and key ingredients; realistic and appetizing.
- Avoid medical/health claims, superlatives like "the best", prices, or allergens unless typical.
- Arabic must be Modern Standard Arabic (not dialect).

Few-shot examples:
Input: name="Green Tea", section="hot_drinks"
Output: {"enName":"Green Tea","arName":"شاي أخضر","en":"A clean, gently grassy brew with a soft, soothing finish.","ar":"شاي نقي بطعم عشبي رقيق ولمسة مهدئة."}

Input: name="Chocolate Milkshake", section="cold_drinks"
Output: {"enName":"Chocolate Milkshake","arName":"ميلكشيك الشوكولاتة","en":"Thick and creamy with rich cocoa and an ice‑cold finish.","ar":"كثيف وكريمي بنكهة كاكاو غنية ونهاية باردة منعشة."}

Now produce the JSON for the current item.`;

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
    // Try to extract a JSON object from the response
    const match = text.match(/\{[\s\S]*\}/);
    let payload = null;
    if (match) {
      try { payload = JSON.parse(match[0]); } catch {}
    } else {
      try { payload = JSON.parse(text); } catch {}
    }
    if (!payload || !payload.ar || !payload.en) {
      // Minimal fallback using name for names, generic but relevant description
      payload = {
        enName: name,
        arName: name,
        ar: `تحضير ${name} بطعم متوازن يبرز نكهته الأساسية بطريقة شهية.`,
        en: `${name} prepared with a balanced taste that highlights its core flavor.`
      };
    }
    res.status(200).json({
      enName: payload.enName || name,
      arName: payload.arName || name,
      en: payload.en,
      ar: payload.ar
    });
  } catch (e) {
    res.status(500).json({ error: 'AI suggestion failed' });
  }
}

