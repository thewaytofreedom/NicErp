// Next.js may normalize req.nextUrl's host. Validate the browser origin against
// the actual HTTP Host header; browsers cannot forge Host in a cross-origin fetch.
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin'),
    host = request.headers.get('host');
  if (!origin || !host) return false;
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol) && url.host === host && url.origin === origin;
  } catch {
    return false;
  }
}
