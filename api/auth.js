export default async function handler(req, res) {
  console.log('Auth endpoint called:', { method: req.method, query: req.query });
  
  const clientId = process.env.OAUTH_CLIENT_ID;
  if (!clientId) {
    console.error('Missing OAUTH_CLIENT_ID environment variable');
    res.status(500).json({ error: 'Missing OAUTH_CLIENT_ID environment variable' });
    return;
  }

  const scope = (req.query.scope || 'repo').toString();
  const state = Math.random().toString(36).slice(2);
  
  console.log('Generated state:', state);

  // Build redirect_uri dynamically based on current host
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const baseUrl = `${proto}://${host}`;
  const redirectUri = `${baseUrl}/api/callback`;
  
  console.log('Redirect URI:', redirectUri);

  // Set a short-lived state cookie for CSRF protection
  res.setHeader('Set-Cookie', `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600; Secure`);

  const ghAuth = new URL('https://github.com/login/oauth/authorize');
  ghAuth.searchParams.set('client_id', clientId);
  ghAuth.searchParams.set('redirect_uri', redirectUri);
  ghAuth.searchParams.set('scope', scope);
  ghAuth.searchParams.set('state', state);

  const authUrl = ghAuth.toString();
  console.log('Redirecting to:', authUrl);

  res.writeHead(302, { Location: authUrl });
  res.end();
}