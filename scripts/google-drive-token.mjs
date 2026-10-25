// One-time helper: get a Google Drive refresh token for Picky and save it to .env.
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env (an OAuth client of type "Desktop app").
// Run: node scripts/google-drive-token.mjs  → open the printed link, allow access, done.
import { readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';

const ENV_FILE = new URL('../.env', import.meta.url);
const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

const env = readFileSync(ENV_FILE, 'utf8');
const read = (key) => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();
const clientId = read('GOOGLE_CLIENT_ID');
const clientSecret = read('GOOGLE_CLIENT_SECRET');
if (!clientId || !clientSecret) {
  console.error('Add GOOGLE_CLIENT_ID=... and GOOGLE_CLIENT_SECRET=... to .env first.');
  process.exit(1);
}

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  });

const server = http.createServer(async (req, res) => {
  const code = new URL(req.url, REDIRECT).searchParams.get('code');
  if (!code) {
    res.end('Waiting for Google…');
    return;
  }
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code',
    }),
  });
  const json = await tokenRes.json();
  if (!json.refresh_token) {
    res.end('No refresh token came back. Check the terminal.');
    console.error('Google did not return a refresh token:', json.error ?? json);
    server.close();
    return;
  }
  const current = readFileSync(ENV_FILE, 'utf8').replace(/^GOOGLE_REFRESH_TOKEN=.*\n?/m, '');
  writeFileSync(ENV_FILE, `${current.trimEnd()}\nGOOGLE_REFRESH_TOKEN=${json.refresh_token}\n`);
  res.end('Picky is connected to Google Drive. You can close this tab.');
  console.log('✅ Saved GOOGLE_REFRESH_TOKEN to .env. Restart `npx expo start --tunnel` to use it.');
  server.close();
});

server.listen(PORT, () => {
  console.log('Open this link in your browser, sign in with the demo Google account and allow access:\n');
  console.log(authUrl + '\n');
});
