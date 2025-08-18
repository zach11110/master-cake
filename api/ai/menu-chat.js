// ULTRA-SMART MENU ASSISTANT: Advanced Intent & Mood Detection System
// Two-stage AI processing with context-aware responses

let MENU_CACHE = { digest: null, expiresAt: 0 };
const RATE_BUCKET = new Map();
const CONVERSATION_STATE = new Map(); // Track conversation state per session

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
        enName: it.enName,
        price: it.price || '',
        desc: it.descriptionAr || it.descriptionEn || '',
        badge: it.badge || '',
        images: it.images || [],
        category: key
      }));
      digest.sections[key] = { 
        ar: sec.ar || key, 
        en: sec.en || key, 
        items: compactItems 
      };
    }
  }
  MENU_CACHE = { digest, expiresAt: nowMs() + 5 * 60 * 1000 };
  return digest;
}

// Extract comprehensive context from conversation
function extractFullContext(messages, sessionId) {
  const recentMessages = messages.slice(-10);
  const sessionState = CONVERSATION_STATE.get(sessionId) || {
    suggestedItems: [],
    discussedItems: [],
    lastIntent: null,
    moodHistory: []
  };
  
  // Extract all mentioned items from conversation
  const mentionedItems = new Set();
  const suggestedItems = new Set();
  
  recentMessages.forEach(msg => {
    const content = msg.content || '';
    // Extract items mentioned by assistant (between **)
    const itemMatches = content.match(/\*\*(.*?)\*\*/g);
    if (itemMatches && msg.role === 'assistant') {
      itemMatches.forEach(match => {
        const item = match.replace(/\*\*/g, '').trim();
        if (item.length > 2) {
          suggestedItems.add(item);
          mentionedItems.add(item.toLowerCase());
        }
      });
    }
    // Extract any item names mentioned in general
    if (msg.role === 'user') {
      const lowerContent = content.toLowerCase();
      ['كابتشينو', 'شاي', 'بوظة', 'آيس كريم', 'أركيلة', 'كريب', 'تشيزكيك'].forEach(item => {
        if (lowerContent.includes(item)) {
          mentionedItems.add(item);
        }
      });
    }
  });
  
  // Build conversation flow
  const conversationFlow = recentMessages.map(msg => ({
    role: msg.role,
    content: msg.content || '',
    timestamp: msg.timestamp || null
  }));
  
  // Get last messages
  const lastUserMessage = recentMessages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
  const lastAssistantMessage = recentMessages.filter(m => m.role === 'assistant').slice(-1)[0]?.content || '';
  const previousUserMessages = recentMessages.filter(m => m.role === 'user').slice(-3).map(m => m.content);
  
  // Update session state
  sessionState.suggestedItems = Array.from(suggestedItems);
  sessionState.discussedItems = Array.from(mentionedItems);
  CONVERSATION_STATE.set(sessionId, sessionState);
  
  return {
    lastUserMessage,
    lastAssistantMessage,
    previousUserMessages,
    conversationFlow,
    suggestedItems: Array.from(suggestedItems),
    discussedItems: Array.from(mentionedItems),
    conversationLength: messages.length,
    sessionState
  };
}

