// ULTRA-SMART MENU ASSISTANT: Context-Aware System
// Enhanced with conversation state tracking and better Syrian dialect understanding

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

// Enhanced context extraction with conversation state tracking
function extractConversationContext(messages) {
  const recentMessages = messages.slice(-8); // Get more context
  
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
  
  // Analyze conversation state
  const userMessages = recentMessages.filter(m => m.role === 'user');
  const lastUserMessage = userMessages.slice(-1)[0]?.content || '';
  const previousUserMessage = userMessages.slice(-2)[0]?.content || '';
  
  // Detect conversation flow and state
  const conversationState = {
    justSuggestedMenu: false,
    userAskedForMore: false,
    userWantsColdDrinks: false,
    userWantsIceCream: false,
    userWantsSpecificType: '',
    conversationTopic: 'greeting'
  };
  
  // Check if we just suggested menu items
  const lastAssistantMsg = recentMessages.filter(m => m.role === 'assistant').slice(-1)[0];
  if (lastAssistantMsg && lastAssistantMsg.content && lastAssistantMsg.content.includes('**')) {
    conversationState.justSuggestedMenu = true;
  }
  
  // Detect specific requests
  const lowerMsg = lastUserMessage.toLowerCase();
  if (lowerMsg.includes('بوظة') || lowerMsg.includes('آيس كريم')) {
    conversationState.userWantsIceCream = true;
    conversationState.userWantsSpecificType = 'ice_cream';
  }
  if (lowerMsg.includes('مشاريب باردة') || lowerMsg.includes('بارد')) {
    conversationState.userWantsColdDrinks = true;
    conversationState.userWantsSpecificType = 'cold_drinks';
  }
  if (lowerMsg.includes('في شي لسا') || lowerMsg.includes('شي تاني') || lowerMsg.includes('كمان')) {
    conversationState.userAskedForMore = true;
  }
  
  return {
    suggestedItems: Array.from(suggestedItems),
    lastUserMessage,
    previousUserMessage,
    conversationLength: messages.length,
    conversationState,
    recentFlow: recentMessages.slice(-4).map(msg => ({
      role: msg.role,
      content: (msg.content || '').slice(0, 150)
    }))
  };
}

// SMART INTENT DETECTION: Rule-based + AI hybrid approach
function detectIntentHybrid(context) {
  const msg = context.lastUserMessage.toLowerCase().trim();
  const prevMsg = context.previousUserMessage.toLowerCase();
  const state = context.conversationState;
  
  // EXPLICIT MENU REQUESTS - High confidence
  const explicitMenuKeywords = [
    'شو عندكم', 'اقترح علي', 'بدي شي', 'عبالي بوظة', 'عبالي آيس كريم',
    'في بوظة', 'عندكم قهوة', 'مشاريب باردة', 'شو في حلو',
    'في شي لسا', 'شي تاني', 'كمان شي', 'غير هيك'
  ];
  
  for (const keyword of explicitMenuKeywords) {
    if (msg.includes(keyword)) {
      return {
        intent: 'MENU_INTENT',
        confidence: 0.95,
        method: 'rule_based',
        reasoning: `Detected explicit menu keyword: "${keyword}"`
      };
    }
  }
  
  // CONTINUATION REQUESTS - Check context
  const continuationKeywords = ['في شي', 'شي لسا', 'كمان', 'تاني'];
  if (continuationKeywords.some(k => msg.includes(k)) && state.justSuggestedMenu) {
    return {
      intent: 'MENU_INTENT',
      confidence: 0.9,
      method: 'context_based',
      reasoning: 'User asking for more after menu suggestions'
    };
  }
  
  // EXPLICIT CHAT/REJECTION - High confidence
  const explicitChatKeywords = [
    'ماعبالي', 'ما بدي', 'مابدي', 'مش عايز', 'لا شكرا',
    'عبالي ندردش', 'بدي احكي', 'نتسلى', 'زهقان', 'ملل'
  ];
  
  for (const keyword of explicitChatKeywords) {
    if (msg.includes(keyword)) {
      return {
        intent: 'CHAT_INTENT',
        confidence: 0.95,
        method: 'rule_based',
        reasoning: `Detected explicit chat/rejection keyword: "${keyword}"`
      };
    }
  }
  
  // SPECIFIC TYPE REQUESTS
  if (msg.includes('بوظة') || msg.includes('آيس كريم')) {
    return {
      intent: 'MENU_INTENT',
      confidence: 0.9,
      method: 'type_specific',
      reasoning: 'User wants ice cream specifically',
      targetCategory: 'ice_cream'
    };
  }
  
  if (msg.includes('مشاريب') || (msg.includes('بارد') && (msg.includes('شو') || msg.includes('عندكم')))) {
    return {
      intent: 'MENU_INTENT',
      confidence: 0.9,
      method: 'type_specific',
      reasoning: 'User wants cold drinks specifically',
      targetCategory: 'cold_drinks'
    };
  }
  
  // AMBIGUOUS CASES - Need AI classification
  const ambiguousKeywords = ['كيفك', 'أهلين', 'مرحبا', 'تمام', 'اي', 'حلو'];
  if (ambiguousKeywords.some(k => msg.includes(k))) {
    return {
      intent: 'NEEDS_AI_CLASSIFICATION',
      confidence: 0.5,
      method: 'ambiguous',
      reasoning: 'Ambiguous message needs AI analysis'
    };
  }
  
  // DEFAULT: Likely chat
  return {
    intent: 'CHAT_INTENT',
    confidence: 0.7,
    method: 'default',
    reasoning: 'No clear menu indicators, defaulting to chat'
  };
}

