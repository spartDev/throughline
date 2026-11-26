import { describe, expect, it } from 'vitest';
import type { SignalsResponse } from '../../shared/api';
import type { NamedMetricsResponse } from './api';
import { buildRetrospective, escapeMarkdown, evolution } from './retrospective';
import { acceptanceTrendOf, agentChainFixture, emptyHealthFixture, metricsFixture, NO_INTENT_SPLIT, plain, trendOf } from './testing';
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
});
