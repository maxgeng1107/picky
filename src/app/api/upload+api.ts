// POST /api/upload — back up one photo to the user's Google Drive ("Picky Cloud Bin" folder).
// The app deletes a photo from the phone only after this returns a driveFileId.
// Credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN) live in .env on the dev server.
const FOLDER_NAME = 'Picky Cloud Bin';
const KEEP_DAYS = 30;

let accessToken: { value: string; expiresAt: number } | null = null;
let folderId: string | null = null;

function driveConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
}

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < accessToken.expiresAt - 60_000) return accessToken.value;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Google sign-in failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  accessToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return accessToken.value;
}

// With the drive.file scope Picky only sees files it created, so look for its own folder or make one.
async function getFolderId(token: string): Promise<string> {
  if (folderId) return folderId;
  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const found = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (found.ok) {
    const { files } = (await found.json()) as { files: { id: string }[] };
    if (files.length > 0) return (folderId = files[0].id);
  }
  const created = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  if (!created.ok) throw new Error(`Could not create the Drive folder (${created.status})`);
  return (folderId = ((await created.json()) as { id: string }).id);
}

export async function GET() {
  return Response.json({ configured: driveConfigured() });
}

export async function POST(request: Request) {
  if (!driveConfigured()) {
    return Response.json({ error: 'drive_not_configured' }, { status: 503 });
  }
  const { id, filename, imageBase64 } = (await request.json()) as {
    id: string;
    filename: string;
    imageBase64: string;
  };
  try {
    const token = await getAccessToken();
    const parent = await getFolderId(token);
    const metadata = {
      name: filename,
      parents: [parent],
      appProperties: {
        pickyId: id.slice(0, 100),
        expiresAt: String(Date.now() + KEEP_DAYS * 24 * 60 * 60 * 1000),
      },
    };
    const boundary = `picky-${Date.now()}`;
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
          `--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      Buffer.from(imageBase64, 'base64'),
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!res.ok) throw new Error(`Drive upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    const { id: driveFileId } = (await res.json()) as { id: string };
    return Response.json({ driveFileId });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
