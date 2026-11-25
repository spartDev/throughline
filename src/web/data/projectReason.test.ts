import { describe, expect, it } from 'vitest';
import {
  type ProjectReasonCode,
  type ProjectReasonDetail,
  readApiErrorDetail,
  readProjectReasonDetail,
  type StoredSqlObject,
} from '../../shared/errors';
import { projectReason, projectReasonFr, storedSqlObjectFr } from '../../shared/project-reasons';
import { ApiError, errorText, projectReasonText } from './apiError';
import { describeError } from './client';

/**
 * bdesk-ewr.8 : la raison d'un Projet illisible ou d'un dossier ignoré porte sa cause codée (`reasonDetail`), d'où l'interface l'écrit dans sa langue.
 * Le français est celui du serveur (une seule source, `project-reasons.ts`) ; une cause inconnue ou mal formée s'affiche par la raison française, telle quelle.
 */

describe('readProjectReasonDetail', () => {
  it('garde une cause connue dont les paramètres ont la forme attendue', () => {
    expect(readProjectReasonDetail({ code: 'dolt-locked', params: {} })).toEqual({ code: 'dolt-locked', params: {} });
    expect(readProjectReasonDetail({ code: 'dolt-locked' })).toEqual({ code: 'dolt-locked', params: {} }); // sans paramètre, `params` peut manquer
    expect(readProjectReasonDetail({ code: 'timeout', params: { ms: 100, path: '/p' } })).toEqual({ code: 'timeout', params: { ms: 100, path: '/p' } });
    const objects: StoredSqlObject[] = [
      { kind: 'view', name: 'issues', place: { in: 'era', commit: 'abc12345' } },
      { kind: 'functional-index', table: 'labels', index: 'fi' },
      { kind: 'nonlocal-in-first-commit' },
    ];
    expect(readProjectReasonDetail({ code: 'stored-sql', params: { objects, others: 0 } })).toEqual({ code: 'stored-sql', params: { objects, others: 0 } });
  });

  it.each([
    ['une cause inconnue', { code: 'nouvelle-cause', params: {} }],
    ['un nom hérité d’Object', { code: 'toString', params: {} }],
    ['un code qui n’est pas un texte', { code: 3, params: {} }],
    ['un paramètre manquant', { code: 'timeout', params: { ms: 100 } }],
    ['un paramètre en trop', { code: 'dolt-locked', params: { path: '/p' } }],
    ['un paramètre mal typé', { code: 'timeout', params: { ms: '100', path: '/p' } }],
    ['un champ en trop à côté du code', { code: 'dolt-locked', params: {}, extra: 1 }],
    ['une liste d’objets qui n’en est pas une', { code: 'stored-sql', params: { objects: 'vue', others: 0 } }],
    ['un objet d’une sorte inconnue', { code: 'stored-sql', params: { objects: [{ kind: 'trigger', name: 't' }], others: 0 } }],
    ['un objet sans son champ', { code: 'stored-sql', params: { objects: [{ kind: 'view', place: { in: 'working' } }], others: 0 } }],
    ['un objet avec un champ en trop', { code: 'stored-sql', params: { objects: [{ kind: 'nonlocal-in-first-commit', name: 'x' }], others: 0 } }],
    ['une racine inconnue', { code: 'stored-sql', params: { objects: [{ kind: 'nonlocal-rows', place: { in: 'branch' } }], others: 0 } }],
    ['une époque sans commit', { code: 'stored-sql', params: { objects: [{ kind: 'nonlocal-rows', place: { in: 'era' } }], others: 0 } }],
    ['une liste d’objets vide', { code: 'stored-sql', params: { objects: [], others: 0 } }],
    ['un compte décimal', { code: 'timeout', params: { ms: 1.5, path: '/p' } }],
    ['un compte négatif', { code: 'queue-full', params: { max: -1 } }],
    ['un compte au-delà des entiers sûrs', { code: 'check-outpaced', params: { attempts: 2 ** 53 } }],
    ['un compte infini', { code: 'output-too-large', params: { bytes: Number.POSITIVE_INFINITY, path: '/p' } }],
    ['un texte', 'dolt-locked'],
    ['null', null],
    ['une liste', [{ code: 'dolt-locked', params: {} }]],
  ])('refuse %s', (_label, detail) => {
    expect(readProjectReasonDetail(detail)).toBeUndefined();
  });
});

