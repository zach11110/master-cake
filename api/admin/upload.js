import path from 'node:path';
import fs from 'node:fs/promises';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(c=>{
    const [k,v] = c.trim().split('=');
    return [k, decodeURIComponent(v||'')];
  }));
  if (cookies.admin_session !== 'ok') return res.status(401).send('Not authenticated');

  // Simple, streaming-less parser for small uploads (Vercel serverless limits apply)
  const contentType = req.headers['content-type'] || '';
  if (!contentType.startsWith('multipart/form-data')) return res.status(400).send('Expected multipart form');

  const boundary = contentType.split('boundary=')[1];
  const buffers = [];
  for await (const chunk of req) buffers.push(chunk);
  const body = Buffer.concat(buffers);
  const parts = body.toString('binary').split(`--${boundary}`);
  const sectionMatch = /name="section"\r\n\r\n([^\r]+)\r\n/.exec(body.toString());
  const section = sectionMatch ? sectionMatch[1] : 'uploads';

  const dir = path.join(process.cwd(), 'menu', section);
  try { await fs.mkdir(dir, { recursive: true }); } catch {}

  const saved = [];
  for (const part of parts) {
    const filenameMatch = /filename="([^"]+)"/.exec(part);
    if (!filenameMatch) continue;
    const filename = filenameMatch[1];
    const fileStart = part.indexOf('\r\n\r\n');
    if (fileStart === -1) continue;
    const fileContent = part.substring(fileStart + 4, part.lastIndexOf('\r\n'));
    const buf = Buffer.from(fileContent, 'binary');
    const target = path.join(dir, filename);
    await fs.writeFile(target, buf);
    saved.push(filename);
  }

  res.status(200).send(saved.join(', '));
}

