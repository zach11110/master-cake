// ULTRA-SMART MENU ASSISTANT: Full AI Control with Error-Free Execution
// Complete AI autonomy with robust error handling

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
    return { sections: {}, allItems: [], itemLookup: {} };
  }
  
  const digest = { 
    sections: {},
    allItems: [],
    itemLookup: {} // For quick lookups
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
        sectionNameAr: sec.ar || key,
        sectionNameEn: sec.en || key
      }));
      
      digest.sections[key] = { 
        ar: sec.ar || key, 
        en: sec.en || key, 
        items: items 
      };
      
      // Build lookup structures
      items.forEach(item => {
        digest.allItems.push(item);
        // Multiple lookup keys for flexibility
        digest.itemLookup[item.arName.toLowerCase()] = item;
        digest.itemLookup[item.id.toLowerCase()] = item;
        if (item.enName) {
          digest.itemLookup[item.enName.toLowerCase()] = item;
        }
      });
    }
  }
  
  MENU_CACHE = { digest, expiresAt: nowMs() + 5 * 60 * 1000 };
  return digest;
}

// Extract comprehensive context
function extractContext(messages, sessionId) {
  const state = CONVERSATION_STATE.get(sessionId) || {
    suggestedItems: new Set(),
    lastSuggestedItems: [],
    discussedTopics: [],
    moodHistory: [],
    conversationTurns: 0
  };
  
  const recentMessages = messages.slice(-8);
  
  // Extract suggested items from conversation
  recentMessages.forEach(msg => {
    if (msg.role === 'assistant') {
      const itemMatches = msg.content?.match(/\*\*(.*?)\*\*/g);
      if (itemMatches) {
        itemMatches.forEach(match => {
          const item = match.replace(/\*\*/g, '').trim();
          if (item && !item.match(/^\d+$/)) {
            state.suggestedItems.add(item);
          }
        });
      }
    }
  });
  
  // Update last suggested items
  const lastAssistantMsg = recentMessages.filter(m => m.role === 'assistant').slice(-1)[0];
  if (lastAssistantMsg) {
    const itemMatches = lastAssistantMsg.content?.match(/\*\*(.*?)\*\*/g);
    if (itemMatches) {
      state.lastSuggestedItems = itemMatches.map(m => m.replace(/\*\*/g, '').trim());
    }
  }
  
  state.conversationTurns++;
  CONVERSATION_STATE.set(sessionId, state);
  
  return {
    messages: recentMessages,
    lastUserMessage: recentMessages.filter(m => m.role === 'user').slice(-1)[0]?.content || '',
    suggestedItems: Array.from(state.suggestedItems),
    lastSuggestedItems: state.lastSuggestedItems,
    conversationTurns: state.conversationTurns,
    fullConversation: recentMessages.map(m => `${m.role}: ${m.content}`).join('\n')
  };
}