// STAGE 1: AI Intent & Mood Detection
async function detectIntentAndMood(context, apiKey) {
  const prompt = `أنت محلل نوايا ومشاعر متخصص في المحادثات السورية لمقهى وبوظة.

**تحليل المحادثة:**
آخر 3 رسائل:
${context.conversationFlow.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}

**العناصر المذكورة سابقاً:** ${context.discussedItems.join(', ') || 'لا يوجد'}
**العناصر المقترحة سابقاً:** ${context.suggestedItems.join(', ') || 'لا يوجد'}

**آخر رسالة للتحليل:** "${context.lastUserMessage}"

**مهمتك:** حلل النية والمزاج بدقة عالية.

**أنواع النوايا:**
1. MENU_INTENT: المستخدم يريد اقتراحات أو يذكر أي شيء متعلق بـ:
   - طلب مباشر للقائمة (شو عندكم، اقترح علي، بدي اشرب شي)
   - ذكر الطقس/الحرارة/البرد (حر اليوم، برد، الجو حلو)
   - ذكر المزاج المرتبط بالطعام (جوعان، عطشان، عبالي حلو)
   - ذكر وقت اليوم (صباح، مساء، غداء)
   - ذكر المقهى أو الجلسة (قاعد بالمقهى، جاي عالمحل)
   - أي سؤال عن الأسعار أو العروضات

2. ITEM_FOLLOWUP_INTENT: المستخدم يسأل عن عنصر محدد تم ذكره:
   - سؤال عن السعر لعنصر مذكور
   - سؤال عن المكونات أو الوصف
   - طلب توضيح عن عنصر محدد
   - مقارنة بين عناصر

3. CHAT_INTENT: محادثة عامة لا علاقة لها بالمقهى:
   - مواضيع شخصية (كيفك، شو اخبارك)
   - مواضيع عامة (السياسة، الرياضة، الأخبار)
   - رفض صريح (ما بدي شي، مش جوعان)

**أنواع المزاج:**
- happy: سعيد، مبسوط، فرحان
- sad: حزين، زعلان، مكتئب
- tired: تعبان، مرهق، نعسان
- energetic: نشيط، حماسي
- hot: حران، حر عليه
- cold: بردان، برد عليه
- hungry: جوعان
- thirsty: عطشان
- relaxed: مرتاح، هادي
- stressed: متوتر، مضغوط
- neutral: عادي، محايد

**قواعد مهمة:**
- إذا ذكر المستخدم أي شيء عن الطقس أو درجة الحرارة = MENU_INTENT
- إذا قال "في شي لسا" أو "كمان" بعد اقتراحات = MENU_INTENT
- إذا سأل عن عنصر محدد موجود في discussedItems = ITEM_FOLLOWUP_INTENT
- إذا المحادثة عن مواضيع عامة بدون ذكر طعام = CHAT_INTENT

رد بـ JSON فقط:
{
  "intent": "MENU_INTENT|ITEM_FOLLOWUP_INTENT|CHAT_INTENT",
  "confidence": 0.0-1.0,
  "mood": "happy|sad|tired|energetic|hot|cold|hungry|thirsty|relaxed|stressed|neutral",
  "moodConfidence": 0.0-1.0,
  "contextClues": ["قائمة الأدلة التي استخدمتها"],
  "specificItem": "اسم العنصر إذا كان السؤال عنه" أو null,
  "reasoning": "شرح مفصل للقرار"
}`;

  try {
    const response = await callGemini(apiKey, prompt);
    const parsed = parseJsonResponse(response);
    if (parsed) {
      // Update session mood history
      if (parsed.mood && context.sessionState) {
        context.sessionState.moodHistory.push(parsed.mood);
        if (context.sessionState.moodHistory.length > 5) {
          context.sessionState.moodHistory.shift();
        }
        context.sessionState.lastIntent = parsed.intent;
      }
      return parsed;
    }
  } catch (error) {
    console.error('Intent detection error:', error);
  }
  
  // Fallback
  return {
    intent: 'CHAT_INTENT',
    confidence: 0.5,
    mood: 'neutral',
    moodConfidence: 0.5,
    contextClues: [],
    specificItem: null,
    reasoning: 'Fallback due to error'
  };
}

// STAGE 2A: Generate Menu Response based on mood
async function generateMenuResponse(context, menuDigest, mood, apiKey) {
  // Select items based on mood
  const moodBasedSuggestions = getMoodBasedCategories(mood);
  
  const prompt = `أنت "ماستر" - نادل محترف ودود من بوظة ماستر كيك.

**الموقف:** المستخدم ${getMoodDescription(mood)} ويريد اقتراحات.

**مزاج المستخدم:** ${mood}
**اقتراحات مناسبة للمزاج:** ${moodBasedSuggestions.join(', ')}

**رسالة المستخدم:** "${context.lastUserMessage}"
**العناصر المقترحة سابقاً (لا تكررها):** ${context.suggestedItems.join(', ') || 'لا يوجد'}

**القائمة المتاحة:**
${JSON.stringify(menuDigest, null, 2)}

**قواعد ذهبية:**
1. اقترح 1-2 عناصر فقط تناسب المزاج
2. لا تكرر أي عنصر تم اقتراحه سابقاً
3. اربط الاقتراح بمزاج المستخدم بطريقة ذكية
4. اذكر السعر والوصف بشكل جذاب
5. استخدم اللهجة السورية الدافئة

**أمثلة حسب المزاج:**
- hot: "يا الله شو هالحر! خلينا نبردلك المزاج مع **آيسد أمريكانو** (25000 ل.س) منعش وقوي!"
- tired: "شكلك تعبان، شو رايك **كابتشينو** (12500 ل.س) يفيقك ويحسن مزاجك؟"
- happy: "ما شاء الله مبسوط! يلا نزيد الحلاوة مع **كريب الشوكولا** (15000 ل.س)!"
- cold: "بردان؟ دفي حالك مع **شاي أخضر** (20000 ل.س) دافي ومريح!"

رد بـ JSON فقط:
{
  "reply": "رد مخصص حسب المزاج مع الاقتراحات",
  "suggestions": [
    {
      "id": "معرف العنصر",
      "category": "القسم",
      "arName": "الاسم العربي",
      "price": "السعر",
      "reason": "سبب الاقتراح حسب المزاج"
    }
  ],
  "moodResponse": true
}`;

  try {
    const response = await callGemini(apiKey, prompt);
    return parseJsonResponse(response);
  } catch (error) {
    console.error('Menu response error:', error);
    return null;
  }
}

