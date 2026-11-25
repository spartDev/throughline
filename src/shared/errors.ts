/**
 * Les codes des réponses d'erreur de l'API (bdesk-ewr.6) et la forme de leurs paramètres.
 *
 * Une réponse d'erreur garde son `message` français, pour le journal et les autres clients ; elle porte en plus `code` et `params`, d'où
 * l'interface écrit la phrase dans sa langue (`src/web/i18n/catalog/errors.ts`). Un code que l'interface ne connaît pas, ou dont les paramètres
 * n'ont pas la forme attendue (un serveur d'une autre version), s'affiche par son `message`. Les paramètres ne disent rien de plus que le
 * message : ce sont ses morceaux (un identifiant, une valeur reçue, la raison d'un Projet illisible).
 *
 * Ajouter un code : l'écrire ici avec ses paramètres, le lever côté serveur (`ApiErrorDetail`), puis l'écrire dans les deux langues du
 * catalogue `errors` : le compilateur refuse un code oublié.
 */

/**
 * Ce que vaut un paramètre : un texte, un nombre (un compte, que l'interface écrit par `formatCount` : « 1 200 » ; une autre sorte de nombre, une année
 * ou un port, demanderait sa propre sorte), une liste de textes (des noms de l'API), ou la raison codée d'un Projet illisible (`project-reason?`, voir
 * `PROJECT_REASON_PARAMS`). Une sorte qui finit par `?` est facultative : le paramètre peut manquer, et s'il n'a pas la forme attendue (un serveur d'une
 * autre version), il est ignoré, sans que le reste de l'erreur le soit.
 */
export type ApiErrorParamKind = 'string' | 'number' | 'string[]' | 'project-reason?';

export const API_ERROR_PARAMS = {
  /**
   * Le message générique « Erreur inattendue. » : une valeur levée qui n'est pas une `Error`, un message qui n'est pas un texte non vide (500, ou le
   * 4xx/5xx que porte l'erreur), ou le filet du gestionnaire. Une erreur imprévue dont le message se lit part sans code.
   */
  unexpected: {},
  /** 499 : le client a fermé sa connexion avant la réponse. */
  'request-aborted': {},
  /** 500 : une lecture abandonnée alors que le client attend toujours (une lecture partagée annulée par d'autres). */
  'read-aborted': {},
  /** 403 : l'en-tête Host n'est pas 127.0.0.1 ou localhost. */
  'host-not-allowed': {},
  /** 403 : la requête ne vient pas de l'application elle-même. */
  'origin-not-allowed': {},
  /** 404 : Projet inconnu. */
  'project-not-found': { project: 'string' },
  /** 404 : ticket inconnu dans un Projet. */
  'issue-not-found': { project: 'string', issue: 'string' },
  /**
   * 503 : le Projet existe mais sa base ne se lit pas. `reason` est la raison telle que le serveur l'écrit, en français ; `reasonDetail`, sa cause codée
   * (`PROJECT_REASON_PARAMS`, bdesk-ewr.8), d'où l'interface écrit la raison dans sa langue. Une raison sans code (une erreur que le serveur n'a pas codée),
   * ou dont le code est inconnu de l'interface, s'affiche par `reason`, telle quelle.
   */
  'project-unreadable': { reason: 'string', reasonDetail: 'project-reason?' },
  /** 400 : un paramètre de requête que la route ne connaît pas. */
  'query-unknown-parameter': { parameter: 'string', expected: 'string[]' },
  /** 400 : un `project` vide. */
  'query-empty-project': {},
  /** 400 : `range` et `from`/`to` à la fois. */
  'query-range-and-dates': {},
  /** 400 : `from` sans `to`, ou l'inverse. */
  'query-dates-together': {},
  /** 400 : un `timeZone` vide. */
  'query-empty-time-zone': {},
  /** 400 : un `range` qui n'est pas un préréglage. */
  'query-invalid-range': { received: 'string', expected: 'string[]' },
  /** 400 : un paramètre qui n'est pas un texte. */
  'query-not-text': { parameter: 'string' },
  /** 400 : un paramètre donné plusieurs fois. */
  'query-repeated': { parameter: 'string' },
  /** 400 : `from` après `to`. */
  'period-inverted': { from: 'string', to: 'string' },
  /** 400 : `to` après aujourd'hui (`today`, dans le fuseau de la requête). */
  'period-in-future': { to: 'string', today: 'string' },
  /** 400 : `from` avant le 1er janvier 1970. */
  'period-too-early': { from: 'string' },
  /** 400 : plus de `max` jours. */
  'period-too-long': { days: 'number', max: 'number' },
  /** 400 : `from` ou `to` (`parameter`) n'est pas un jour qui existe au format AAAA-MM-JJ. */
  'period-invalid-day': { parameter: 'string', received: 'string' },
} as const satisfies Record<string, Record<string, ApiErrorParamKind>>;

