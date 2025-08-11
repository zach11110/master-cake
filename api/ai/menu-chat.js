// Smart Professional Menu Assistant using Gemini 1.5 Flash
// Intelligently handles both casual chat and menu suggestions
// Tracks conversation context to avoid repetition and provide relevant responses

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
        desc: (it.descriptionAr || it.descriptionEn || '').slice(0, 120),
        badge: it.badge || ''
      }));
      digest.sections[key] = { ar: sec.ar || key, en: sec.en || key, items: compactItems };
    }
  }
  MENU_CACHE = { digest, expiresAt: nowMs() + 5 * 60 * 1000 };
  return digest;
}

function analyzeConversationContext(messages) {
  const userMessages = messages.filter(m => m.role === 'user').slice(-5);
  const assistantMessages = messages.filter(m => m.role === 'assistant').slice(-5);
  
  // Track what was already suggested to avoid repetition
  const suggestedItems = new Set();
  assistantMessages.forEach(msg => {
    const content = msg.content || '';
    // Extract suggested items from previous responses
    const matches = content.match(/كابتشينو|شاي|آيس كريم|كريب|فستق|أركيلة|تشيزكيك/g);
    if (matches) matches.forEach(item => suggestedItems.add(item));
  });

  const recentUserText = userMessages.map(m => (m.content || '').toLowerCase()).join(' ');
  
  // Detect conversation intent
  const chatOnlyKeywords = /(ما بدي|مابدي|لا بدي|مو حابب|مالي جوعان|مالي عطشان|ما عبالي|بس دردش|دردشة|نحكي|احكي|كيفك|شلونك|اخبارك|شو ماك)/;
  const menuInterestKeywords = /(بدي|حابب|شو عندكن|عبالي|اقتراح|بارد|ساخن|دافئ|حلو|حلويات|آيس|قهوة|شاي|بوظة|سموذي|موهيتو|كريم|شوكولا|مشروب|اكل)/;
  const priceInterestKeywords = /(رخيص|غالي|سعر|كم|ميزانية|وفر|اقتصاد)/;
  
  const isJustChatting = chatOnlyKeywords.test(recentUserText) && !menuInterestKeywords.test(recentUserText);
  const wantsMenuSuggestion = menuInterestKeywords.test(recentUserText);
  const careAboutPrice = priceInterestKeywords.test(recentUserText);
  
  // Detect mood/preferences
  const wantsCold = /(بارد|منعش|حار|صيف|عطش|آيس|ثلج)/i.test(recentUserText);
  const wantsHot = /(دافئ|ساخن|برد|شتا|دفا|حر)/i.test(recentUserText);
  const wantsSweet = /(حلو|سكر|شوكولا|كيك|حلويات|كريم)/i.test(recentUserText);
  const wantsDrink = /(اشرب|مشروب|قهوة|شاي|عصير)/i.test(recentUserText);
  
  return {
    suggestedItems,
    isJustChatting,
    wantsMenuSuggestion,
    careAboutPrice,
    preferences: {
      cold: wantsCold,
      hot: wantsHot,
      sweet: wantsSweet,
      drink: wantsDrink
    }
  };
}