describe('readApiErrorDetail : la cause codée du 503', () => {
  const LOCKED = 'La base est tenue par un autre processus dolt : réessayez dans un instant.';

  it('garde la cause à côté de la raison, ou la raison seule', () => {
    expect(readApiErrorDetail('project-unreadable', { reason: LOCKED, reasonDetail: { code: 'dolt-locked', params: {} } })).toEqual({
      code: 'project-unreadable',
      params: { reason: LOCKED, reasonDetail: { code: 'dolt-locked', params: {} } },
    });
    expect(readApiErrorDetail('project-unreadable', { reason: LOCKED })).toEqual({ code: 'project-unreadable', params: { reason: LOCKED } });
  });

  it('ignore une cause qu’il ne sait pas lire, sans perdre l’erreur : la raison française reste', () => {
    expect(readApiErrorDetail('project-unreadable', { reason: LOCKED, reasonDetail: { code: 'nouvelle-cause', params: {} } })).toEqual({
      code: 'project-unreadable',
      params: { reason: LOCKED },
    });
  });

  it('refuse toujours un 503 sans raison, ou avec un paramètre inconnu', () => {
    expect(readApiErrorDetail('project-unreadable', { reasonDetail: { code: 'dolt-locked', params: {} } })).toBeUndefined();
    expect(readApiErrorDetail('project-unreadable', { reason: LOCKED, cause: 'x' })).toBeUndefined();
  });
});

describe('projectReason : la raison française et sa cause, d’une seule source', () => {
  it('écrit la raison du serveur et porte la cause telle quelle', () => {
    const detail: ProjectReasonDetail = { code: 'unsupported-mode', params: { mode: 'proxied-server' } };

    expect(projectReason(detail)).toEqual({
      reason: 'Mode Dolt « proxied-server » non pris en charge (embedded et server seulement).',
      reasonDetail: detail,
    });
  });
});

