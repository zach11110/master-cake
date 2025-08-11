// Core data fallback: bilingual sections and demo items (used if manifest is missing)
const BRAND_FALLBACK = {
  ar: {
    name: 'بوظة مستر كيك',
    tag: 'قائمة راقية بطابع حديث',
    sections: {
      cold_drinks: 'مشروبات باردة',
      hot_drinks: 'مشروبات ساخنة',
      sweets: 'حلويات',
      argillies: 'أركيلة',
      ice_cream: 'بوظة / آيس كريم'
    },
    demo: 'صنف تجريبي',
    note: 'عينات عرض فقط — استبدل بمحتوى حقيقي'
  },
  en: {
    name: 'Master Cake',
    tag: 'A modern, premium menu experience',
    sections: {
      cold_drinks: 'Cold Drinks',
      hot_drinks: 'Hot Drinks',
      sweets: 'Sweets',
      argillies: 'Argillies (Hookah)',
      ice_cream: 'Ice Cream'
    },
    demo: 'Demo Item',
    note: 'Demo only — replace with your real items'
  }
};

const DEFAULT_SECTION_ORDER = ['cold_drinks', 'hot_drinks', 'sweets', 'argillies', 'ice_cream'];

// Curated notes per section (AR/EN)
const SECTION_NOTES = {
  ar: {
    cold_drinks: 'برودة منعشة لكل مزاج — ارتشف الانتعاش.',
    hot_drinks: 'دفء يوقظ الحواس — كل رشفة حكاية.',
    sweets: 'حلوى تصنع البهجة — لقمة تذوب في الفم.',
    argillies: 'أجواء هادئة ونكهات أصيلة — اختَر مزاجك.',
    ice_cream: 'متعة بوظة كريمية — نكهات تحبها.'
  },
  en: {
    cold_drinks: 'Chilled refreshment for every mood.',
    hot_drinks: 'Warm sips that awaken the senses.',
    sweets: 'Treats that spark joy.',
    argillies: 'Laid‑back vibes with authentic flavors.',
    ice_cream: 'Creamy scoops of happiness.'
  }
};

// Generate some demo items per section
function buildDemoItems(label) {
  return Array.from({ length: 6 }).map((_, i) => ({
    title: `${label} ${i + 1}`,
    note: i % 2 ? 'Signature style' : 'Best seller',
    badge: i % 3 ? 'NEW' : '★'
  }));
}

function $(sel) { return document.querySelector(sel); }

let manifestLoadAttempted = false;
async function loadManifest() {
  // Prefer JSON on HTTP(S), fallback to JS for file:// or errors
  try {
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      const res = await fetch('menu/manifest.json', { cache: 'no-store' });
      if (res.ok) return await res.json();
    }
  } catch (e) {}
  return await loadManifestFromJS();
}

