export const dynamic = 'force-dynamic';

/** Utilisé par le healthcheck Docker. */
export function GET() {
  return Response.json({ ok: true, time: new Date().toISOString() });
}
