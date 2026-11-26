import {
  type ApiErrorCode,
  type ApiErrorParams,
  NONLOCAL_TABLE,
  type ProjectReasonDetail,
  type ProjectReasonSentences,
  type StoredSqlObjectSentences,
  type StoredSqlPlace,
} from '../../../shared/errors';
import { PROJECT_REASONS_FR, STORED_SQL_OBJECTS_FR, storedSqlObjectText } from '../../../shared/project-reasons';
import type { Zone } from './zone';

/**
 * Zone « errors » (bdesk-ewr.6) : ce que l'interface écrit pour chaque code d'erreur que le serveur lui envoie (code + paramètres, voir
 * `src/shared/errors.ts`). Les erreurs que le client constate lui-même (serveur injoignable, réponse sans corps lisible) sont écrites par
 * `shell.loadErrors`. Lu par `errorText` (`src/web/data/apiError.ts`), jamais
 * directement par un composant. Fichiers de la zone : ce module, `src/web/data/apiError.ts` (`ApiError` et `errorText`), `src/shared/errors.ts`
 * et les réponses d'erreur du serveur.
 *
 * Les paramètres sont des morceaux du message du serveur : un identifiant, une valeur reçue, un nom de paramètre de l'API, la raison d'un Projet
 * illisible. Aucun n'est traduit. Les nombres arrivent déjà formatés dans la langue (`errorText` les passe par `formatCount`), et la raison d'un Projet
 * illisible déjà écrite dans la langue (`errorText` l'écrit par `projectReasonText`, d'après sa cause codée).
 *
 * `reasons` (bdesk-ewr.8) : la raison d'un Projet illisible ou d'un dossier ignoré, une phrase par cause (`PROJECT_REASON_PARAMS`). Le français est celui
 * que le serveur écrit (`PROJECT_REASONS_FR`, `src/shared/project-reasons.ts`, une seule source : la raison du serveur et le texte de l'interface ne
 * divergent pas) ; l'anglais est écrit ici. Les comptes s'écrivent par `count` (`formatCount` de la langue) ; le pluriel se choisit d'après le nombre
 * lui-même (`others`, `attempts`, `bytes`), jamais d'après son écriture. Lu par
 * `projectReasonText` (`src/web/data/apiError.ts`), jamais directement par un composant. `storedSqlObjects` : les objets que nomme la raison `stored-sql`,
 * une phrase par sorte (`STORED_SQL_OBJECTS_FR` pour le français), qu'elle assemble ; ils sont dans le catalogue pour que la garde de ses textes les lise.
 */

/** Les paramètres tels que le catalogue les reçoit : les nombres déjà écrits ; la cause codée d'une raison, déjà écrite dans `reason`. */
type Texts<C extends ApiErrorCode> = {
  [K in keyof ApiErrorParams<C> as ApiErrorParams<C>[K] extends ProjectReasonDetail | undefined ? never : K]: ApiErrorParams<C>[K] extends number
    ? string
    : ApiErrorParams<C>[K];
};

/** Une phrase par code de l'API. */
export type ApiErrorSentences = { [C in ApiErrorCode]: (params: Texts<C>) => string };

const quotedFr = (text: string) => `« ${text} »`;
const quotedEn = (text: string) => `“${text}”`;

