/**
 * Génère la paire de clés VAPID des notifications et l'ajoute au .env (une seule fois).
 *   pnpm cles-notifications            → .env du dépôt
 *   pnpm cles-notifications --stdout   → écrit les deux lignes sur la sortie (pour les envoyer
 *                                        au serveur par SSH sans les afficher)
 * Changer les clés désabonne tous les appareils : ne pas relancer si elles existent.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findRepoRoot } from '@tandhim/core/node';
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
const lignes = `\nVAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\n`;

if (process.argv.includes('--stdout')) {
  process.stdout.write(lignes);
} else {
  const fichier = join(findRepoRoot(), '.env');
  const actuel = existsSync(fichier) ? readFileSync(fichier, 'utf8') : '';
  if (/^VAPID_PRIVATE_KEY=.+/m.test(actuel)) {
    console.log('Clés VAPID déjà présentes dans .env : rien à faire.');
  } else {
    appendFileSync(fichier, lignes);
    console.log(`Clés VAPID ajoutées à ${fichier} (clé publique : ${publicKey}).`);
  }
}
