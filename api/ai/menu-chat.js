// FIXED: Smart Professional Menu Assistant 
// Now properly detects when users want to chat vs get suggestions
// Respects user intent and stops forcing menu suggestions

let MENU_CACHE = { digest: null, expiresAt: 0 };
const RATE_BUCKET = new Map();

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
  const repo = process.env.GITHUB_REPO;
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
        desc: (it.descriptionAr || it.descriptionEn || '').slice(0, 120),
        badge: it.badge || '',
        images: it.images || []
      }));
      digest.sections[key] = { ar: sec.ar || key, en: sec.en || key, items: compactItems };
    }
  }
  MENU_CACHE = { digest, expiresAt: nowMs() + 5 * 60 * 1000 };
  return digest;
}

function analyzeUserIntent(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { wantsChat: false, wantsMenu: false, suggestedItems: new Set() };
  }

  // Get recent user messages
  const recentMessages = messages.filter(m => m.role === 'user').slice(-3);
  const lastUserMessage = recentMessages[recentMessages.length - 1]?.content?.toLowerCase() || '';
  
  // Track previously suggested items from assistant messages
  const assistantMessages = messages.filter(m => m.role === 'assistant').slice(-5);
  const suggestedItems = new Set();
  assistantMessages.forEach(msg => {
    const content = msg.content || '';
    // Look for Arabic menu items
    const arabicItems = content.match(/(كابتشينو|شاي أخضر|ايسد امريكانو|آيس كريم كيكة الماستر|كريب الشوكولا|تشيزكيك|فستق حلبي|أركيلة نعنع)/g);
    if (arabicItems) {
      arabicItems.forEach(item => suggestedItems.add(item));
    }
  });

  // Strong indicators user wants to CHAT ONLY
  const chatIndicators = [
    /مابدي.{0,10}(اكل|شرب|شي)/,
    /ما.{0,5}عبالي.{0,10}(اكل|شرب|شي)/,
    /عبالي.{0,10}(نحكي|دردش|احكي)/,
    /بدي.{0,10}(نحكي|دردش|احكي)/,
    /تعا.{0,10}(نحكي|ندردش)/,
    /نحكي.{0,10}عن.{0,10}الحب/,
    /بس.{0,10}(دردش|نحكي)/,
    /لا.{0,10}لا.{0,10}مابدي/
  ];

  // Strong indicators user wants MENU suggestions
  const menuIndicators = [
    /شو.{0,10}عندكن/,
    /اقتراح/,
    /عبالي.{0,10}(اكل|شرب|آيس|بوظة|قهوة|شاي)/,
    /بدي.{0,10}(اكل|شرب|آيس|بوظة|قهوة|شاي)/,
    /حابب.{0,10}(اكل|شرب|آيس|بوظة|قهوة|شاي)/,
    /(بارد|ساخن|دافئ|حلو).{0,10}شي/,
    /شو.{0,10}(رايك|تنصح)/
  ];

  const wantsChat = chatIndicators.some(pattern => pattern.test(lastUserMessage));
  const wantsMenu = menuIndicators.some(pattern => pattern.test(lastUserMessage));

  // If user explicitly said they don't want anything, respect it
  if (wantsChat && !wantsMenu) {
    return { wantsChat: true, wantsMenu: false, suggestedItems };
  }

  // If user explicitly wants menu suggestions
  if (wantsMenu) {
    return { wantsChat: false, wantsMenu: true, suggestedItems };
  }

  // Default to chat if unclear
  return { wantsChat: true, wantsMenu: false, suggestedItems };
}