/** Chaque cause, dans les deux langues : le compilateur refuse une cause oubliée. Les comptes restent sous 1 000 : le serveur et l'interface les écrivent de même. */
const SENTENCES: Record<ProjectReasonCode, [ProjectReasonDetail, string, string]> = {
  'no-beads-folder': [
    { code: 'no-beads-folder', params: {} },
    'Ce dossier ajouté à la main ne contient aucun Projet.',
    'This manually added folder contains no Project.',
  ],
  'no-metadata': [
    { code: 'no-metadata', params: {} },
    'Projet incomplet : pas de metadata.json, donc pas de base Dolt.',
    'Incomplete Project: no metadata.json, so no Dolt database.',
  ],
  'invalid-metadata': [{ code: 'invalid-metadata', params: {} }, 'metadata.json illisible (JSON invalide).', 'Unreadable metadata.json (invalid JSON).'],
  'sqlite-workspace': [
    { code: 'sqlite-workspace', params: { database: 'beads.db' } },
    'Workspace SQLite (beads.db) : seuls les Projets Dolt sont suivis.',
    'SQLite workspace (beads.db): only Dolt Projects are tracked.',
  ],
  'other-workspace': [
    { code: 'other-workspace', params: { backend: 'postgres' } },
    'Workspace « postgres » : seuls les Projets Dolt sont suivis.',
    '“postgres” workspace: only Dolt Projects are tracked.',
  ],
  'unknown-workspace': [
    { code: 'unknown-workspace', params: {} },
    'Workspace « inconnu » : seuls les Projets Dolt sont suivis.',
    'Workspace of unknown kind: only Dolt Projects are tracked.',
  ],
  'unsupported-mode': [
    { code: 'unsupported-mode', params: { mode: 'proxied-server' } },
    'Mode Dolt « proxied-server » non pris en charge (embedded et server seulement).',
    'Dolt mode “proxied-server” is not supported (embedded and server only).',
  ],
  'database-not-local': [
    { code: 'database-not-local', params: { folder: '.beads/dolt', path: '.beads/dolt/b' } },
    "Base Dolt absente de ce poste (.beads/dolt/b introuvable) : le Projet est en mode server, sa base n'est pas disponible localement.",
    'Dolt database not on this machine (.beads/dolt/b not found): the Project is in server mode, its database is not available locally.',
  ],
  'database-not-found': [
    { code: 'database-not-found', params: { folder: '.beads/embeddeddolt', path: '' } },
    'Base Dolt introuvable (.beads/embeddeddolt/<base>).',
    'Dolt database not found (.beads/embeddeddolt/<database>).',
  ],
  'database-missing': [{ code: 'database-missing', params: {} }, 'Base Dolt introuvable.', 'Dolt database not found.'],
  unreadable: [{ code: 'unreadable', params: {} }, 'Projet illisible.', 'Unreadable Project.'],
  'project-vanished': [
    { code: 'project-vanished', params: {} },
    'Projet disparu pendant le calcul (dossier supprimé, déplacé ou masqué).',
    'Project gone during the computation (folder deleted, moved, or hidden).',
  ],
  'dolt-not-found': [
    { code: 'dolt-not-found', params: { binary: 'dolt' } },
    "Le binaire « dolt » est introuvable : installez Dolt et vérifiez qu'il est dans le PATH.",
    'The “dolt” binary cannot be found: install Dolt and check that it is in the PATH.',
  ],
  'launch-failed': [{ code: 'launch-failed', params: { binary: 'dolt', cause: 'E2BIG' } }, 'Impossible de lancer « dolt » : E2BIG.', 'Cannot start “dolt”: E2BIG.'],
  'null-byte': [
    { code: 'null-byte', params: { binary: 'dolt' } },
    'Impossible de lancer « dolt » : la requête contient un octet nul, que le client n’envoie pas à dolt.',
    'Cannot start “dolt”: the query contains a null byte, which the client does not send to dolt.',
  ],
  'private-config-failed': [
    { code: 'private-config-failed', params: { directory: '/tmp', cause: 'EACCES' } },
    "Impossible de préparer un dossier de configuration privé pour dolt dans /tmp (EACCES) : dolt n'est pas lancé, car il écrirait dans le ~/.dolt de l'utilisateur.",
    "Cannot prepare a private configuration folder for dolt in /tmp (EACCES): dolt is not started, as it would write to the user’s ~/.dolt.",
  ],
  'folder-not-found': [{ code: 'folder-not-found', params: { path: '/p' } }, 'Dossier introuvable : /p', 'Folder not found: /p'],
  'queue-full': [
    { code: 'queue-full', params: { max: 500 } },
    'Trop de lectures Dolt en attente (plus de 500) : réessayez dans un instant.',
    'Too many Dolt reads waiting (more than 500): try again in a moment.',
  ],
  timeout: [{ code: 'timeout', params: { ms: 150, path: '/p' } }, 'Délai dépassé (150 ms) pour lire /p', 'Timed out (150 ms) reading /p'],
  'output-too-large': [
    { code: 'output-too-large', params: { bytes: 512 * 1024 * 1024, path: '/p' } },
    'Sortie de dolt trop volumineuse (plus de 512 Mo) pour lire /p',
    'Dolt output too large (more than 512 MB) reading /p',
  ],
  'dolt-exit-code': [
    { code: 'dolt-exit-code', params: { code: '3' } },
    "dolt a échoué (code de sortie 3) sans message d'erreur",
    'dolt failed (exit code 3) without an error message',
  ],
  'dolt-interrupted': [
    { code: 'dolt-interrupted', params: { signal: 'SIGKILL' } },
    "dolt a été interrompu (SIGKILL) sans message d'erreur",
    'dolt was interrupted (SIGKILL) without an error message',
  ],
  'invalid-date': [{ code: 'invalid-date', params: { value: 'hier' } }, 'Date Dolt invalide : hier', 'Invalid Dolt date: hier'],
  'invalid-integer-text': [
    { code: 'invalid-integer-text', params: { column: 'priority', value: 'haute' } },
    'Entier Dolt invalide (priority) : « haute »',
    'Invalid Dolt integer (priority): “haute”',
  ],
  'invalid-integer': [
    { code: 'invalid-integer', params: { column: 'restart', value: '1.5' } },
    'Entier Dolt invalide (restart) : 1.5',
    'Invalid Dolt integer (restart): 1.5',
  ],
  'head-unreadable': [{ code: 'head-unreadable', params: { path: '/p' } }, 'HEAD illisible dans /p', 'Unreadable HEAD in /p'],
  'dolt-locked': [
    { code: 'dolt-locked', params: {} },
    'La base est tenue par un autre processus dolt : réessayez dans un instant.',
    'The database is held by another dolt process: try again in a moment.',
  ],
  'dolt-permission-denied': [
    { code: 'dolt-permission-denied', params: {} },
    'Dolt ne peut pas ouvrir les fichiers de la base : permission refusée.',
    'Dolt cannot open the database files: permission denied.',
  ],
  'dolt-unreadable-output': [{ code: 'dolt-unreadable-output', params: {} }, 'La sortie de dolt est illisible.', 'The dolt output is unreadable.'],
  'dolt-failed': [
    { code: 'dolt-failed', params: {} },
    "Dolt n'a pas pu lire la base : le texte de son erreur n'est pas repris (il pourrait citer ce que la base lui fait lire).",
    'Dolt could not read the database: the text of its error is not shown (it could quote what the database makes it read).',
  ],
  'read-refused': [
    { code: 'read-refused', params: {} },
    "Dolt a refusé une lecture de l'app : le texte de son erreur n'est pas repris (il pourrait citer ce que la base lui fait lire).",
    'Dolt refused one of the app’s reads: the text of its error is not shown (it could quote what the database makes it read).',
  ],
  'missing-table': [
    { code: 'missing-table', params: { name: 'issues' } },
    "Dolt ne trouve pas la table « issues » que l'app lit.",
    'Dolt cannot find the “issues” table that the app reads.',
  ],
  'missing-column': [
    { code: 'missing-column', params: { name: 'title' } },
    "Dolt ne trouve pas la colonne « title » que l'app lit.",
    'Dolt cannot find the “title” column that the app reads.',
  ],
  'check-refused': [
    { code: 'check-refused', params: {} },
    "La vérification du SQL stocké n'a pas pu s'achever : Dolt a refusé l'une de ses propres requêtes, dont le message n'est pas repris (il pourrait citer ce que la base lui fait lire). La base n'est pas lue.",
    'The check of the stored SQL could not finish: Dolt refused one of its own queries, whose message is not shown (it could quote what the database makes it read). The database is not read.',
  ],
  'check-outpaced': [
    { code: 'check-outpaced', params: { attempts: 3 } },
    "La base change plus vite que la vérification du SQL qu'elle porte (3 essais) : réessayez dans un instant.",
    'The database changes faster than the check of the SQL it holds (3 attempts): try again in a moment.',
  ],
  'stored-sql': [
    { code: 'stored-sql', params: { objects: [{ kind: 'view', name: 'issues', place: { in: 'head' } }], others: 1 } },
    "SQL stocké dans la base, que Dolt exécuterait à la lecture : « issues » est une vue, que l'app pourrait lire à la place d'une table (dans HEAD) ; et 1 autre. La base n'est pas lue.",
    'SQL stored in the database, which Dolt would run on read: “issues” is a view, which the app could read instead of a table (in HEAD); and 1 other. The database is not read.',
  ],
  'no-commit': [
    { code: 'no-commit', params: { path: '/p' } },
    'Aucun commit dans /p : ce que dolt_nonlocal_tables porte ne peut pas se vérifier.',
    'No commit in /p: what dolt_nonlocal_tables holds cannot be checked.',
  ],
  'era-commit-unreadable': [{ code: 'era-commit-unreadable', params: { path: '/p' } }, "Commit d'époque illisible dans /p", 'Unreadable era commit in /p'],
};

