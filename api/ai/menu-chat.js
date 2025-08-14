// SMART MENU ASSISTANT: Two-Step AI Approach
// Step 1: Intelligent Intent Classification
// Step 2: Context-Aware Response Generation

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

function extractConversationContext(messages) {
  // Get last 6 messages for better context
  const recentMessages = messages.slice(-6);
  
  // Extract previously suggested items
  const suggestedItems = new Set();
  const assistantMessages = recentMessages.filter(m => m.role === 'assistant');
  assistantMessages.forEach(msg => {
    const content = msg.content || '';
    const itemMatches = content.match(/\*\*(.*?)\*\*/g);
    if (itemMatches) {
      itemMatches.forEach(match => {
        const item = match.replace(/\*\*/g, '');
        if (item.length > 3 && !item.match(/^\d+$/)) {
          suggestedItems.add(item);
        }
      });
    }
  });
  
  // Detect conversation flow patterns
  const conversationFlow = [];
  for (let i = Math.max(0, recentMessages.length - 4); i < recentMessages.length; i++) {
    const msg = recentMessages[i];
    if (msg) {
      conversationFlow.push({
        role: msg.role,
        content: (msg.content || '').slice(0, 100),
        timestamp: i
      });
    }
  }
  
  return {
    suggestedItems: Array.from(suggestedItems),
    conversationFlow,
    lastUserMessage: messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '',
    conversationLength: messages.length
  };
}

// STEP 1: Smart Intent Classification
function buildIntentClassifierPrompt(context) {
  return `أنت خبير في فهم النوايا للهجة السورية. 

**المهمة:** حلل المحادثة وحدد نية المستخدم بدقة.

**السياق:**
- آخر رسالة: "${context.lastUserMessage}"
- العناصر المقترحة سابقاً: ${context.suggestedItems.join(', ') || 'لا يوجد'}
- طول المحادثة: ${context.conversationLength} رسالة

**تدفق المحادثة الأخير:**
${context.conversationFlow.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

**انتبه للإشارات التالية:**

**نية القائمة (MENU_INTENT):**
- طلب مباشر: "شو عندكم"، "اقترح علي"، "بدي شي"
- استفسار عن نوع: "في بوظة؟"، "عندكم قهوة؟"، "شو في حلو؟"
- رد إيجابي على اقتراح: "اي"، "تمام"، "حلو"
- طلب بديل: "شي تاني"، "غير هيك"

**نية الدردشة (CHAT_INTENT):**
- تحية: "مرحبا"، "كيفك"، "شلونك"
- دردشة شخصية: "شو اخبارك"، "كيف يومك"
- مواضيع عامة: "حكيلي عن..."، "شو رايك"
- رفض القائمة: "مابدي اكل"، "مش جوعان"

**نية مختلطة (MIXED_INTENT):**
- سؤال + طلب: "كيفك؟ شو عندكم؟"
- دردشة تؤدي لطلب

رد بـ JSON فقط:
{
  "intent": "MENU_INTENT|CHAT_INTENT|MIXED_INTENT",
  "confidence": 0.0-1.0,
  "reasoning": "سبب قصير للقرار",
  "context_clues": ["دلائل من السياق"]
}`;
}

// STEP 2A: Menu Response Generator
function buildMenuResponsePrompt(context, menuDigest) {
  return `أنت "ماستر" - نادل محترف ودود من بوظة ماستر كيك. تتكلم باللهجة السورية بطبيعية.

**الموقف:** المستخدم يريد اقتراحات من القائمة.

**السياق:**
- آخر رسالة: "${context.lastUserMessage}"
- عناصر مقترحة سابقاً: ${context.suggestedItems.join(', ') || 'لا يوجد'}

**قواعد مهمة:**
- اقترح 1-2 عناصر مناسبة فقط
- لا تكرر العناصر المقترحة سابقاً
- اذكر الاسم والسعر بوضوح  
- كن ودود ومهني
- استخدم اللهجة السورية الطبيعية

**القائمة المتاحة:**
${JSON.stringify(menuDigest, null, 2)}

**أمثلة على الردود الجيدة:**
- "أهلين! شو رايك **كابتشينو** (12500 ل.س) دافي ولذيذ؟"
- "يا مرحبا! عنا **آيس كريم كيكة الماستر** (15000 ل.س) طعم رائع!"

رد بـ JSON فقط:
{
  "reply": "رد ودود مع اقتراح واضح",
  "suggestions": [{"id":"...","section":"...","arName":"...","price":"...","badge":"...","images":[]}]
}`;
}

