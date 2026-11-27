import { describe, expect, it } from 'vitest';
import type { MetricsDecisions, MetricsSoundThroughputTile, SignalsResponse } from '../../shared/api';
import type { NamedMetricsResponse } from './api';
import { buildRetrospective, escapeMarkdown, evolution } from './retrospective';
import {
  acceptanceTrendOf,
  agentChainFixture,
  emptyHealthFixture,
  ENOUGH_COVERAGE,
  heldDecisionsFixture,
  LOW_COVERAGE,
  metricsFixture,
  NO_INTENT_SPLIT,
  plain,
  trendOf,
} from './testing';
import { MEASURES } from './trend';

const DAY = 86_400_000;

const signalsResponse = (overrides: Partial<SignalsResponse> = {}): SignalsResponse => ({
  generatedAt: '2026-11-02T19:00:15.242Z',
  timeZone: 'Europe/Paris',
  timeZoneHonoured: true,
  projects: [
    { id: 'bdesk', name: 'beads-desktop' },
    { id: 'mpm', name: 'Mon-Pommier-Malin' },
  ],
  unreadable: [],
  signals: [
    { kind: 'drift', project: 'bdesk', ticket: { id: 'bdesk-d1', title: 'Refonte | kanban', type: 'feature', priority: 1 }, cycleTime: 9 * DAY, reference: 4 * DAY, scope: 'type' },
    { kind: 'stagnantReady', project: 'mpm', ticket: { id: 'mpm-s1', title: 'Doc *export*', type: 'task', priority: 3 }, since: '2026-10-10T08:00:00.000Z', age: 23 * DAY },
    { kind: 'unusualWip', project: 'mpm', wip: 9, threshold: 6 },
  ],
  ...overrides,
});

const build = (metrics: NamedMetricsResponse = metricsFixture(), signals: SignalsResponse | 'error' = signalsResponse()) =>
  plain(buildRetrospective({ scopeName: 'Vue globale', metrics, signals: signals === 'error' ? { status: 'error' } : { status: 'ok', response: signals }, language: 'fr' }));

