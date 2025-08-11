// COMPLETELY REWRITTEN: Actually Smart Menu Assistant
// Simple, clear logic that understands context properly

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

function isMenuRequest(userMessage) {
  const msg = userMessage.toLowerCase();
  
  // Clear menu requests
  const menuKeywords = [
    'شو عندكم', 'شو عندك', 'ايش عندكم', 'ايش عندك',
    'بدي', 'عبالي', 'حابب', 'اقتراح',
    'بوظة', 'آيس كريم', 'قهوة', 'شاي', 'كابتشينو',
    'حلو', 'حلويات', 'كريم', 'شوكولا',
    'بارد', 'ساخن', 'دافئ', 'منعش',
    'اركيل', 'أركيلة', 'نرجيلة',
    'اشرب', 'مشروب', 'تشرب', 'للشرب'
  ];
  
  return menuKeywords.some(keyword => msg.includes(keyword));
}

function isChatOnly(userMessage) {
  const msg = userMessage.toLowerCase();
  
  // Clear chat-only indicators
  const chatKeywords = [
    'نحكي', 'احكي', 'دردش', 'كيفك', 'شلونك', 
    'اخبارك', 'شو ماك', 'حكيلي', 'خبرني',
    'مرحبا', 'هلا', 'السلام', 'أهلين',
    'تعبان', 'زهقان', 'حزين', 'مبسوط',
    'عن الحب', 'فيلم', 'لعبة', 'كتاب'
  ];
  
  // Strong rejection of menu
  const rejectMenu = [
    'مابدي', 'ما بدي', 'لا بدي', 'مو عايز',
    'ما عبالي', 'مالي', 'مش جوعان', 'مش عطشان'
  ];
  
  const hasChat = chatKeywords.some(keyword => msg.includes(keyword));
  const hasReject = rejectMenu.some(keyword => msg.includes(keyword));
  
  return hasChat || hasReject;
}

function extractSuggestedItems(messages) {
  const suggestedItems = new Set();
  const assistantMessages = messages.filter(m => m.role === 'assistant').slice(-5);
  
  assistantMessages.forEach(msg => {
    const content = msg.content || '';
    // Look for **item_name** patterns
    const itemMatches = content.match(/\*\*(.*?)\*\*/g);
    if (itemMatches) {
      itemMatches.forEach(match => {
        const item = match.replace(/\*\*/g, '');
        if (item.length > 3 && !item.match(/^\d+$/)) { // Ignore prices
          suggestedItems.add(item);
        }
      });
    }
  });
  
  return suggestedItems;
}

function buildPrompt(menuDigest, messages, isMenuMode) {
  const recentChat = messages.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n');
  const suggestedItems = extractSuggestedItems(messages);
  const suggestedList = Array.from(suggestedItems).join(', ');

  if (isMenuMode) {
    return `أنت "ماستر" من بوظة ماستر كيك - نادل ذكي ومهني.

المستخدم يطلب اقتراحات من القائمة.

**مهمتك:**
- اقترح 1-2 عناصر مناسبة من القائمة
- لا تقترح هذه العناصر مرة ثانية: ${suggestedList}
- كن مهني وودود باللهجة السورية
- اذكر الاسم والسعر بوضوح

**القائمة المتاحة:**
${JSON.stringify(menuDigest, null, 2)}

رد JSON فقط:
{
  "reply": "رد مهني مع اقتراح",
  "suggestions": [{"id":"...","section":"...","arName":"...","price":"...","images":[]}]
}

**المحادثة:**
${recentChat}

المساعد:`;
  } else {
    return `أنت "ماستر" - شخصية ودودة من بوظة ماستر كيك.

المستخدم يريد الدردشة فقط، ليس اقتراحات طعام.

**مهمتك:**
- تكلم بطبيعية باللهجة السورية
- كن ودود ومرح
- لا تذكر الطعام أو القائمة نهائياً
- ركز على المحادثة الطبيعية

رد JSON فقط:
{
  "reply": "رد طبيعي بدون ذكر طعام",
  "suggestions": []
}

**المحادثة:**
${recentChat}

المساعد:`;
  }
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
        maxOutputTokens: 300
      } 
    })
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text).filter(Boolean).join('\n').trim();
}

function validateResponse(rawText, digest, isMenuMode) {
  let cleanText = rawText || '';
  cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
  let response = null;
  
  if (jsonMatch) {
    try { 
      response = JSON.parse(jsonMatch[0]); 
    } catch (e) { 
      console.log('JSON parse failed:', e);
    }
  }
  
  // Fallback
  if (!response) {
    if (isMenuMode) {
      return {
        reply: 'أهلين! شو رايك اقترح لك شي من قائمتنا؟',
        suggestions: []
      };
    } else {
      return {
        reply: 'أهلين! شو بدك نحكي عنه؟',
        suggestions: []
      };
    }
  }
  
  // Force empty suggestions if not menu mode
  if (!isMenuMode) {
    return {
      reply: String(response.reply || 'أهلين!').slice(0, 300),
      suggestions: []
    };
  }
  
  // Validate suggestions for menu mode
  const validSuggestions = [];
  const sections = digest.sections || {};
  
  if (Array.isArray(response.suggestions)) {
    for (const suggestion of response.suggestions) {
      const section = sections[suggestion.section];
      if (section) {
        const item = section.items.find(it => it.id === suggestion.id);
        if (item) {
          validSuggestions.push({
            id: item.id,
            section: suggestion.section,
            arName: item.arName,
            price: item.price || 'السعر غير محدد',
            badge: item.badge || '',
            images: item.images || []
          });
          if (validSuggestions.length >= 2) break;
        }
      }
    }
  }
  
  return {
    reply: String(response.reply || 'أهلين!').slice(0, 300),
    suggestions: validSuggestions
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
  
  const { sessionId = '', messages = [] } = body || {};
  
  if (!Array.isArray(messages) || messages.length === 0) {
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
    // Get the last user message to understand intent
    const lastUserMessage = messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
    
    // Simple, clear decision logic
    let isMenuMode = false;
    
    if (isMenuRequest(lastUserMessage)) {
      isMenuMode = true;
    } else if (isChatOnly(lastUserMessage)) {
      isMenuMode = false;
    } else {
      // Default to chat if unclear
      isMenuMode = false;
    }
    
    const digest = await buildMenuDigest();
    const prompt = buildPrompt(digest, messages, isMenuMode);
    
    const rawResponse = await callGemini(apiKey, prompt);
    const finalResponse = validateResponse(rawResponse, digest, isMenuMode);
    
    res.status(200).json(finalResponse);
    
  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({ 
      reply: 'عذراً، في مشكلة تقنية. جرب مرة تانية.',
      suggestions: []
    });
  }
}