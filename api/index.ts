import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleApiRequest } from '../server/authPlugin';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const handled = await handleApiRequest(req, res);
  if (!handled) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'API route not found' }));
  }
}