/** « 7d, 30d ou 90d » : la liste fermée des valeurs permises. */
const orFr = (items: readonly string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ou ${items.at(-1)}`);
const orEn = (items: readonly string[]) => {
  if (items.length <= 2) return items.join(' or ');
  return `${items.slice(0, -1).join(', ')}, or ${items.at(-1)}`;
};

const api = {
  unexpected: () => 'Erreur inattendue.',
  'request-aborted': () => 'Requête abandonnée par le client.',
  'read-aborted': () => 'Lecture abandonnée par son demandeur.',
  'host-not-allowed': () => "Hôte non autorisé : l'application n'est joignable que par 127.0.0.1 ou localhost.",
  'origin-not-allowed': () => "Origine non autorisée : l'API n'est jointe que par l'application elle-même (127.0.0.1 ou localhost).",
  'project-not-found': ({ project }) => `Projet inconnu : ${project}`,
  'issue-not-found': ({ project, issue }) => `Ticket inconnu dans ${project} : ${issue}`,
  'project-unreadable': ({ reason }) => `Projet illisible : ${reason}`,
  'query-unknown-parameter': ({ parameter, expected }) => `Paramètre inconnu : ${quotedFr(parameter)} (attendus : ${expected.join(', ')}).`,
  'query-empty-project': () => '« project » ne peut pas être vide.',
  'query-range-and-dates': () => 'Choisissez « range » ou « from » et « to », pas les deux.',
  'query-dates-together': () => '« from » et « to » vont ensemble.',
  'query-empty-time-zone': () => '« timeZone » ne peut pas être vide.',
  'query-invalid-range': ({ received, expected }) => `« range » doit valoir ${orFr(expected)} : reçu ${quotedFr(received)}.`,
  'query-not-text': ({ parameter }) => `${quotedFr(parameter)} doit être un texte.`,
  'query-repeated': ({ parameter }) => `${quotedFr(parameter)} ne peut être donné qu'une fois.`,
  'query-invalid-instant': ({ parameter, received }) =>
    `${quotedFr(parameter)} doit être un instant ISO 8601, avec sa date, son heure et son fuseau : reçu ${quotedFr(received)}.`,
  'period-inverted': ({ from, to }) => `La plage commence après sa fin : « from » (${from}) doit être avant « to » (${to}).`,
  'period-in-future': ({ to, today }) => `« to » (${to}) est dans le futur : la plage ne peut pas dépasser aujourd'hui (${today}).`,
  'period-too-early': ({ from }) => `La plage doit commencer le 1er janvier 1970 ou après : « from » (${from}) est trop tôt.`,
  'period-too-long': ({ days, max }) => `La plage est trop longue : ${days} jours, au plus ${max}.`,
  'period-invalid-day': ({ parameter, received }) =>
    `${quotedFr(parameter)} doit être un jour qui existe, au format AAAA-MM-JJ : reçu ${quotedFr(received)}.`,
} satisfies ApiErrorSentences;

const fr = {
  /** Les erreurs que l'API envoie, par code. */
  api,
  /** La raison d'un Projet illisible ou d'un dossier ignoré, par cause. */
  reasons: PROJECT_REASONS_FR,
  /** Les objets de SQL stocké que nomme la raison `stored-sql`, par sorte. */
  storedSqlObjects: STORED_SQL_OBJECTS_FR,
};

/** Où un objet de SQL stocké a été vu : rien pour le working set. */
const placeEn = (where: StoredSqlPlace): string => {
  if (where.in === 'head') return ' (in HEAD)';
  if (where.in === 'era') return ` (era of commit ${where.commit})`;
  if (where.in === 'dependencies-history') return ' (dependency history)';
  return '';
};

/** Un objet de SQL stocké, tel que la raison `stored-sql` le nomme : une phrase par sorte. */
const storedSqlObjectsEn: StoredSqlObjectSentences = {
  view: ({ name, place }) => `${quotedEn(name)} is a view, which the app could read instead of a table${placeEn(place)}`,
  'generated-column': ({ table, column, place }) => `generated column ${quotedEn(column)} of ${quotedEn(table)}${placeEn(place)}`,
  'functional-index': ({ table, index }) => `functional index ${quotedEn(index)} of ${quotedEn(table)}`,
  'history-generated-column': ({ column, place }) => `generated column ${quotedEn(column)} of the dependency history${placeEn(place)}`,
  'nonlocal-rows': ({ place }) =>
    `${quotedEn(NONLOCAL_TABLE)} is not empty${placeEn(place)}: the ticket tool seems to be migrating the database; try again in a moment, or run any command of that tool, which will finish the migration`,
  'nonlocal-in-first-commit': () =>
    `${quotedEn(NONLOCAL_TABLE)} already exists in the first commit: without a commit where it is missing, there is no telling whether it is empty`,
  'table-in-first-commit': ({ name }) =>
    `${quotedEn(name)} already exists in the first commit: without a commit where it is missing, its CREATE TABLE cannot be checked`,
  'table-without-definition': ({ table, place }) =>
    `${quotedEn(table)}${placeEn(place)}: no table definition read by the comparison: the table is missing, or the comparison is incomplete`,
  'not-a-table': ({ table, place }) =>
    `${quotedEn(table)}${placeEn(place)} is a view, or something other than a table, which the app could read instead of a table`,
  'unrecognized-definition': ({ table, place }) => `${quotedEn(table)}${placeEn(place)}: unrecognized construct in the table definition`,
  'not-admitted': ({ table, place }) => `${quotedEn(table)}${placeEn(place)}: generated column, functional index, or other construct not allowed`,
  'unrecognized-options': ({ table, place }) => `${quotedEn(table)}${placeEn(place)}: unrecognized construct in the table options`,
};

