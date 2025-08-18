// ULTRA-SMART MENU ASSISTANT: Enhanced Intent & Mood Detection System
// Fixed mood detection and item validation

let MENU_CACHE = { digest: null, expiresAt: 0 };
const RATE_BUCKET = new Map();
const CONVERSATION_STATE = new Map();

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
  
  const digest = { 
    sections: {},
    allItems: [] // Add flat list for easy searching
  };
  
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
      
      // Add to flat list
      compactItems.forEach(item => {
        digest.allItems.push({...item, sectionNameAr: sec.ar, sectionNameEn: sec.en});
      });
    }
  }
  
  MENU_CACHE = { digest, expiresAt: nowMs() + 5 * 60 * 1000 };
  return digest;
}

// Quick keyword-based intent check (before AI)
function quickIntentCheck(message) {
  const msg = message.toLowerCase();
  
  // CRITICAL: Check for temperature preferences FIRST
  const coldKeywords = ['بارد', 'برد', 'منعش', 'بردان', 'حر', 'سخونة', 'ice', 'cold'];
  const hotKeywords = ['دافي', 'سخن', 'ساخن', 'دفا', 'hot', 'warm'];
  
  let temperaturePreference = null;
  if (coldKeywords.some(k => msg.includes(k))) {
    temperaturePreference = 'cold';
  } else if (hotKeywords.some(k => msg.includes(k))) {
    temperaturePreference = 'hot';
  }
  
  // Menu intent keywords
  const menuKeywords = [
    'عبالي', 'بدي', 'شو عندكم', 'اقترح', 'في عندكم', 'شو في',
    'جوعان', 'عطشان', 'حلويات', 'مشاريب', 'بوظة', 'آيس كريم', 
    'قهوة', 'شاي', 'أركيلة', 'كريب', 'menu', 'suggest'
  ];
  
  const hasMenuIntent = menuKeywords.some(k => msg.includes(k));
  
  return {
    hasMenuIntent,
    temperaturePreference,
    quickCheck: true
  };
}

// Extract comprehensive context from conversation
function extractFullContext(messages, sessionId) {
  const recentMessages = messages.slice(-10);
  const sessionState = CONVERSATION_STATE.get(sessionId) || {
    suggestedItems: [],
    discussedItems: [],
    lastIntent: null,
    moodHistory: [],
    temperaturePreference: null
  };
  
  // Extract all mentioned items
  const mentionedItems = new Set();
  const suggestedItems = new Set();
  
  recentMessages.forEach(msg => {
    const content = msg.content || '';
    
    // Check for temperature preferences in all messages
    const quickCheck = quickIntentCheck(content);
    if (quickCheck.temperaturePreference) {
      sessionState.temperaturePreference = quickCheck.temperaturePreference;
    }
    
    // Extract items mentioned by assistant
    if (msg.role === 'assistant') {
      const itemMatches = content.match(/\*\*(.*?)\*\*/g);
      if (itemMatches) {
        itemMatches.forEach(match => {
          const item = match.replace(/\*\*/g, '').trim();
          if (item.length > 2 && !item.match(/^\d+$/)) {
            suggestedItems.add(item);
            mentionedItems.add(item.toLowerCase());
          }
        });
      }
    }
    
    // Extract items mentioned by user
    if (msg.role === 'user') {
      const lowerContent = content.toLowerCase();
      const menuItems = ['كابتشينو', 'شاي', 'بوظة', 'آيس كريم', 'أركيلة', 'كريب', 'تشيزكيك', 'ايسد امريكانو'];
      menuItems.forEach(item => {
        if (lowerContent.includes(item)) {
          mentionedItems.add(item);
        }
      });
    }
  });
  
  const conversationFlow = recentMessages.map(msg => ({
    role: msg.role,
    content: msg.content || '',
    timestamp: msg.timestamp || null
  }));
  
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
    sessionState,
    temperaturePreference: sessionState.temperaturePreference
  };
}