export type ApiErrorCode = keyof typeof API_ERROR_PARAMS;

/** La valeur JSON d'un paramètre de chaque sorte. */
interface ParamValue {
  string: string;
  number: number;
  count: number;
  'string[]': readonly string[];
  'project-reason?': ProjectReasonDetail;
  'stored-sql-objects': readonly StoredSqlObject[];
}

/** Les sortes de paramètres d'un registre (`API_ERROR_PARAMS`, `PROJECT_REASON_PARAMS`). */
type Kinds = Record<string, keyof ParamValue>;

/** Les paramètres d'une entrée de registre : obligatoires, sauf ceux dont la sorte finit par `?`. */
type ParamsOf<K extends Kinds> = keyof K extends never
  ? Record<string, never>
  : {
      -readonly [N in keyof K as K[N] extends `${string}?` ? never : N]: ParamValue[K[N]];
    } & {
      -readonly [N in keyof K as K[N] extends `${string}?` ? N : never]?: ParamValue[K[N]];
    };

/** Les paramètres d'un code, tels que le serveur les envoie ; aucun pour un code qui n'en a pas (le compilateur refuse d'en ajouter). */
export type ApiErrorParams<C extends ApiErrorCode> = ParamsOf<(typeof API_ERROR_PARAMS)[C]>;

/** Un code et ses paramètres, de la forme que son code demande. */
export type ApiErrorDetail = { [C in ApiErrorCode]: { code: C; params: ApiErrorParams<C> } }[ApiErrorCode];

/** Le code et les paramètres d'une erreur, s'ils ont la forme attendue ; `undefined` sinon (code inconnu, paramètre manquant, en trop ou mal typé). */
export function readApiErrorDetail(code: unknown, params: unknown): ApiErrorDetail | undefined {
  return readEntry(API_ERROR_PARAMS, code, params) as ApiErrorDetail | undefined;
}

/* -------------------------------------------------------------------------------------------------------------------
 * Les raisons d'un Projet illisible (bdesk-ewr.8)
 *
 * Pourquoi un Projet est illisible, ou un dossier ignoré, le serveur l'écrit en français (`reason` : le journal, les autres clients) ; il porte aussi
 * la cause codée à côté (`reasonDetail` : un code de `PROJECT_REASON_PARAMS` et ses paramètres), d'où l'interface écrit la raison dans sa langue :
 * - dans les réponses 200, `Project.reasonDetail`, `IgnoredFolder.reasonDetail` et `MetricsUnreadableProject.reasonDetail`, à côté de leur `reason` ;
 * - dans un 503, le paramètre `reasonDetail` du code `project-unreadable`, à côté de son paramètre `reason`.
 * Une seule source écrit la phrase française et porte le détail : `projectReason` (`project-reasons.ts`), que le serveur appelle avec le détail ; le
 * catalogue de l'interface reprend ces phrases pour le français (`src/web/i18n/catalog/errors.ts`). Une raison sans détail (une erreur que le serveur n'a
 * pas codée : le refus du garde de lecture seule, un texte de Dolt d'un client non vérifié) ou dont le détail est inconnu de l'interface, ou mal formé
 * (un serveur d'une autre version), s'affiche par `reason`, telle quelle.
 *
 * Ajouter une cause : l'écrire ici avec ses paramètres, puis sa phrase française dans `project-reasons.ts` et sa phrase anglaise dans le catalogue
 * `errors` (le compilateur refuse un code oublié), et la lever côté serveur par `projectReason` ou une `DoltQueryError` qui porte le détail. Les
 * paramètres ne disent rien de plus que la phrase : ce sont ses morceaux (un chemin, un délai, un nom, une valeur, des objets, un compte).
 * ---------------------------------------------------------------------------------------------------------------- */

