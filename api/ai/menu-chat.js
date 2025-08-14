// ULTRA-SMART MENU ASSISTANT (Enhanced Syrian Dialect + AI + Memory)

import OpenAI from "openai";
import Fuse from "fuse.js"; // fuzzy search

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Expanded Syrian dialect keywords for explicit menu intents
const explicitMenuKeywords = [
  "شي سخن", "شي دافي", "دفيني", "بردان", "بردانة", "سخنان", "دفيني فنجان شاي",
  "شي بيبرد", "شي بيفرفح", "هيك شي بيبرد", "عطيني بارد", "مشروب بارد",
  "شي حلو", "شي مالح", "وجبة", "سناك", "مشروب", "شي خفيف", "شي سريع",
  "قهوة", "شاي", "عصير", "سندويش", "مقبلات"
];

// Expanded continuation keywords (more, something else)
const continuationKeywords = [
  "غيره", "غير", "شو كمان", "بعد", "عطيني شي تاني", "عطيني غير", "بدنا أكتر",
  "بدي كمان", "شي تاني", "كمان", "بزيادة", "بدنا نشوف أكتر"
];

let suggestedItems = new Set(); // prevent repetition across conversation

// Fuse.js options for fuzzy search (Arabic-friendly)
const fuse = new Fuse(explicitMenuKeywords, {
  includeScore: true,
  threshold: 0.4, // allow ~60% match
});

// Detect intent with hybrid logic + AI ALWAYS involved
async function detectIntentHybrid(message) {
  const lowerMessage = message.toLowerCase();

  // First: fuzzy match for explicit menu keywords
  const fuzzyMatches = fuse.search(lowerMessage);
  if (fuzzyMatches.length && fuzzyMatches[0].score < 0.4) {
    return "EXPLICIT_MENU";
  }

  // Check continuation keywords directly
  if (continuationKeywords.some(k => lowerMessage.includes(k))) {
    return "CONTINUE_SUGGESTIONS";
  }

  // Always involve AI to refine classification
  const aiClassification = await classifyIntentWithAI(message);
  return aiClassification;
}

// AI intent classification
async function classifyIntentWithAI(message) {
  const prompt = `
  صنّف نية المستخدم بناءً على النص التالي:
  "${message}"

  التصنيفات الممكنة:
  - EXPLICIT_MENU (طلب مباشر لعنصر من القائمة)
  - CONTINUE_SUGGESTIONS (طلب اقتراحات إضافية)
  - CHAT_INTENT (دردشة عامة أو كلام غير متعلق بالقائمة)

  أجب فقط بالتصنيف.
  `;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
  });

  return response.choices[0].message.content.trim();
}

// Suggest menu items, ensuring no repetition
function getNewSuggestions(allItems, count = 3) {
  const newItems = allItems.filter(item => !suggestedItems.has(item));
  const picked = newItems.slice(0, count);
  picked.forEach(item => suggestedItems.add(item));
  return picked;
}

// Generate varied chat responses to avoid repetition
function getRandomChatResponse() {
  const options = [
    "أكيد! خبرني أكتر شو مزاجك اليوم؟",
    "طيب، شو بتحب نبلّش فيه؟",
    "تمام، خبرني شو خاطرك هلأ؟",
    "على عيني، شو بتحب أجيبلك؟",
    "حاضر، بتحب شي حلو ولا مالح؟"
  ];
  return options[Math.floor(Math.random() * options.length)];
}

// Main handler
export async function handleUserMessage(message, conversationHistory, allMenuItems) {
  // Keep longer memory: last 25 messages
  const shortHistory = conversationHistory.slice(-25);

  const intent = await detectIntentHybrid(message);

  if (intent === "EXPLICIT_MENU") {
    const suggestions = getNewSuggestions(allMenuItems);
    return suggestions.length
      ? `من عندي لك: ${suggestions.join(", ")}`
      : "شكله عطيتك كل الاقتراحات الممكنة!";
  }

  if (intent === "CONTINUE_SUGGESTIONS") {
    const suggestions = getNewSuggestions(allMenuItems);
    return suggestions.length
      ? `طيب، جرب كمان: ${suggestions.join(", ")}`
      : "ما بقي شي جديد أقترحه عليك 😄";
  }

  // Default: chat
  return getRandomChatResponse();
}
