import path from 'node:path';

function parseCookies(req){
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(c=>{
    const [k,v] = c.trim().split('=');
    return [k, decodeURIComponent(v||'')];
  }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const cookies = parseCookies(req);
  if (cookies.admin_session !== 'ok') return res.status(401).json({ error: 'Not authenticated' });

  try {
    const { section, item } = req.body || {};
    if(!section || !item || !item.id) return res.status(400).json({ error: 'Missing section or item id' });

    const repo = process.env.GITHUB_REPO; // owner/name
    const branch = process.env.GITHUB_BRANCH || 'main';
    const token = process.env.GITHUB_TOKEN;
    if (!repo || !token) return res.status(500).json({ error: 'Missing GITHUB_REPO or GITHUB_TOKEN' });

    // 1) Get file
    const getUrl = `https://api.github.com/repos/${repo}/contents/menu/manifest.json?ref=${encodeURIComponent(branch)}`;
    const getRes = await fetch(getUrl, { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' } });
    if (!getRes.ok) return res.status(500).json({ error: 'Failed to fetch manifest' });
    const getData = await getRes.json();
    const sha = getData.sha;
    const json = JSON.parse(Buffer.from(getData.content, 'base64').toString('utf8'));

    // 2) Modify with partial update (ignore empty strings/arrays)
    json.sections = json.sections || {};
    json.sections[section] = json.sections[section] || { items: [], ar: '', en: '' };
    const items = json.sections[section].items || [];
    const sanitize = (obj) => {
      const allowedKeys = ['arName','enName','descriptionAr','descriptionEn','images','price','badge'];
      const out = { id: obj.id };
      for (const k of allowedKeys) {
        if (!(k in obj)) continue;
        const v = obj[k];
        if (Array.isArray(v)) { if (v.length) out[k] = v; continue; }
        if (typeof v === 'string') { if (v.trim() !== '') out[k] = v.trim(); continue; }
        if (v !== undefined && v !== null) out[k] = v;
      }
      return out;
    };
    const patch = sanitize(item);
    const idx = items.findIndex(i => i.id === item.id);
    if (item._delete) {
      if (idx >= 0) items.splice(idx, 1);
    } else {
      if(idx >= 0) items[idx] = { ...items[idx], ...patch };
      else items.push(patch);
    }
    json.sections[section].items = items;

    const newContent = Buffer.from(JSON.stringify(json, null, 2)).toString('base64');

    // 3) Commit back
    const putUrl = `https://api.github.com/repos/${repo}/contents/menu/manifest.json`;
    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
      body: JSON.stringify({
        message: `chore(admin): update ${section} item ${item.id}`,
        content: newContent,
        sha,
        branch
      })
    });
    if (!putRes.ok) return res.status(500).json({ error: 'Failed to commit manifest' });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save item' });
  }
}

