export default async function handler(req, res) {
  try {
    const repo = process.env.GITHUB_REPO; // owner/name
    const branch = process.env.GITHUB_BRANCH || 'main';
    const token = process.env.GITHUB_TOKEN;
    if (!repo || !token) {
      return res.status(500).json({ error: 'Missing GITHUB_REPO or GITHUB_TOKEN' });
    }

    const apiUrl = `https://api.github.com/repos/${repo}/contents/menu/manifest.json?ref=${encodeURIComponent(branch)}`;
    const r = await fetch(apiUrl, { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' } });
    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ error: 'GitHub fetch failed', details: t });
    }
    const data = await r.json();
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).end(content);
  } catch (e) {
    res.status(500).json({ error: 'Failed to read manifest via GitHub' });
  }
}