export const PROJECT_REASON_PARAMS = {
  // Découverte (`discovery.ts`) : un dossier ignoré.
  /** Un dossier ajouté à la main sans `.beads`. */
  'no-beads-folder': {},
  /** `.beads` sans `metadata.json`. */
  'no-metadata': {},
  /** `metadata.json` n'est pas un objet JSON. */
  'invalid-metadata': {},
  /** Un workspace SQLite : `database`, le fichier que `metadata.json` déclare (`sqlite` s'il n'en déclare aucun). */
  'sqlite-workspace': { database: 'string' },
  /** Un workspace d'une autre sorte, que `metadata.json` nomme (`backend`, à défaut `database`). */
  'other-workspace': { backend: 'string' },
  /** Un workspace dont `metadata.json` ne dit pas la sorte. */
  'unknown-workspace': {},
  // Découverte : un Projet illisible.
  /** `dolt_mode` n'est ni `embedded` ni `server`. */
  'unsupported-mode': { mode: 'string' },
  /**
   * Un Projet en mode server dont la base n'est pas sur ce poste : `folder`, le dossier des bases (`.beads/dolt`) ; `path`, le chemin de la base que
   * `metadata.json` nomme, écrit par le serveur (`join`, qui le normalise : `../autre` y devient `.beads/autre`), vide quand il n'en nomme aucune.
   */
  'database-not-local': { folder: 'string', path: 'string' },
  /** Un Projet embedded dont la base est introuvable : `folder` (`.beads/embeddeddolt`) et `path`, comme pour `database-not-local`. */
  'database-not-found': { folder: 'string', path: 'string' },
  /** Un Projet illisible que le scan n'a pas dit pourquoi (`ProjectService`). */
  'database-missing': {},
  /** Un Projet illisible sans raison connue (`MetricsService`). */
  unreadable: {},
  /** Un Projet que la liste connaissait, disparu pendant le calcul des métriques. */
  'project-vanished': {},
  // Le client Dolt (`dolt/client.ts`, `dolt/errors.ts`).
  /** Le binaire `dolt` est introuvable. */
  'dolt-not-found': { binary: 'string' },
  /** `dolt` ne se lance pas : `cause`, le code de l'erreur de Node (vide quand on n'en sait rien). */
  'launch-failed': { binary: 'string', cause: 'string' },
  /** La requête contient un octet nul : elle ne part pas. */
  'null-byte': { binary: 'string' },
  /** Pas de dossier de configuration privé pour dolt dans `directory` : `cause`, le code de l'erreur (vide quand on n'en sait rien). */
  'private-config-failed': { directory: 'string', cause: 'string' },
  /** Le dossier de la base n'existe pas. */
  'folder-not-found': { path: 'string' },
  /** La file d'une voie est pleine : plus de `max` lectures en attente. */
  'queue-full': { max: 'count' },
  /** La lecture de `path` a dépassé `ms` millisecondes. */
  timeout: { ms: 'count', path: 'string' },
  /** La sortie de dolt a dépassé `bytes` octets en lisant `path` (écrits en mégaoctets à partir d'un Mio). */
  'output-too-large': { bytes: 'count', path: 'string' },
  /** dolt s'est arrêté sur le code de sortie `code` sans rien écrire (un identifiant, non un compte : un texte). */
  'dolt-exit-code': { code: 'string' },
  /** dolt a été interrompu par le signal `signal` sans rien écrire. */
  'dolt-interrupted': { signal: 'string' },
  /** Une date de la base qui ne se lit pas : `value`, telle quelle. */
  'invalid-date': { value: 'string' },
  /** Un entier de la base qui ne se lit pas, dans la colonne `column` : `value`, un texte (au plus quarante caractères). */
  'invalid-integer-text': { column: 'string', value: 'string' },
  /** De même, une valeur qui n'est pas un texte : `value`, son écriture JSON (au plus quarante caractères). */
  'invalid-integer': { column: 'string', value: 'string' },
  /** Le hash de HEAD ne se lit pas dans la base `path`. */
  'head-unreadable': { path: 'string' },
  // Le client vérifié (`dolt/stored-sql.ts`) : il ne rend jamais le texte de Dolt, mais la classe de sa cause.
  /** Un autre processus dolt tient la base. */
  'dolt-locked': {},
  /** Dolt ne peut pas ouvrir les fichiers de la base. */
  'dolt-permission-denied': {},
  /** La sortie de dolt ne se lit pas. */
  'dolt-unreadable-output': {},
  /** Toute autre erreur de Dolt. */
  'dolt-failed': {},
  /** Dolt a refusé une lecture de l'app, pour une autre cause qu'une table ou une colonne manquante. */
  'read-refused': {},
  /** Il manque la table `name`, que l'app lit (le nom tel que la requête l'écrit). */
  'missing-table': { name: 'string' },
  /** Il manque la colonne `name`, que l'app lit. */
  'missing-column': { name: 'string' },
  /** Dolt a refusé une requête de la vérification du SQL stocké. */
  'check-refused': {},
  /** La base change plus vite que la vérification : `attempts` essais. */
  'check-outpaced': { attempts: 'count' },
  /** Du SQL stocké dans la base : `objects`, les premiers objets (`MAX_NAMED_OBJECTS`), `others`, combien d'autres. */
  'stored-sql': { objects: 'stored-sql-objects', others: 'count' },
  /** La base `path` n'a aucun commit. */
  'no-commit': { path: 'string' },
  /** Le commit d'une époque du schéma ne se lit pas, dans la base `path`. */
  'era-commit-unreadable': { path: 'string' },
} as const satisfies Record<string, Record<string, ProjectReasonParamKind>>;