// STEP 2B: Chat Response Generator  
function buildChatResponsePrompt(context) {
  return `أنت "ماستر" - شخصية ودودة من بوظة ماستر كيك. تتكلم باللهجة السورية بطبيعية.

**الموقف:** المستخدم يريد الدردشة العادية.

**السياق:**
- آخر رسالة: "${context.lastUserMessage}"
- طول المحادثة: ${context.conversationLength} رسالة

**قواعد مهمة:**
- تكلم بطبيعية باللهجة السورية
- كن ودود ومرح ولبق
- لا تذكر الطعام أو القائمة إلا إذا سأل
- ركز على المحادثة الطبيعية
- اجعل الرد قصير ومناسب

**تدفق المحادثة:**
${context.conversationFlow.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

**أمثلة على الردود الجيدة:**
- "أهلين وسهلين! كيفك اليوم؟"
- "يا مرحبا فيك! شو اخبارك؟"
- "الله يعطيك العافية! شو عملت اليوم؟"

رد بـ JSON فقط:
{
  "reply": "رد طبيعي ودود",
  "suggestions": []
}`;
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
        maxOutputTokens: 400
      } 
    })
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text).filter(Boolean).join('\n').trim();
}

function parseJsonResponse(rawText) {
  let cleanText = rawText || '';
  cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { 
      return JSON.parse(jsonMatch[0]); 
    } catch (e) { 
      console.log('JSON parse failed:', e);
    }
  }
  return null;
}

function validateMenuResponse(response, digest) {
  if (!response) return null;
  
  const validSuggestions = [];
  const sections = digest.sections || {};
  
  if (Array.isArray(response.suggestions)) {
    for (const suggestion of response.suggestions.slice(0, 2)) {
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
        }
      }
    }
  }
  
  return {
    reply: String(response.reply || 'أهلين! كيف بقدر ساعدك؟').slice(0, 400),
    suggestions: validSuggestions
  };
}

function validateChatResponse(response) {
  if (!response) return null;
  
  return {
    reply: String(response.reply || 'أهلين! شو اخبارك؟').slice(0, 400),
    suggestions: []
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
  if (!rateLimit(key, 1000)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Service configuration error' });
  }

  try {
    // Extract conversation context
    const context = extractConversationContext(messages);
    
    // STEP 1: Classify Intent
    const intentPrompt = buildIntentClassifierPrompt(context);
    const intentRawResponse = await callGemini(apiKey, intentPrompt);
    const intentResult = parseJsonResponse(intentRawResponse);
    
    console.log('Intent Classification:', intentResult);
    
    if (!intentResult) {
      return res.status(500).json({ 
        reply: 'عذراً، في مشكلة تقنية. جرب مرة تانية.',
        suggestions: []
      });
    }
    
    // STEP 2: Generate appropriate response based on intent
    let finalResponse;
    
    if (intentResult.intent === 'MENU_INTENT' || intentResult.intent === 'MIXED_INTENT') {
      // Load menu and generate menu response
      const digest = await buildMenuDigest();
      const menuPrompt = buildMenuResponsePrompt(context, digest);
      const menuRawResponse = await callGemini(apiKey, menuPrompt);
      const menuResponse = parseJsonResponse(menuRawResponse);
      finalResponse = validateMenuResponse(menuResponse, digest);
      
    } else {
      // Generate chat response
      const chatPrompt = buildChatResponsePrompt(context);
      const chatRawResponse = await callGemini(apiKey, chatPrompt);
      const chatResponse = parseJsonResponse(chatRawResponse);
      finalResponse = validateChatResponse(chatResponse);
    }
    
    // Fallback if validation fails
    if (!finalResponse) {
      finalResponse = {
        reply: 'أهلين وسهلين! كيف بقدر ساعدك اليوم؟',
        suggestions: []
      };
    }
    
    res.status(200).json(finalResponse);
    
  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({ 
      reply: 'عذراً، في مشكلة تقنية. جرب مرة تانية.',
      suggestions: []
    });
  }
}