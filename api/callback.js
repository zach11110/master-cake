export default async function handler(req, res) {
  try {
    const { code, state } = req.query;
    const cookies = (req.headers.cookie || '').split(';').reduce((acc, c) => {
      const [k, v] = c.trim().split('=');
      if (k) acc[k] = decodeURIComponent(v || '');
      return acc;
    }, {});

    if (!code || !state || !cookies.oauth_state || state !== cookies.oauth_state) {
      return renderError(res, 'Invalid state or code');
    }

    const clientId = process.env.OAUTH_CLIENT_ID;
    const clientSecret = process.env.OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return renderError(res, 'Missing OAuth env vars');
    }

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
    });
    const tokenJson = await tokenRes.json();
    if (!tokenJson.access_token) {
      return renderError(res, 'Failed to obtain token');
    }

    // Respond with a small HTML page that notifies the opener (Decap CMS) and closes.
    const payload = JSON.stringify({ token: tokenJson.access_token });
    const html = `<!doctype html><html><body>
      <script>
        (function(){
          function send(msg){
            if (window.opener && typeof window.opener.postMessage === 'function') {
              window.opener.postMessage(msg, '*');
            }
          }
          send('authorization:github:success:' + ${JSON.stringify(payload)});
          window.close();
        })();
      </script>
      Success. You can close this window.
    </body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).end(html);
  } catch (e) {
    return renderError(res, 'OAuth callback error');
  }
}

function renderError(res, message) {
  const err = JSON.stringify({ error: message });
  const html = `<!doctype html><html><body>
    <script>
      (function(){
        if (window.opener && typeof window.opener.postMessage === 'function') {
          window.opener.postMessage('authorization:github:error:' + ${JSON.stringify(err)}, '*');
        }
      })();
    </script>
    Error: ${message}
  </body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(400).end(html);
}