function loadManifestFromJS() {
  return new Promise((resolve) => {
    if (window.MENU_MANIFEST) return resolve(window.MENU_MANIFEST);
    if (manifestLoadAttempted) return resolve(null);
    manifestLoadAttempted = true;

    const s = document.createElement('script');
    s.src = 'menu/manifest.js';
    s.defer = true;
    s.onload = () => resolve(window.MENU_MANIFEST || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}

function getBrand(t, lang) {
  if (!t) return BRAND_FALLBACK[lang];
  const sectionsObj = {};
  const keys = Object.keys(t.sections || {});
  if (keys.length) {
    keys.forEach((key) => {
      const sec = t.sections[key] || {};
      sectionsObj[key] = lang === 'ar' ? (sec.ar || key) : (sec.en || key);
    });
  } else {
    // fallback if manifest has no sections
    DEFAULT_SECTION_ORDER.forEach((key) => {
      const sec = t.sections?.[key];
      sectionsObj[key] = lang === 'ar' ? (sec?.ar || BRAND_FALLBACK.ar.sections[key]) : (sec?.en || BRAND_FALLBACK.en.sections[key]);
    });
  }
  return {
    name: lang === 'ar' ? (t.brand?.arName || BRAND_FALLBACK.ar.name) : (t.brand?.enName || BRAND_FALLBACK.en.name),
    tag: lang === 'ar' ? (t.brand?.tagAr || BRAND_FALLBACK.ar.tag) : (t.brand?.tagEn || BRAND_FALLBACK.en.tag),
    sections: sectionsObj,
  };
}

function buildItemsForSection(manifest, sectionKey, lang) {
  if (!manifest) {
    // Only show demo items when no JSON manifest is available (local file mode)
    const label = lang === 'ar' ? BRAND_FALLBACK.ar.demo : BRAND_FALLBACK.en.demo;
    return Array.from({ length: 6 }).map((_, i) => ({
      id: `demo-${sectionKey}-${i + 1}`,
      arName: `${label} ${i + 1}`,
      enName: `${label} ${i + 1}`,
      descriptionAr: 'وصف تجريبي للصنف. استبدله بالمكونات الحقيقية.',
      descriptionEn: 'Demo description. Replace with real ingredients.',
      images: []
    }));
  }
  const sec = manifest.sections?.[sectionKey];
  if (!sec) return [];
  return sec.items || [];
}

async function renderUI(lang) {
  const manifest = await loadManifest();
  const t = getBrand(manifest, lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

  // Update SEO meta and URL parameter
  const url = new URL(window.location.href);
  url.searchParams.set('lang', lang);
  window.history.replaceState({}, '', url.toString());

  const isAr = lang === 'ar';
  const titleText = isAr ? 'بوظة ماستر كيك | Master Cake — القائمة' : 'Master Cake — Premium Menu';
  document.title = titleText;
  const metaDesc = document.getElementById('metaDescription');
  metaDesc?.setAttribute('content', isAr ? 'قائمة بوظة ماستر كيك — مشروبات باردة وساخنة، حلويات، أركيلة، وبوظة.' : 'Master Cake menu — cold/hot drinks, sweets, argillies, and ice cream.');
  document.getElementById('canonicalLink')?.setAttribute('href', `${url.origin}${url.pathname}`);
  document.getElementById('ogTitle')?.setAttribute('content', titleText);
  document.getElementById('ogDescription')?.setAttribute('content', metaDesc?.content || '');
  document.getElementById('ogUrl')?.setAttribute('content', `${url.origin}${url.pathname}?lang=${lang}`);
  document.getElementById('ogLocale')?.setAttribute('content', isAr ? 'ar_AR' : 'en_US');
  const absImage = `${url.origin}/Logo.png`;
  document.getElementById('ogImage')?.setAttribute('content', absImage);
  document.getElementById('ogImageSecure')?.setAttribute('content', absImage);
  document.getElementById('twTitle')?.setAttribute('content', titleText);
  document.getElementById('twDescription')?.setAttribute('content', metaDesc?.content || '');
  document.getElementById('twImage')?.setAttribute('content', absImage);

  $('#brandName').textContent = t.name;
  const brandTagEl = $('#brandTag');
  if (brandTagEl) brandTagEl.textContent = t.tag;

  // Determine section keys
  const sectionKeys = Object.keys(t.sections || {});

  // Render quick nav chips
  const quickNav = $('#quickNav');
  quickNav.innerHTML = '';
  sectionKeys.forEach((key) => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = t.sections[key];
    chip.addEventListener('click', () => {
      document.getElementById(`sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    quickNav.appendChild(chip);
  });

  // Render sections with demo items
  const root = $('#sectionsRoot');
  root.innerHTML = '';

  sectionKeys.forEach((key, idx) => {
    const card = document.createElement('article');
    card.className = 'section-card';
    card.id = `sec-${key}`;

    const header = document.createElement('div');
    header.className = 'section-header';
    header.innerHTML = `
      <div class="section-title">
        <span class="badge">${idx + 1}</span>
        <h2>${t.sections[key]}</h2>
      </div>
      <p class="section-note">${SECTION_NOTES[lang]?.[key] || (lang === 'ar' ? BRAND_FALLBACK.ar.note : BRAND_FALLBACK.en.note)}</p>
    `;

    const itemsWrap = document.createElement('div');
    itemsWrap.className = 'items';

    const items = buildItemsForSection(manifest, key, lang);
    items.forEach((it) => {
      const item = document.createElement('div');
      item.className = 'item';
      const title = lang === 'ar' ? (it.arName || it.title) : (it.enName || it.title);
      const desc = lang === 'ar' ? (it.descriptionAr || it.note) : (it.descriptionEn || it.note);
      const firstImg = (it.images && it.images[0]) ? `menu/${key}/${it.images[0]}` : '';
      const price = it.price ? (lang === 'ar' ? `${it.price} ل.س` : `$${it.price}`) : '';
      const defaultBadge = lang === 'ar' ? 'جديد' : 'NEW';
      const badgeText = it.badge || '';
      const isNew = (badgeText || '').toLowerCase() === 'new' || badgeText === 'جديد' || badgeText === '★';
      const pills = [
        badgeText && `<span class="pill pill-badge ${isNew ? 'pill-badge-new' : ''}">${badgeText}</span>`,
        price && `<span class="pill pill-price">${price}</span>`
      ].filter(Boolean).join('');
      item.innerHTML = `
        ${firstImg ? `<img class="thumb" src="${firstImg}" alt="${title}" loading="lazy" decoding="async" />` : `<div class="thumb" aria-hidden="true"></div>`}
        <h3>${title}</h3>
        <p>${desc || ''}</p>
        <div class="pill-group">${pills || `<span class="pill pill-badge pill-badge-new">${defaultBadge}</span>`}</div>
      `;
      item.addEventListener('click', () => openLightbox({ sectionKey: key, item: it, lang }));
      itemsWrap.appendChild(item);
    });

    card.appendChild(header);
    card.appendChild(itemsWrap);
    root.appendChild(card);
  });

  // Animate items on view
  revealOnScroll();

  // Update lang buttons
  document.querySelectorAll('.lang').forEach((btn) => btn.classList.toggle('active', btn.dataset.lang === lang));
}

function revealOnScroll() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('show');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });

  document.querySelectorAll('.item').forEach((el, i) => {
    el.style.transitionDelay = `${(i % 6) * 60}ms`;
    observer.observe(el);
  });
}

// Language switch
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('mc_lang') || 'ar';
  renderUI(saved);

  document.getElementById('btnAR').addEventListener('click', () => {
    localStorage.setItem('mc_lang', 'ar');
    renderUI('ar');
  });
  document.getElementById('btnEN').addEventListener('click', () => {
    localStorage.setItem('mc_lang', 'en');
    renderUI('en');
  });

  // Chat widget
  const chatFab = document.getElementById('chatFab');
  const chatPanel = document.getElementById('chatPanel');
  const chatBody = document.getElementById('chatBody');
  const chatInput = document.getElementById('chatInput');
  const chatSend = document.getElementById('chatSend');
  const chatClose = document.getElementById('chatClose');
  if (chatFab && chatPanel) {
    const sessionId = (localStorage.getItem('mc_chat_session') || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())));
    localStorage.setItem('mc_chat_session', sessionId);
    const history = [];
    const pushMsg = (role, content) => {
      history.push({ role, content }); if (history.length > 10) history.shift();
      const div = document.createElement('div');
      div.className = `chat-msg ${role === 'user' ? 'chat-user' : 'chat-bot'}`;
      div.textContent = content;
      chatBody.appendChild(div);
      chatBody.scrollTop = chatBody.scrollHeight;
    };
    const send = async () => {
      const text = chatInput.value.trim(); if (!text) return;
      pushMsg('user', text); chatInput.value = '';
      try {
        const res = await fetch('/api/ai/menu-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, messages: history, maxSuggestions: 3 }) });
        const data = await res.json();
        pushMsg('assistant', data.reply || 'تمام!');
        // Render suggestion chips
        if (Array.isArray(data.suggestions) && data.suggestions.length) {
          const wrap = document.createElement('div');
          wrap.className = 'chat-msg chat-bot';
          wrap.innerHTML = data.suggestions.map(s => `<button class="chip" data-sec="${s.section}" data-id="${s.id}" style="margin:3px 6px 0 0">${s.arName || s.id}${s.price ? ' • ' + s.price : ''}</button>`).join('');
          wrap.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
            const sec = btn.getAttribute('data-sec'); const id = btn.getAttribute('data-id');
            document.getElementById(`sec-${sec}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }));
          chatBody.appendChild(wrap); chatBody.scrollTop = chatBody.scrollHeight;
        }
        if (data.followUpQuestion) pushMsg('assistant', data.followUpQuestion);
      } catch {
        pushMsg('assistant', 'صار عندي ضغط هلق، جرب بعد شوي 🙏');
      }
    };
    chatFab.addEventListener('click', () => { chatPanel.classList.add('show'); if (!history.length) pushMsg('assistant', 'أهلا فيك! خبرني بمزاجك اليوم وبقترح لك شي طيب 😋'); });
    chatClose.addEventListener('click', () => { chatPanel.classList.remove('show'); });
    chatSend.addEventListener('click', send);
    chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  }
});