describe('les raisons, dans les deux langues', () => {
  it.each(Object.entries(SENTENCES))('%s', (_code, [detail, fr, en]) => {
    // Le français de l'interface est la raison du serveur, mot pour mot.
    expect(projectReasonFr(detail)).toBe(fr);
    expect(projectReasonText({ reason: 'repli', reasonDetail: detail }, 'fr')).toBe(fr);
    expect(projectReasonText({ reason: 'repli', reasonDetail: detail }, 'en')).toBe(en);
  });

  it('écrit les comptes dans la langue : le serveur, lui, les écrit tels quels', () => {
    const detail: ProjectReasonDetail = { code: 'timeout', params: { ms: 60_000, path: '/p' } };

    expect(projectReasonFr(detail)).toBe('Délai dépassé (60000 ms) pour lire /p');
    // `formatCount` groupe les milliers par une espace fine insécable.
    expect(projectReasonText({ reasonDetail: detail }, 'fr')?.replace(/\s/g, ' ')).toBe('Délai dépassé (60 000 ms) pour lire /p');
    expect(projectReasonText({ reasonDetail: detail }, 'en')).toBe('Timed out (60,000 ms) reading /p');
  });

  it('accorde « autre » au compte, et n’en dit rien quand il n’y en a pas', () => {
    const objects: StoredSqlObject[] = [{ kind: 'nonlocal-in-first-commit' }];
    const text = (others: number, language: 'fr' | 'en') => projectReasonText({ reasonDetail: { code: 'stored-sql', params: { objects, others } } }, language);

    expect(text(0, 'fr')).not.toMatch(/autre/);
    expect(text(2, 'fr')).toContain('; et 2 autres.');
    expect(text(0, 'en')).not.toMatch(/other/);
    expect(text(1, 'en')).toContain('; and 1 other.');
    expect(text(1200, 'en')).toContain('; and 1,200 others.');
  });
});