// AI Intent Classification (only for ambiguous cases)
function buildAIIntentPrompt(context) {
  return `أنت خبير تحليل النوايا للهجة السورية. حلل هذه المحادثة بدقة.

**المحادثة الأخيرة:**
${context.recentFlow.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

**السياق المهم:**
- العناصر المقترحة سابقاً: ${context.suggestedItems.join(', ') || 'لا يوجد'}
- هل اقترحنا قائمة للتو؟ ${context.conversationState.justSuggestedMenu ? 'نعم' : 'لا'}
- طول المحادثة: ${context.conversationLength} رسالة

**قواعد التحليل:**
1. إذا المستخدم قال "ولاشي عبالي بوظة" = يريد بوظة → MENU_INTENT
2. إذا قال "في شي لسا؟" بعد اقتراحات = يريد المزيد → MENU_INTENT
3. إذا قال "عندكم مشاريب باردة؟" = يريد مشروبات → MENU_INTENT
4. إذا قال "كيفك" فقط بدون طلب = دردشة → CHAT_INTENT
5. إذا قال "ماعبالي" أو "ملل" = دردشة → CHAT_INTENT

**آخر رسالة للتحليل:** "${context.lastUserMessage}"

رد بـ JSON فقط:
{
  "intent": "MENU_INTENT|CHAT_INTENT",
  "confidence": 0.0-1.0,
  "reasoning": "سبب القرار بوضوح"
}`;
}

// Enhanced Menu Response with category awareness
function buildSmartMenuPrompt(context, menuDigest, targetCategory = null) {
  let categoryFocus = '';
  if (targetCategory) {
    categoryFocus = `**مهم جداً:** المستخدم يريد "${targetCategory}" تحديداً، ركز على هذا القسم.`;
  } else if (context.conversationState.userWantsIceCream) {
    categoryFocus = `**مهم جداً:** المستخدم طلب بوظة/آيس كريم، ركز على قسم البوظة.`;
    targetCategory = 'ice_cream';
  } else if (context.conversationState.userWantsColdDrinks) {
    categoryFocus = `**مهم جداً:** المستخدم طلب مشروبات باردة، ركز على المشروبات الباردة.`;
    targetCategory = 'cold_drinks';
  }

  return `أنت "ماستر" - نادل محترف ودود من بوظة ماستر كيك.

**الموقف:** المستخدم يريد اقتراحات من القائمة.
${categoryFocus}

**السياق:**
- آخر رسالة: "${context.lastUserMessage}"
- العناصر المقترحة سابقاً: ${context.suggestedItems.join(', ') || 'لا يوجد'}
- هل يطلب المزيد؟ ${context.conversationState.userAskedForMore ? 'نعم' : 'لا'}

**قواعد ذهبية:**
- اقترح 1-2 عناصر جديدة فقط
- لا تكرر العناصر المقترحة سابقاً أبداً
- اذكر الاسم والسعر بوضوح
- استخدم اللهجة السورية الطبيعية
- كن ودود ومهني

**القائمة:**
${JSON.stringify(menuDigest, null, 2)}

**أمثلة ردود صحيحة:**
- "أهلين! شو رايك **فستق حلبي** بوظة كريمية؟"
- "يا مرحبا! عنا **شاي أخضر** (20000 ل.س) منعش ودافي!"

رد بـ JSON فقط:
{
  "reply": "رد ودود مع اقتراح جديد",
  "suggestions": [{"id":"...","section":"...","arName":"...","price":"...","badge":"...","images":[]}]
}`;
}