// STAGE 2B: Generate Item Followup Response
async function generateItemFollowupResponse(context, menuDigest, specificItem, apiKey) {
  // Find the specific item in menu
  let itemDetails = null;
  let itemCategory = null;
  
  for (const [category, section] of Object.entries(menuDigest.sections)) {
    const found = section.items.find(item => 
      item.arName.includes(specificItem) || 
      item.enName?.toLowerCase().includes(specificItem.toLowerCase())
    );
    if (found) {
      itemDetails = found;
      itemCategory = category;
      break;
    }
  }

  const prompt = `أنت "ماستر" - نادل محترف يجيب عن أسئلة العملاء.

**السؤال:** المستخدم يسأل عن "${specificItem}"
**رسالة المستخدم:** "${context.lastUserMessage}"

${itemDetails ? `
**تفاصيل العنصر:**
- الاسم: ${itemDetails.arName}
- السعر: ${itemDetails.price || 'غير محدد'}
- الوصف: ${itemDetails.desc}
- القسم: ${itemCategory}
- العرض: ${itemDetails.badge || 'لا يوجد'}
` : `**ملاحظة:** العنصر "${specificItem}" غير موجود في القائمة.`}

**مهمتك:**
1. أجب عن السؤال بدقة ووضوح
2. لا تقترح أي عناصر جديدة
3. ركز فقط على الإجابة عن السؤال
4. استخدم اللهجة السورية الودودة

**أمثلة:**
- سؤال عن السعر: "**الكابتشينو** بـ 12500 ليرة بس!"
- سؤال عن المكونات: "**التشيزكيك** عنا طبقة بسكويت زبدية مع كريمة الجبن الغنية!"
- سؤال عن الحجم: "**الآيسد أمريكانو** يجي بالكوب الكبير، بيكفيك!"

رد بـ JSON فقط:
{
  "reply": "إجابة مباشرة عن السؤال",
  "itemInfo": {
    "found": true/false,
    "name": "اسم العنصر",
    "price": "السعر",
    "details": "التفاصيل المطلوبة"
  },
  "suggestions": []
}`;

  try {
    const response = await callGemini(apiKey, prompt);
    return parseJsonResponse(response);
  } catch (error) {
    console.error('Item followup error:', error);
    return null;
  }
}

// STAGE 2C: Generate Chat Response
async function generateChatResponse(context, apiKey) {
  const prompt = `أنت "ماستر" - شخصية ودودة من مقهى بوظة ماستر كيك.

**المهمة:** دردشة طبيعية وودية بدون أي ذكر للطعام أو الشراب أو القائمة.

**رسالة المستخدم:** "${context.lastUserMessage}"
**السياق:** 
${context.conversationFlow.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}

**قواعد صارمة:**
1. ممنوع تماماً ذكر أي طعام أو شراب أو قائمة أو أسعار
2. ممنوع السؤال "تحب تطلب شي؟" أو أي اقتراح مشابه
3. ركز على المحادثة العامة فقط
4. كن ودود ومتفهم
5. استخدم اللهجة السورية الطبيعية
6. رد قصير ومناسب (1-3 جمل)

**مواضيع مناسبة:**
- الطقس العام (بدون ربطه بالمشروبات)
- الأحوال الشخصية
- الهوايات والاهتمامات
- الأخبار العامة
- النصائح الحياتية

**أمثلة ردود صحيحة:**
- "الله يعطيك العافية! اليوم الجمعة، يوم راحة وبركة"
- "معك حق، الحياة صارت صعبة بس المهم نضل متفائلين"
- "يا هلا فيك! شو أخبارك اليوم؟ ان شاء الله تمام"

رد بـ JSON فقط:
{
  "reply": "رد دردشة طبيعي بدون أي ذكر للطعام",
  "topicType": "weather|personal|general|advice",
  "suggestions": []
}`;

  try {
    const response = await callGemini(apiKey, prompt);
    return parseJsonResponse(response);
  } catch (error) {
    console.error('Chat response error:', error);
    return null;
  }
}

// Helper: Get mood-based category suggestions
function getMoodBasedCategories(mood) {
  const moodMap = {
    'hot': ['cold_drinks', 'ice_cream'],
    'cold': ['hot_drinks', 'sweets'],
    'tired': ['hot_drinks', 'sweets'],
    'energetic': ['cold_drinks', 'argillies'],
    'happy': ['sweets', 'ice_cream'],
    'sad': ['sweets', 'hot_drinks'],
    'hungry': ['sweets', 'ice_cream'],
    'thirsty': ['cold_drinks', 'hot_drinks'],
    'relaxed': ['argillies', 'hot_drinks'],
    'stressed': ['argillies', 'sweets'],
    'neutral': ['hot_drinks', 'cold_drinks', 'sweets']
  };
  return moodMap[mood] || moodMap['neutral'];
}