/** « .beads/dolt/beads », le chemin que le serveur a écrit, ou « .beads/dolt/<database> » quand `metadata.json` ne nomme pas la base. */
const databaseEn = ({ folder, path }: { folder: string; path: string }) => path || `${folder}/<database>`;

/** Le singulier pour 1 seulement, comme le veut l'anglais (« 0 bytes »). */
const pluralEn = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** « 50 MB » à partir d'un Mio, « 512 bytes » en deçà (« 1 byte »). */
const bytesEn = (bytes: number, count: (n: number) => string) =>
  bytes >= 1024 * 1024 ? `${count(Math.round(bytes / (1024 * 1024)))} MB` : `${count(bytes)} ${pluralEn(bytes, 'byte', 'bytes')}`;

const reasonsEn: ProjectReasonSentences = {
  'no-beads-folder': () => 'This manually added folder contains no Project.',
  'no-metadata': () => 'Incomplete Project: no metadata.json, so no Dolt database.',
  'invalid-metadata': () => 'Unreadable metadata.json (invalid JSON).',
  'sqlite-workspace': ({ database }) => `SQLite workspace (${database}): only Dolt Projects are tracked.`,
  'other-workspace': ({ backend }) => `${quotedEn(backend)} workspace: only Dolt Projects are tracked.`,
  'unknown-workspace': () => 'Workspace of unknown kind: only Dolt Projects are tracked.',
  'unsupported-mode': ({ mode }) => `Dolt mode ${quotedEn(mode)} is not supported (embedded and server only).`,
  'database-not-local': (where) =>
    `Dolt database not on this machine (${databaseEn(where)} not found): the Project is in server mode, its database is not available locally.`,
  'database-not-found': (where) => `Dolt database not found (${databaseEn(where)}).`,
  'database-missing': () => 'Dolt database not found.',
  unreadable: () => 'Unreadable Project.',
  'project-vanished': () => 'Project gone during the computation (folder deleted, moved, or hidden).',
  'dolt-not-found': ({ binary }) => `The ${quotedEn(binary)} binary cannot be found: install Dolt and check that it is in the PATH.`,
  'launch-failed': ({ binary, cause }) => `Cannot start ${quotedEn(binary)}: ${cause || 'unknown cause'}.`,
  'null-byte': ({ binary }) => `Cannot start ${quotedEn(binary)}: the query contains a null byte, which the client does not send to dolt.`,
  'private-config-failed': ({ directory, cause }) =>
    `Cannot prepare a private configuration folder for dolt in ${directory} (${cause || 'unknown error'}): dolt is not started, as it would write to the user’s ~/.dolt.`,
  'folder-not-found': ({ path }) => `Folder not found: ${path}`,
  'queue-full': ({ max }, count) => `Too many Dolt reads waiting (more than ${count(max)}): try again in a moment.`,
  timeout: ({ ms, path }, count) => `Timed out (${count(ms)} ms) reading ${path}`,
  'output-too-large': ({ bytes, path }, count) => `Dolt output too large (more than ${bytesEn(bytes, count)}) reading ${path}`,
  'dolt-exit-code': ({ code }) => `dolt failed (exit code ${code}) without an error message`,
  'dolt-interrupted': ({ signal }) => `dolt was interrupted (${signal}) without an error message`,
  'invalid-date': ({ value }) => `Invalid Dolt date: ${value}`,
  'invalid-integer-text': ({ column, value }) => `Invalid Dolt integer (${column}): ${quotedEn(value)}`,
  'invalid-integer': ({ column, value }) => `Invalid Dolt integer (${column}): ${value}`,
  'head-unreadable': ({ path }) => `Unreadable HEAD in ${path}`,
  'dolt-locked': () => 'The database is held by another dolt process: try again in a moment.',
  'dolt-permission-denied': () => 'Dolt cannot open the database files: permission denied.',
  'dolt-unreadable-output': () => 'The dolt output is unreadable.',
  'dolt-failed': () => 'Dolt could not read the database: the text of its error is not shown (it could quote what the database makes it read).',
  'read-refused': () => 'Dolt refused one of the app’s reads: the text of its error is not shown (it could quote what the database makes it read).',
  'missing-table': ({ name }) => `Dolt cannot find the ${quotedEn(name)} table that the app reads.`,
  'missing-column': ({ name }) => `Dolt cannot find the ${quotedEn(name)} column that the app reads.`,
  'check-refused': () =>
    'The check of the stored SQL could not finish: Dolt refused one of its own queries, whose message is not shown (it could quote what the database makes it read). The database is not read.',
  'check-outpaced': ({ attempts }, count) =>
    `The database changes faster than the check of the SQL it holds (${count(attempts)} ${pluralEn(attempts, 'attempt', 'attempts')}): try again in a moment.`,
  'stored-sql': ({ objects, others }, count) => {
    const shown = objects.map((object) => storedSqlObjectText(storedSqlObjectsEn, object)).join('; ');
    const rest = others > 0 ? `; and ${count(others)} ${pluralEn(others, 'other', 'others')}` : '';
    return `SQL stored in the database, which Dolt would run on read: ${shown}${rest}. The database is not read.`;
  },
  'no-commit': ({ path }) => `No commit in ${path}: what ${NONLOCAL_TABLE} holds cannot be checked.`,
  'era-commit-unreadable': ({ path }) => `Unreadable era commit in ${path}`,
};

