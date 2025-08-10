import path from 'node:path';

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
  const itemIdMatch = /name="itemId"\r\n\r\n([^\r]+)\r\n/.exec(body.toString());
  const itemId = itemIdMatch ? itemIdMatch[1] : '';
  const autoMatch = /name="autoname"\r\n\r\n([^\r]+)\r\n/.exec(body.toString());
  const autoName = autoMatch ? autoMatch[1] === '1' : false;

  // Save files to GitHub repo under menu/<section>/
  const repo = process.env.GITHUB_REPO; // owner/name
  const branch = process.env.GITHUB_BRANCH || 'main';
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) return res.status(500).send('Missing GITHUB_REPO or GITHUB_TOKEN');

  const slugify = (s) => (s || 'img')
    .toString()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .toLowerCase();

  const saved = [];
  let index = 0;
  for (const part of parts) {
    const filenameMatch = /filename="([^"]+)"/.exec(part);
    if (!filenameMatch) continue;
    const original = filenameMatch[1];
    const fileStart = part.indexOf('\r\n\r\n');
    if (fileStart === -1) continue;
    const fileContent = part.substring(fileStart + 4, part.lastIndexOf('\r\n'));
    const contentBase64 = Buffer.from(fileContent, 'binary').toString('base64');

    let finalName = original;
    if (autoName) {
      const base = slugify(itemId) || 'img';
      const ts = Date.now();
      const ext = (original && original.lastIndexOf('.') !== -1) ? original.slice(original.lastIndexOf('.')).toLowerCase() : '.jpg';
      index += 1;
      finalName = `${base}-${ts}-${index}${ext}`;
    }

    const apiUrl = `https://api.github.com/repos/${repo}/contents/menu/${section}/${encodeURIComponent(finalName)}`;
    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
      body: JSON.stringify({
        message: `chore(admin): upload ${section}/${finalName}`,
        content: contentBase64,
        branch
      })
    });
    if (!putRes.ok) return res.status(500).send('GitHub upload failed');
    saved.push(finalName);
  }

  res.setHeader('Content-Type', 'application/json');
  res.status(200).end(JSON.stringify({ saved }));
}

