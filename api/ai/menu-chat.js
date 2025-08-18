// ULTRA-SMART MENU ASSISTANT: Simplified and Robust Version
// Fixed JSON parsing, better error handling, and smarter responses

let MENU_CACHE = { digest: null, expiresAt: 0 };
const RATE_BUCKET = new Map();
const CONVERSATION_STATE = new Map();

function nowMs() { return Date.now(); }

function rateLimit(key, minIntervalMs = 1000) {
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
  
  try {
    const apiUrl = `https://api.github.com/repos/${repo}/contents/menu/manifest.json?ref=${encodeURIComponent(branch)}`;
    const r = await fetch(apiUrl, { 
      headers: { 
        Authorization: `token ${token}`, 
        Accept: 'application/vnd.github+json' 
      } 
    });
    if (!r.ok) return null;
    const data = await r.json();
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return JSON.parse(content);
  } catch (e) {
    console.error('GitHub fetch error:', e);
    return null;
  }
}

async function buildMenuDigest() {
  if (MENU_CACHE.digest && MENU_CACHE.expiresAt > nowMs()) {
    return MENU_CACHE.digest;
  }
  
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
  } catch (e) {
    console.error('Menu load error:', e);
    // Return a default menu structure
    return { sections: {}, allItems: [] };
  }
  
  const digest = { 
    sections: {},
    allItems: [],
    byName: {} // Add lookup by name
  };
  
  if (manifest && manifest.sections) {
    for (const [key, sec] of Object.entries(manifest.sections)) {
      const items = (sec.items || []).map((it) => ({
        id: it.id || '',
        arName: it.arName || '',
        enName: it.enName || '',
        price: it.price || '',
        desc: it.descriptionAr || it.descriptionEn || '',
        badge: it.badge || '',
        images: Array.isArray(it.images) ? it.images : [],
        category: key,
        sectionNameAr: sec.ar || key
      }));
      
      digest.sections[key] = { 
        ar: sec.ar || key, 
        en: sec.en || key, 
        items: items 
      };
      
      // Add to flat list and name lookup
      items.forEach(item => {
        digest.allItems.push(item);
        const nameLower = item.arName.toLowerCase();
        digest.byName[nameLower] = item;
        // Also add partial matches
        if (nameLower.includes('بوظة')) digest.byName['بوظة'] = item;
        if (nameLower.includes('آيس كريم')) digest.byName['آيس كريم'] = item;
        if (nameLower.includes('كريب')) digest.byName['كريب'] = item;
      });
    }
  }
  
  MENU_CACHE = { digest, expiresAt: nowMs() + 5 * 60 * 1000 };
  return digest;
}

// Simplified intent detection without AI for reliability
function detectUserIntent(message, context, menuDigest) {
  const msg = message.toLowerCase().trim();
  
  // Temperature preferences
  const wantsCold = ['بارد', 'منعش', 'ice', 'cold', 'بردني', 'بوظة', 'آيس كريم'].some(k => msg.includes(k));
  const wantsHot = ['دافي', 'ساخن', 'سخن', 'hot', 'warm', 'قهوة', 'شاي'].some(k => msg.includes(k)) && !msg.includes('بارد');
  
  // Check for menu-related keywords
  const menuKeywords = [
    'عبالي', 'بدي', 'شو عندكم', 'اقترح', 'في عندكم', 'شو في',
    'جوعان', 'عطشان', 'حلويات', 'مشاريب', 'بوظة', 'آيس', 
    'قهوة', 'شاي', 'أركيلة', 'كريب', 'عندكم', 'في شي'
  ];
  const hasMenuIntent = menuKeywords.some(k => msg.includes(k));
  
  // Check for specific item questions
  const questionWords = ['شو هي', 'شو هو', 'شو هيدي', 'شو هاد', 'كيف', 'ايش'];
  const isAskingAboutItem = questionWords.some(k => msg.includes(k));
  
  // Check for personal questions
  const personalQuestions = ['مين انت', 'شو اسمك', 'عمرك', 'وين ساكن', 'شخصي'];
  const isPersonalQuestion = personalQuestions.some(k => msg.includes(k));
  
  // Check for greetings
  const greetings = ['مرحبا', 'هاي', 'أهلين', 'السلام عليكم', 'صباح', 'مساء'];
  const isGreeting = greetings.some(k => msg.includes(k));
  
  // Check for negative responses
  const negatives = ['لا', 'ما بدي', 'مابدي', 'مش عايز', 'بكفي'];
  const isNegative = negatives.some(k => msg.includes(k));
  
  // Determine intent
  let intent = 'CHAT';
  let mood = 'neutral';
  let specificItem = null;
  
  if (hasMenuIntent && !isNegative) {
    intent = 'MENU';
    if (wantsCold) mood = 'wanting_cold';
    else if (wantsHot) mood = 'wanting_hot';
  } else if (isAskingAboutItem && context.lastSuggestedItems.length > 0) {
    intent = 'ITEM_QUESTION';
    // Try to find which item they're asking about
    for (const item of context.lastSuggestedItems) {
      if (msg.includes(item.toLowerCase())) {
        specificItem = item;
        break;
      }
    }
    if (!specificItem && context.lastSuggestedItems.length > 0) {
      specificItem = context.lastSuggestedItems[0]; // Assume asking about first item
    }
  } else if (isPersonalQuestion) {
    intent = 'PERSONAL';
  } else if (isGreeting) {
    intent = 'GREETING';
  } else if (msg.length < 10 && !hasMenuIntent) {
    intent = 'CHAT';
  }
  
  return {
    intent,
    mood,
    wantsCold,
    wantsHot,
    specificItem,
    confidence: 0.8
  };
}

