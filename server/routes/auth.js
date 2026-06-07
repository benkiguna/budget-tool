import { Router } from 'express';
import { google } from 'googleapis';

const router = Router();

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.SERVER_URL}/auth/google/callback`,
  );
}

// 1. Redirect to Google consent screen
router.get('/google', (req, res) => {
  const oauth2Client = getOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.appdata'],
  });
  res.redirect(url);
});

// 2. Handle callback — exchange code for tokens
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code || typeof code !== 'string') {
    return res.status(400).send('Missing auth code');
  }

  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    req.session.tokens = tokens;
    res.redirect(`${process.env.CLIENT_URL}?auth=success`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect(`${process.env.CLIENT_URL}?auth=error`);
  }
});

// 3. Provide fresh access token to browser (auto-refreshes if needed)
router.get('/token', async (req, res) => {
  const tokens = req.session.tokens;
  if (!tokens) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials(tokens);

    if (tokens.expiry_date && tokens.expiry_date < Date.now() + 60_000) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      req.session.tokens = credentials;
      return res.json({ access_token: credentials.access_token });
    }

    res.json({ access_token: tokens.access_token });
  } catch (err) {
    console.error('Token refresh error:', err);
    res.status(401).json({ error: 'Token refresh failed' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/status', (req, res) => {
  res.json({ authenticated: !!req.session.tokens });
});

export default router;