// Lightbox / Gallery
const lb = {
  el: null,
  main: null,
  thumbs: null,
  title: null,
  desc: null,
  closeBtn: null,
  state: { images: [], index: 0 }
};

function initLightbox() {
  lb.el = document.getElementById('lightbox');
  lb.main = document.getElementById('lbMainImg');
  lb.thumbs = document.getElementById('lbThumbs');
  lb.title = document.getElementById('lbTitle');
  lb.desc = document.getElementById('lbDesc');
  lb.closeBtn = document.querySelector('.lb-close');
  lb.closeBtn.addEventListener('click', closeLightbox);
  lb.el.querySelector('.lightbox-backdrop').addEventListener('click', closeLightbox);
  window.addEventListener('keydown', (e) => {
    if (lb.el.classList.contains('hidden')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') showIndex(Math.min(lb.state.index + 1, lb.state.images.length - 1));
    if (e.key === 'ArrowLeft') showIndex(Math.max(lb.state.index - 1, 0));
  });
}

function openLightbox({ sectionKey, item, lang }) {
  if (!lb.el) initLightbox();
  const title = lang === 'ar' ? (item.arName || item.title) : (item.enName || item.title);
  const desc = lang === 'ar' ? (item.descriptionAr || '') : (item.descriptionEn || '');
  lb.title.textContent = title;
  lb.desc.textContent = desc;

  const images = (item.images || []).map((f) => `menu/${sectionKey}/${f}`);
  lb.state.images = images.length ? images : [''];
  lb.state.index = 0;
  renderThumbs();
  showIndex(0);

  lb.el.classList.remove('hidden');
  lb.el.setAttribute('aria-hidden', 'false');
}

function closeLightbox() {
  lb.el.classList.add('hidden');
  lb.el.setAttribute('aria-hidden', 'true');
}

function renderThumbs() {
  lb.thumbs.innerHTML = '';
  lb.state.images.forEach((src, i) => {
    const im = document.createElement('img');
    im.src = src || '';
    im.alt = `thumb-${i + 1}`;
    im.addEventListener('click', () => showIndex(i));
    lb.thumbs.appendChild(im);
  });
}

function showIndex(i) {
  lb.state.index = i;
  const src = lb.state.images[i];
  if (!src) {
    // fallback image (blank)
    lb.main.removeAttribute('src');
    lb.main.style.background = 'linear-gradient(135deg, #ffe1d2, #fff1ea)';
  } else {
    lb.main.src = src;
    lb.main.style.background = '#fff';
  }
  Array.from(lb.thumbs.children).forEach((c, idx) => c.classList.toggle('active', idx === i));
}