/**
 * Ce que vaut un paramètre de raison : un texte, un compte (un entier sûr, positif ou nul : un délai, une borne, des octets, des essais), ou les objets de
 * SQL stocké (`StoredSqlObject`, au moins un).
 */
type ProjectReasonParamKind = 'string' | 'count' | 'stored-sql-objects';

export type ProjectReasonCode = keyof typeof PROJECT_REASON_PARAMS;

export type ProjectReasonParams<C extends ProjectReasonCode> = ParamsOf<(typeof PROJECT_REASON_PARAMS)[C]>;

/** La cause d'une raison : un code et ses paramètres, de la forme que son code demande. */
export type ProjectReasonDetail = { [C in ProjectReasonCode]: { code: C; params: ProjectReasonParams<C> } }[ProjectReasonCode];

/** Une phrase par cause, dans une langue : `count` écrit un compte dans cette langue (`formatCount` pour l'interface, `String` pour le serveur). */
export type ProjectReasonSentences = { [C in ProjectReasonCode]: (params: ProjectReasonParams<C>, count: (n: number) => string) => string };

/** La cause d'une raison, si elle a la forme attendue ; `undefined` sinon (code inconnu, paramètre manquant, en trop ou mal typé, objet inconnu). */
export function readProjectReasonDetail(detail: unknown): ProjectReasonDetail | undefined {
  if (detail === null || typeof detail !== 'object' || Array.isArray(detail)) return undefined;
  const { code, params, ...rest } = detail as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return undefined;
  return readEntry(PROJECT_REASON_PARAMS, code, params) as ProjectReasonDetail | undefined;
}

/* -------------------------------------------------------------------------------------------------------------------
 * Les objets de SQL stocké (`stored-sql` ci-dessus) : ce que la base porte et que Dolt exécuterait à la lecture, un par sorte. Les noms sont ceux de la
 * base, déjà bornés et sans caractère de contrôle (`stored-sql.ts`, `safeName`) ; `place` dit où l'objet a été vu.
 * ---------------------------------------------------------------------------------------------------------------- */

/** La table de Dolt qui mène un nom de table ailleurs (Dolt 2.5.0) : la vérification la lit (`stored-sql.ts`), les raisons la nomment. */
export const NONLOCAL_TABLE = 'dolt_nonlocal_tables';

/**
 * Où un objet a été vu : le working set (rien n'est dit), HEAD, l'historique des dépendances, ou l'ancre d'une époque du schéma (`commit`, ses huit premiers
 * caractères).
 */
export type StoredSqlPlace = { in: 'working' } | { in: 'head' } | { in: 'dependencies-history' } | { in: 'era'; commit: string };

