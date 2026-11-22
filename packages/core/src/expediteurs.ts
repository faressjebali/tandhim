/**
 * Expéditeurs dont les mails sont lus par le moteur IA (décision de Fares, 21/11/2026) :
 * ses profs, la déléguée, la DVURE et DEF INSAT. Tout le reste (clubs, autres étudiants,
 * « Etudiants INSAT », UCAR, autres enseignants…) est ignoré sans passer par l'IA.
 */

/** Adresses exactes. */
export const ADRESSES_SUIVIES = [
  // Déléguée de la classe
  'deleguee@exemple.tn',
  // Direction de la vie universitaire et des relations extérieures
  'vie-etudiante@exemple.tn',
  // Direction des études (emplois du temps, DS, examens)
  'etudes@exemple.tn',
  // Profs (adresses déjà vues)
  'leila.ferchichi@exemple.tn', // TNS
  'anis.sassi@exemple.tn', // Frameworks
  'sarah.bensalahboukotaya@exemple.tn', // Anglais
  'sami.riahi@exemple.tn', // RHD
  'amel.gharbi@exemple.tn', // PRM
  'ons.mejri@exemple.tn', // Droit
  'walid.trabelsi@exemple.tn', // Machine Learning
];

/** Profs pas encore vus : nom de famille cherché dans la partie avant @ d'une adresse INSAT. */
export const NOMS_PROFS_SUIVIS = ['haddad', 'mansour', 'chaabane', 'jaziri', 'ayari'];

const DOMAINE = '@exemple.tn';

/** Extrait l'adresse d'un en-tête « Nom <adresse> » (ou adresse seule), en minuscules. */
export function adresseDe(entete: string | null | undefined): string | null {
  if (!entete) return null;
  const m = /<([^>]+)>/.exec(entete) ?? /([^\s,;]+@[^\s,;>]+)/.exec(entete);
  return m?.[1]?.trim().toLowerCase() ?? null;
}

export function estAdresseSuivie(adresse: string | null | undefined): boolean {
  if (!adresse) return false;
  const a = adresse.toLowerCase();
  if (ADRESSES_SUIVIES.includes(a)) return true;
  if (!a.endsWith(DOMAINE)) return false;
  const local = a.slice(0, -DOMAINE.length).replace(/[^a-z]/g, '');
  return NOMS_PROFS_SUIVIS.some((nom) => local.includes(nom));
}

/** Mail reçu à lire ? (expéditeur suivi) */
export const expediteurSuivi = (from: string | null | undefined) =>
  estAdresseSuivie(adresseDe(from));

/** Mail envoyé par Fares à garder ? (au moins un destinataire suivi : prof, déléguée…) */
export function destinataireSuivi(destinataires: string | null | undefined): boolean {
  return (destinataires ?? '').split(/[,;]/).some((d) => estAdresseSuivie(adresseDe(d)));
}

/** Requête Gmail correspondante (filtrage côté Google, puis vérifié par le code). */
export function requeteExpediteurs(champ: 'from' | 'to'): string {
  const termes = [...ADRESSES_SUIVIES, ...NOMS_PROFS_SUIVIS];
  return `${champ}:(${termes.join(' OR ')})`;
}
