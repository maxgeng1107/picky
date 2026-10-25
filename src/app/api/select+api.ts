// Server-only route. Phone and real-user study share the same validated VLM observations.
import { validatePhotos, VisionError } from '../../../server/vision';
import { observeLegacyPhotos } from '../../../server/legacy-vision';
import { readJSON, RequestError } from '../../../server/http';

export async function POST(request: Request) {
  try {
    const body = await readJSON(request);
    let photos;
    try { photos = validatePhotos((body as { photos?: unknown })?.photos); }
    catch (error) { throw new RequestError(error instanceof Error ? error.message : 'Invalid photos.'); }
    return Response.json(await observeLegacyPhotos(photos));
  } catch (error) {
    const status = error instanceof RequestError || error instanceof VisionError ? error.status : 502;
    return Response.json({ error: error instanceof Error ? error.message : 'Scoring failed.' }, { status });
  }
}