// Extract context from conversation
function extractContext(messages, sessionId) {
  const state = CONVERSATION_STATE.get(sessionId) || {
    suggestedItems: new Set(),
    lastSuggestedItems: [],
    conversationCount: 0
  };
  
  const recentMessages = messages.slice(-5);
  const lastUserMessage = recentMessages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
  const lastAssistantMessage = recentMessages.filter(m => m.role === 'assistant').slice(-1)[0]?.content || '';
  
  // Extract suggested items from last assistant message
  const itemMatches = lastAssistantMessage.match(/\*\*(.*?)\*\*/g);
  if (itemMatches) {
    state.lastSuggestedItems = itemMatches.map(m => m.replace(/\*\*/g, '').trim());
    state.lastSuggestedItems.forEach(item => state.suggestedItems.add(item));
  }
  
  state.conversationCount++;
  CONVERSATION_STATE.set(sessionId, state);
  
  return {
    lastUserMessage,
    lastAssistantMessage,
    suggestedItems: Array.from(state.suggestedItems),
    lastSuggestedItems: state.lastSuggestedItems,
    conversationCount: state.conversationCount,
    messages: recentMessages
  };
}

// Generate menu suggestions based on mood
function generateMenuSuggestions(mood, context, menuDigest) {
  const suggested = new Set(context.suggestedItems);
  const suggestions = [];
  
  // Determine which categories to search
  let targetCategories = [];
  if (mood === 'wanting_cold') {
    targetCategories = ['cold_drinks', 'ice_cream'];
  } else if (mood === 'wanting_hot') {
    targetCategories = ['hot_drinks'];
  } else {
    targetCategories = ['cold_drinks', 'hot_drinks', 'sweets', 'ice_cream'];
  }
  
  // Find items not yet suggested
  for (const cat of targetCategories) {
    if (menuDigest.sections[cat]) {
      for (const item of menuDigest.sections[cat].items) {
        if (!suggested.has(item.arName) && suggestions.length < 2) {
          suggestions.push({
            ...item,
            category: cat,
            categoryName: menuDigest.sections[cat].ar
          });
        }
      }
    }
  }
  
  // If no new items, pick random from appropriate categories
  if (suggestions.length === 0) {
    for (const cat of targetCategories) {
      if (menuDigest.sections[cat] && menuDigest.sections[cat].items.length > 0) {
        const items = menuDigest.sections[cat].items;
        const randomItem = items[Math.floor(Math.random() * items.length)];
        suggestions.push({
          ...randomItem,
          category: cat,
          categoryName: menuDigest.sections[cat].ar
        });
        if (suggestions.length >= 2) break;
      }
    }
  }
  
  return suggestions.slice(0, 2);
}

// Generate response using Gemini (simplified prompts)
async function generateAIResponse(type, context, data, apiKey) {
  let prompt = '';
  
  switch (type) {
    case 'MENU':
      const mood = data.mood === 'wanting_cold' ? 'يريد شيء بارد' : 
                   data.mood === 'wanting_hot' ? 'يريد شيء دافئ' : 'عادي';
      
      prompt = `أنت نادل في مقهى. المستخدم ${mood}.
رسالته: "${context.lastUserMessage}"

اقترح هذه العناصر:
${data.suggestions.map(s => `- ${s.arName} (${s.price} ل.س)`).join('\n')}

اكتب رد قصير وودود باللهجة السورية. اذكر الأسماء والأسعار.
مثال: "يا هلا! شو رأيك جرب [اسم] ب[سعر] ل.س، كتير طيب!"

رد بجملة واحدة فقط:`;
      break;
      
    case 'ITEM_QUESTION':
      prompt = `المستخدم يسأل عن: ${data.item.arName}
التفاصيل: ${data.item.desc || 'لا يوجد وصف'}
السعر: ${data.item.price || 'غير محدد'}

اشرح بجملة قصيرة وودودة باللهجة السورية:`;
      break;
      
    case 'GREETING':
      prompt = `رد على التحية باللهجة السورية بجملة ودودة قصيرة:
"${context.lastUserMessage}"

مثال: "أهلين وسهلين! كيفك اليوم؟"`;
      break;
      
    case 'PERSONAL':
      prompt = `المستخدم يسأل سؤال شخصي. أنت "ماستر" مساعد المقهى.
رد بلطف واختصار أنك مساعد المقهى هنا لخدمته.`;
      break;
      
    default:
      prompt = `دردش بود مع المستخدم باللهجة السورية. رد قصير على:
"${context.lastUserMessage}"`;
  }
  
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        contents: [{ role: 'user', parts: [{ text: prompt }] }], 
        generationConfig: { 
          temperature: 0.7,
          maxOutputTokens: 150,
          topP: 0.8
        } 
      })
    });
    
    if (!resp.ok) {
      console.error('Gemini API error:', resp.status);
      return null;
    }
    
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return text.trim();
  } catch (error) {
    console.error('AI generation error:', error);
    return null;
  }
}

