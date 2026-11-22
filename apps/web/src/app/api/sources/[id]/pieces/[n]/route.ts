import { OAuth2Client } from 'google-auth-library';
import { loadEnv } from '@tandhim/core';
import { dechiffrer } from '@tandhim/core/node';
import { listerComptes, trouverSource } from '@tandhim/db';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Pièce jointe d'un mail, récupérée auprès de Gmail (lecture seule) pour être lue dans l'app.
 * Accès protégé par la session (proxy.ts). Rien n'est stocké : le fichier est relayé tel quel.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  const { db } = getDb();
  const source = trouverSource(db, Number(id));
  const piece = source?.attachments[Number(n)];
  if (!source || source.source !== 'gmail' || !piece?.id || !source.accountId)
    return new Response('Pièce jointe introuvable.', { status: 404 });
  const compte = listerComptes(db).find((c) => c.id === source.accountId);
  if (!compte) return new Response('Compte Google introuvable.', { status: 404 });

  const env = loadEnv();
  const auth = new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  });
  auth.setCredentials({ refresh_token: dechiffrer(compte.refreshTokenEnc, env.ENCRYPTION_KEY) });
  try {
    const { token } = await auth.getAccessToken();
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(source.externalId)}/attachments/${encodeURIComponent(piece.id)}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000) },
    );
    if (!r.ok) return new Response(`Gmail a refusé (${r.status}).`, { status: 502 });
    const { data } = (await r.json()) as { data?: string };
    if (!data) return new Response('Pièce jointe vide.', { status: 502 });
    return new Response(Buffer.from(data, 'base64url'), {
      headers: {
        'Content-Type': piece.type || 'application/octet-stream',
        // « inline » : un PDF ou une image s'affiche directement (aperçu iOS) au lieu d'être téléchargé.
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(piece.nom)}`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e) {
    return new Response(`Gmail ne répond pas : ${e instanceof Error ? e.message : String(e)}`, {
      status: 502,
    });
  }
}
