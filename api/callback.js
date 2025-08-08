export default async function handler(req, res) {
  try {
    const { code, state } = req.query;
    const cookies = (req.headers.cookie || '').split(';').reduce((acc, c) => {
      const [k, v] = c.trim().split('=');
      if (k) acc[k] = decodeURIComponent(v || '');
      return acc;
    }, {});

    if (!code || !state || !cookies.oauth_state || state !== cookies.oauth_state) {
      res.status(400).json({ error: 'Invalid state or code' });
      return;
    }

    const clientId = process.env.OAUTH_CLIENT_ID;
    const clientSecret = process.env.OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      res.status(500).json({ error: 'Missing OAuth env vars' });
      return;
    }

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
    });
    const tokenJson = await tokenRes.json();
    if (!tokenJson.access_token) {
      res.status(400).json({ error: 'Failed to obtain token', details: tokenJson });
      return;
    }

    // Decap CMS expects JSON { token: "..." }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ token: tokenJson.access_token }));
  } catch (e) {
    res.status(500).json({ error: 'OAuth callback error', details: String(e) });
  }
}