// Format final response
function formatResponse(intent, aiReply, suggestions = []) {
  // Clean up AI reply
  let reply = aiReply || '';
  
  // Add default replies if AI failed
  if (!reply) {
    switch (intent) {
      case 'MENU':
        reply = suggestions.length > 0 ? 
          `شو رأيك تجرب ${suggestions.map(s => `**${s.arName}** (${s.price} ل.س)`).join(' أو ')}؟` :
          'أهلين! شو حابب تطلب اليوم؟';
        break;
      case 'GREETING':
        reply = 'أهلين وسهلين! كيف بقدر ساعدك؟';
        break;
      case 'PERSONAL':
        reply = 'أنا ماستر، مساعدك في المقهى. كيف بقدر أخدمك؟';
        break;
      case 'ITEM_QUESTION':
        reply = 'هاد العنصر كتير طيب! جربه وما رح تندم.';
        break;
      default:
        reply = 'تكرم عيونك! شو بتحب؟';
    }
  }
  
  // Format suggestions for response
  const formattedSuggestions = suggestions.map(s => ({
    id: s.id,
    category: s.category,
    arName: s.arName,
    enName: s.enName,
    price: s.price || 'السعر غير محدد',
    description: s.desc,
    badge: s.badge || '',
    images: s.images || []
  }));
  
  // Make sure item names in reply are bold
  suggestions.forEach(s => {
    if (!reply.includes(`**${s.arName}**`)) {
      reply = reply.replace(s.arName, `**${s.arName}**`);
    }
  });
  
  return {
    reply: reply.slice(0, 500),
    suggestions: formattedSuggestions
  };
}

// MAIN HANDLER
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body;
  try { 
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch { 
    body = req.body || {};
  }
  
  const { sessionId = 'default', messages = [] } = body;
  
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  // Rate limiting
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim();
  const key = `${sessionId}|${ip}`;
  if (!rateLimit(key, 800)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Service configuration error' });
  }

  try {
    // Load menu
    const menuDigest = await buildMenuDigest();
    
    // Extract context
    const context = extractContext(messages, sessionId);
    
    // Detect intent
    const intentResult = detectUserIntent(context.lastUserMessage, context, menuDigest);
    
    console.log('Intent:', intentResult.intent, 'Mood:', intentResult.mood);
    
    let response = { reply: '', suggestions: [] };
    
    switch (intentResult.intent) {
      case 'MENU':
        // Get menu suggestions
        const suggestions = generateMenuSuggestions(intentResult.mood, context, menuDigest);
        
        // Generate AI response
        const menuReply = await generateAIResponse('MENU', context, {
          mood: intentResult.mood,
          suggestions
        }, apiKey);
        
        response = formatResponse('MENU', menuReply, suggestions);
        break;
        
      case 'ITEM_QUESTION':
        // Find the item details
        let itemDetails = null;
        if (intentResult.specificItem) {
          itemDetails = menuDigest.byName[intentResult.specificItem.toLowerCase()];
        }
        
        if (itemDetails) {
          const itemReply = await generateAIResponse('ITEM_QUESTION', context, {
            item: itemDetails
          }, apiKey);
          response = formatResponse('ITEM_QUESTION', itemReply);
        } else {
          // Fallback to menu suggestions
          const suggestions = generateMenuSuggestions('neutral', context, menuDigest);
          const menuReply = await generateAIResponse('MENU', context, {
            mood: 'neutral',
            suggestions
          }, apiKey);
          response = formatResponse('MENU', menuReply, suggestions);
        }
        break;
        
      case 'GREETING':
        const greetReply = await generateAIResponse('GREETING', context, {}, apiKey);
        response = formatResponse('GREETING', greetReply);
        break;
        
      case 'PERSONAL':
        const personalReply = await generateAIResponse('PERSONAL', context, {}, apiKey);
        response = formatResponse('PERSONAL', personalReply);
        break;
        
      case 'CHAT':
      default:
        const chatReply = await generateAIResponse('CHAT', context, {}, apiKey);
        response = formatResponse('CHAT', chatReply);
        break;
    }
    
    console.log('Response:', response.reply.slice(0, 100));
    res.status(200).json(response);
    
  } catch (error) {
    console.error('Handler error:', error);
    res.status(200).json({ 
      reply: 'أهلين! كيف بقدر ساعدك اليوم؟',
      suggestions: []
    });
  }
}