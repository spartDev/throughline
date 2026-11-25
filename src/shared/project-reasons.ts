import { NONLOCAL_TABLE, type ProjectReasonDetail, type ProjectReasonSentences, type StoredSqlObject, type StoredSqlPlace } from './errors';

/**
 * Les raisons d'un Projet illisible en français (bdesk-ewr.8) : la seule source de leurs phrases. Le serveur les écrit par `projectReason`, qui rend la
 * raison française (`reason`, pour le journal et les autres clients) et sa cause codée (`reasonDetail`) ensemble : elles ne peuvent pas diverger. Le
 * catalogue de l'interface reprend `PROJECT_REASONS_FR` pour le français (`src/web/i18n/catalog/errors.ts`), et écrit l'anglais à côté.
 *
 * Les comptes passent par `count` : `String` côté serveur (la raison française que le journal a toujours eue : « 1000 »), `formatCount` dans l'interface
 * (« 1 000 »).
 */

/** Un nom de la base dans une raison, entre guillemets (il arrive borné et sans caractère de contrôle : `safeName`, `stored-sql.ts`). */
const quoted = (name: string) => `« ${name} »`;

/** Ce qui suit un objet pour dire où il a été vu : rien pour le working set. */
const place = (where: StoredSqlPlace): string => {
  if (where.in === 'head') return ' (dans HEAD)';
  if (where.in === 'era') return ` (époque du commit ${where.commit})`;
  if (where.in === 'dependencies-history') return ' (historique des dépendances)';
  return '';
};

/** Un objet de SQL stocké, tel que la raison le nomme. */
export function storedSqlObjectFr(object: StoredSqlObject): string {
  switch (object.kind) {
    case 'view':
      return `${quoted(object.name)} est une vue, que l'app pourrait lire à la place d'une table${place(object.place)}`;
    case 'generated-column':
      return `colonne générée ${quoted(object.column)} de ${quoted(object.table)}${place(object.place)}`;
    case 'functional-index':
      return `index fonctionnel ${quoted(object.index)} de ${quoted(object.table)}`;
    case 'history-generated-column':
      return `colonne générée ${quoted(object.column)} de l'historique des dépendances${place(object.place)}`;
    case 'nonlocal-rows':
      return `${quoted(NONLOCAL_TABLE)} n'est pas vide${place(object.place)} : bd semble être en train de migrer cette base ; réessayez dans un instant, ou lancez n'importe quelle commande bd, qui achèvera la migration`;
    case 'nonlocal-in-first-commit':
      return `${quoted(NONLOCAL_TABLE)} existe déjà dans le premier commit : sans commit où elle manque, on ne peut pas dire qu'elle est vide`;
    case 'table-in-first-commit':
      return `${quoted(object.name)} existe déjà dans le premier commit : sans commit où elle manque, on ne peut pas juger son CREATE TABLE`;
    case 'table-without-definition':
      return `${quoted(object.table)}${place(object.place)} : aucune définition de table lue par la comparaison : la table manque, ou la comparaison est incomplète`;
    case 'not-a-table':
      return `${quoted(object.table)}${place(object.place)} est une vue, ou autre chose qu'une table, que l'app pourrait lire à la place d'une table`;
    case 'unrecognized-definition':
      return `${quoted(object.table)}${place(object.place)} : construction non reconnue dans la définition de la table`;
    case 'not-admitted':
      return `${quoted(object.table)}${place(object.place)} : colonne générée, index fonctionnel, ou autre construction non admise`;
    case 'unrecognized-options':
      return `${quoted(object.table)}${place(object.place)} : construction non reconnue dans les options de la table`;
  }
}

/**
 * « .beads/dolt/beads » : le chemin que le serveur a écrit (`path`, normalisé par `join`) ; « .beads/dolt/<base> » quand `metadata.json` ne nomme pas la base
 * (`folder` est normalisé, et `<base>` n'a rien à normaliser : la concaténation écrit ce que `join` écrirait).
 */
const databaseFr = ({ folder, path }: { folder: string; path: string }) => path || `${folder}/<base>`;

/** Le singulier pour 0 et 1, le pluriel au-delà, comme le veut le français. */
const pluralFr = (n: number, one: string, many: string) => (n > 1 ? many : one);

/** « 50 Mo » à partir d'un Mio, « 512 octets » en deçà (« 1 octet »). */
const bytesFr = (bytes: number, count: (n: number) => string) =>
  bytes >= 1024 * 1024 ? `${count(Math.round(bytes / (1024 * 1024)))} Mo` : `${count(bytes)} ${pluralFr(bytes, 'octet', 'octets')}`;

