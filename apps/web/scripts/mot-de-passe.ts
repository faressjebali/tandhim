/**
 * Choisit le mot de passe de l'app : demande le mot de passe (sans l'afficher),
 * écrit son hachage dans le .env local (APP_PASSWORD_HASH) et crée SESSION_SECRET si absent.
 * Usage : pnpm mot-de-passe   (dans un vrai terminal : cmd, PowerShell)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { findRepoRoot } from '@tandhim/core/node';
import { hashPassword } from '../src/lib/auth';

function demanderCache(question: string): Promise<string> {
  let muet = false;
  const sortie = new Writable({
    write(chunk, _enc, cb) {
      if (!muet) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: sortie, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (reponse) => {
      rl.close();
      process.stdout.write('\n');
      resolve(reponse);
    });
    muet = true;
  });
}

function definir(contenu: string, cle: string, valeur: string): string {
  const ligne = `${cle}=${valeur}`;
  const re = new RegExp(`^${cle}=.*$`, 'm');
  return re.test(contenu) ? contenu.replace(re, () => ligne) : `${contenu.trimEnd()}\n${ligne}\n`;
}

async function main() {
  if (!process.stdin.isTTY) {
    console.error('Lance cette commande dans un vrai terminal (cmd ou PowerShell).');
    process.exit(1);
  }
  const mdp = await demanderCache('Nouveau mot de passe de Tandhim : ');
  if (mdp.length < 8) {
    console.error('❌ 8 caractères minimum.');
    process.exit(1);
  }
  if ((await demanderCache('Confirme le mot de passe : ')) !== mdp) {
    console.error('❌ Les deux saisies sont différentes.');
    process.exit(1);
  }

  const fichier = join(findRepoRoot(), '.env');
  let contenu = existsSync(fichier) ? readFileSync(fichier, 'utf8') : '';
  contenu = definir(contenu, 'APP_PASSWORD_HASH', hashPassword(mdp));
  if (!/^SESSION_SECRET=.{32,}$/m.test(contenu)) {
    contenu = definir(contenu, 'SESSION_SECRET', randomBytes(48).toString('base64url'));
  }
  writeFileSync(fichier, contenu);
  console.log(`✅ Mot de passe enregistré (haché) dans ${fichier}.`);
  console.log('   Pour le serveur : pnpm mot-de-passe:serveur (voir docs/serveur.md §12).');
}

void main();