function buildSmartPrompt(menuDigest, messages, maxSuggestions = 3) {
  const context = analyzeConversationContext(messages);
  const suggestedBefore = Array.from(context.suggestedItems).join(', ');
  
  const system = `أنت "ماستر" من بوظة ماستر كيك - مساعد ذكي ومهني.

**سلوكك:**
- تكلم باللهجة السورية، طبيعي ومهني
- اجعل المحادثة ممتعة وذكية
- لا تكرر اقتراحات سابقة: تم اقتراحها مسبقاً = [${suggestedBefore}]
- فهم السياق: هل المستخدم يدردش فقط أم يريد اقتراحات؟

**قواعد مهمة:**
- المستخدم لا يستطيع "الطلب" - فقط يستطيع رؤية العناصر والأسعار
- لا تسأل "بدك تطلب؟" أو "بدك تضيف؟" 
- بدلاً من ذلك: "شو رايك؟" أو "يمكن يعجبك"
- إذا كان يدردش فقط، تجاوب بطبيعية واقترح بشكل غير مباشر

**السياق الحالي:**
- يدردش فقط: ${context.isJustChatting}
- يريد اقتراحات: ${context.wantsMenuSuggestion}
- يهتم بالسعر: ${context.careAboutPrice}
- التفضيلات: ${JSON.stringify(context.preferences)}

**الاستجابة:**
JSON فقط مع:
{
  "reply": "رد ذكي مناسب للسياق",
  "suggestions": [{"id":"...","section":"...","arName":"...","price":"..."}],
  "conversationType": "chat|menu_focused|mixed"
}`;

  const digestText = JSON.stringify(menuDigest, null, 2);
  const recentChat = messages.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n');
  
  const examples = `**أمثلة ذكية:**

المستخدم: كيفك؟
المساعد: {"reply":"أهلين! الحمدلله تمام. شو ماكك اليوم؟","suggestions":[],"conversationType":"chat"}

المستخدم: مابدي اكل شي، بس نحكي
المساعد: {"reply":"تمام، أهلاً وسهلاً! شو اخبار اليوم معك؟","suggestions":[],"conversationType":"chat"}

المستخدم: عبالي شي بارد
المساعد: {"reply":"في هالحر؟ ايسد امريكانو منعش وقوي، أو آيس كريم كيكة الماستر لذيذ كتير","suggestions":[{"id":"iced-americano","section":"cold_drinks","arName":"ايسد امريكانو","price":"25000"}],"conversationType":"menu_focused"}`;

  return `${system}\n\n**القائمة:**\n${digestText}\n\n${examples}\n\n**المحادثة:**\n${recentChat}\n\nالمساعد (JSON فقط):`;
}

async function callGemini(apiKey, prompt) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      contents: [{ role: 'user', parts: [{ text: prompt }] }], 
      generationConfig: { 
        temperature: 0.7, 
        maxOutputTokens: 400,
        topP: 0.9
      } 
    })
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map(p => p.text).filter(Boolean).join('\n').trim();
  return text;
}

function validateAndCleanResponse(text, digest, maxSuggestions, context) {
  let cleanText = text;
  
  // Clean markdown formatting
  cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  // Try to extract JSON
  const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
  let response = null;
  
  if (jsonMatch) {
    try { 
      response = JSON.parse(jsonMatch[0]); 
    } catch (e) { 
      console.log('JSON parse error:', e.message);
      response = null; 
    }
  }
  
  // Fallback response
  if (!response || typeof response !== 'object') {
    return {
      reply: 'أهلين فيك! شو بدك تحكي اليوم؟',
      suggestions: [],
      conversationType: 'chat'
    };
  }
  
  // Validate suggestions against actual menu
  const validSuggestions = [];
  const sections = digest.sections || {};
  
  if (Array.isArray(response.suggestions)) {
    for (const suggestion of response.suggestions) {
      const section = sections[suggestion.section];
      if (section) {
        const item = section.items.find(it => it.id === suggestion.id);
        if (item && !context.suggestedItems.has(item.arName)) {
          validSuggestions.push({
            id: item.id,
            section: suggestion.section,
            arName: item.arName,
            price: item.price || 'السعر غير محدد',
            badge: item.badge || ''
          });
          if (validSuggestions.length >= maxSuggestions) break;
        }
      }
    }
  }
  
  return {
    reply: String(response.reply || 'أهلين فيك!').slice(0, 300),
    suggestions: validSuggestions,
    conversationType: response.conversationType || 'mixed'
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

  // Rate limiting
  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
  const key = `${sessionId || 'anon'}|${ip}`;
  if (!rateLimit(key, 1200)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Service configuration error' });
  }

  try {
    const digest = await buildMenuDigest();
    const context = analyzeConversationContext(messages);
    const prompt = buildSmartPrompt(digest, messages, maxSuggestions);
    
    const rawResponse = await callGemini(apiKey, prompt);
    const finalResponse = validateAndCleanResponse(rawResponse || '', digest, maxSuggestions, context);
    
    res.status(200).json(finalResponse);
    
  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({ 
      reply: 'عذراً، في مشكلة تقنية. جرب مرة تانية.',
      suggestions: [],
      conversationType: 'chat'
    });
  }
}