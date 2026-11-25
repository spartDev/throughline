import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Config } from '../config';
import { type DoltClient, DoltNotFoundError, DoltQueryError } from '../dolt/client';
import { scratchDir } from '../testing/scratch';
import { discoverProjects, slugify } from './discovery';

let root: string;

beforeEach(() => {
  // Chemin canonique : sur macOS, /var/folders est un lien vers /private/var.
  root = realpathSync(scratchDir('bdesk-discovery-'));
});

function write(path: string, content = ''): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

const folder = (...parts: string[]) => join(root, ...parts);

/** Un workspace beads Dolt : metadata.json et, si `database` est donné, le dossier `.dolt` de la base. */
function doltWorkspace(
  project: string,
  { metadata, database, config }: { metadata: Record<string, unknown>; database?: string[]; config?: string },
): void {
  const beads = folder(project, '.beads');
  write(join(beads, 'metadata.json'), JSON.stringify({ backend: 'dolt', database: 'dolt', ...metadata }));
  if (database) mkdirSync(join(beads, ...database, '.dolt'), { recursive: true });
  if (config) write(join(beads, 'config.yaml'), config);
}

/** Un faux client dolt : le préfixe (ou l'erreur) à renvoyer pour chaque dossier de base. */
function fakeDolt(answers: Record<string, string | Error | null> = {}): DoltClient & { opened: string[] } {
  const opened: string[] = [];
  return {
    opened,
    open: (dir) => ({
      dir,
      async query() {
        opened.push(dir);
        const answer = answers[dir];
        if (answer instanceof Error) throw answer;
        return answer ? [{ value: answer }] : [];
      },
    }),
  };
}

const config = (overrides: Partial<Config> = {}): Config => ({ roots: [root], projects: [], hiddenProjects: [], ...overrides });

