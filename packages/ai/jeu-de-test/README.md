# AI extraction test set

`pnpm test:ai` replays these cases through Gemini (free tier: one call per batch of 6 cases) and compares, for each case, the extracted items (class group, date, subject) with the expected ones. It is run after every change to the prompt, the lexicon, the model or the code safeguards.

- `pnpm test:ai -- --essais 3`: three runs and their average (outputs vary between runs).
- `pnpm test:ai -- --cas id1,id2`: replay only some cases.
- `pnpm test:ai -- --detail`: show the raw model answer for the failed cases.

## Files

- `cas-publics.json`: **invented** cases (class-group wordings, Darija, polls), versioned.
- `prive/`: **real conversations, anonymized**. Excluded from Git and blocked by a local commit check; this folder is never published.

Case format: `{ id, type, date: "YYYY-MM-DDTHH:MM" (Tunis time), de, titre, texte, attendu: [{ groupe: "RT4" | "RT4/1" | "RT4/2", date: "YYYY-MM-DD", matiere? }] }`. `attendu: []` means the model must extract nothing (small talk).

## Results

Gemini Flash-Lite, the same 32 cases (11 public + 21 real), 20 expected dated items:

| Version                                                       | Precision            | Recall               |
| ------------------------------------------------------------- | -------------------- | -------------------- |
| First prompt (tasks only)                                     | 100 %                | 80 %                 |
| Richer schema, first runs                                     | 68 % → 76 % → 81 %   | 65 – 85 %            |
| Clearer prompt, dates resolved by code (3 runs)               | 89 – 94 % (avg 91 %) | 80 – 90 %            |
| + code safeguards (`packages/core/src/garde-fous.ts`, 3 runs) | 94 – 95 % (avg 95 %) | 85 – 90 % (avg 87 %) |

Recall on the class groups actually displayed in the app: 86 %. Remaining errors: an online session mentioned without a date, an exam date picked up from a side conversation, an item for the other class group sometimes skipped.