describe('rapport de rétrospective', () => {
  it('titre la période et dit comment elle est comparée', () => {
    const text = build();
    expect(text).toMatch(/^# Rétrospective : Vue globale, 27 oct. – 2 nov. 2026\n\nPériode en cours/);
  });

  it('donne Débit, Lead Time, Taux de Réouverture et Taux d’échec avec leur évolution', () => {
    const text = build();
    expect(text).toContain('| Débit | 18 Livraisons | 28 | −10 (−36 %), en moins bien |');
    expect(text).toMatch(/\| Lead Time \(médiane\) \| 6,9 j \| [^|]+ \| [^|]+ \|/);
    expect(text).toMatch(/\| Lead Time \(P85\) \| 16 j \| 4 j \| \+12 j \(\+304 %\), en moins bien \|/);
    expect(text).toContain('| Taux de Réouverture | 9,5 % (2 sur 21 clôtures) | 4 % | +5,5 pts, en moins bien |');
    expect(text).toContain('| Taux d’échec | 0 % (0 sur 18 Livraisons), non significatif | 0 % | stable |');
    expect(text).toContain('_Taux d’échec non significatif : couverture insuffisante : 19 % des bugs ont une origine renseignée (minimum 50 %)._');
  });

  it('montre la Tendance longue semaine par semaine, et signale les centiles peu fiables', () => {
    const text = build();
    expect(text).toContain('## Tendance longue (12 semaines)');
    expect(text).toContain('| 17 août | 5 | 1 j | 20 % |');
    expect(text).toContain('| 2 nov. (en cours) | 1 | 12 j \\* | 0 % |');
    expect(text).toContain('| 7 sept. | 0 | — | — |');
    expect(text).toContain('\\* Moins de 4 Livraisons dans la semaine');
  });

  it('liste les tickets en Retravail avec leurs causes, et leur Projet dans la Vue globale', () => {
    const text = build();
    expect(text).toContain('## Retravail (2 tickets)');
    expect(text).toContain('- `bdesk-r1` Palette ⌘K (beads-desktop) : 2 Réouvertures, Bug d’origine `bdesk-b9`');
    expect(text).toContain('- `mpm-r2` Import des récoltes (Mon-Pommier-Malin) : 1 Prise rendue');
  });

  it('dit quand rien n’est revenu sur la période', () => {
    const text = build(metricsFixture({ health: emptyHealthFixture() }));
    expect(text).toContain('## Retravail (0 ticket)\n\nAucun ticket n’est revenu sur la période');
  });

  it('groupe les Signaux en cours par sorte, datés de leur lecture', () => {
    const text = build();
    expect(text).toContain('## Signaux en cours (3 Signaux, au 2 nov. à 20:00)');
    expect(text).toContain('### Dérive\n\n- `bdesk-d1` Refonte \\| kanban (beads-desktop) : 9 j de Cycle Time en cours, au-delà de 4 j, le P85 des Livraisons du même type');
    expect(text).toContain('### Prêt qui stagne\n\n- `mpm-s1` Doc \\*export\\* (Mon-Pommier-Malin) : Prêt depuis 23 j');
    expect(text).toContain('### WIP inhabituel\n\n- Mon-Pommier-Malin : 9 tickets en cours, au-delà de 6');
    expect(text.indexOf('### Dérive')).toBeLessThan(text.indexOf('### Prêt qui stagne'));
    expect(text.endsWith('quotidien des 90 derniers jours\n')).toBe(true);
  });

  it('ne nomme pas le Projet d’un ticket quand il n’y en a qu’un', () => {
    const metrics = metricsFixture({ projects: [{ id: 'bdesk', name: 'beads-desktop' }] });
    const text = build(metrics, signalsResponse({ projects: [{ id: 'bdesk', name: 'beads-desktop' }], signals: signalsResponse().signals.slice(0, 1) }));
    expect(text).toContain('- `bdesk-r1` Palette ⌘K : 2 Réouvertures');
    expect(text).toContain('- `bdesk-d1` Refonte \\| kanban : 9 j');
  });

  it('nomme un Projet sans nom comme l’avis des Projets illisibles, jamais « Sans titre »', () => {
    const metrics: NamedMetricsResponse = {
      ...metricsFixture(),
      projects: [
        { id: 'bdesk', name: 'beads-desktop' },
        { id: 'mpm', name: 'Sans titre', unnamed: true },
      ],
    };
    const text = build(metrics);
    expect(text).toContain('- `mpm-r2` Import des récoltes (Un Projet sans nom) : 1 Prise rendue');
    expect(text).toContain('- `bdesk-r1` Palette ⌘K (« beads-desktop ») :');
    expect(text).toContain('- Un Projet sans nom : 9 tickets en cours');
  });

  it('dit qu’il n’y a aucun Signal, ou qu’ils n’ont pas pu être lus, sans renoncer au reste', () => {
    expect(build(undefined, signalsResponse({ signals: [] }))).toContain('## Signaux en cours (0 Signal, au 2 nov. à 20:00)\n\nAucune Dérive');
    const failed = build(undefined, 'error');
    expect(failed).toContain('## Signaux en cours\n\n_Les Signaux n’ont pas pu être lus._');
    expect(failed).toContain('## Indicateurs');
  });
});

describe('rapport de rétrospective : les Signaux de relais', () => {
  const relayed = signalsResponse({
    projects: [{ id: 'bdesk', name: 'beads-desktop' }],
    signals: [
      { kind: 'unusualWip', project: 'bdesk', wip: 9, threshold: 6 },
      { kind: 'waitingValidation', project: 'bdesk', ticket: { id: 'bdesk-v', title: 'Export *csv*', type: 'task', priority: 2 }, since: '2026-10-30T19:00:00.000Z', duration: 3 * DAY },
      { kind: 'sendBackLoop', project: 'bdesk', ticket: { id: 'bdesk-l', title: 'Thème sombre', type: 'feature', priority: 1 }, sendBacks: 4 },
    ],
  });
  const metrics = () => metricsFixture({ projects: [{ id: 'bdesk', name: 'beads-desktop' }] });

  it('figurent avec les autres Signaux, après le WIP inhabituel : la Validation qui attend, puis la Boucle de Retours', () => {
    const text = build(metrics(), relayed);
    expect(text).toContain('## Signaux en cours (3 Signaux, au 2 nov. à 20:00)');
    expect(text).toContain(
      '### WIP inhabituel\n\n- beads-desktop : 9 tickets en cours, au-delà de 6, le P85 du WIP quotidien des 90 derniers jours\n\n' +
        '### Validation qui attend\n\n- `bdesk-v` Export \\*csv\\* : À valider depuis 3 j\n\n' +
        '### Boucle de Retours\n\n- `bdesk-l` Thème sombre : 4 Retours au développement, sans être fermé',
    );
  });

  it('en anglais, sous leurs noms anglais', () => {
    const text = plain(buildRetrospective({ scopeName: 'beads-desktop', metrics: metrics(), signals: { status: 'ok', response: relayed }, language: 'en' }));
    expect(text).toContain('### Unusual WIP\n\n- beads-desktop: 9 tickets in progress, above 6, the P85 of daily WIP over the last 90 days');
    expect(text).toContain('### Waiting validation\n\n- `bdesk-v` Export \\*csv\\*: Awaiting validation for 3 d');
    expect(text).toContain('### Send-back loop\n\n- `bdesk-l` Thème sombre: 4 Send-backs to development, still not closed');
  });

  it('le Flux à l’arrêt se range après le WIP inhabituel, au nom de son Projet', () => {
    const stalled = signalsResponse({
      projects: [{ id: 'bdesk', name: 'beads-desktop' }],
      signals: [
        { kind: 'unusualWip', project: 'bdesk', wip: 9, threshold: 6 },
        { kind: 'stalledFlow', project: 'bdesk', ready: 4, since: '2026-11-01T19:00:00.000Z', duration: 25 * 3_600_000 },
      ],
    });
    expect(build(metrics(), stalled)).toContain(
      '### WIP inhabituel\n\n- beads-desktop : 9 tickets en cours, au-delà de 6, le P85 du WIP quotidien des 90 derniers jours\n\n' +
        '### Flux à l’arrêt\n\n- beads-desktop : 4 tickets Prêts, et aucune Transition depuis 1 j',
    );
  });

  it('le Stock en hausse se range après le Flux à l’arrêt, au nom de son Projet, avec la courbe du Stock', () => {
    const rising = signalsResponse({
      projects: [{ id: 'bdesk', name: 'beads-desktop' }],
      signals: [
        { kind: 'stalledFlow', project: 'bdesk', ready: 4, since: '2026-11-01T19:00:00.000Z', duration: 25 * 3_600_000 },
        { kind: 'risingStock', project: 'bdesk', stock: [21, 25, 31, 40], since: '2026-10-11T22:00:00.000Z' },
      ],
    });
    expect(build(metrics(), rising)).toContain(
      '### Flux à l’arrêt\n\n- beads-desktop : 4 tickets Prêts, et aucune Transition depuis 1 j\n\n' +
        '### Stock en hausse\n\n- beads-desktop : Stock de 21 à 40 tickets en 3 semaines (21 → 25 → 31 → 40), en hausse chaque semaine',
    );
  });

  it('comptent dans « aucun Signal »', () => {
    const none = build(undefined, signalsResponse({ signals: [] }));
    expect(none).toContain('aucun Stock en hausse');
    expect(none).toContain('ni aucune Boucle de Retours en ce moment.');
  });
});

describe('évolution', () => {
  it('dit l’écart, sa part et s’il est un mieux', () => {
    expect(plain(evolution(trendOf(12, 9), MEASURES.fr.count))).toBe('+3 (+33 %), en mieux');
    expect(plain(evolution(trendOf(2 * DAY, 3 * DAY), MEASURES.fr.duration))).toBe('−1 j (−33 %), en mieux');
    expect(evolution(trendOf(4, 4), MEASURES.fr.count)).toBe('stable');
    expect(evolution(trendOf(4, null), MEASURES.fr.count)).toBe('—');
  });
});

describe('la Chaîne d’agents du rapport (bdesk-pz0.8)', () => {
  const HOUR = 3_600_000;
  const chain = agentChainFixture();
  const withChain = (review: Partial<NamedMetricsResponse['review']>, humanWaits: Partial<NamedMetricsResponse['cycleTimeBreakdown']['humanWaits']> = {}) =>
    agentChainFixture({
      review: { ...chain.review, ...review },
      cycleTimeBreakdown: { ...chain.cycleTimeBreakdown, humanWaits: { ...chain.cycleTimeBreakdown.humanWaits, ...humanWaits } },
    });

  it('n’apparaît pas sans Livraison passée par un Statut de relais : le rapport reste celui d’avant', () => {
    const text = build();
    expect(text).not.toContain('Chaîne d’agents');
    expect(text).not.toContain('Acceptation au premier passage');
    expect(text).not.toContain('Attente humaine');
  });

  it('donne l’Acceptation au premier passage avec son évolution, puis l’Attente humaine, entre les indicateurs et la Tendance longue', () => {
    const text = build(chain);
    expect(text).toContain('## Chaîne d’agents\n\n| Indicateur | Période | Précédente | Évolution |\n| --- | ---: | ---: | --- |');
    expect(text).toContain('| Acceptation au premier passage | 75 % (9 sur 12 Livraisons relues) | 60 % | +15 pts, en mieux |');
    expect(text).toContain('| Attente humaine (médiane) | 8 h | — | — |');
    expect(text).toContain('| Attente humaine (P85) | 1,3 j | — | — |');
    expect(text).toContain('_Attente humaine : médiane et P85 des 6 Livraisons qui ont attendu votre validation ; 12,9 % du Cycle Time cumulé de la période._');
    expect(text.indexOf('## Indicateurs')).toBeLessThan(text.indexOf('## Chaîne d’agents'));
    expect(text.indexOf('## Chaîne d’agents')).toBeLessThan(text.indexOf('## Tendance longue'));
  });

  it('sous 10 Livraisons relues, la dit non significative sur sa ligne et dessous ; sous 4 attentes, met la réserve des centiles', () => {
    const text = build(
      withChain(
        { reviewed: 3, firstPassAcceptance: { accepted: 2, reviewed: 3, rate: 2 / 3, significant: false, minReviewed: 10, trend: acceptanceTrendOf(2 / 3, null) , byWrittenIntent: NO_INTENT_SPLIT } },
        { waited: 1, stats: { median: 3 * HOUR, p85: 3 * HOUR, n: 1 }, reliable: false },
      ),
    );
    expect(text).toContain('| Acceptation au premier passage | 66,7 % (2 sur 3 Livraisons relues), non significatif | — | — |');
    expect(text).toContain('_Acceptation au premier passage non significative : 3 Livraisons relues, il en faut au moins 10._');
    expect(text).toContain(
      '_Attente humaine : médiane et P85 de 1 Livraison qui a attendu votre validation ; 12,9 % du Cycle Time cumulé de la période. Moins de 4 Livraisons : les centiles ne disent pas grand-chose._',
    );
  });

  it('face à une période précédente sous 10 Livraisons relues : son taux est dit non significatif, et l’évolution n’en tire pas de verdict', () => {
    const text = build(withChain({ firstPassAcceptance: { ...chain.review.firstPassAcceptance, trend: acceptanceTrendOf(0.75, 1, false) } }));
    expect(text).toContain('| Acceptation au premier passage | 75 % (9 sur 12 Livraisons relues) | 100 %, non significatif | — |');
  });

  it('sans Livraison relue ni attente : des tirets, et ce qui manque dit en toutes lettres', () => {
    const text = build(
      withChain(
        { reviewed: 0, firstPassAcceptance: { accepted: 0, reviewed: 0, rate: null, significant: false, minReviewed: 10, trend: acceptanceTrendOf(null, 0.5) , byWrittenIntent: NO_INTENT_SPLIT } },
        { waited: 0, stats: { median: null, p85: null, n: 0 }, reliable: false, share: 0 },
      ),
    );
    expect(text).toContain('| Acceptation au premier passage | — | 50 % | — |');
    expect(text).toContain('| Attente humaine (médiane) | — | — | — |');
    expect(text).toContain('_Aucune Livraison de la période n’a attendu votre validation (À valider)._');
  });

  it('en anglais', () => {
    const text = plain(buildRetrospective({ scopeName: 'Overview', metrics: chain, signals: { status: 'ok', response: signalsResponse() }, language: 'en' }));
    expect(text).toContain('## Agent chain\n\n| Metric | Period | Previous | Change |');
    expect(text).toContain('| First-pass acceptance | 75% (9 of 12 Reviewed deliveries) | 60% | +15 pts, better |');
    expect(text).toContain('| Human wait (median) | 8 h | — | — |');
    expect(text).toContain('_Human wait: median and P85 of the 6 Deliveries that waited for your validation; 12.9% of the period’s cumulative Cycle Time._');
  });
});

/**
 * Le rapport de `metricsFixture`, sans Statut de relais, avec le seul Signal de Dérive, tel que l'écrivait la version d'avant le Débit sain (bdesk-3e9.8) : relevé
 * sur le commit c15e9b6, espaces insécables comprises comme des espaces (`plain`).
 */
const REPORT_BEFORE_SOUND_THROUGHPUT = `${[
  '# Rétrospective : Vue globale, 27 oct. – 2 nov. 2026',
  '',
  'Période en cours (27 oct. – 2 nov. 2026), comptée jusqu’au 2 nov. à 20:00. Les tendances la comparent à la période précédente (20 oct. – 26 oct. 2026) à durée écoulée égale, c’est-à-dire jusqu’au 26 oct. à 19:00.',
  '',
  '## Indicateurs',
  '',
  '| Indicateur | Période | Précédente | Évolution |',
  '| --- | ---: | ---: | --- |',
  '| Débit | 18 Livraisons | 28 | −10 (−36 %), en moins bien |',
  '| Lead Time (médiane) | 6,9 j | 16 h 28 | +6,2 j (+903 %), en moins bien |',
  '| Lead Time (P85) | 16 j | 4 j | +12 j (+304 %), en moins bien |',
  '| Taux de Réouverture | 9,5 % (2 sur 21 clôtures) | 4 % | +5,5 pts, en moins bien |',
  '| Taux d’échec | 0 % (0 sur 18 Livraisons), non significatif | 0 % | stable |',
  '',
  '_Taux d’échec non significatif : couverture insuffisante : 19 % des bugs ont une origine renseignée (minimum 50 %)._',
  '',
  '## Tendance longue (12 semaines)',
  '',
  '| Semaine du | Débit | Lead Time (P85) | Taux de Réouverture |',
  '| --- | ---: | ---: | ---: |',
  '| 17 août | 5 | 1 j | 20 % |',
  '| 24 août | 6 | 2 j | 16,7 % |',
  '| 31 août | 4 | 3 j | 25 % |',
  '| 7 sept. | 0 | — | — |',
  '| 14 sept. | 3 | 5 j \\* | 0 % |',
  '| 21 sept. | 7 | 6 j | 14,3 % |',
  '| 28 sept. | 5 | 7 j | 20 % |',
  '| 5 oct. | 8 | 8 j | 25 % |',
  '| 12 oct. | 6 | 9 j | 16,7 % |',
  '| 19 oct. | 4 | 10 j | 25 % |',
  '| 26 oct. | 5 | 11 j | 20 % |',
  '| 2 nov. (en cours) | 1 | 12 j \\* | 0 % |',
  '',
  '\\* Moins de 4 Livraisons dans la semaine : le centile ne dit pas grand-chose.',
  '',
  '## Retravail (2 tickets)',
  '',
  '- `bdesk-r1` Palette ⌘K (beads-desktop) : 2 Réouvertures, Bug d’origine `bdesk-b9`',
  '- `mpm-r2` Import des récoltes (Mon-Pommier-Malin) : 1 Prise rendue',
  '',
  '## Signaux en cours (1 Signal, au 2 nov. à 20:00)',
  '',
  '### Dérive',
  '',
  '- `bdesk-d1` Refonte \\| kanban (beads-desktop) : 9 j de Cycle Time en cours, au-delà de 4 j, le P85 des Livraisons du même type',
].join('\n')}\n`;

describe('le Débit sain du rapport (bdesk-3e9.8)', () => {
  const withSound = (sound: Partial<MetricsSoundThroughputTile>) => {
    const base = metricsFixture();
    return metricsFixture({ tiles: { ...base.tiles, soundThroughput: { ...base.tiles.soundThroughput, ...sound } } });
  };

  it('sans Statut de relais, seul le Débit sain s’ajoute : le reste du rapport est celui d’avant, à l’octet près', () => {
    const text = build(metricsFixture(), signalsResponse({ signals: signalsResponse().signals.slice(0, 1) }));
    const added = [
      '| Débit sain | 14 sur 18 Livraisons, non significatif, provisoire | 22 | −8 (−36 %), en moins bien |\n',
      '_Débit sain non significatif : couverture insuffisante : 19 % des bugs ont une origine renseignée (minimum 50 %)._\n\n',
      '_Débit sain provisoire : des Livraisons peuvent encore revenir._\n\n',
    ];
    for (const line of added) expect(text).toContain(line);
    expect(added.reduce((rest, line) => rest.replace(line, ''), text)).toBe(REPORT_BEFORE_SOUND_THROUGHPUT);
  });

  it('suit le Débit, et ses réserves précèdent celle du Taux d’échec, dans l’ordre des lignes', () => {
    const text = build();
    expect(text).toContain('| Débit | 18 Livraisons | 28 | −10 (−36 %), en moins bien |\n| Débit sain | 14 sur 18 Livraisons, non significatif, provisoire |');
    expect(text).toContain(
      '| Taux d’échec | 0 % (0 sur 18 Livraisons), non significatif | 0 % | stable |\n\n' +
        '_Débit sain non significatif : couverture insuffisante : 19 % des bugs ont une origine renseignée (minimum 50 %)._\n\n' +
        '_Débit sain provisoire : des Livraisons peuvent encore revenir._\n\n' +
        '_Taux d’échec non significatif : ',
    );
  });

  it('significatif sur une période finie : ni réserve sur sa ligne, ni note dessous', () => {
    const text = build(withSound({ ...ENOUGH_COVERAGE, provisional: false }));
    expect(text).toContain('| Débit sain | 14 sur 18 Livraisons | 22 | −8 (−36 %), en moins bien |');
    expect(text).not.toContain('Débit sain non significatif');
    expect(text).not.toContain('Débit sain provisoire');
  });

  it('accorde au singulier, et n’est pas provisoire sans Livraison : rien ne peut revenir', () => {
    expect(build(withSound({ total: 1, deliveries: 1, trend: trendOf(1, 1) }))).toContain('| Débit sain | 1 sur 1 Livraison, non significatif, provisoire | 1 | stable |');
    const none = build(withSound({ total: 0, deliveries: 0, ...LOW_COVERAGE, trend: trendOf(0, 3) }));
    expect(none).toMatch(/\| Débit sain \| 0 Livraison, non significatif \| 3 \| /);
    expect(none).toContain('_Débit sain non significatif : ');
    expect(none).not.toContain('Débit sain provisoire');
  });
});

describe('les Décisions du rapport (bdesk-3e9.8)', () => {
  const decided = (decisions: Partial<MetricsDecisions>, overrides: Partial<NamedMetricsResponse> = {}) =>
    agentChainFixture({ decisions: { ...heldDecisionsFixture(), ...decisions }, ...overrides });

  it('n’apparaissent pas sans Statut de relais, même avec des Décisions : la condition est celle des onglets de la page', () => {
    const text = build(metricsFixture({ decisions: heldDecisionsFixture() }));
    expect(text).not.toContain('## Décisions');
    expect(text).not.toContain('Feu vert');
    expect(text).not.toContain('Coût d’attention');
  });

  it('avec les Statuts de relais, suivent la Chaîne d’agents : Décisions tenues par sens, Livraisons prouvées, Coût d’attention, Livraisons sans Feu vert', () => {
    const text = build(agentChainFixture());
    expect(text).toContain(
      [
        '_Attente humaine : médiane et P85 des 6 Livraisons qui ont attendu votre validation ; 12,9 % du Cycle Time cumulé de la période._',
        '',
        '## Décisions',
        '',
        '### Décisions tenues',
        '',
        '7 sur 8 Feux verts et Refus, 87,5 %',
        '',
        '- Feux verts : 6 (66,7 %), 5 tenus',
        '- Relances : 1 (11,1 %)',
        '- Refus : 2 (22,2 %), 2 tenus',
        '- Reports : 0 (0 %)',
        '',
        '_Provisoire : la période court, et ses Décisions n’ont pas toutes eu le temps d’être démenties._',
        '',
        '### Livraisons prouvées',
        '',
        '66,7 % (4 sur 6 prouvées). Le plus souvent, il manque : Intention écrite.',
        '',
        '### Coût d’attention',
        '',
        'Décisions par Livraison passée par la chaîne : 1,5 (9 Décisions pour 6 Livraisons)',
        '',
        '### Livraisons sans Feu vert (1 Livraison)',
        '',
        '- `bdesk-b7q` Le graphique du Débit se décale après minuit (beads-desktop) : Livrée le 28 oct.',
        '',
        '## Tendance longue (12 semaines)',
      ].join('\n'),
    );
  });

  it('en Vue globale, chaque Livraison sans Feu vert nomme son Projet, son titre échappé, livrée le jour de l’utilisateur', () => {
    const base = heldDecisionsFixture().evidencedDeliveries;
    const text = build(
      decided({
        evidencedDeliveries: {
          ...base,
          // 23:30Z le 27 octobre : le 28 à Paris, en heure d'hiver.
          withoutGreenLight: [...base.withoutGreenLight, { id: 'mpm-x2', title: 'Export *csv* | v2', type: 'task', priority: 2, project: 'mpm', deliveredAt: '2026-10-27T23:30:00.000Z' }],
        },
      }),
    );
    expect(text).toContain(
      '### Livraisons sans Feu vert (2 Livraisons)\n\n' +
        '- `bdesk-b7q` Le graphique du Débit se décale après minuit (beads-desktop) : Livrée le 28 oct.\n' +
        '- `mpm-x2` Export \\*csv\\* \\| v2 (Mon-Pommier-Malin) : Livrée le 28 oct.',
    );
  });

  it('dans un seul Projet, la liste ne nomme pas le Projet', () => {
    const text = build(agentChainFixture({ projects: [{ id: 'bdesk', name: 'beads-desktop' }] }));
    expect(text).toContain('- `bdesk-b7q` Le graphique du Débit se décale après minuit : Livrée le 28 oct.');
  });

  it('liste vide : la phrase de la page, selon qu’une Livraison est passée par la chaîne ou non', () => {
    const base = heldDecisionsFixture().evidencedDeliveries;
    const allGreen = build(decided({ evidencedDeliveries: { ...base, missing: { ...base.missing, greenLight: 0 }, withoutGreenLight: [] } }));
    expect(allGreen).toContain('### Livraisons sans Feu vert (0 Livraison)\n\nToutes les Livraisons passées par la chaîne ont reçu votre Feu vert sur la période.');
    expect(allGreen).not.toContain('bdesk-b7q');
  });

  it('avec les Statuts de relais mais sans Décision ni Livraison passée par la chaîne : ce qui manque, dit en toutes lettres, et pas de Chaîne d’agents', () => {
    const text = build(metricsFixture({ handoff: ['awaiting_human'] }));
    expect(text).not.toContain('## Chaîne d’agents');
    expect(text).toContain(
      [
        '## Décisions',
        '',
        '### Décisions tenues',
        '',
        'Aucune Décision sur la période.',
        '',
        '### Livraisons prouvées',
        '',
        'Aucune Livraison passée par la chaîne sur la période.',
        '',
        '### Coût d’attention',
        '',
        'Aucune Livraison passée par la chaîne sur la période.',
        '',
        '### Livraisons sans Feu vert (0 Livraison)',
        '',
        'Aucune Livraison passée par la chaîne sur la période.',
        '',
        '## Tendance longue',
      ].join('\n'),
    );
  });

  it('accorde au singulier et à zéro : « 1 tenu », « 0 tenu », « 1 sur 1 prouvée », « 1 Décision pour 1 Livraison »', () => {
    const text = build(
      decided({
        total: 2,
        greenLights: { total: 1, held: 1, contradicted: 0 },
        rejections: { total: 1, held: 0, contradicted: 1 },
        reruns: 0,
        postponements: 0,
        provisional: false,
        attentionCost: { deliveries: 1, decisions: 1, perDelivery: 1 },
        evidencedDeliveries: {
          deliveries: 1,
          evidenced: 1,
          share: 1,
          missing: { writtenIntent: 0, reviewRound: 0, integration: 0, greenLight: 0 },
          mostMissing: null,
          withoutGreenLight: [],
        },
      }),
    );
    expect(text).toContain('### Décisions tenues\n\n1 sur 2 Feux verts et Refus, 50 %\n\n- Feux verts : 1 (50 %), 1 tenu\n- Relances : 0 (0 %)\n- Refus : 1 (50 %), 0 tenu\n- Reports : 0 (0 %)\n\n###');
    expect(text).toContain('### Livraisons prouvées\n\n100 % (1 sur 1 prouvée). Aucune preuve ne manque.');
    expect(text).toContain('### Coût d’attention\n\nDécisions par Livraison passée par la chaîne : 1 (1 Décision pour 1 Livraison)');
  });

  it('sans Feu vert ni Refus, les autres sens se comptent, et rien n’est provisoire : rien ne peut être démenti', () => {
    const text = build(decided({ total: 1, greenLights: { total: 0, held: 0, contradicted: 0 }, rejections: { total: 0, held: 0, contradicted: 0 }, reruns: 1, postponements: 0 }));
    expect(text).toContain('### Décisions tenues\n\nAucun Feu vert ni Refus sur la période.\n\n- Feux verts : 0 (0 %), 0 tenu\n- Relances : 1 (100 %)\n- Refus : 0 (0 %), 0 tenu');
    expect(text).not.toContain('_Provisoire : la période court');
  });
});

describe('échappement', () => {
  it('neutralise la mise en forme et les fins de ligne d’un texte venu des données', () => {
    expect(escapeMarkdown('Fix *a* | [b](c) <d> `e` #1\nsuite')).toBe('Fix \\*a\\* \\| \\[b\\](c) \\<d\\> \\`e\\` \\#1 suite');
  });
});

describe('en anglais', () => {
  const english = (metrics: NamedMetricsResponse = metricsFixture(), signals: SignalsResponse = signalsResponse()) =>
    plain(buildRetrospective({ scopeName: 'Overview', metrics, signals: { status: 'ok', response: signals }, language: 'en' }));

  it('écrit le rapport complet dans la langue et la notation de l’interface', () => {
    const text = english();
    expect(text).toMatch(/^# Retrospective: Overview, Oct 27 – Nov 2, 2026\n\nPeriod in progress/);
    expect(text).toContain('## Key metrics\n\n| Metric | Period | Previous | Change |');
    expect(text).toContain('| Throughput | 18 Deliveries | 28 | −10 (−36%), worse |');
    expect(text).toContain('| Lead Time (median) | 6.9 d |');
    expect(text).toContain('| Reopen rate | 9.5% (2 of 21 closures) | 4% | +5.5 pts, worse |');
    expect(text).toContain('| Change failure rate | 0% (0 of 18 Deliveries), not significant | 0% | steady |');
    expect(text).toContain('_Change failure rate not significant: Coverage too low: 19% of bugs have a recorded origin (minimum 50%)._');
    expect(text).toContain('## Long trend (12 weeks)\n\n| Week of | Throughput | Lead Time (P85) | Reopen rate |');
    expect(text).toContain('| Aug 24 | 6 | 2 d | 16.7% |');
    expect(text).toContain('| Nov 2 (in progress) | 1 | 12 d \\* | 0% |');
    expect(text).toContain('\\* Fewer than 4 Deliveries in the week');
    expect(text).toContain('## Rework (2 tickets)');
    expect(text).toContain('- `bdesk-r1` Palette ⌘K (beads-desktop): 2 Reopens, Escaped bug `bdesk-b9`');
    expect(text).toContain('- `mpm-r2` Import des récoltes (Mon-Pommier-Malin): 1 Handback');
    expect(text).toContain('## Current Signals (3 Signals, as of Nov 2 at 20:00)');
    // L'échappement markdown ne dépend pas de la langue.
    expect(text).toContain('- `bdesk-d1` Refonte \\| kanban (beads-desktop): ');
    expect(text).toContain('- `mpm-s1` Doc \\*export\\* (Mon-Pommier-Malin): ');
  });

  it('accorde au singulier pour 1 exactement, et dit l’absence', () => {
    const quiet = english(metricsFixture({ health: emptyHealthFixture() }), signalsResponse({ signals: signalsResponse().signals.slice(0, 1) }));
    expect(quiet).toContain('## Rework (0 tickets)\n\nNo ticket came back in the period');
    expect(quiet).toContain('## Current Signals (1 Signal, as of Nov 2 at 20:00)');
    expect(plain(evolution(trendOf(12, 9), MEASURES.en.count))).toBe('+3 (+33%), better');
    expect(evolution(trendOf(4, 4), MEASURES.en.count)).toBe('steady');
  });

  it('le Débit sain et les Décisions (bdesk-3e9.8), sous leurs noms anglais', () => {
    const base = heldDecisionsFixture();
    const untitled = { id: 'mpm-u1', title: '   ', type: 'task', priority: 2, project: 'mpm', deliveredAt: '2026-10-28T08:00:00.000Z' };
    const text = english(
      agentChainFixture({ decisions: { ...base, evidencedDeliveries: { ...base.evidencedDeliveries, withoutGreenLight: [...base.evidencedDeliveries.withoutGreenLight, untitled] } } }),
    );
    expect(text).toContain('| Throughput | 18 Deliveries | 28 | −10 (−36%), worse |\n| Sound throughput | 14 of 18 Deliveries, not significant, provisional | 22 | −8 (−36%), worse |');
    expect(text).toContain('_Sound throughput not significant: Coverage too low: 19% of bugs have a recorded origin (minimum 50%)._');
    expect(text).toContain('_Sound throughput provisional: Deliveries may still come back._');
    expect(text).toContain(
      [
        '## Decisions',
        '',
        '### Held decisions',
        '',
        '7 of 8 Green lights and Rejections, 87.5%',
        '',
        '- Green lights: 6 (66.7%), 5 held',
        '- Reruns: 1 (11.1%)',
        '- Rejections: 2 (22.2%), 2 held',
        '- Postponements: 0 (0%)',
        '',
        '_Provisional: the period is still running, and its Decisions have not all had time to be contradicted._',
        '',
        '### Evidenced deliveries',
        '',
        '66.7% (4 of 6 evidenced). Most often missing: Written intent.',
        '',
        '### Attention cost',
        '',
        'Decisions per Delivery through the chain: 1.5 (9 Decisions for 6 Deliveries)',
        '',
        '### Deliveries without green light (2 Deliveries)',
        '',
        '- `bdesk-b7q` Le graphique du Débit se décale après minuit (beads-desktop): Delivered on Oct 28',
        // Un ticket sans titre se nomme dans la langue du rapport.
        '- `mpm-u1` Untitled (Mon-Pommier-Malin): Delivered on Oct 28',
      ].join('\n'),
    );
  });
});