// Single unified AI handler with full control
async function generateSmartResponse(context, menuDigest, apiKey) {
  // Build menu summary for AI
  const menuSummary = Object.entries(menuDigest.sections).map(([key, section]) => {
    const items = section.items.slice(0, 5).map(item => 
      `  - ${item.arName}${item.price ? ` (${item.price} ل.س)` : ''}`
    ).join('\n');
    return `${section.ar}:\n${items}`;
  }).join('\n\n');

  const systemPrompt = `أنت "ماستر" - نادل ذكي ومحترف في مقهى "بوظة ماستر كيك". شخصيتك ودودة وذكية ومرحة باللهجة السورية.

**هويتك:**
- اسمك: ماستر
- وظيفتك: نادل ومساعد في المقهى
- شخصيتك: ودود، ذكي، مرح، محترف
- طريقة كلامك: لهجة سورية طبيعية وعفوية

**القائمة المتاحة:**
${menuSummary}

**العناصر المقترحة سابقاً (حاول عدم تكرارها):**
${context.suggestedItems.join(', ') || 'لا يوجد'}

**مهمتك:** حلل رسالة المستخدم وحدد النية والرد المناسب.

**القواعد:**

1. **تحليل النية:**
   - إذا ذكر أي شيء عن الطعام/الشراب/الطقس/المزاج/الجوع/العطش → اقترح من القائمة
   - إذا سأل عن عنصر محدد → اشرح تفاصيله
   - إذا سأل سؤال شخصي عنك → أجب كماستر النادل
   - إذا دردشة عامة → تحدث بود دون ذكر الطعام

2. **الاقتراحات:**
   - إذا طلب "بارد" أو ذكر الحر → اقترح من المشروبات الباردة والآيس كريم فقط
   - إذا ذكر "بردان" أو البرد → اقترح من المشروبات الساخنة
   - اقترح 1-2 عناصر مناسبة مع ذكر السعر
   - اجعل أسماء العناصر بين ** دائماً

3. **طريقة الرد:**
   - استخدم اللهجة السورية العفوية
   - كن ودود ومرح
   - ردود قصيرة ومركزة (2-3 جمل)
   - تفاعل مع مزاج المستخدم

**المحادثة:**
${context.fullConversation}

**آخر رسالة:** "${context.lastUserMessage}"

حلل الموقف واكتب ردك المناسب مباشرة. لا تكتب JSON أو أي تنسيق خاص، فقط الرد الطبيعي.`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        contents: [{ 
          role: 'user', 
          parts: [{ text: systemPrompt }] 
        }], 
        generationConfig: { 
          temperature: 0.8,
          maxOutputTokens: 400,
          topP: 0.9,
          topK: 40
        } 
      })
    });
    
    if (!resp.ok) {
      console.error('Gemini API error:', resp.status);
      throw new Error(`API error: ${resp.status}`);
    }
    
    const data = await resp.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (!reply) {
      throw new Error('Empty AI response');
    }
    
    return reply.trim();
    
  } catch (error) {
    console.error('AI generation error:', error);
    
    // Smart fallback based on context
    const msg = context.lastUserMessage.toLowerCase();
    
    if (msg.includes('مرحبا') || msg.includes('هاي')) {
      return 'أهلين وسهلين! نورت المقهى! شو بتحب تطلب اليوم؟';
    } else if (msg.includes('كيفك')) {
      return 'الحمدلله تمام! أنا ماستر، جاهز لخدمتك. شو عبالك تجرب من عندنا؟';
    } else if (msg.includes('بارد') || msg.includes('حر')) {
      return 'يا الله شو هالحر! شو رايك **آيسد أمريكانو** (25000 ل.س) منعش كتير، أو **آيس كريم كيكة الماستر** (15000 ل.س)؟';
    } else if (msg.includes('عمرك') || msg.includes('مين انت')) {
      return 'أنا ماستر، نادلك المفضل هون بالمقهى! موجود دايماً لخدمتك وأساعدك تختار أطيب شي من عندنا.';
    } else {
      return 'تكرم عيونك! كيف بقدر ساعدك اليوم؟';
    }
  }
}

// Extract suggestions from AI reply for structured response
function extractSuggestionsFromReply(reply, menuDigest) {
  const suggestions = [];
  const itemMatches = reply.match(/\*\*(.*?)\*\*/g);
  
  if (itemMatches) {
    itemMatches.forEach(match => {
      const itemName = match.replace(/\*\*/g, '').trim();
      
      // Find in menu
      const item = menuDigest.itemLookup[itemName.toLowerCase()];
      if (item) {
        suggestions.push({
          id: item.id,
          category: item.category,
          arName: item.arName,
          enName: item.enName,
          price: item.price || 'السعر غير محدد',
          description: item.desc,
          badge: item.badge || '',
          images: item.images || []
        });
      }
    });
  }
  
  return suggestions;
}

// MAIN HANDLER - Streamlined
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
    return res.status(500).json({ 
      reply: 'عذراً، المساعد غير متوفر حالياً. جرب بعد شوي.',
      suggestions: [] 
    });
  }

  try {
    // Step 1: Load menu
    const menuDigest = await buildMenuDigest();
    
    // Step 2: Extract context
    const context = extractContext(messages, sessionId);
    
    console.log('Processing message:', context.lastUserMessage);
    
    // Step 3: Generate AI response with full control
    const aiReply = await generateSmartResponse(context, menuDigest, apiKey);
    
    // Step 4: Extract structured suggestions from reply
    const suggestions = extractSuggestionsFromReply(aiReply, menuDigest);
    
    // Step 5: Format final response
    const finalResponse = {
      reply: aiReply.slice(0, 500),
      suggestions: suggestions.slice(0, 3) // Max 3 suggestions
    };
    
    console.log('Response:', finalResponse.reply.slice(0, 100));
    res.status(200).json(finalResponse);
    
  } catch (error) {
    console.error('Handler error:', error);
    
    // Emergency fallback
    res.status(200).json({ 
      reply: 'أهلين وسهلين! معليش في مشكلة تقنية صغيرة. شو بتحب من عندنا؟ عنا قهوة وشاي ومشروبات باردة وحلويات!',
      suggestions: []
    });
  }
}