describe('discoverProjects', () => {
  it('liste les Projets Dolt embedded avec leur préfixe lu dans la base', async () => {
    doltWorkspace('aviron-club-360', {
      metadata: { dolt_mode: 'embedded', dolt_database: 'av360' },
      database: ['embeddeddolt', 'av360'],
    });
    const db = folder('aviron-club-360', '.beads', 'embeddeddolt', 'av360');

    const { projects, ignored } = await discoverProjects(config(), { dolt: fakeDolt({ [db]: 'av360' }) });

    expect(ignored).toEqual([]);
    expect(projects).toEqual([
      {
        id: 'aviron-club-360',
        name: 'aviron-club-360',
        path: folder('aviron-club-360'),
        prefix: 'av360',
        mode: 'embedded',
        status: 'ok',
        databasePath: db,
      },
    ]);
  });

  it('lit un Projet en mode server dans .beads/dolt/<base>', async () => {
    doltWorkspace('serveur', { metadata: { dolt_mode: 'server', dolt_database: 'srv' }, database: ['dolt', 'srv'] });
    const db = folder('serveur', '.beads', 'dolt', 'srv');

    const { projects } = await discoverProjects(config(), { dolt: fakeDolt({ [db]: 'srv' }) });

    expect(projects[0]).toMatchObject({ mode: 'server', status: 'ok', prefix: 'srv', databasePath: db });
  });

  it('signale illisible un Projet server dont la base est absente, sans planter, avec le préfixe de config.yaml', async () => {
    doltWorkspace('jardin-partage', {
      metadata: { dolt_mode: 'server', dolt_database: 'b' },
      database: ['dolt'], // le dossier .beads/dolt/.dolt existe, mais pas la base .beads/dolt/b
      config: '# commentaire\nissue-prefix: b\nsync:\n  git-remote: git@example.com:x/y.git\n',
    });
    const dolt = fakeDolt();

    const { projects } = await discoverProjects(config(), { dolt });

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ mode: 'server', status: 'unreadable', prefix: 'b' });
    expect(projects[0]?.reason).toContain('.beads/dolt/b');
    expect(projects[0]?.databasePath).toBeUndefined();
    expect(dolt.opened).toEqual([]);
  });

  it('signale illisible un Projet dont la base répond par une erreur, avec le message de dolt', async () => {
    doltWorkspace('casse', { metadata: { dolt_mode: 'embedded', dolt_database: 'x' }, database: ['embeddeddolt', 'x'] });
    const db = folder('casse', '.beads', 'embeddeddolt', 'x');

    const { projects } = await discoverProjects(config(), { dolt: fakeDolt({ [db]: new DoltQueryError('table not found: config', db) }) });

    expect(projects[0]).toMatchObject({ status: 'unreadable', reason: 'table not found: config', prefix: 'x', databasePath: db });
  });

  it('signale illisibles les Projets quand le binaire dolt est absent', async () => {
    doltWorkspace('p', { metadata: { dolt_mode: 'embedded', dolt_database: 'x' }, database: ['embeddeddolt', 'x'] });
    const db = folder('p', '.beads', 'embeddeddolt', 'x');

    const { projects } = await discoverProjects(config(), { dolt: fakeDolt({ [db]: new DoltNotFoundError('dolt') }) });

    expect(projects[0]?.status).toBe('unreadable');
    expect(projects[0]?.reason).toContain('introuvable');
  });

  it('se rabat sur config.yaml puis sur le nom de la base quand la base ne porte pas de préfixe', async () => {
    doltWorkspace('a', { metadata: { dolt_mode: 'embedded', dolt_database: 'base_a' }, database: ['embeddeddolt', 'base_a'], config: 'issue-prefix: "pfx"\n' });
    doltWorkspace('b', { metadata: { dolt_mode: 'embedded', dolt_database: 'base_b' }, database: ['embeddeddolt', 'base_b'] });

    const { projects } = await discoverProjects(config(), { dolt: fakeDolt() });

    expect(projects.map((p) => [p.name, p.prefix, p.status])).toEqual([
      ['a', 'pfx', 'ok'],
      ['b', 'base_b', 'ok'],
    ]);
  });

  it('ignore avec une raison les workspaces SQLite, incomplets ou illisibles', async () => {
    write(folder('fanfare-municipale', '.beads', 'metadata.json'), JSON.stringify({ database: 'beads.db', jsonl_export: 'issues.jsonl' }));
    write(folder('fanfare-municipale', '.beads', 'beads.db'));
    mkdirSync(folder('tutoriel-photo', '.beads', 'dolt'), { recursive: true });
    write(folder('json-casse', '.beads', 'metadata.json'), '{ pas du json');
    write(folder('autre', '.beads', 'metadata.json'), JSON.stringify({ backend: 'postgres', database: 'x' }));

    const { projects, ignored } = await discoverProjects(config(), { dolt: fakeDolt() });

    expect(projects).toEqual([]);
    expect(ignored.map((i) => i.path)).toEqual([folder('autre'), folder('fanfare-municipale'), folder('json-casse'), folder('tutoriel-photo')]);
    expect(ignored.find((i) => i.path === folder('fanfare-municipale'))?.reason).toMatch(/SQLite \(beads\.db\).*Dolt/);
    expect(ignored.find((i) => i.path === folder('tutoriel-photo'))?.reason).toContain('metadata.json');
    expect(ignored.find((i) => i.path === folder('json-casse'))?.reason).toContain('illisible');
    expect(ignored.find((i) => i.path === folder('autre'))?.reason).toContain('postgres');
  });

  // bdesk-ewr.8 : chaque raison porte sa cause codée à côté (`reasonDetail`), et la raison française reste celle d'avant, mot pour mot.
  describe('la cause codée de chaque raison, à côté de la raison française', () => {
    const metadataOnly = (name: string, metadata: unknown) => write(folder(name, '.beads', 'metadata.json'), JSON.stringify(metadata));

    it.each([
      ['un workspace SQLite', { database: 'beads.db' }, 'Workspace SQLite (beads.db) : seuls les Projets Dolt sont suivis.', { code: 'sqlite-workspace', params: { database: 'beads.db' } }],
      ['un workspace SQLite sans base nommée', { backend: 'sqlite' }, 'Workspace SQLite (sqlite) : seuls les Projets Dolt sont suivis.', { code: 'sqlite-workspace', params: { database: 'sqlite' } }],
      ['un workspace d’une autre sorte', { backend: 'postgres', database: 'x' }, 'Workspace « postgres » : seuls les Projets Dolt sont suivis.', { code: 'other-workspace', params: { backend: 'postgres' } }],
      ['un workspace qui ne dit pas sa sorte', {}, 'Workspace « inconnu » : seuls les Projets Dolt sont suivis.', { code: 'unknown-workspace', params: {} }],
    ])('ignore %s', async (_label, metadata, reason, reasonDetail) => {
      metadataOnly('atelier', metadata);

      const { ignored } = await discoverProjects(config(), { dolt: fakeDolt() });

      expect(ignored).toEqual([{ path: folder('atelier'), reason, reasonDetail }]);
    });

    it('ignore un workspace sans metadata.json, ou dont metadata.json n’est pas du JSON', async () => {
      mkdirSync(folder('ardoise', '.beads'), { recursive: true });
      write(folder('carnet', '.beads', 'metadata.json'), '{ pas du json');

      const { ignored } = await discoverProjects(config(), { dolt: fakeDolt() });

      expect(ignored).toEqual([
        {
          path: folder('ardoise'),
          reason: 'Projet incomplet : pas de metadata.json, donc pas de base Dolt.',
          reasonDetail: { code: 'no-metadata', params: {} },
        },
        { path: folder('carnet'), reason: 'metadata.json illisible (JSON invalide).', reasonDetail: { code: 'invalid-metadata', params: {} } },
      ]);
    });

    it('un mode Dolt qu’il ne sait pas lire', async () => {
      doltWorkspace('atelier', { metadata: { dolt_mode: 'proxied-server', dolt_database: 'x' } });

      const { projects } = await discoverProjects(config(), { dolt: fakeDolt() });

      expect(projects[0]).toMatchObject({
        reason: 'Mode Dolt « proxied-server » non pris en charge (embedded et server seulement).',
        reasonDetail: { code: 'unsupported-mode', params: { mode: 'proxied-server' } },
      });
    });

    it('une base absente : de ce poste (server), ou introuvable (embedded, sans base nommée)', async () => {
      doltWorkspace('atelier', { metadata: { dolt_mode: 'server', dolt_database: 'b' }, database: ['dolt'] });
      doltWorkspace('ardoise', { metadata: { dolt_mode: 'embedded' } });

      const { projects } = await discoverProjects(config(), { dolt: fakeDolt() });

      expect(projects.map(({ reason, reasonDetail }) => ({ reason, reasonDetail }))).toEqual([
        {
          reason: 'Base Dolt introuvable (.beads/embeddeddolt/<base>).',
          reasonDetail: { code: 'database-not-found', params: { folder: join('.beads', 'embeddeddolt'), path: '' } },
        },
        {
          reason:
            "Base Dolt absente de ce poste (.beads/dolt/b introuvable) : le Projet est en mode server, sa base n'est pas disponible localement.",
          reasonDetail: { code: 'database-not-local', params: { folder: join('.beads', 'dolt'), path: join('.beads', 'dolt', 'b') } },
        },
      ]);
    });

    // La raison française reste celle d'avant mot pour mot, chemins inhabituels compris : le serveur écrit le chemin par `join`, qui le normalise.
    it.each([
      ['../autre', join('.beads', 'autre')],
      ['./x', join('.beads', 'embeddeddolt', 'x')],
      ['a//b/', join('.beads', 'embeddeddolt', 'a', 'b') + '/'],
      ['/etc', join('.beads', 'embeddeddolt', 'etc')],
    ])('une base nommée %j : son chemin normalisé, dans la raison et dans la cause', async (database, path) => {
      doltWorkspace('atelier', { metadata: { dolt_mode: 'embedded', dolt_database: database } });

      const { projects } = await discoverProjects(config(), { dolt: fakeDolt() });

      expect(projects.map(({ reason, reasonDetail }) => ({ reason, reasonDetail }))).toEqual([
        {
          reason: `Base Dolt introuvable (${join('.beads', 'embeddeddolt', database)}).`,
          reasonDetail: { code: 'database-not-found', params: { folder: join('.beads', 'embeddeddolt'), path } },
        },
      ]);
      expect(join('.beads', 'embeddeddolt', database)).toBe(path);
    });

    it('reprend la cause d’une erreur du client Dolt, et rien de plus pour une erreur qu’il n’a pas codée', async () => {
      doltWorkspace('atelier', { metadata: { dolt_mode: 'embedded', dolt_database: 'x' }, database: ['embeddeddolt', 'x'] });
      doltWorkspace('ardoise', { metadata: { dolt_mode: 'embedded', dolt_database: 'y' }, database: ['embeddeddolt', 'y'] });
      doltWorkspace('carnet', { metadata: { dolt_mode: 'embedded', dolt_database: 'z' }, database: ['embeddeddolt', 'z'] });
      const db = (name: string, base: string) => folder(name, '.beads', 'embeddeddolt', base);
      const dolt = fakeDolt({
        [db('atelier', 'x')]: new DoltQueryError({ code: 'dolt-locked', params: {} }, db('atelier', 'x'), true),
        [db('ardoise', 'y')]: new DoltQueryError('texte que le client ne code pas', db('ardoise', 'y')),
        [db('carnet', 'z')]: new DoltNotFoundError('dolt'),
      });

      const { projects } = await discoverProjects(config(), { dolt });
      const [ardoise, atelier, carnet] = projects;

      expect(atelier).toMatchObject({
        reason: 'La base est tenue par un autre processus dolt : réessayez dans un instant.',
        reasonDetail: { code: 'dolt-locked', params: {} },
      });
      expect(ardoise?.reason).toBe('texte que le client ne code pas');
      expect(ardoise).not.toHaveProperty('reasonDetail');
      expect(carnet).toMatchObject({
        reason: "Le binaire « dolt » est introuvable : installez Dolt et vérifiez qu'il est dans le PATH.",
        reasonDetail: { code: 'dolt-not-found', params: { binary: 'dolt' } },
      });
    });
  });

  it('scanne deux niveaux sous la racine, sans descendre dans node_modules ni dans les dossiers cachés', async () => {
    for (const path of [['projet'], ['groupe', 'imbrique'], ['groupe', 'node_modules', 'dep'], ['.cache', 'p'], ['a', 'b', 'trop-profond']]) {
      doltWorkspace(join(...path), { metadata: { dolt_mode: 'embedded', dolt_database: 'x' }, database: ['embeddeddolt', 'x'] });
    }

    const { projects } = await discoverProjects(config(), { dolt: fakeDolt() });

    expect(projects.map((p) => p.path)).toEqual([folder('groupe', 'imbrique'), folder('projet')]);
  });

  it('déduit le mode des dossiers quand metadata.json ne le dit pas, et retrouve l’unique base du dossier', async () => {
    doltWorkspace('ancien', { metadata: {}, database: ['dolt', 'seule'] });
    doltWorkspace('moderne', { metadata: {}, database: ['embeddeddolt', 'seule'] });

    const { projects } = await discoverProjects(config(), { dolt: fakeDolt() });

    expect(projects.map((p) => [p.name, p.mode, p.status])).toEqual([
      ['ancien', 'server', 'ok'],
      ['moderne', 'embedded', 'ok'],
    ]);
  });

  it('signale illisible un mode Dolt qu’il ne sait pas lire', async () => {
    doltWorkspace('proxy', { metadata: { dolt_mode: 'proxied-server', dolt_database: 'x' } });

    const { projects } = await discoverProjects(config(), { dolt: fakeDolt() });

    expect(projects[0]).toMatchObject({ status: 'unreadable' });
    expect(projects[0]?.reason).toContain('proxied-server');
  });

  it('ajoute les Projets saisis à la main, hors des racines, et signale ceux qui n’ont pas de .beads', async () => {
    const elsewhere = scratchDir('bdesk-elsewhere-');
    write(join(elsewhere, 'manuel', '.beads', 'metadata.json'), JSON.stringify({ backend: 'dolt', dolt_mode: 'embedded', dolt_database: 'm' }));
    mkdirSync(join(elsewhere, 'manuel', '.beads', 'embeddeddolt', 'm', '.dolt'), { recursive: true });
    mkdirSync(join(elsewhere, 'vide'));

    const { projects, ignored } = await discoverProjects(
      config({ roots: [], projects: [join(elsewhere, 'manuel'), join(elsewhere, 'vide'), join(elsewhere, 'manuel')] }),
      { dolt: fakeDolt() },
    );

    expect(projects.map((p) => p.path)).toEqual([join(elsewhere, 'manuel')]);
    expect(ignored).toEqual([
      { path: join(elsewhere, 'vide'), reason: 'Ce dossier ajouté à la main ne contient aucun Projet.', reasonDetail: { code: 'no-beads-folder', params: {} } },
    ]);
  });

  it('retire les Projets masqués, qu’ils viennent du scan ou de la configuration, sans les lister parmi les ignorés', async () => {
    doltWorkspace('visible', { metadata: { dolt_mode: 'embedded', dolt_database: 'x' }, database: ['embeddeddolt', 'x'] });
    doltWorkspace('masque', { metadata: { dolt_mode: 'embedded', dolt_database: 'x' }, database: ['embeddeddolt', 'x'] });
    write(folder('masque-sqlite', '.beads', 'metadata.json'), JSON.stringify({ database: 'beads.db' }));

    const { projects, ignored } = await discoverProjects(
      config({ projects: [folder('masque')], hiddenProjects: [folder('masque'), `${folder('masque-sqlite')}/`] }),
      { dolt: fakeDolt() },
    );

    expect(projects.map((p) => p.name)).toEqual(['visible']);
    expect(ignored).toEqual([]);
  });

  it('ne compte qu’une fois un dossier atteint par un lien symbolique, et garde son chemin canonique', async () => {
    doltWorkspace('reel', { metadata: { dolt_mode: 'embedded', dolt_database: 'x' }, database: ['embeddeddolt', 'x'] });
    symlinkSync(folder('reel'), folder('alias'));

    const { projects } = await discoverProjects(config(), { dolt: fakeDolt() });

    expect(projects.map((p) => p.name)).toEqual(['reel']);
  });

  describe('Projets masqués par un chemin non canonique', () => {
    it('masque le Projet et ses doublons quand le chemin à masquer est un lien symbolique', async () => {
      doltWorkspace('reel', { metadata: { dolt_mode: 'embedded', dolt_database: 'x' }, database: ['embeddeddolt', 'x'] });
      symlinkSync(folder('reel'), folder('alias'));

      const { projects, ignored } = await discoverProjects(config({ hiddenProjects: [folder('alias')] }), { dolt: fakeDolt() });

      expect(projects).toEqual([]);
      expect(ignored).toEqual([]);
    });

    it('masque aussi un dossier ignoré (SQLite) désigné par un lien symbolique', async () => {
      write(folder('lite', '.beads', 'metadata.json'), JSON.stringify({ database: 'beads.db' }));
      symlinkSync(folder('lite'), folder('alias-lite'));

      const { ignored } = await discoverProjects(config({ hiddenProjects: [folder('alias-lite')] }), { dolt: fakeDolt() });

      expect(ignored).toEqual([]);
    });

    it('masque un Projet dont le chemin à masquer passe par le lien /var → /private/var de macOS', async () => {
      const raw = scratchDir('bdesk-hide-'); // /var/folders/… sur macOS
      const real = realpathSync(raw); // /private/var/folders/…
      write(join(real, 'p', '.beads', 'metadata.json'), JSON.stringify({ backend: 'sqlite', database: 'beads.db' }));

      const { projects, ignored } = await discoverProjects(
        { roots: [real], projects: [], hiddenProjects: [join(raw, 'p')] },
        { dolt: fakeDolt() },
      );

      expect(projects).toEqual([]);
      expect(ignored).toEqual([]);
    });

    it('se contente du chemin résolu quand le dossier à masquer n’existe pas', async () => {
      const { ignored } = await discoverProjects(
        config({ roots: [], projects: [folder('absent')], hiddenProjects: [`${folder('absent')}/`] }),
        { dolt: fakeDolt() },
      );

      expect(ignored).toEqual([]);
    });
  });

  it('donne des identifiants uniques aux Projets de même nom', async () => {
    for (const path of [['a', 'api'], ['b', 'api'], ['c', 'API']]) {
      doltWorkspace(join(...path), { metadata: { dolt_mode: 'embedded', dolt_database: 'x' }, database: ['embeddeddolt', 'x'] });
    }

    const { projects } = await discoverProjects(config(), { dolt: fakeDolt() });

    expect(projects.map((p) => [p.id, p.path])).toEqual([
      ['api', folder('a', 'api')],
      ['api-2', folder('b', 'api')],
      ['api-3', folder('c', 'API')],
    ]);
  });

  it('trie les Projets par nom, sans tenir compte de la casse', async () => {
    for (const name of ['zeta', 'Alpha', 'beta']) {
      doltWorkspace(name, { metadata: { dolt_mode: 'embedded', dolt_database: 'x' }, database: ['embeddeddolt', 'x'] });
    }

    const { projects } = await discoverProjects(config(), { dolt: fakeDolt() });

    expect(projects.map((p) => p.name)).toEqual(['Alpha', 'beta', 'zeta']);
  });

  it('accepte une racine absente ou illisible', async () => {
    const { projects, ignored } = await discoverProjects(config({ roots: [folder('absente')] }), { dolt: fakeDolt() });

    expect(projects).toEqual([]);
    expect(ignored).toEqual([]);
  });
});

describe('slugify', () => {
  it.each([
    ['Mon-Pommier-Malin', 'mon-pommier-malin'],
    ['aviron-club-360', 'aviron-club-360'],
    ['Mon Projet_été (v2)', 'mon-projet-ete-v2'],
    ['---', 'projet'],
  ])('%s → %s', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });
});