// Enhanced Chat Response
function buildSmartChatPrompt(context) {
  return `أنت "ماستر" - شخصية ودودة من بوظة ماستر كيك.

**المهمة:** دردشة طبيعية بدون ذكر طعام نهائياً.

**السياق:**
- آخر رسالة: "${context.lastUserMessage}"
- المحادثة الأخيرة:
${context.recentFlow.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

**قواعد صارمة:**
- ممنوع ذكر أي طعام أو شراب أو قائمة
- ممنوع ذكر أسعار
- ركز على: المزاج، اليوم، الطقس، المشاعر
- كن ودود ومتفهم
- استخدم اللهجة السورية الطبيعية
- رد قصير (جملة أو اثنين)

**أمثلة ردود مناسبة:**
- "الله يعطيك العافية! شو صار معك اليوم؟"
- "يا هلا فيك! شو أخبارك؟"
- "تمام حبيبي، كيف مزاجك اليوم؟"

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
        temperature: 0.8, 
        maxOutputTokens: 500
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
  if (!rateLimit(key, 800)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Service configuration error' });
  }

  try {
    // STEP 1: Extract enhanced context
    const context = extractConversationContext(messages);
    
    // STEP 2: Hybrid Intent Detection
    let intentResult = detectIntentHybrid(context);
    
    console.log('Hybrid Intent Detection:', intentResult);
    
    // STEP 3: AI classification for ambiguous cases only
    if (intentResult.intent === 'NEEDS_AI_CLASSIFICATION') {
      const aiPrompt = buildAIIntentPrompt(context);
      const aiResponse = await callGemini(apiKey, aiPrompt);
      const aiResult = parseJsonResponse(aiResponse);
      
      if (aiResult) {
        intentResult = {
          intent: aiResult.intent,
          confidence: aiResult.confidence,
          method: 'ai_classified',
          reasoning: aiResult.reasoning
        };
      } else {
        // Fallback to chat if AI fails
        intentResult.intent = 'CHAT_INTENT';
        intentResult.confidence = 0.6;
      }
    }
    
    console.log('Final Intent:', intentResult);
    
    // STEP 4: Generate response based on intent
    let finalResponse;
    
    if (intentResult.intent === 'MENU_INTENT') {
      const digest = await buildMenuDigest();
      const menuPrompt = buildSmartMenuPrompt(context, digest, intentResult.targetCategory);
      const menuRawResponse = await callGemini(apiKey, menuPrompt);
      const menuResponse = parseJsonResponse(menuRawResponse);
      finalResponse = validateMenuResponse(menuResponse, digest);
      
    } else {
      const chatPrompt = buildSmartChatPrompt(context);
      const chatRawResponse = await callGemini(apiKey, chatPrompt);
      const chatResponse = parseJsonResponse(chatRawResponse);
      finalResponse = validateChatResponse(chatResponse);
    }
    
    // Enhanced fallback
    if (!finalResponse) {
      if (intentResult.intent === 'MENU_INTENT') {
        finalResponse = {
          reply: 'أهلين وسهلين! شو حابب اقترح لك من قائمتنا؟',
          suggestions: []
        };
      } else {
        finalResponse = {
          reply: 'أهلين فيك! شو اخبارك اليوم؟',
          suggestions: []
        };
      }
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