const STORED_SQL_OBJECTS = {
  /** Une vue qui porte le nom d'une table que l'app lit. */
  view: { name: 'string', place: 'place' },
  /** Une colonne générée d'une table que l'app lit. */
  'generated-column': { table: 'string', column: 'string', place: 'place' },
  /** Un index fonctionnel d'une table que l'app lit (dans le working set). */
  'functional-index': { table: 'string', index: 'string' },
  /** Une colonne générée de l'historique des dépendances. */
  'history-generated-column': { column: 'string', place: 'place' },
  /** `dolt_nonlocal_tables` porte des lignes : bd migre sans doute la base. */
  'nonlocal-rows': { place: 'place' },
  /** `dolt_nonlocal_tables` existe dès le premier commit. */
  'nonlocal-in-first-commit': {},
  /** La table `name` existe dès le premier commit. */
  'table-in-first-commit': { name: 'string' },
  /** La comparaison des schémas ne rend aucune définition pour `table`. */
  'table-without-definition': { table: 'string', place: 'place' },
  /** La définition de `table` n'est pas celle d'une table (une vue, par exemple). */
  'not-a-table': { table: 'string', place: 'place' },
  /** Une construction non reconnue dans la définition de `table`. */
  'unrecognized-definition': { table: 'string', place: 'place' },
  /** Une colonne générée, un index fonctionnel ou une autre construction non admise dans `table`. */
  'not-admitted': { table: 'string', place: 'place' },
  /** Une construction non reconnue dans les options de `table`. */
  'unrecognized-options': { table: 'string', place: 'place' },
} as const satisfies Record<string, Record<string, 'string' | 'place'>>;

type ObjectFields<K extends Record<string, 'string' | 'place'>> = { -readonly [N in keyof K]: K[N] extends 'place' ? StoredSqlPlace : string };

/** Un objet de SQL stocké, de la forme que sa sorte demande. */
export type StoredSqlObject = {
  [S in keyof typeof STORED_SQL_OBJECTS]: { kind: S } & ObjectFields<(typeof STORED_SQL_OBJECTS)[S]>;
}[keyof typeof STORED_SQL_OBJECTS];

/* ---------------------------------------------------------------------------------------------------------------- */

/** Une entrée d'un registre, si son code est connu et ses paramètres de la forme attendue ; les paramètres facultatifs mal formés sont ignorés. */
function readEntry(registry: Record<string, Kinds>, code: unknown, params: unknown): { code: string; params: Record<string, unknown> } | undefined {
  if (typeof code !== 'string' || !Object.hasOwn(registry, code)) return undefined;
  const expected = registry[code] as Kinds;
  const given = params === undefined ? {} : params;
  if (!isRecord(given)) return undefined;
  for (const name of Object.keys(given)) if (!Object.hasOwn(expected, name)) return undefined;
  const read: Record<string, unknown> = {};
  for (const [name, kind] of Object.entries(expected)) {
    const optional = kind.endsWith('?');
    if (!Object.hasOwn(given, name)) {
      if (optional) continue;
      return undefined;
    }
    const value = readKind(given[name], kind);
    if (value === undefined) {
      if (optional) continue;
      return undefined;
    }
    read[name] = value;
  }
  return { code, params: read };
}

/** La valeur, si elle a la forme de sa sorte (lue à nouveau pour une raison codée, dont seuls les champs connus sont gardés) ; `undefined` sinon. */
function readKind(value: unknown, kind: keyof ParamValue): unknown {
  switch (kind) {
    case 'string':
      return typeof value === 'string' ? value : undefined;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    case 'count':
      return Number.isSafeInteger(value) && (value as number) >= 0 ? value : undefined;
    case 'string[]':
      return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined;
    case 'project-reason?':
      return readProjectReasonDetail(value);
    case 'stored-sql-objects':
      // Une raison de SQL stocké nomme au moins un objet : une liste vide ne dirait rien, la raison française le dit mieux.
      if (!Array.isArray(value) || value.length === 0) return undefined;
      return value.every(isStoredSqlObject) ? value : undefined;
  }
}

function isStoredSqlObject(value: unknown): value is StoredSqlObject {
  if (!isRecord(value)) return false;
  const { kind, ...fields } = value;
  if (typeof kind !== 'string' || !Object.hasOwn(STORED_SQL_OBJECTS, kind)) return false;
  const expected: Record<string, 'string' | 'place'> = STORED_SQL_OBJECTS[kind as keyof typeof STORED_SQL_OBJECTS];
  const names = Object.keys(fields);
  if (names.length !== Object.keys(expected).length) return false;
  return names.every((name) => Object.hasOwn(expected, name) && (expected[name] === 'place' ? isPlace(fields[name]) : typeof fields[name] === 'string'));
}

function isPlace(value: unknown): value is StoredSqlPlace {
  if (!isRecord(value)) return false;
  const { in: where, ...rest } = value;
  if (where === 'era') return Object.keys(rest).length === 1 && typeof rest.commit === 'string';
  return (where === 'working' || where === 'head' || where === 'dependencies-history') && Object.keys(rest).length === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