/** Chaque objet de SQL stocké, dans les deux langues (le français, celui du serveur). */
const OBJECTS: Record<StoredSqlObject['kind'], [StoredSqlObject, string, string]> = {
  view: [
    { kind: 'view', name: 'issues', place: { in: 'dependencies-history' } },
    "« issues » est une vue, que l'app pourrait lire à la place d'une table (historique des dépendances)",
    '“issues” is a view, which the app could read instead of a table (dependency history)',
  ],
  'generated-column': [
    { kind: 'generated-column', table: 'issues', column: 'c', place: { in: 'working' } },
    'colonne générée « c » de « issues »',
    'generated column “c” of “issues”',
  ],
  'functional-index': [{ kind: 'functional-index', table: 'labels', index: 'fi' }, 'index fonctionnel « fi » de « labels »', 'functional index “fi” of “labels”'],
  'history-generated-column': [
    { kind: 'history-generated-column', column: 'type', place: { in: 'era', commit: 'abc12345' } },
    "colonne générée « type » de l'historique des dépendances (époque du commit abc12345)",
    'generated column “type” of the dependency history (era of commit abc12345)',
  ],
  'nonlocal-rows': [
    { kind: 'nonlocal-rows', place: { in: 'working' } },
    "« dolt_nonlocal_tables » n'est pas vide : la base semble en cours de migration par l'outil de tickets ; réessayez dans un instant, ou lancez n'importe quelle commande de cet outil, qui achèvera la migration",
    '“dolt_nonlocal_tables” is not empty: the ticket tool seems to be migrating the database; try again in a moment, or run any command of that tool, which will finish the migration',
  ],
  'nonlocal-in-first-commit': [
    { kind: 'nonlocal-in-first-commit' },
    "« dolt_nonlocal_tables » existe déjà dans le premier commit : sans commit où elle manque, on ne peut pas dire qu'elle est vide",
    '“dolt_nonlocal_tables” already exists in the first commit: without a commit where it is missing, there is no telling whether it is empty',
  ],
  'table-in-first-commit': [
    { kind: 'table-in-first-commit', name: 'issues' },
    '« issues » existe déjà dans le premier commit : sans commit où elle manque, on ne peut pas juger son CREATE TABLE',
    '“issues” already exists in the first commit: without a commit where it is missing, its CREATE TABLE cannot be checked',
  ],
  'table-without-definition': [
    { kind: 'table-without-definition', table: 'labels', place: { in: 'head' } },
    '« labels » (dans HEAD) : aucune définition de table lue par la comparaison : la table manque, ou la comparaison est incomplète',
    '“labels” (in HEAD): no table definition read by the comparison: the table is missing, or the comparison is incomplete',
  ],
  'not-a-table': [
    { kind: 'not-a-table', table: 'issues', place: { in: 'working' } },
    "« issues » est une vue, ou autre chose qu'une table, que l'app pourrait lire à la place d'une table",
    '“issues” is a view, or something other than a table, which the app could read instead of a table',
  ],
  'unrecognized-definition': [
    { kind: 'unrecognized-definition', table: 'issues', place: { in: 'head' } },
    '« issues » (dans HEAD) : construction non reconnue dans la définition de la table',
    '“issues” (in HEAD): unrecognized construct in the table definition',
  ],
  'not-admitted': [
    { kind: 'not-admitted', table: 'dependencies', place: { in: 'era', commit: 'c3' } },
    '« dependencies » (époque du commit c3) : colonne générée, index fonctionnel, ou autre construction non admise',
    '“dependencies” (era of commit c3): generated column, functional index, or other construct not allowed',
  ],
  'unrecognized-options': [
    { kind: 'unrecognized-options', table: 'config', place: { in: 'working' } },
    '« config » : construction non reconnue dans les options de la table',
    '“config”: unrecognized construct in the table options',
  ],
};

