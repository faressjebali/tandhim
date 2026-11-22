/**
 * Appel à Gemini pour analyser un lot d'éléments sources (sortie JSON structurée).
 */
import { ApiError, GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { type Analyse, analyseSchema } from './schema';

/** Quota Gemini atteint (429) : le lot reste en file d'attente et sera repris plus tard. */
export class QuotaAtteint extends Error {}

export interface PieceJointe {
  /** Élément source auquel appartient la pièce jointe (cité dans le texte d'accompagnement). */
  sourceId: number;
  nom: string;
  mime: string;
  base64: string;
}

export interface OptionsAnalyse {
  apiKey: string;
  modeles: string[];
  /** Appelé après chaque requête réussie (comptage du quota). */
  surConsommation?: (modele: string, tokens: number) => void;
}

/** Lecture de documents par le modèle « docs » : plus lent, mais jamais plus de 3 min. */
const DELAI_GEMINI_MS = 180_000;

const retryable = (e: unknown) => e instanceof ApiError && (e.status === 503 || e.status === 500);

export async function analyserLot(
  prompt: string,
  pieces: PieceJointe[],
  opts: OptionsAnalyse,
): Promise<{ analyse: Analyse; modele: string }> {
  // Délai maximal : un appel sans réponse ne doit jamais bloquer le moteur (ni les synchros).
  const ai = new GoogleGenAI({ apiKey: opts.apiKey, httpOptions: { timeout: DELAI_GEMINI_MS } });
  const parts = [
    { text: prompt },
    ...pieces.flatMap((p) => [
      { text: `Pièce jointe « ${p.nom} » de l’élément ${p.sourceId} :` },
      { inlineData: { mimeType: p.mime, data: p.base64 } },
    ]),
  ];
  let derniere: unknown;
  for (const modele of opts.modeles) {
    for (let essai = 1; essai <= 2; essai++) {
      try {
        const r = await ai.models.generateContent({
          model: modele,
          contents: [{ role: 'user', parts }],
          config: {
            responseMimeType: 'application/json',
            responseJsonSchema: z.toJSONSchema(analyseSchema),
            temperature: 0.1,
          },
        });
        opts.surConsommation?.(modele, r.usageMetadata?.totalTokenCount ?? 0);
        const analyse = analyseSchema.parse(JSON.parse(r.text ?? ''));
        return { analyse, modele };
      } catch (e) {
        derniere = e;
        if (e instanceof ApiError && e.status === 429) {
          // Quota de CE modèle atteint : on passe au suivant ; plus aucun modèle → la file attendra.
          if (modele === opts.modeles.at(-1)) throw new QuotaAtteint(e.message);
          break;
        }
        if (e instanceof ApiError && !retryable(e)) break; // modèle introuvable, clé… : modèle suivant
        // JSON invalide ou surcharge : un nouvel essai, puis modèle suivant.
      }
    }
  }
  throw derniere instanceof Error ? derniere : new Error(String(derniere));
}
