/**
 * Alertes de panne : une source (Messenger, Google, Gemini…) qui échoue depuis plus de 3 h
 * déclenche une notification, une seule fois par panne, avec la raison et quoi faire.
 */
export const SEUIL_ALERTE_MS = 3 * 3_600_000;

export interface EtatSource {
  key: string;
  label: string;
  lastError: string | null;
  enEchecDepuis: string | null;
}

/** Faut-il alerter maintenant ? (panne de plus de 3 h, pas encore signalée) */
export function panneAAlerter(
  e: EtatSource,
  dejaSignalee: string | undefined,
  maintenant: Date,
): boolean {
  if (!e.enEchecDepuis || e.key === 'notifications') return false;
  if (dejaSignalee === e.enEchecDepuis) return false;
  return maintenant.getTime() - new Date(e.enEchecDepuis).getTime() >= SEUIL_ALERTE_MS;
}

/** Quoi faire, selon la source et l'erreur. */
export function conseilPanne(key: string, erreur: string): string {
  const e = erreur.toLowerCase();
  if (key.startsWith('messenger-silence')) {
    return 'Le pont est peut-être déconnecté de Facebook. Dans Element, salon « Pont Messenger », envoie « list-logins » ; si le compte est déconnecté, refais « login messenger » avec les cookies.';
  }
  if (key.startsWith('pont-messenger')) {
    return 'Le pont a perdu la connexion au compte secondaire. Dans Element, salon « Pont Messenger » : « list-logins », puis « relogin » ou « login messenger » avec les cookies.';
  }
  if (key.startsWith('messenger')) {
    if (/jeton|token|401/.test(e))
      return 'Le jeton Matrix de l’app est refusé : refais-le (script de l’étape 9 du guide Messenger) puis redéploie.';
    return 'Le serveur Matrix ne répond pas. Sur le serveur : cd ~/messenger && docker compose ps (puis docker compose up -d si un conteneur est arrêté).';
  }
  if (key.startsWith('gmail') || key.startsWith('classroom') || key.startsWith('drive')) {
    if (/invalid_grant|revoked|révoqu|reconnect|unauthorized|401/.test(e))
      return 'L’accès Google a été retiré : Plus → Comptes et cours → Reconnecter.';
    if (/inaccessible|not found/.test(e))
      return 'Le dossier Drive n’est plus accessible avec tes comptes : vérifie le partage ou retire-le dans Plus → Comptes et cours.';
    return 'Google ne répond pas : la synchro réessaie toute seule. Si ça dure, vérifie la connexion Internet du serveur.';
  }
  if (key === 'ia') {
    if (/quota|429|resource_exhausted/.test(e))
      return 'Quota Gemini du jour épuisé : reprise automatique demain, rien à faire.';
    if (/api key|permission|403|invalid/.test(e))
      return 'La clé Gemini est refusée : crée-en une nouvelle sur AI Studio et mets-la dans le .env du serveur.';
    return 'Gemini ne répond pas : nouvel essai automatique. Si ça dure, vérifie le statut de l’API Gemini.';
  }
  if (key === 'sauvegarde')
    return 'La sauvegarde de nuit a échoué : vérifie l’espace disque du serveur (df -h).';
  if (key === 'worker')
    return 'Une étape de synchro a été abandonnée (bloquée) : elle repart au prochain passage. Si ça se répète, redémarre le worker.';
  return 'Ouvre Plus → État des synchros pour le détail.';
}