const en: typeof fr = {
  api: {
    unexpected: () => 'Unexpected error.',
    'request-aborted': () => 'Request canceled by the client.',
    'read-aborted': () => 'Read canceled by its requester.',
    'host-not-allowed': () => 'Host not allowed: the app can only be reached at 127.0.0.1 or localhost.',
    'origin-not-allowed': () => 'Origin not allowed: the API only answers the app itself (127.0.0.1 or localhost).',
    'project-not-found': ({ project }) => `Unknown Project: ${project}`,
    'issue-not-found': ({ project, issue }) => `Unknown ticket in ${project}: ${issue}`,
    'project-unreadable': ({ reason }) => `Unreadable Project: ${reason}`,
    'query-unknown-parameter': ({ parameter, expected }) => `Unknown parameter: ${quotedEn(parameter)} (expected: ${expected.join(', ')}).`,
    'query-empty-project': () => '“project” cannot be empty.',
    'query-range-and-dates': () => 'Choose “range” or “from” and “to”, not both.',
    'query-dates-together': () => '“from” and “to” go together.',
    'query-empty-time-zone': () => '“timeZone” cannot be empty.',
    'query-invalid-range': ({ received, expected }) => `“range” must be ${orEn(expected)}: got ${quotedEn(received)}.`,
    'query-not-text': ({ parameter }) => `${quotedEn(parameter)} must be a string.`,
    'query-repeated': ({ parameter }) => `${quotedEn(parameter)} can only be given once.`,
    'query-invalid-instant': ({ parameter, received }) =>
      `${quotedEn(parameter)} must be an ISO 8601 instant, with its date, time and time zone: got ${quotedEn(received)}.`,
    'period-inverted': ({ from, to }) => `The range starts after it ends: “from” (${from}) must be before “to” (${to}).`,
    'period-in-future': ({ to, today }) => `“to” (${to}) is in the future: the range cannot go past today (${today}).`,
    'period-too-early': ({ from }) => `The range must start on or after January 1, 1970: “from” (${from}) is too early.`,
    'period-too-long': ({ days, max }) => `The range is too long: ${days} days, at most ${max}.`,
    'period-invalid-day': ({ parameter, received }) => `${quotedEn(parameter)} must be a real day, formatted YYYY-MM-DD: got ${quotedEn(received)}.`,
  },
  reasons: reasonsEn,
  storedSqlObjects: storedSqlObjectsEn,
};

export const errors: Zone<typeof fr> = { fr, en };