// STAGE 1: Enhanced AI Intent & Mood Detection
async function detectIntentAndMood(context, menuDigest, apiKey) {
  // Quick check first
  const quickCheck = quickIntentCheck(context.lastUserMessage);
  
  // Build item list for AI
  const availableItems = menuDigest.allItems.map(item => 
    `${item.arName} (${item.sectionNameAr})`
  ).join(', ');
  
  const prompt = `أنت محلل نوايا ومشاعر دقيق جداً لمقهى وبوظة.

**رسالة المستخدم الأخيرة:** "${context.lastUserMessage}"

**السياق:**
آخر 3 رسائل:
${context.conversationFlow.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}

**العناصر المقترحة سابقاً:** ${context.suggestedItems.join(', ') || 'لا يوجد'}
**تفضيل الحرارة المكتشف:** ${context.temperaturePreference || 'غير محدد'}

**العناصر المتاحة في القائمة:**
${availableItems}

**قواعد حاسمة للنية:**
1. MENU_INTENT إذا:
   - ذكر أي طعام أو شراب (بوظة، آيس كريم، قهوة، شاي، حلويات، مشاريب)
   - طلب اقتراحات (شو عندكم، اقترح علي، في شي)
   - ذكر الحرارة أو البرد (بارد، حر، دافي، منعش)
   - ذكر الجوع أو العطش
   
2. ITEM_FOLLOWUP_INTENT إذا:
   - سأل عن عنصر محدد موجود في القائمة
   - طلب تفاصيل عن عنصر مذكور
   
3. CHAT_INTENT إذا:
   - محادثة عامة بدون ذكر أي طعام
   - رفض واضح (ما بدي، مش جوعان)

**قواعد حاسمة للمزاج:**
- إذا قال "بارد" أو "عبالي شي بارد" أو "حر" = wanting_cold (يريد شيء بارد)
- إذا قال "بردان" أو "دافي" = wanting_hot (يريد شيء دافئ)
- إذا قال "جوعان" = hungry
- إذا قال "عطشان" = thirsty
- إذا قال "تعبان" = tired
- إذا قال "مبسوط" = happy
- إذا قال "زعلان" = sad
- إذا قال "مضغوط" = stressed
- غير ذلك = neutral

**العنصر المحدد:**
إذا ذكر المستخدم اسم عنصر من القائمة، اكتبه في specificItem

رد بـ JSON فقط:
{
  "intent": "MENU_INTENT|ITEM_FOLLOWUP_INTENT|CHAT_INTENT",
  "confidence": 0.0-1.0,
  "mood": "wanting_cold|wanting_hot|hungry|thirsty|tired|happy|sad|stressed|neutral",
  "moodConfidence": 0.0-1.0,
  "contextClues": ["الأدلة"],
  "specificItem": "اسم العنصر إن وجد" أو null,
  "temperaturePreference": "cold|hot|neutral",
  "reasoning": "شرح القرار"
}`;

  try {
    const response = await callGemini(apiKey, prompt);
    const parsed = parseJsonResponse(response);
    
    if (parsed) {
      // Override with quick check if high confidence
      if (quickCheck.hasMenuIntent && parsed.intent === 'CHAT_INTENT') {
        parsed.intent = 'MENU_INTENT';
        parsed.reasoning = 'Overridden by keyword detection';
      }
      
      if (quickCheck.temperaturePreference) {
        parsed.temperaturePreference = quickCheck.temperaturePreference;
        if (quickCheck.temperaturePreference === 'cold') {
          parsed.mood = 'wanting_cold';
        } else if (quickCheck.temperaturePreference === 'hot') {
          parsed.mood = 'wanting_hot';
        }
      }
      
      // Update session
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
  
  // Fallback with quick check
  return {
    intent: quickCheck.hasMenuIntent ? 'MENU_INTENT' : 'CHAT_INTENT',
    confidence: 0.6,
    mood: quickCheck.temperaturePreference === 'cold' ? 'wanting_cold' : 
          quickCheck.temperaturePreference === 'hot' ? 'wanting_hot' : 'neutral',
    moodConfidence: 0.6,
    contextClues: ['Fallback to quick check'],
    specificItem: null,
    temperaturePreference: quickCheck.temperaturePreference || 'neutral',
    reasoning: 'Fallback due to error, using keyword detection'
  };
}

// STAGE 2A: Generate Menu Response based on mood
async function generateMenuResponse(context, menuDigest, intentResult, apiKey) {
  const mood = intentResult.mood;
  const temperaturePref = intentResult.temperaturePreference || context.temperaturePreference;
  
  // Smart category selection based on mood AND temperature
  let targetCategories = [];
  
  if (mood === 'wanting_cold' || temperaturePref === 'cold') {
    targetCategories = ['cold_drinks', 'ice_cream'];
  } else if (mood === 'wanting_hot' || temperaturePref === 'hot') {
    targetCategories = ['hot_drinks'];
  } else {
    targetCategories = getMoodBasedCategories(mood);
  }
  
  // Filter available items
  const availableItems = [];
  targetCategories.forEach(cat => {
    if (menuDigest.sections[cat]) {
      menuDigest.sections[cat].items.forEach(item => {
        if (!context.suggestedItems.includes(item.arName)) {
          availableItems.push({
            ...item,
            category: cat,
            categoryName: menuDigest.sections[cat].ar
          });
        }
      });
    }
  });
  
  const prompt = `أنت "ماستر" - نادل محترف من بوظة ماستر كيك.

**رسالة المستخدم:** "${context.lastUserMessage}"
**مزاج المستخدم:** ${mood}
**تفضيل الحرارة:** ${temperaturePref}

${mood === 'wanting_cold' || temperaturePref === 'cold' ? 
  '**مهم جداً: المستخدم يريد شيء بارد/منعش فقط! لا تقترح أي شيء دافئ أو ساخن!**' :
  mood === 'wanting_hot' || temperaturePref === 'hot' ?
  '**مهم جداً: المستخدم يريد شيء دافئ/ساخن فقط! لا تقترح أي شيء بارد!**' :
  ''
}

**العناصر المناسبة المتاحة (اختر 1-2 فقط):**
${JSON.stringify(availableItems.slice(0, 6), null, 2)}

**العناصر المقترحة سابقاً (لا تكررها أبداً):**
${context.suggestedItems.join(', ') || 'لا يوجد'}

**قواعد:**
1. اقترح 1-2 عناصر فقط من القائمة المتاحة
2. تأكد أن الاقتراح يناسب تفضيل الحرارة
3. اذكر الاسم بين ** والسعر
4. أضف وصف جذاب
5. استخدم اللهجة السورية

**أمثلة:**
- wanting_cold: "يا سلام عبالك شي بارد! جرب **ايسد امريكانو** (25000 ل.س) منعش وقوي!"
- wanting_hot: "بردان؟ دفي حالك مع **كابتشينو** (12500 ل.س) كريمي ولذيذ!"

رد بـ JSON فقط:
{
  "reply": "رد مع الاقتراحات",
  "suggestions": [
    {
      "id": "معرف العنصر",
      "category": "القسم",
      "arName": "الاسم",
      "price": "السعر",
      "images": ["قائمة الصور"],
      "reason": "سبب الاقتراح"
    }
  ]
}`;

  try {
    const response = await callGemini(apiKey, prompt);
    const parsed = parseJsonResponse(response);
    
    // Validate suggestions exist in menu
    if (parsed && parsed.suggestions) {
      parsed.suggestions = parsed.suggestions.map(sug => {
        const found = availableItems.find(item => 
          item.id === sug.id || item.arName === sug.arName
        );
        if (found) {
          return {
            ...sug,
            images: found.images || []
          };
        }
        return null;
      }).filter(Boolean);
    }
    
    return parsed;
  } catch (error) {
    console.error('Menu response error:', error);
    return null;
  }
}

// STAGE 2B: Generate Item Followup Response
async function generateItemFollowupResponse(context, menuDigest, specificItem, apiKey) {
  if (!specificItem) {
    // Try to extract item from message
    const msg = context.lastUserMessage.toLowerCase();
    for (const item of menuDigest.allItems) {
      if (msg.includes(item.arName.toLowerCase()) || 
          (item.enName && msg.includes(item.enName.toLowerCase()))) {
        specificItem = item.arName;
        break;
      }
    }
  }
  
  // Find item details
  let itemDetails = null;
  for (const item of menuDigest.allItems) {
    if (item.arName === specificItem || 
        item.arName.includes(specificItem) ||
        (specificItem && item.arName.includes(specificItem))) {
      itemDetails = item;
      break;
    }
  }
  
  if (!itemDetails) {
    // Item not found - return menu intent instead
    return null;
  }

  const prompt = `أنت "ماستر" - نادل محترف.

**المستخدم يسأل عن:** "${specificItem}"
**رسالة المستخدم:** "${context.lastUserMessage}"

**تفاصيل العنصر:**
- الاسم: ${itemDetails.arName}
- السعر: ${itemDetails.price || 'السعر غير محدد'}
- الوصف: ${itemDetails.desc || 'لا يوجد وصف'}
- القسم: ${itemDetails.sectionNameAr}
- العرض: ${itemDetails.badge || 'لا يوجد'}

**مهمتك:**
1. أجب عن السؤال بوضوح
2. اذكر التفاصيل المطلوبة
3. لا تقترح عناصر أخرى
4. كن ودود ومختصر

رد بـ JSON فقط:
{
  "reply": "الإجابة",
  "itemInfo": {
    "found": true,
    "name": "${itemDetails.arName}",
    "price": "${itemDetails.price}",
    "details": "التفاصيل"
  },
  "suggestions": []
}`;

  try {
    const response = await callGemini(apiKey, prompt);
    return parseJsonResponse(response);
  } catch (error) {
    console.error('Item followup error:', error);
    return {
      reply: `**${itemDetails.arName}** ${itemDetails.price ? `بـ ${itemDetails.price} ل.س` : ''} ${itemDetails.desc || ''}`,
      itemInfo: {
        found: true,
        name: itemDetails.arName,
        price: itemDetails.price,
        details: itemDetails.desc
      },
      suggestions: []
    };
  }
}

// STAGE 2C: Generate Chat Response
async function generateChatResponse(context, apiKey) {
  const prompt = `أنت "ماستر" - شخصية ودودة من مقهى.

**رسالة المستخدم:** "${context.lastUserMessage}"

**قواعد:**
1. دردشة عادية بدون ذكر أي طعام أو شراب
2. لا تسأل "تحب تطلب شي؟"
3. كن ودود وطبيعي
4. رد قصير (1-2 جملة)

رد بـ JSON فقط:
{
  "reply": "رد الدردشة",
  "suggestions": []
}`;

  try {
    const response = await callGemini(apiKey, prompt);
    return parseJsonResponse(response);
  } catch (error) {
    return {
      reply: 'يا هلا فيك! شو أخبارك؟',
      suggestions: []
    };
  }
}

// Helper: Get mood-based categories
function getMoodBasedCategories(mood) {
  const moodMap = {
    'wanting_cold': ['cold_drinks', 'ice_cream'],
    'wanting_hot': ['hot_drinks'],
    'hungry': ['sweets', 'ice_cream'],
    'thirsty': ['cold_drinks', 'hot_drinks'],
    'tired': ['hot_drinks', 'sweets'],
    'happy': ['sweets', 'ice_cream'],
    'sad': ['sweets', 'hot_drinks'],
    'stressed': ['argillies', 'sweets'],
    'neutral': ['hot_drinks', 'cold_drinks', 'sweets', 'ice_cream']
  };
  return moodMap[mood] || moodMap['neutral'];
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
        temperature: 0.6,  // Lower for more consistency
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
function formatFinalResponse(response, digest, intentResult) {
  if (!response) {
    // Generate fallback based on intent
    if (intentResult.intent === 'MENU_INTENT') {
      const items = digest.allItems.slice(0, 2);
      return {
        reply: 'أهلين! شو حابب من عندنا اليوم؟',
        suggestions: items.map(item => ({
          id: item.id,
          category: item.category,
          arName: item.arName,
          enName: item.enName,
          price: item.price || 'السعر غير محدد',
          description: item.desc,
          badge: item.badge || '',
          images: item.images || []
        }))
      };
    }
    return {
      reply: 'عذراً، في مشكلة. جرب مرة تانية.',
      suggestions: []
    };
  }
  
  // Validate and enrich suggestions
  const validSuggestions = [];
  if (Array.isArray(response.suggestions)) {
    response.suggestions.forEach(suggestion => {
      // Find in digest
      const found = digest.allItems.find(item => 
        item.id === suggestion.id || 
        item.arName === suggestion.arName
      );
      
      if (found) {
        validSuggestions.push({
          id: found.id,
          category: found.category,
          arName: found.arName,
          enName: found.enName,
          price: found.price || suggestion.price || 'السعر غير محدد',
          description: found.desc,
          badge: found.badge || '',
          images: found.images || [],
          reason: suggestion.reason || ''
        });
      }
    });
  }
  
  return {
    reply: String(response.reply || 'أهلين! كيف بقدر ساعدك؟').slice(0, 500),
    suggestions: validSuggestions,
    metadata: {
      intent: intentResult.intent,
      mood: intentResult.mood,
      temperaturePreference: intentResult.temperaturePreference,
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
    // Step 1: Load menu first
    const menuDigest = await buildMenuDigest();
    
    // Step 2: Extract context
    const context = extractFullContext(messages, sessionId);
    
    console.log('Context:', {
      lastMessage: context.lastUserMessage,
      temperaturePreference: context.temperaturePreference,
      suggestedItems: context.suggestedItems
    });
    
    // Step 3: Detect intent and mood with menu awareness
    const intentResult = await detectIntentAndMood(context, menuDigest, apiKey);
    
    console.log('Intent Result:', {
      intent: intentResult.intent,
      mood: intentResult.mood,
      temperature: intentResult.temperaturePreference,
      item: intentResult.specificItem
    });
    
    // Step 4: Generate appropriate response
    let response = null;
    
    switch (intentResult.intent) {
      case 'MENU_INTENT':
        response = await generateMenuResponse(
          context, 
          menuDigest, 
          intentResult,
          apiKey
        );
        break;
        
      case 'ITEM_FOLLOWUP_INTENT':
        response = await generateItemFollowupResponse(
          context,
          menuDigest,
          intentResult.specificItem,
          apiKey
        );
        
        // If item not found, switch to menu intent
        if (!response) {
          response = await generateMenuResponse(
            context, 
            menuDigest, 
            intentResult,
            apiKey
          );
        }
        break;
        
      case 'CHAT_INTENT':
      default:
        response = await generateChatResponse(context, apiKey);
        break;
    }
    
    // Step 5: Format final response
    const finalResponse = formatFinalResponse(response, menuDigest, intentResult);
    
    // Add debug info
    if (process.env.NODE_ENV === 'development') {
      finalResponse.debug = {
        detectedIntent: intentResult.intent,
        confidence: intentResult.confidence,
        mood: intentResult.mood,
        temperaturePreference: intentResult.temperaturePreference,
        specificItem: intentResult.specificItem,
        reasoning: intentResult.reasoning
      };
    }
    
    console.log('Final Response:', {
      reply: finalResponse.reply.slice(0, 100),
      suggestions: finalResponse.suggestions.length
    });
    
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