describe('les mots qui dépendent d’un compte ou d’une cause absente', () => {
  const text = (detail: ProjectReasonDetail, language: 'fr' | 'en') => projectReasonText({ reasonDetail: detail }, language);

  it('« cause inconnue » quand le lancement de dolt échoue sans code, comme le serveur l’a toujours écrit', () => {
    const detail: ProjectReasonDetail = { code: 'launch-failed', params: { binary: 'dolt', cause: '' } };

    expect(projectReasonFr(detail)).toBe('Impossible de lancer « dolt » : cause inconnue.');
    expect(text(detail, 'en')).toBe('Cannot start “dolt”: unknown cause.');
  });

  it('accorde « essai » au nombre d’essais, sans changer la phrase du serveur pour trois essais', () => {
    const outpaced = (attempts: number): ProjectReasonDetail => ({ code: 'check-outpaced', params: { attempts } });

    expect(projectReasonFr(outpaced(1))).toContain('(1 essai)');
    expect(projectReasonFr(outpaced(3))).toContain('(3 essais)');
    expect(text(outpaced(1), 'en')).toContain('(1 attempt)');
    expect(text(outpaced(3), 'en')).toContain('(3 attempts)');
  });

  it('accorde « octet » au nombre d’octets sous un Mio, sans changer la phrase du serveur au-delà', () => {
    const tooLarge = (bytes: number): ProjectReasonDetail => ({ code: 'output-too-large', params: { bytes, path: '/p' } });

    expect(projectReasonFr(tooLarge(1))).toContain('(plus de 1 octet)');
    expect(projectReasonFr(tooLarge(512))).toContain('(plus de 512 octets)');
    expect(projectReasonFr(tooLarge(1024 * 1024))).toContain('(plus de 1 Mo)');
    expect(text(tooLarge(1), 'en')).toContain('(more than 1 byte)');
    expect(text(tooLarge(512), 'en')).toContain('(more than 512 bytes)');
    expect(text(tooLarge(1024 * 1024), 'en')).toContain('(more than 1 MB)');
  });
});

