/**
 * Phase 0 — vérifie la clé Gemini et la sortie JSON structurée (modèle principal + secours).
 * Usage : pnpm check:gemini
 */
import { ApiError, GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { formatTunis, requireEnv } from '@tandhim/core';
import { loadRepoEnv } from '@tandhim/core/node';

const env = loadRepoEnv();
const ai = new GoogleGenAI({ apiKey: requireEnv(env, 'GEMINI_API_KEY') });

const extraction = z.object({
  elements: z.array(
    z.object({
      type: z.enum(['deadline', 'seance_en_ligne', 'annulation', 'info_prof', 'autre']),
      matiere: z.string().nullable(),
      titre: z.string(),
      date: z
        .string()
        .nullable()
        .describe('Date ISO AAAA-MM-JJ, calculée à partir de la date du message'),
      confiance: z.number().min(0).max(1),
    }),
  ),
});

const message = 'ghodwa el TP mta3 ML en ligne 3al meet, w el compte rendu mta3 TNS lkhmis jey';
const messageDate = new Date('2026-11-23T18:00:00Z'); // lundi 23/11 19:00 à Tunis

async function tryModel(model: string) {
  const started = Date.now();
  const response = await ai.models.generateContent({
    model,
    contents:
      `Message de la discussion de la filière, envoyé le ` +
      `${formatTunis(messageDate, "EEEE d MMMM yyyy 'à' HH:mm")} (Africa/Tunis).\n` +
      `Lexique : ghodwa = demain, mta3 = de, lkhmis = jeudi, jey = prochain, 3al = sur.\n` +
      `Extrais les éléments utiles.\nMessage : « ${message} »`,
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: z.toJSONSchema(extraction),
    },
  });
  const parsed = extraction.parse(JSON.parse(response.text ?? ''));
  return { parsed, ms: Date.now() - started, tokens: response.usageMetadata?.totalTokenCount };
}

/** 503 (surcharge), 429 (quota/minute) et coupures réseau sont temporaires : on réessaie avec backoff. */
async function withRetry<T>(model: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const network = e instanceof TypeError && /fetch failed/i.test(e.message);
      const retryable =
        network || (e instanceof ApiError && (e.status === 503 || e.status === 429));
      if (!retryable || i >= attempts) throw e;
      const reason = e instanceof ApiError ? `HTTP ${e.status}` : 'coupure réseau';
      const delay = 5000 * 2 ** (i - 1); // 5 s, 10 s, 20 s
      console.log(
        `… ${model} : ${reason}, nouvel essai dans ${delay / 1000} s (${i}/${attempts - 1})`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

function explain(e: unknown): string {
  if (e instanceof ApiError) {
    const hint =
      e.status === 503
        ? 'modèle surchargé côté Google (temporaire, ta clé fonctionne) : réessaie plus tard'
        : e.status === 429
          ? 'quota atteint (réessaie plus tard ; vérifie RPM/RPD dans AI Studio)'
          : e.status === 404
            ? 'modèle introuvable : change GEMINI_MODEL / GEMINI_FALLBACK_MODEL'
            : e.status === 400 || e.status === 403
              ? 'clé invalide ou API non activée'
              : '';
    return `HTTP ${e.status} — ${hint}\n   ${e.message.slice(0, 300)}`;
  }
  return e instanceof Error ? e.message : String(e);
}

async function main() {
  for (const model of [env.GEMINI_MODEL, env.GEMINI_FALLBACK_MODEL]) {
    try {
      const { parsed, ms, tokens } = await withRetry(model, () => tryModel(model));
      console.log(`✅ ${model} répond (${ms} ms, ${tokens ?? '?'} tokens), JSON valide :`);
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.error(`❌ ${model} : ${explain(e)}`);
      process.exitCode = 1;
    }
  }
  console.log(
    '\nAttendu : TP de ML en ligne le 2026-11-24, compte rendu de TNS le 2026-12-03 (message du lundi 23/11 : « lkhmis jey » = jeudi 03/12, « lkhmis hedha » serait le 26/11).',
  );
}

void main();
