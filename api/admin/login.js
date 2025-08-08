import { serialize } from 'node:querystring';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { username, password } = req.body || {};
  const u = process.env.ADMIN_USERNAME;
  const p = process.env.ADMIN_PASSWORD;
  if (!u || !p) return res.status(500).json({ error: 'Admin credentials not set' });
  if (username === u && password === p) {
    res.setHeader('Set-Cookie', `admin_session=ok; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400; Secure`);
    return res.status(200).json({ ok: true });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
}