describe('les chemins d’une base absente : écrits par le serveur, repris tels quels', () => {
  const text = (detail: ProjectReasonDetail, language: 'fr' | 'en') => projectReasonText({ reasonDetail: detail }, language);

  it('le chemin de la base nommée, ou le dossier suivi de « <base> » quand metadata.json ne la nomme pas', () => {
    const named: ProjectReasonDetail = { code: 'database-not-found', params: { folder: '.beads/embeddeddolt', path: '.beads/autre' } };
    const unnamed: ProjectReasonDetail = { code: 'database-not-local', params: { folder: '.beads/dolt', path: '' } };

    expect(projectReasonFr(named)).toBe('Base Dolt introuvable (.beads/autre).');
    expect(text(named, 'en')).toBe('Dolt database not found (.beads/autre).');
    expect(projectReasonFr(unnamed)).toContain('(.beads/dolt/<base> introuvable)');
    expect(text(unnamed, 'en')).toContain('(.beads/dolt/<database> not found)');
  });
});

describe('les objets de SQL stocké, dans les deux langues', () => {
  it.each(Object.entries(OBJECTS))('%s', (_kind, [object, fr, en]) => {
    const one = (language: 'fr' | 'en') => projectReasonText({ reasonDetail: { code: 'stored-sql', params: { objects: [object], others: 0 } } }, language);

    expect(storedSqlObjectFr(object)).toBe(fr);
    expect(one('fr')).toBe(`SQL stocké dans la base, que Dolt exécuterait à la lecture : ${fr}. La base n'est pas lue.`);
    expect(one('en')).toBe(`SQL stored in the database, which Dolt would run on read: ${en}. The database is not read.`);
  });
});

describe('projectReasonText : le repli sur la raison française', () => {
  const REASON = 'La base est tenue par un autre processus dolt : réessayez dans un instant.';

  it.each([
    ['sans cause', undefined],
    ['une cause inconnue (un serveur plus récent)', { code: 'nouvelle-cause', params: {} }],
    ['une cause mal formée', { code: 'timeout', params: { ms: 'cent' } }],
  ])('%s : la raison, telle quelle', (_label, reasonDetail) => {
    expect(projectReasonText({ reason: REASON, reasonDetail }, 'en')).toBe(REASON);
  });

  it('sans raison ni cause : rien, à l’appelant de dire « Projet illisible »', () => {
    expect(projectReasonText({}, 'en')).toBeUndefined();
  });
});

describe('le 503 d’un Projet illisible, dans la langue affichée', () => {
  const REASON = 'La base est tenue par un autre processus dolt : réessayez dans un instant.';
  const unreadable = (reasonDetail?: unknown) =>
    new ApiError(`Projet illisible : ${REASON}`, 503, {
      reason: REASON,
      detail: readApiErrorDetail('project-unreadable', reasonDetail === undefined ? { reason: REASON } : { reason: REASON, reasonDetail }),
    });

  it('une cause codée : la raison en anglais, dans le titre comme dans le détail', () => {
    const error = unreadable({ code: 'dolt-locked', params: {} });

    expect(errorText(error, 'en')).toBe('Unreadable Project: The database is held by another dolt process: try again in a moment.');
    expect(describeError(error, 'en')).toEqual({
      title: 'Unreadable project',
      detail: 'The database is held by another dolt process: try again in a moment.',
      specific: true,
    });
    expect(describeError(error, 'fr').detail).toBe(REASON);
  });

  it('une cause inconnue, ou pas de cause : la raison française du serveur, telle quelle', () => {
    for (const error of [unreadable({ code: 'nouvelle-cause', params: {} }), unreadable()]) {
      expect(errorText(error, 'en')).toBe(`Unreadable Project: ${REASON}`);
      expect(describeError(error, 'en').detail).toBe(REASON);
    }
  });
});