function buildContextAwarePrompt(menuDigest, messages, maxSuggestions = 3) {
  const intent = analyzeUserIntent(messages);
  const recentChat = messages.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n');

  let systemPrompt;
  
  if (intent.wantsChat && !intent.wantsMenu) {
    // User wants to chat - NO menu suggestions
    systemPrompt = `أنت "ماستر" - شخصية ودودة من بوظة ماستر كيك.

المستخدم يريد الدردشة فقط وليس اقتراحات طعام.

**قواعد صارمة:**
- لا تقترح أي عناصر من القائمة
- تكلم باللهجة السورية بطبيعية
- كن ودود ومرح
- اجعل المحادثة ممتعة
- لا تذكر الطعام أو المشروبات نهائياً

رد JSON:
{
  "reply": "رد طبيعي بدون ذكر الطعام",
  "suggestions": [],
  "conversationType": "chat"
}`;
  } else {
    // User wants menu suggestions
    systemPrompt = `أنت "ماستر" من بوظة ماستر كيك - مساعد ذكي.

المستخدم يريد اقتراحات من القائمة.

**سلوكك:**
- اقترح عناصر مناسبة من القائمة
- لا تكرر هذه العناصر: ${Array.from(intent.suggestedItems).join(', ')}
- تكلم باللهجة السورية
- كن مهني ومفيد

رد JSON:
{
  "reply": "رد مع اقتراح مناسب",
  "suggestions": [{"id":"...","section":"...","arName":"...","price":"...","images":[]}],
  "conversationType": "menu_focused"
}`;
  }

  const digestText = intent.wantsMenu ? JSON.stringify(menuDigest, null, 2) : '';
  
  return `${systemPrompt}\n\n${digestText}\n\n**المحادثة الأخيرة:**\n${recentChat}\n\nالمساعد (JSON فقط):`;
}

async function callGemini(apiKey, prompt) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      contents: [{ role: 'user', parts: [{ text: prompt }] }], 
      generationConfig: { 
        temperature: 0.6, 
        maxOutputTokens: 350
      } 
    })
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text).filter(Boolean).join('\n').trim();
}

function parseAndValidateResponse(rawText, digest, intent, maxSuggestions) {
  let cleanText = rawText || '';
  cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
  let response = null;
  
  if (jsonMatch) {
    try { 
      response = JSON.parse(jsonMatch[0]); 
    } catch (e) { 
      console.log('JSON parse failed:', e.message);
    }
  }
  
  // Fallback response
  if (!response) {
    if (intent.wantsChat) {
      return {
        reply: 'أهلين! شو بدك نحكي عنه؟',
        suggestions: [],
        conversationType: 'chat'
      };
    } else {
      return {
        reply: 'أهلين! شو رايك اقترح لك شي من قائمتنا؟',
        suggestions: [],
        conversationType: 'menu_focused'
      };
    }
  }
  
  // Force empty suggestions if user wants chat only
  if (intent.wantsChat && !intent.wantsMenu) {
    return {
      reply: String(response.reply || 'أهلين!').slice(0, 300),
      suggestions: [],
      conversationType: 'chat'
    };
  }
  
  // Validate menu suggestions
  const validSuggestions = [];
  const sections = digest.sections || {};
  
  if (Array.isArray(response.suggestions) && intent.wantsMenu) {
    for (const suggestion of response.suggestions) {
      const section = sections[suggestion.section];
      if (section) {
        const item = section.items.find(it => it.id === suggestion.id);
        if (item && !intent.suggestedItems.has(item.arName)) {
          validSuggestions.push({
            id: item.id,
            section: suggestion.section,
            arName: item.arName,
            price: item.price || 'السعر غير محدد',
            badge: item.badge || '',
            images: item.images || []
          });
          if (validSuggestions.length >= maxSuggestions) break;
        }
      }
    }
  }
  
  return {
    reply: String(response.reply || 'أهلين!').slice(0, 300),
    suggestions: validSuggestions,
    conversationType: response.conversationType || (intent.wantsMenu ? 'menu_focused' : 'chat')
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body;
  try { 
    body = await (async() => { 
      try { return await req.json(); } 
      catch { return req.body; } 
    })(); 
  } catch { 
    body = req.body; 
  }
  
  const { sessionId = '', messages = [], maxSuggestions = 3 } = body || {};
  
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
  const key = `${sessionId || 'anon'}|${ip}`;
  if (!rateLimit(key, 1200)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Service configuration error' });
  }

  try {
    const digest = await buildMenuDigest();
    const intent = analyzeUserIntent(messages);
    const prompt = buildContextAwarePrompt(digest, messages, maxSuggestions);
    
    const rawResponse = await callGemini(apiKey, prompt);
    const finalResponse = parseAndValidateResponse(rawResponse, digest, intent, maxSuggestions);
    
    res.status(200).json(finalResponse);
    
  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({ 
      reply: 'عذراً، في مشكلة تقنية صغيرة. جرب مرة تانية.',
      suggestions: [],
      conversationType: 'chat'
    });
  }
}