export const PROJECT_REASONS_FR: ProjectReasonSentences = {
  'no-beads-folder': () => 'Aucun dossier .beads dans ce dossier ajouté à la main.',
  'no-metadata': () => 'Pas de metadata.json dans .beads : workspace beads incomplet, sans base Dolt.',
  'invalid-metadata': () => 'metadata.json illisible (JSON invalide).',
  'sqlite-workspace': ({ database }) => `Workspace SQLite (${database}) : seuls les Projets Dolt sont suivis.`,
  'other-workspace': ({ backend }) => `Workspace ${quoted(backend)} : seuls les Projets Dolt sont suivis.`,
  'unknown-workspace': () => `Workspace ${quoted('inconnu')} : seuls les Projets Dolt sont suivis.`,
  'unsupported-mode': ({ mode }) => `Mode Dolt ${quoted(mode)} non pris en charge (embedded et server seulement).`,
  'database-not-local': (where) =>
    `Base Dolt absente de ce poste (${databaseFr(where)} introuvable) : le Projet est en mode server, sa base n'est pas disponible localement.`,
  'database-not-found': (where) => `Base Dolt introuvable (${databaseFr(where)}).`,
  'database-missing': () => 'Base Dolt introuvable.',
  unreadable: () => 'Projet illisible.',
  'project-vanished': () => 'Projet disparu pendant le calcul (dossier supprimé, déplacé ou masqué).',
  'dolt-not-found': ({ binary }) => `Le binaire ${quoted(binary)} est introuvable : installez Dolt et vérifiez qu'il est dans le PATH.`,
  'launch-failed': ({ binary, cause }) => `Impossible de lancer ${quoted(binary)} : ${cause || 'cause inconnue'}.`,
  'null-byte': ({ binary }) => `Impossible de lancer ${quoted(binary)} : la requête contient un octet nul, que le client n’envoie pas à dolt.`,
  'private-config-failed': ({ directory, cause }) =>
    `Impossible de préparer un dossier de configuration privé pour dolt dans ${directory} (${cause || 'erreur inconnue'}) : dolt n'est pas lancé, car il écrirait dans le ~/.dolt de l'utilisateur.`,
  'folder-not-found': ({ path }) => `Dossier introuvable : ${path}`,
  'queue-full': ({ max }, count) => `Trop de lectures Dolt en attente (plus de ${count(max)}) : réessayez dans un instant.`,
  timeout: ({ ms, path }, count) => `Délai dépassé (${count(ms)} ms) pour lire ${path}`,
  'output-too-large': ({ bytes, path }, count) => `Sortie de dolt trop volumineuse (plus de ${bytesFr(bytes, count)}) pour lire ${path}`,
  'dolt-exit-code': ({ code }) => `dolt a échoué (code de sortie ${code}) sans message d'erreur`,
  'dolt-interrupted': ({ signal }) => `dolt a été interrompu (${signal}) sans message d'erreur`,
  'invalid-date': ({ value }) => `Date Dolt invalide : ${value}`,
  'invalid-integer-text': ({ column, value }) => `Entier Dolt invalide (${column}) : ${quoted(value)}`,
  'invalid-integer': ({ column, value }) => `Entier Dolt invalide (${column}) : ${value}`,
  'head-unreadable': ({ path }) => `HEAD illisible dans ${path}`,
  'dolt-locked': () => 'La base est tenue par un autre processus dolt : réessayez dans un instant.',
  'dolt-permission-denied': () => 'Dolt ne peut pas ouvrir les fichiers de la base : permission refusée.',
  'dolt-unreadable-output': () => 'La sortie de dolt est illisible.',
  'dolt-failed': () => "Dolt n'a pas pu lire la base : le texte de son erreur n'est pas repris (il pourrait citer ce que la base lui fait lire).",
  'read-refused': () => "Dolt a refusé une lecture de l'app : le texte de son erreur n'est pas repris (il pourrait citer ce que la base lui fait lire).",
  'missing-table': ({ name }) => `Dolt ne trouve pas la table ${quoted(name)} que l'app lit.`,
  'missing-column': ({ name }) => `Dolt ne trouve pas la colonne ${quoted(name)} que l'app lit.`,
  'check-refused': () =>
    "La vérification du SQL stocké n'a pas pu s'achever : Dolt a refusé l'une de ses propres requêtes, dont le message n'est pas repris (il pourrait citer ce que la base lui fait lire). La base n'est pas lue.",
  'check-outpaced': ({ attempts }, count) =>
    `La base change plus vite que la vérification du SQL qu'elle porte (${count(attempts)} ${pluralFr(attempts, 'essai', 'essais')}) : réessayez dans un instant.`,
  'stored-sql': ({ objects, others }, count) => {
    const shown = objects.map(storedSqlObjectFr).join(' ; ');
    const rest = others > 0 ? ` ; et ${count(others)} ${pluralFr(others, 'autre', 'autres')}` : '';
    return `SQL stocké dans la base, que Dolt exécuterait à la lecture : ${shown}${rest}. La base n'est pas lue.`;
  },
  'no-commit': ({ path }) => `Aucun commit dans ${path} : ce que ${NONLOCAL_TABLE} porte ne peut pas se vérifier.`,
  'era-commit-unreadable': ({ path }) => `Commit d'époque illisible dans ${path}`,
};

/** La raison française d'une cause : sa phrase, les comptes écrits tels quels (`String`). */
export function projectReasonFr(detail: ProjectReasonDetail): string {
  // Le code et ses paramètres vont ensemble (`ProjectReasonDetail`) : la phrase de ce code reçoit ses paramètres.
  const sentence = PROJECT_REASONS_FR[detail.code] as (params: ProjectReasonDetail['params'], count: (n: number) => string) => string;
  return sentence(detail.params, String);
}

/** Ce que le serveur porte pour une cause : la raison française et la cause codée, écrites d'une seule source. */
export function projectReason(detail: ProjectReasonDetail): { reason: string; reasonDetail: ProjectReasonDetail } {
  return { reason: projectReasonFr(detail), reasonDetail: detail };
}
