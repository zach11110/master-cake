import fs from 'node:fs/promises';
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

  try{
    const { section, item } = req.body || {};
    if(!section || !item || !item.id) return res.status(400).json({ error: 'Missing section or item id' });

    const file = path.join(process.cwd(), 'menu', 'manifest.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.sections = json.sections || {};
    json.sections[section] = json.sections[section] || { items: [], ar: '', en: '' };
    const items = json.sections[section].items || [];
    const idx = items.findIndex(i => i.id === item.id);
    if(idx >= 0) items[idx] = { ...items[idx], ...item };
    else items.push(item);
    json.sections[section].items = items;
    await fs.writeFile(file, JSON.stringify(json, null, 2), 'utf8');
    res.status(200).json({ ok: true });
  }catch(e){
    res.status(500).json({ error: 'Failed to save item' });
  }
}

