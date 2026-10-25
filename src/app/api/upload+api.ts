// The configured demo Drive account receives JPEG copies, not HEIC/Live Photo originals.
import { createDriveUploader, driveConfigured, validateDriveInput } from '../../../server/drive';
import { readJSON, RequestError } from '../../../server/http';
const upload = createDriveUploader();
export async function GET() { return Response.json({ configured: driveConfigured(), format: 'jpeg-copy', automaticCleanup: false }); }
export async function POST(request: Request) {
  if (!driveConfigured()) return Response.json({ error: 'drive_not_configured' }, { status: 503 });
  try { return Response.json(await upload(validateDriveInput(await readJSON(request, 32 * 1024 * 1024)))); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Drive backup failed.' }, { status: error instanceof RequestError ? error.status : 502 }); }
}
