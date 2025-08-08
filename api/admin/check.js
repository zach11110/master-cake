export default async function handler(req, res) {
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(c=>{
    const [k,v] = c.trim().split('=');
    return [k, decodeURIComponent(v||'')];
  }));
  if (cookies.admin_session === 'ok') return res.status(200).json({ ok: true });
  return res.status(401).json({ error: 'Not authenticated' });
}

