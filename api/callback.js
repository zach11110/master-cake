export default async function handler(req, res) {
  console.log('Callback called with:', { query: req.query, method: req.method });
  
  try {
    const { code, state } = req.query;
    console.log('Received code:', code ? 'present' : 'missing');
    console.log('Received state:', state ? 'present' : 'missing');

    // Parse cookies
    const cookies = (req.headers.cookie || '').split(';').reduce((acc, c) => {
      const [k, v] = c.trim().split('=');
      if (k) acc[k] = decodeURIComponent(v || '');
      return acc;
    }, {});
    console.log('Cookies:', Object.keys(cookies));

    if (!code) {
      console.error('No code received');
      return renderError(res, 'No authorization code received');
    }

    if (!state) {
      console.error('No state received');
      return renderError(res, 'No state parameter received');
    }

    if (!cookies.oauth_state) {
      console.error('No oauth_state cookie found');
      return renderError(res, 'No oauth_state cookie found');
    }

    if (state !== cookies.oauth_state) {
      console.error('State mismatch:', { received: state, expected: cookies.oauth_state });
      return renderError(res, 'Invalid state parameter');
    }

    const clientId = process.env.OAUTH_CLIENT_ID;
    const clientSecret = process.env.OAUTH_CLIENT_SECRET;
    
    console.log('Environment variables:', {
      clientId: clientId ? 'present' : 'missing',
      clientSecret: clientSecret ? 'present' : 'missing'
    });

    if (!clientId || !clientSecret) {
      console.error('Missing OAuth environment variables');
      return renderError(res, 'Server configuration error');
    }

    console.log('Exchanging code for token...');
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Accept': 'application/json',
        'User-Agent': 'Master-Cake-CMS'
      },
      body: JSON.stringify({ 
        client_id: clientId, 
        client_secret: clientSecret, 
        code 
      })
    });

    console.log('Token response status:', tokenRes.status);
    const tokenJson = await tokenRes.json();
    console.log('Token response:', { 
      hasAccessToken: !!tokenJson.access_token,
      error: tokenJson.error,
      errorDescription: tokenJson.error_description
    });

    if (!tokenJson.access_token) {
      console.error('No access token received:', tokenJson);
      return renderError(res, `Failed to obtain token: ${tokenJson.error || 'Unknown error'}`);
    }

    // Success! Return the token to CMS
    const payload = JSON.stringify({ token: tokenJson.access_token, provider: 'github' });
    console.log('Success! Sending token to CMS');
    
    const html = `<!doctype html><html><body>
      <script>
        (function(){
          function send(msg, data){
            console.log('Sending message:', msg, data);
            if (window.opener && typeof window.opener.postMessage === 'function') {
              window.opener.postMessage(msg, '*');
              if (data) {
                window.opener.postMessage(data, '*');
              }
            } else {
              console.error('No opener window found');
            }
          }
          
          const payload = ${payload};
          
          // Try multiple message formats for compatibility
          send('authorization:github:success:' + JSON.stringify(payload));
          send({ type: 'authorization:github:success', payload: payload });
          
          setTimeout(() => {
            console.log('Closing window...');
            window.close();
          }, 1000);
        })();
      </script>
      <div style="padding: 20px; font-family: Arial, sans-serif; text-align: center;">
        <h2>✅ Authorization successful!</h2>
        <p>You can close this window now.</p>
        <script>setTimeout(() => window.close(), 2000);</script>
      </div>
    </body></html>`;
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).end(html);
    
  } catch (error) {
    console.error('Callback error:', error);
    return renderError(res, 'OAuth callback error: ' + error.message);
  }
}

function renderError(res, message) {
  console.error('Rendering error:', message);
  const err = JSON.stringify({ error: message });
  const html = `<!doctype html><html><body>
    <script>
      (function(){
        console.error('OAuth error:', ${err});
        if (window.opener && typeof window.opener.postMessage === 'function') {
          window.opener.postMessage('authorization:github:error:' + ${JSON.stringify(err)}, '*');
        }
        setTimeout(() => window.close(), 5000);
      })();
    </script>
    <div style="padding: 20px; font-family: Arial, sans-serif; text-align: center; color: #d32f2f;">
      <h2>❌ Authorization Error</h2>
      <p><strong>Error:</strong> ${message}</p>
      <p>This window will close automatically.</p>
    </div>
  </body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(400).end(html);
}