/**
 * Phase 0 — test OAuth bloquant (SPEC §10) : l'INSAT laisse-t-il notre app lire
 * Gmail, Classroom et Drive en lecture seule ? Rien n'est écrit côté Google,
 * aucun token n'est enregistré sur le disque, et l'accès est révoqué à la fin.
 *
 * Usage : pnpm check:google   (puis se connecter avec le compte à tester)
 */
import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { OAuth2Client } from 'google-auth-library';
import { classroom as classroomApi } from '@googleapis/classroom';
import { drive as driveApi } from '@googleapis/drive';
import { gmail as gmailApi } from '@googleapis/gmail';
import { requireEnv } from '@tandhim/core';
import { loadRepoEnv } from '@tandhim/core/node';

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

/** Scopes en LECTURE SEULE uniquement (principe non négociable : aucune écriture côté Google). */
const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.announcements.readonly',
  'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
];

/** Google renvoie parfois l'ancien nom d'un scope (même autorisation). */
const SCOPE_ALIASES: Record<string, string> = {
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly':
    'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly',
};

const env = loadRepoEnv();
const client = new OAuth2Client({
  clientId: requireEnv(env, 'GOOGLE_CLIENT_ID'),
  clientSecret: requireEnv(env, 'GOOGLE_CLIENT_SECRET'),
  redirectUri: REDIRECT_URI,
});

const authUrl = client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent select_account',
  scope: GOOGLE_SCOPES,
});

function openBrowser(url: string) {
  const cmd =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => undefined);
}

function waitForCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', REDIRECT_URI);
      if (url.pathname !== '/oauth2callback') {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        error
          ? `<h1>Refusé : ${error}</h1><p>Regarde le terminal.</p>`
          : '<h1>C’est bon ✅</h1><p>Tu peux fermer cet onglet et revenir au terminal.</p>',
      );
      server.close();
      if (error) reject(new Error(`Google a renvoyé l'erreur « ${error} »`));
      else if (code) resolve(code);
      else reject(new Error('Pas de code dans la réponse Google'));
    });
    server.listen(PORT, () => {
      console.log('\nOuvre ce lien et connecte-toi avec le compte à tester :\n');
      console.log(authUrl, '\n');
      openBrowser(authUrl);
    });
  });
}

type Result = { name: string; ok: boolean; detail: string };

async function probe(name: string, fn: () => Promise<string>): Promise<Result> {
  try {
    return { name, ok: true, detail: await fn() };
  } catch (e: unknown) {
    const err = e as { message?: string; code?: number; errors?: { reason?: string }[] };
    const reason = err.errors?.[0]?.reason ?? '';
    return {
      name,
      ok: false,
      detail: `${err.code ?? ''} ${reason} ${err.message ?? String(e)}`.trim(),
    };
  }
}

async function main() {
  const code = await waitForCode();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const info = await client.getTokenInfo(tokens.access_token ?? '').catch(() => undefined);
  const granted = new Set(info?.scopes ?? (tokens.scope ?? '').split(' '));
  const missing = GOOGLE_SCOPES.filter(
    (s) => s.startsWith('https://') && ![s, SCOPE_ALIASES[s]].some((n) => n && granted.has(n)),
  );
  console.log(`\nCompte testé : ${info?.email ?? '(inconnu)'}`);

  const gmail = gmailApi({ version: 'v1', auth: client });
  const classroom = classroomApi({ version: 'v1', auth: client });
  const drive = driveApi({ version: 'v3', auth: client });

  const results: Result[] = [];
  results.push(
    await probe('Gmail', async () => {
      const { data } = await gmail.users.getProfile({ userId: 'me' });
      return `${data.emailAddress} — ${data.messagesTotal} messages`;
    }),
  );

  let firstCourseId: string | undefined;
  results.push(
    await probe('Classroom (cours)', async () => {
      const { data } = await classroom.courses.list({ courseStates: ['ACTIVE'], pageSize: 50 });
      const courses = data.courses ?? [];
      firstCourseId = courses[0]?.id ?? undefined;
      return `${courses.length} cours actifs : ${courses.map((c) => c.name).join(' · ') || '—'}`;
    }),
  );
  if (firstCourseId) {
    const courseId = firstCourseId;
    results.push(
      await probe('Classroom (devoirs)', async () => {
        const { data } = await classroom.courses.courseWork.list({ courseId, pageSize: 5 });
        return `${data.courseWork?.length ?? 0} devoir(s) lus dans le 1er cours`;
      }),
      await probe('Classroom (annonces)', async () => {
        const { data } = await classroom.courses.announcements.list({ courseId, pageSize: 5 });
        return `${data.announcements?.length ?? 0} annonce(s) lues dans le 1er cours`;
      }),
      await probe('Classroom (supports)', async () => {
        const { data } = await classroom.courses.courseWorkMaterials.list({
          courseId,
          pageSize: 5,
        });
        return `${data.courseWorkMaterial?.length ?? 0} support(s) lus dans le 1er cours`;
      }),
      // Indispensable pour le « terminé automatique » (SPEC §3.3) : mon état de rendu.
      await probe('Classroom (mes rendus)', async () => {
        const { data } = await classroom.courses.courseWork.studentSubmissions.list({
          courseId,
          courseWorkId: '-',
          userId: 'me',
          pageSize: 5,
        });
        const states = (data.studentSubmissions ?? []).map((s) => s.state).join(', ');
        return `${data.studentSubmissions?.length ?? 0} rendu(s) lus : ${states || '—'}`;
      }),
    );
  }

  results.push(
    await probe('Drive (partagés avec moi)', async () => {
      const { data } = await drive.files.list({
        q: 'sharedWithMe = true',
        pageSize: 5,
        fields: 'files(name, mimeType)',
      });
      const names = (data.files ?? []).map((f) => f.name).join(' · ');
      return `${data.files?.length ?? 0} fichier(s) : ${names || '—'}`;
    }),
  );

  console.log('\n=== Résultat du test OAuth ===');
  console.log(
    `Refresh token reçu : ${tokens.refresh_token ? 'oui ✅' : 'NON ❌ (révoque l’accès et relance)'}`,
  );
  if (missing.length) console.log(`Scopes NON accordés ❌ : ${missing.join(', ')}`);
  for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.name} — ${r.detail}`);

  const allOk = results.every((r) => r.ok) && missing.length === 0;
  const onlyUnticked =
    !allOk &&
    missing.length > 0 &&
    results.every((r) => r.ok || /insufficient authentication scopes/i.test(r.detail));
  console.log(
    allOk
      ? '\nTout passe : l’établissement ne bloque pas l’app pour ce compte.'
      : onlyUnticked
        ? '\nCe n’est pas un blocage : certaines autorisations n’ont pas été cochées sur l’écran Google.' +
          '\n→ Relance et coche TOUTES les cases (ou « Tout sélectionner ») avant « Continuer ».'
        : '\nAu moins un accès est bloqué. Voir docs/google-oauth.md (résultats possibles et plan B).',
  );
  await client.revokeCredentials().catch(() => undefined); // simple test : on ne garde rien
  process.exit(allOk ? 0 : 1);
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`\n❌ ${msg}`);
  if (/admin_policy_enforced|access_denied|org_internal/i.test(msg)) {
    console.error(
      '→ Probablement une restriction de l’administrateur Google Workspace (voir docs/google-oauth.md).',
    );
  }
  process.exit(1);
});