// Helper: Get mood description in Arabic
function getMoodDescription(mood) {
  const descriptions = {
    'hot': 'حران ويحتاج شيء منعش',
    'cold': 'بردان ويحتاج شيء دافي',
    'tired': 'تعبان ويحتاج شيء ينشطه',
    'energetic': 'نشيط ومليان طاقة',
    'happy': 'مبسوط وفرحان',
    'sad': 'حزين شوي',
    'hungry': 'جوعان',
    'thirsty': 'عطشان',
    'relaxed': 'مرتاح وهادي',
    'stressed': 'متوتر شوي',
    'neutral': 'بمزاج عادي'
  };
  return descriptions[mood] || descriptions['neutral'];
}

// Helper: Call Gemini API
async function callGemini(apiKey, prompt) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      contents: [{ role: 'user', parts: [{ text: prompt }] }], 
      generationConfig: { 
        temperature: 0.7, 
        maxOutputTokens: 800
      } 
    })
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text).filter(Boolean).join('\n').trim();
}

// Helper: Parse JSON from AI response
function parseJsonResponse(rawText) {
  if (!rawText) return null;
  let cleanText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { 
      return JSON.parse(jsonMatch[0]); 
    } catch (e) { 
      console.error('JSON parse error:', e);
    }
  }
  return null;
}

// Helper: Validate and format final response
function formatFinalResponse(response, digest, intent) {
  if (!response) {
    return {
      reply: 'عذراً، في مشكلة تقنية. جرب مرة تانية.',
      suggestions: []
    };
  }
  
  // Validate suggestions if present
  const validSuggestions = [];
  if (Array.isArray(response.suggestions)) {
    response.suggestions.slice(0, 2).forEach(suggestion => {
      // Find the item in the digest
      for (const [category, section] of Object.entries(digest.sections)) {
        const item = section.items.find(it => it.id === suggestion.id);
        if (item) {
          validSuggestions.push({
            id: item.id,
            category: category,
            arName: item.arName,
            enName: item.enName,
            price: item.price || 'السعر غير محدد',
            description: item.desc,
            badge: item.badge || '',
            images: item.images || [],
            reason: suggestion.reason || ''
          });
          break;
        }
      }
    });
  }
  
  return {
    reply: String(response.reply || 'أهلين! كيف بقدر ساعدك؟').slice(0, 500),
    suggestions: validSuggestions,
    metadata: {
      intent: intent,
      moodResponse: response.moodResponse || false,
      topicType: response.topicType || null,
      itemInfo: response.itemInfo || null
    }
  };
}

// MAIN HANDLER
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
  
  const { sessionId = 'default', messages = [] } = body || {};
  
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  // Rate limiting
  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
  const key = `${sessionId}|${ip}`;
  if (!rateLimit(key, 800)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Service configuration error' });
  }

  try {
    // Step 1: Extract comprehensive context
    const context = extractFullContext(messages, sessionId);
    console.log('Context extracted:', {
      lastMessage: context.lastUserMessage,
      suggestedItems: context.suggestedItems,
      discussedItems: context.discussedItems
    });
    
    // Step 2: AI Intent and Mood Detection
    const intentResult = await detectIntentAndMood(context, apiKey);
    console.log('Intent Detection Result:', intentResult);
    
    // Step 3: Load menu digest
    const menuDigest = await buildMenuDigest();
    
    // Step 4: Generate response based on intent
    let response = null;
    
    switch (intentResult.intent) {
      case 'MENU_INTENT':
        // Generate menu suggestions based on mood
        response = await generateMenuResponse(
          context, 
          menuDigest, 
          intentResult.mood, 
          apiKey
        );
        break;
        
      case 'ITEM_FOLLOWUP_INTENT':
        // Answer specific questions about items
        response = await generateItemFollowupResponse(
          context,
          menuDigest,
          intentResult.specificItem,
          apiKey
        );
        break;
        
      case 'CHAT_INTENT':
      default:
        // Normal chat without menu mentions
        response = await generateChatResponse(context, apiKey);
        break;
    }
    
    // Step 5: Format and validate response
    const finalResponse = formatFinalResponse(response, menuDigest, intentResult.intent);
    
    // Add intent and mood to response for debugging
    finalResponse.debug = {
      detectedIntent: intentResult.intent,
      confidence: intentResult.confidence,
      mood: intentResult.mood,
      moodConfidence: intentResult.moodConfidence,
      reasoning: intentResult.reasoning
    };
    
    console.log('Final Response:', finalResponse);
    res.status(200).json(finalResponse);
    
  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({ 
      reply: 'عذراً، في مشكلة تقنية. جرب مرة تانية لو سمحت.',
      suggestions: [],
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}