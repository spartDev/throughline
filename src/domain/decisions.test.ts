import { describe, expect, it } from 'vitest';
import type { DeclaredStatuses, MetricsDecisionTally, MetricsEvidence } from '../shared/api';
import type { PeriodSpec } from './calendar';
import { computeDecisions, type Decision, decisionsOf, missingEvidence, throughChain } from './decisions';
import type { DependencyHistory } from './flow';
import { computeHealth } from './health';
import { analyzeProject, type MetricsInput, type MetricsTicket } from './metrics';
import { NO_DECLARED_STATUSES } from './statuses';

/**
 * Décisions, Décision tenue et Coût d'attention (bdesk-3e9.3). Les historiques sont fictifs ; chaque scénario dit les dates qu'il fabrique, en jours avant
 * l'instant de la mesure. La période par défaut est celle des 7 derniers jours, du samedi 17 octobre 2026 (minuit à Paris, il y a 6 jours et 20 heures) à
 * maintenant.
 */

const PARIS = 'Europe/Paris';
/** Vendredi 23 octobre 2026, 18:00Z (20:00 à Paris). */
const NOW = Date.parse('2026-10-23T18:00:00Z');
const DAY = 24 * 3_600_000;
const ago = (days: number) => NOW - days * DAY;

/** Les trois Statuts de relais, un statut personnalisé de catégorie `wip`, qui compte comme en cours, et un autre de catégorie `active`, qui reste « En pause ». */
const DECLARED: DeclaredStatuses = {
  handoff: ['in_review', 'in_integration', 'awaiting_human'],
  others: [
    { name: 'fixing', category: 'wip' },
    { name: 'parked', category: 'active' },
  ],
};
/** Un Projet qui relit et intègre, mais n'a pas À valider. */
const WITHOUT_GATE: DeclaredStatuses = { handoff: ['in_review', 'in_integration'], others: [] };

function ticket(id: string, statuses: [string, number][], extra: Partial<MetricsTicket> = {}): MetricsTicket {
  return {
    id,
    title: `Titre de ${id}`,
    type: 'task',
    priority: 2,
    statusSnapshots: statuses.map(([status, at]) => ({ status, at: new Date(at) })),
    dependencies: [],
    ...extra,
  };
}

/** Un ticket dont les statuts se suivent de jour en jour, le dernier il y a `last` jours. */
const daily = (id: string, statuses: string[], last = 1, extra: Partial<MetricsTicket> = {}) =>
  ticket(id, statuses.map((status, i): [string, number] => [status, ago(last + statuses.length - 1 - i)]), extra);

/** Doublon de `target` : un Abandon. */
const duplicateOf = (target: string): DependencyHistory => ({ type: 'duplicates', target, addedAt: new Date(ago(10)) });

/** Un bug créé il y a `days` jours, découvert à partir de `target`. */
const bugFrom = (id: string, target: string, days: number) =>
  ticket(id, [['open', ago(days)]], { type: 'bug', dependencies: [{ type: 'discovered-from', target, addedAt: new Date(ago(days)) }] });

const project = (tickets: MetricsTicket[], declared: DeclaredStatuses = DECLARED, id = 'p'): MetricsInput => ({
  id,
  name: `Projet ${id}`,
  analysis: analyzeProject(tickets, declared),
});

/** Les Décisions de chaque ticket du Projet, par identifiant. */
function decided(tickets: MetricsTicket[], declared: DeclaredStatuses = DECLARED): Record<string, Decision[]> {
  const { analysis } = project(tickets, declared);
  return Object.fromEntries(analysis.tickets.map((t) => [t.id, decisionsOf(t.timeline.steps, t, declared)]));
}

const decisionsIn = (projects: MetricsInput[], period: PeriodSpec = { range: '7d' }) =>
  computeDecisions(projects, { period, now: new Date(NOW), timeZone: PARIS });

const NONE: MetricsDecisionTally = {
  total: 0,
  greenLights: { total: 0, held: 0, contradicted: 0 },
  rejections: { total: 0, held: 0, contradicted: 0 },
  reruns: 0,
  postponements: 0,
};

/** Chaque sens, selon le statut d'arrivée, et ce qu'il faut au ticket pour que sa clôture soit, ou non, une Livraison. */
const SENSES: Array<[string, string, Partial<MetricsTicket>, Decision['sense']]> = [
  ['un Feu vert, vers une clôture qui est une Livraison', 'closed', {}, 'greenLight'],
  ['un Feu vert, vers En intégration', 'in_integration', {}, 'greenLight'],
  ['un Refus, vers une clôture en Renoncement', 'closed', { labels: ['declined'] }, 'rejection'],
  ['un Refus, vers une clôture en Abandon', 'closed', { dependencies: [duplicateOf('x')] }, 'rejection'],
  ['une Relance, vers en cours', 'in_progress', {}, 'rerun'],
  ['une Relance, vers rattaché à un agent', 'hooked', {}, 'rerun'],
  ['une Relance, vers un statut que le Projet déclare `wip`', 'fixing', {}, 'rerun'],
  ['une Relance, vers En relecture', 'in_review', {}, 'rerun'],
  ['un Report, vers ouvert', 'open', {}, 'postponement'],
  ['un Report, vers différé', 'deferred', {}, 'postponement'],
  ['un Report, vers bloqué', 'blocked', {}, 'postponement'],
  ['un Report, vers épinglé', 'pinned', {}, 'postponement'],
  ['un Report, vers un statut que le Projet déclare `active`', 'parked', {}, 'postponement'],
];

describe('les Décisions d’un ticket', () => {
  it.each(SENSES)('%s', (_case, to, extra, sense) => {
    const judged = sense === 'greenLight' || sense === 'rejection';
    expect(decided([daily('t', ['open', 'in_progress', 'awaiting_human', to], 1, extra)]).t).toEqual([{ at: ago(1), sense, ...(judged ? { held: true } : {}) }]);
  });

  it('un statut personnalisé que le Projet ne déclare pas `wip` reste « En pause » : y aller est un Report, pas une Relance', () => {
    expect(decided([daily('t', ['open', 'awaiting_human', 'fixing'])], NO_DECLARED_STATUSES).t).toEqual([{ at: ago(1), sense: 'postponement' }]);
  });

  it('aucune Décision pour un ticket qui n’est jamais passé À valider, une par sortie pour celui qui y passe plusieurs fois', () => {
    const tickets = [
      daily('jamais', ['open', 'in_progress', 'in_review', 'in_integration', 'closed']),
      daily('deux', ['open', 'in_progress', 'awaiting_human', 'in_progress', 'awaiting_human', 'closed']),
      // Créé À valider : sa création n'est pas une Transition, mais il en sort par une Décision.
      daily('cree', ['awaiting_human', 'open']),
    ];

    expect(decided(tickets)).toEqual({
      jamais: [],
      deux: [
        { at: ago(3), sense: 'rerun' },
        { at: ago(1), sense: 'greenLight', held: true },
      ],
      cree: [{ at: ago(1), sense: 'postponement' }],
    });
  });
});

describe('Décision tenue', () => {
  it('un Feu vert vers En intégration suivi d’un Retour d’intégration n’est pas démenti : la chaîne a fait son travail', () => {
    const tickets = [daily('t', ['open', 'in_progress', 'awaiting_human', 'in_integration', 'in_progress', 'in_integration', 'closed'])];

    expect(decided(tickets).t).toEqual([{ at: ago(4), sense: 'greenLight', held: true }]);
  });

  it('un Feu vert vers En intégration dont la PR est encore ouverte : rien ne l’a démenti', () => {
    expect(decided([daily('t', ['open', 'awaiting_human', 'in_integration'])]).t).toEqual([{ at: ago(1), sense: 'greenLight', held: true }]);
  });

  it('un Feu vert est démenti quand la Livraison qui le suit reçoit un Bug d’origine, pas par un bug trouvé avant elle', () => {
    const tickets = [
      daily('livre', ['open', 'in_progress', 'awaiting_human', 'closed'], 3),
      bugFrom('apres', 'livre', 2),
      daily('integre', ['open', 'awaiting_human', 'in_integration', 'closed'], 3),
      bugFrom('apres2', 'integre', 1),
      daily('sain', ['open', 'in_progress', 'awaiting_human', 'closed'], 3),
      bugFrom('avant', 'sain', 4), // trouvé en cours de travail : l'origine d'aucun échec
    ];

    const decisions = decided(tickets);
    expect(decisions.livre).toEqual([{ at: ago(3), sense: 'greenLight', held: false }]);
    expect(decisions.integre).toEqual([{ at: ago(4), sense: 'greenLight', held: false }]);
    expect(decisions.sain).toEqual([{ at: ago(3), sense: 'greenLight', held: true }]);
  });

  it('un Feu vert est démenti quand la Livraison qui le suit est rouverte ; le nouveau Feu vert, lui, est tenu', () => {
    const tickets = [daily('t', ['open', 'awaiting_human', 'in_integration', 'closed', 'in_progress', 'awaiting_human', 'closed'])];

    expect(decided(tickets).t).toEqual([
      { at: ago(5), sense: 'greenLight', held: false },
      { at: ago(1), sense: 'greenLight', held: true },
    ]);
  });

  it('un Feu vert vers En intégration suivi d’un Abandon ou d’un Renoncement n’est pas démenti, rouvert ou non : aucune Livraison ne le suit', () => {
    const reopened = ['open', 'awaiting_human', 'in_integration', 'closed', 'open'];
    const tickets = [
      daily('abandon', reopened, 1, { dependencies: [duplicateOf('x')] }),
      daily('renoncement', reopened, 1, { labels: ['declined'] }),
      daily('abandon-ferme', reopened.slice(0, -1), 1, { dependencies: [duplicateOf('x')] }),
    ];

    expect(decided(tickets)).toEqual({
      abandon: [{ at: ago(3), sense: 'greenLight', held: true }],
      renoncement: [{ at: ago(3), sense: 'greenLight', held: true }],
      'abandon-ferme': [{ at: ago(2), sense: 'greenLight', held: true }],
    });
  });

  it('un Refus est démenti quand le ticket est rouvert, tenu sinon', () => {
    const tickets = [
      daily('rouvert', ['open', 'awaiting_human', 'closed', 'open'], 1, { dependencies: [duplicateOf('x')] }),
      daily('tenu', ['open', 'awaiting_human', 'closed'], 1, { labels: ['declined'] }),
    ];

    expect(decided(tickets)).toEqual({
      rouvert: [{ at: ago(2), sense: 'rejection', held: false }],
      tenu: [{ at: ago(1), sense: 'rejection', held: true }],
    });
  });

  it('un Report vers ouvert n’est pas une Prise rendue : il n’entre pas dans le Retravail, quand un retour d’En relecture à ouvert y entre', () => {
    const projects = [project([daily('reporte', ['open', 'in_progress', 'awaiting_human', 'open']), daily('rendu', ['open', 'in_progress', 'in_review', 'open'])])];

    expect(decisionsIn(projects)).toMatchObject({ total: 1, postponements: 1 });
    const { rework } = computeHealth(projects, { period: { range: '7d' }, now: new Date(NOW), timeZone: PARIS });
    expect(rework.tickets.map(({ id, returns }) => [id, returns])).toEqual([['rendu', 1]]);
  });
});

describe('Livraison passée par la chaîne', () => {
  it('au moins un Statut de relais depuis sa dernière Réouverture, ou depuis sa création', () => {
    const statuses = (...names: string[]) => names.map((status) => ({ status }));

    expect(throughChain(statuses('open', 'in_progress', 'in_review', 'closed'))).toBe(true);
    expect(throughChain(statuses('in_integration', 'closed'))).toBe(true); // créé dans un Statut de relais
    expect(throughChain(statuses('open', 'in_progress', 'closed'))).toBe(false); // fait à la main
    expect(throughChain(statuses('open', 'awaiting_human', 'closed', 'in_progress', 'closed'))).toBe(false); // à la main depuis sa Réouverture
    expect(throughChain(statuses('open', 'in_progress', 'closed', 'awaiting_human', 'closed'))).toBe(true); // rouvert dans la chaîne
  });
});

describe('les Décisions de la période', () => {
  it('compte chaque sens, et les Feux verts et les Refus tenus ou démentis', () => {
    const tickets = [
      daily('fv', ['open', 'awaiting_human', 'closed']),
      daily('fv-bug', ['open', 'awaiting_human', 'closed'], 3),
      bugFrom('b', 'fv-bug', 2),
      daily('refus', ['open', 'awaiting_human', 'closed', 'open'], 1, { labels: ['declined'] }),
      daily('relance', ['open', 'awaiting_human', 'in_progress', 'awaiting_human', 'in_review']),
      daily('report', ['open', 'awaiting_human', 'deferred']),
    ];

    expect(decisionsIn([project(tickets)])).toMatchObject({
      total: 6,
      greenLights: { total: 2, held: 1, contradicted: 1 },
      rejections: { total: 1, held: 0, contradicted: 1 },
      reruns: 2,
      postponements: 1,
    });
  });

  it('date une Décision de sa Transition : celle d’avant la période n’y compte pas, même si la Livraison y tombe', () => {
    // Période passée du lundi 19 au mercredi 21 octobre à Paris : de 22:00Z le 18 à 22:00Z le 21.
    const past = { from: '2026-10-19', to: '2026-10-21' };
    const tickets = [
      ticket('avant', [['open', ago(9)], ['awaiting_human', ago(8)], ['in_progress', ago(7)], ['closed', ago(3)]]),
      ticket('dedans', [['open', ago(9)], ['awaiting_human', ago(4)], ['closed', ago(3)]]),
      ticket('apres', [['open', ago(9)], ['awaiting_human', ago(2)], ['closed', ago(1)]]),
    ];

    const decisions = decisionsIn([project(tickets)], past);
    expect(decisions).toMatchObject({ total: 1, greenLights: { total: 1, held: 1 }, reruns: 0 });
    // La période est finie : rien ne la dit provisoire.
    expect(decisions.provisional).toBe(false);
    expect(decisionsIn([project(tickets)]).provisional).toBe(true);
  });

  it('un Projet qui n’a pas À valider n’a aucune Décision, et pas de Coût d’attention, même avec des Livraisons relues et intégrées', () => {
    const tickets = [daily('relu', ['open', 'in_progress', 'in_review', 'in_integration', 'closed']), daily('main', ['open', 'in_progress', 'closed'])];

    const decisions = decisionsIn([project(tickets, WITHOUT_GATE)]);
    expect(decisions).toMatchObject({ ...NONE, provisional: true, attentionCost: { deliveries: 0, decisions: 0, perDelivery: null } });
    expect(decisions.weeks).toHaveLength(12);
    expect(decisions.weeks.every((week) => week.total === 0 && week.attentionCost.perDelivery === null)).toBe(true);
    // Un Projet qui ne déclare rien, sans Statut de relais : de même.
    expect(decisionsIn([project(tickets, NO_DECLARED_STATUSES)])).toMatchObject({ ...NONE, attentionCost: { deliveries: 0, perDelivery: null } });
  });
});

describe('Coût d’attention', () => {
  it('les Décisions qu’ont demandées les Livraisons passées par la chaîne, par Livraison : chaque Relance l’augmente', () => {
    const tickets = [
      // Relancée une fois, puis Feu vert : deux Décisions.
      daily('relancee', ['open', 'in_progress', 'in_review', 'awaiting_human', 'in_progress', 'awaiting_human', 'closed']),
      // Passée par la chaîne sans passer À valider : aucune Décision, mais elle compte.
      daily('sans-feu-vert', ['open', 'in_progress', 'in_review', 'closed']),
      // Relancée il y a 10 jours, avant la période, livrée dedans : ses deux Décisions comptent, à la période de sa Livraison.
      ticket('ancienne', [['open', ago(12)], ['in_progress', ago(11)], ['awaiting_human', ago(10.5)], ['in_progress', ago(10)], ['awaiting_human', ago(2)], ['closed', ago(1)]]),
      // Faite à la main : pas passée par la chaîne.
      daily('main', ['open', 'in_progress', 'closed']),
      // Passée par la chaîne avant sa Réouverture, à la main depuis : pas passée par la chaîne.
      daily('reprise', ['open', 'in_review', 'awaiting_human', 'closed', 'in_progress', 'closed']),
      // Un Refus n'est pas une Livraison : sa Décision compte dans la période, pas dans le Coût d'attention.
      daily('refus', ['open', 'in_review', 'awaiting_human', 'closed'], 1, { labels: ['declined'] }),
    ];

    const decisions = decisionsIn([project(tickets)]);
    expect(decisions.attentionCost).toEqual({ deliveries: 3, decisions: 4, perDelivery: 4 / 3 });
    // Les Décisions de la période, elles, sont datées de leur Transition : celle d'il y a 10 jours n'y est pas.
    expect(decisions.total).toBe(2 + 1 + 1 + 1);
  });

  it('dans la Vue globale, ne compte que les Livraisons des Projets qui ont À valider, déclaré ou porté par un ticket', () => {
    const gated = project([daily('a', ['open', 'in_review', 'awaiting_human', 'in_progress', 'awaiting_human', 'closed'])], DECLARED, 'gated');
    // Ne déclare pas À valider, mais un ticket l'a porté (la déclaration a été retirée) : il a la porte humaine (ADR 0007).
    const carried = project([daily('c', ['open', 'awaiting_human', 'closed'])], WITHOUT_GATE, 'carried');
    // Relit sans jamais faire valider : ses Livraisons n'entrent pas dans le Coût d'attention.
    const ungated = project([daily('u1', ['open', 'in_review', 'closed']), daily('u2', ['open', 'in_review', 'closed'])], WITHOUT_GATE, 'ungated');

    const decisions = decisionsIn([gated, carried, ungated]);
    expect(decisions).toMatchObject({ total: 3, greenLights: { total: 2, held: 2 }, reruns: 1 });
    expect(decisions.attentionCost).toEqual({ deliveries: 2, decisions: 3, perDelivery: 1.5 });
  });
});

describe('les 12 semaines', () => {
  it('les semaines de la Tendance longue, la dernière en cours ; chacune ses Décisions et son Coût d’attention, quelle que soit la période', () => {
    const tickets = [
      // Lundi 12 octobre : relancé, puis Feu vert le mardi 13, livré le jour même.
      ticket('w11', [
        ['open', Date.parse('2026-10-12T08:00:00Z')],
        ['awaiting_human', Date.parse('2026-10-12T09:00:00Z')],
        ['in_progress', Date.parse('2026-10-12T10:00:00Z')],
        ['awaiting_human', Date.parse('2026-10-13T09:00:00Z')],
        ['closed', Date.parse('2026-10-13T10:00:00Z')],
      ]),
      // Cette semaine : un Report.
      daily('w12', ['open', 'awaiting_human', 'open']),
      // Après maintenant (l'horloge d'un commit en avance) : pas encore arrivé.
      ticket('futur', [['open', ago(1)], ['awaiting_human', NOW + 3_600_000], ['closed', NOW + 7_200_000]]),
    ];

    const { weeks } = decisionsIn([project(tickets)], { range: '30d' });
    expect(weeks.map((week) => week.from)).toEqual([
      '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07',
      '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19',
    ]);
    expect(weeks.at(-1)).toMatchObject({ to: '2026-10-25', start: '2026-10-18T22:00:00.000Z', end: '2026-10-25T23:00:00.000Z', partial: true });
    expect(weeks.at(-2)).toMatchObject({
      partial: false,
      ...NONE,
      total: 2,
      reruns: 1,
      greenLights: { total: 1, held: 1, contradicted: 0 },
      attentionCost: { deliveries: 1, decisions: 2, perDelivery: 2 },
    });
    expect(weeks.at(-1)).toMatchObject({ ...NONE, total: 1, postponements: 1, attentionCost: { deliveries: 0, perDelivery: null } });
    expect(decisionsIn([project(tickets)], { range: '7d' }).weeks).toEqual(weeks);
  });
});

/** Le même ticket, ses critères d'acceptation renseignés (true) ou vides (false) dans chacun de ses instantanés. */
const withCriteria = (t: MetricsTicket, hasAcceptanceCriteria: boolean): MetricsTicket => ({
  ...t,
  statusSnapshots: t.statusSnapshots.map((snapshot) => ({ ...snapshot, hasAcceptanceCriteria })),
});
/** Une Intention écrite : ses critères d'acceptation sont renseignés dès son premier démarrage. */
const intended = (t: MetricsTicket) => withCriteria(t, true);

/** Ce qui manque à chaque Livraison du Projet (`missingEvidence`), par identifiant ; null pour celle qui n'est pas passée par la chaîne. */
function missingOf(tickets: MetricsTicket[], declared: DeclaredStatuses = DECLARED): Record<string, MetricsEvidence[] | null> {
  const { analysis } = project(tickets, declared);
  return Object.fromEntries(analysis.tickets.filter((t) => t.deliveredAt !== null).map((t) => [t.id, missingEvidence(t.timeline.steps, t, declared)]));
}

/** Toute la chaîne : démarré, relu, validé vers En intégration, livré. */
const CHAIN = ['open', 'in_progress', 'in_review', 'awaiting_human', 'in_integration', 'closed'];
/** Relu et intégré, sans jamais passer À valider. */
const UNGATED = ['open', 'in_progress', 'in_review', 'in_integration', 'closed'];

describe('Livraison prouvée et Livraison sans Feu vert', () => {
  it('une chaîne complète, avec une Intention écrite : une Livraison prouvée', () => {
    expect(missingOf([intended(daily('t', CHAIN))]).t).toEqual([]);
    // Validée après l'intégration, d'un Feu vert vers la clôture : prouvée de même.
    expect(missingOf([intended(daily('t', ['open', 'in_progress', 'in_review', 'in_integration', 'awaiting_human', 'closed']))]).t).toEqual([]);
    // Créée En relecture : sa création est un Tour de relecture, et son premier démarrage.
    expect(missingOf([intended(daily('t', ['in_review', 'awaiting_human', 'in_integration', 'closed']))]).t).toEqual([]);
  });

  it.each<[string, MetricsTicket, MetricsEvidence[]]>([
    ['sans Intention écrite : critères vides au premier démarrage', withCriteria(daily('t', CHAIN), false), ['writtenIntent']],
    ['sans Intention écrite lisible : l’historique ne dit pas ses critères, rien ne la prouve', daily('t', CHAIN), ['writtenIntent']],
    ['sans Tour de relecture', intended(daily('t', ['open', 'in_progress', 'awaiting_human', 'in_integration', 'closed'])), ['reviewRound']],
    ['sans passage En intégration', intended(daily('t', ['open', 'in_progress', 'in_review', 'awaiting_human', 'closed'])), ['integration']],
    ['sans Feu vert : jamais passée À valider', intended(daily('t', UNGATED)), ['greenLight']],
    ['sans Feu vert : relancée depuis À valider, puis fermée sans y revenir', intended(daily('t', [...UNGATED.slice(0, -1), 'awaiting_human', 'in_progress', 'closed'])), ['greenLight']],
    [
      'sans rien d’autre qu’un passage À valider, reporté',
      daily('t', ['open', 'in_progress', 'awaiting_human', 'open', 'in_progress', 'closed']),
      ['writtenIntent', 'reviewRound', 'integration', 'greenLight'],
    ],
  ])('%s', (_case, delivered, missing) => {
    expect(missingOf([delivered]).t).toEqual(missing);
  });

  it('un Feu vert reçu avant une Réouverture ne prouve pas la Livraison qui suit : sans nouveau Feu vert, elle est sans Feu vert', () => {
    const reopened = intended(daily('t', [...CHAIN, 'in_progress', 'in_review', 'in_integration', 'closed']));

    expect(missingOf([reopened]).t).toEqual(['greenLight']);
    expect(decisionsIn([project([reopened])]).evidencedDeliveries.withoutGreenLight.map(({ id }) => id)).toEqual(['t']);
    // Le Tour de relecture et le passage En intégration se lisent de même depuis la dernière Réouverture.
    expect(missingOf([intended(daily('t', [...CHAIN, 'in_progress', 'awaiting_human', 'closed']))]).t).toEqual(['reviewRound', 'integration']);
    // Rouverte droit En relecture : cette Transition est un Tour de relecture de la nouvelle Livraison.
    expect(missingOf([intended(daily('t', ['open', 'in_progress', 'closed', 'in_review', 'awaiting_human', 'in_integration', 'closed']))]).t).toEqual([]);
  });

  it('le travail fait à la main, hors chaîne, n’est ni prouvé ni sans Feu vert', () => {
    const tickets = [
      intended(daily('main', ['open', 'in_progress', 'closed'])),
      // Passée par la chaîne et validée avant sa Réouverture, reprise à la main depuis.
      intended(daily('reprise', [...CHAIN, 'in_progress', 'closed'])),
    ];

    expect(missingOf(tickets)).toEqual({ main: null, reprise: null });
    expect(decisionsIn([project(tickets)]).evidencedDeliveries).toEqual({
      deliveries: 0,
      evidenced: 0,
      share: null,
      missing: { writtenIntent: 0, reviewRound: 0, integration: 0, greenLight: 0 },
      mostMissing: null,
      withoutGreenLight: [],
    });
  });

  it('par période : la part des Livraisons prouvées parmi celles passées par la chaîne, ce qui leur manque, et les Livraisons sans Feu vert', () => {
    const tickets = [
      intended(daily('prouvee', CHAIN, 1)),
      // Validée il y a 10 jours, avant la période, livrée dedans : prouvée, à la période de sa dernière clôture.
      intended(
        ticket('ancienne', [['open', ago(12)], ['in_progress', ago(11)], ['in_review', ago(10.5)], ['awaiting_human', ago(10)], ['in_integration', ago(9)], ['closed', ago(1)]]),
      ),
      intended(daily('sans-relecture', ['open', 'in_progress', 'awaiting_human', 'in_integration', 'closed'], 3)),
      intended(daily('sans-feu-vert', UNGATED, 2)),
      // Relue seulement, sans critères lisibles : il lui manque l'Intention écrite, l'intégration et le Feu vert.
      daily('relue', ['open', 'in_progress', 'in_review', 'closed'], 4),
      // Faite à la main : hors du compte.
      intended(daily('main', ['open', 'in_progress', 'closed'])),
      // Livrée il y a 9 jours, avant la période : ni dans le compte, ni dans la liste.
      intended(daily('avant', UNGATED, 9)),
      // Refusée au bout de la chaîne, ou encore en cours : pas des Livraisons.
      intended(daily('refus', ['open', 'in_progress', 'in_review', 'awaiting_human', 'closed'], 1, { labels: ['declined'] })),
      intended(daily('en-cours', ['open', 'in_progress', 'in_review'])),
    ];

    expect(decisionsIn([project(tickets)]).evidencedDeliveries).toEqual({
      deliveries: 5,
      evidenced: 2,
      share: 2 / 5,
      missing: { writtenIntent: 1, reviewRound: 1, integration: 1, greenLight: 2 },
      mostMissing: 'greenLight',
      // De la plus récente à la plus ancienne.
      withoutGreenLight: [
        { id: 'sans-feu-vert', title: 'Titre de sans-feu-vert', type: 'task', priority: 2, project: 'p', deliveredAt: new Date(ago(2)).toISOString() },
        { id: 'relue', title: 'Titre de relue', type: 'task', priority: 2, project: 'p', deliveredAt: new Date(ago(4)).toISOString() },
      ],
    });
  });

  it('l’élément manquant le plus fréquent : à égalité, le premier dans l’ordre de la chaîne ; aucun quand rien ne manque', () => {
    const tie = [intended(daily('sans-feu-vert', UNGATED)), intended(daily('sans-integration', ['open', 'in_progress', 'in_review', 'awaiting_human', 'closed']))];

    expect(decisionsIn([project(tie)]).evidencedDeliveries).toMatchObject({
      missing: { writtenIntent: 0, reviewRound: 0, integration: 1, greenLight: 1 },
      mostMissing: 'integration',
    });
    expect(decisionsIn([project([intended(daily('prouvee', CHAIN))])]).evidencedDeliveries).toMatchObject({
      deliveries: 1,
      evidenced: 1,
      share: 1,
      mostMissing: null,
      withoutGreenLight: [],
    });
  });

  it('dans la Vue globale, seules comptent les Livraisons des Projets qui ont À valider, comme pour le Coût d’attention', () => {
    const gated = project([intended(daily('a', CHAIN, 2)), intended(daily('b', UNGATED, 1))], DECLARED, 'gated');
    const ungated = project([intended(daily('u', UNGATED, 1))], WITHOUT_GATE, 'ungated');

    const { evidencedDeliveries, attentionCost } = decisionsIn([ungated, gated]);
    // La Livraison du Projet sans À valider, qui ne pouvait recevoir aucun Feu vert, n'entre ni dans la part ni dans la liste.
    expect(evidencedDeliveries).toMatchObject({ deliveries: 2, evidenced: 1, share: 1 / 2, mostMissing: 'greenLight' });
    expect(evidencedDeliveries.withoutGreenLight.map(({ project, id }) => [project, id])).toEqual([['gated', 'b']]);
    // Le Coût d'attention compte les mêmes Livraisons.
    expect(attentionCost.deliveries).toBe(2);
  });
});

describe('Carte des Décisions (bdesk-3e9.7)', () => {
  /** Les cases non vides d'une carte, `jour-heure` (0 pour le lundi) : leur compte. */
  const filled = (cells: number[][]) =>
    Object.fromEntries(cells.flatMap((hours, weekday) => hours.flatMap((count, hour) => (count === 0 ? [] : [[`${weekday}-${hour}`, count]]))));
  const at = (iso: string) => Date.parse(`${iso}Z`);

  it('range chaque Décision de la période au jour et à l’heure de sa Transition, dans le Fuseau de l’utilisateur', () => {
    // Mardi 20 octobre 2026 à Paris (UTC+2) : une Relance à 07:15Z (9 h), un Feu vert à 21:40Z (23 h). Mercredi 21 à 23:10Z, c'est déjà jeudi 1 h à Paris.
    const tickets = [
      ticket('a', [
        ['open', at('2026-10-19T08:00')],
        ['awaiting_human', at('2026-10-20T06:00')],
        ['in_progress', at('2026-10-20T07:15')],
        ['awaiting_human', at('2026-10-20T20:00')],
        ['closed', at('2026-10-20T21:40')],
      ]),
      ticket('b', [['open', at('2026-10-19T08:00')], ['awaiting_human', at('2026-10-21T20:00')], ['deferred', at('2026-10-21T23:10')]]),
      // Une Transition qui n'est pas une Décision (l'entrée À valider, le démarrage) n'est pas sur la carte.
      ticket('c', [['open', at('2026-10-19T08:00')], ['in_progress', at('2026-10-20T10:00')], ['awaiting_human', at('2026-10-20T11:00')]]),
    ];

    const decisions = decisionsIn([project(tickets)]);
    expect(filled(decisions.decisionMap.cells)).toEqual({ '1-9': 1, '1-23': 1, '3-1': 1 });
    expect(decisions.decisionMap.total).toBe(3);
    // La carte range les Décisions de la période, ni plus ni moins.
    expect(decisions.decisionMap.total).toBe(decisions.total);

    // En UTC, les mêmes Décisions tombent ailleurs : la carte suit le fuseau demandé.
    const utc = computeDecisions([project(tickets)], { period: { range: '7d' }, now: new Date(NOW), timeZone: 'UTC' });
    expect(filled(utc.decisionMap.cells)).toEqual({ '1-7': 1, '1-21': 1, '2-23': 1 });
  });

  it('lit l’heure du mur au changement d’heure : 02:30 revient deux fois le dimanche 25 octobre, aux deux décalages', () => {
    const now = new Date('2026-10-27T12:00:00Z');
    const tickets = [
      ticket('a', [
        ['open', at('2026-10-24T10:00')],
        ['awaiting_human', at('2026-10-25T00:00')],
        ['in_progress', at('2026-10-25T00:30')], // 02:30 en heure d'été (UTC+2) : une Relance
        ['awaiting_human', at('2026-10-25T01:00')],
        ['in_review', at('2026-10-25T01:30')], // 02:30 en heure d'hiver (UTC+1) : une Relance
        ['awaiting_human', at('2026-10-25T02:00')],
        ['closed', at('2026-10-25T02:30')], // 03:30 : un Feu vert
      ]),
    ];

    const { decisionMap, total } = computeDecisions([project(tickets)], { period: { from: '2026-10-24', to: '2026-10-26' }, now, timeZone: PARIS });
    expect(filled(decisionMap.cells)).toEqual({ '6-2': 2, '6-3': 1 });
    expect(decisionMap.total).toBe(total);
  });

  it('une période sans Décision a une carte vide : 7 jours de 24 heures à zéro', () => {
    // Une Décision il y a 9 jours, avant la période : elle n'y est pas.
    const tickets = [ticket('avant', [['open', ago(10)], ['awaiting_human', ago(9.5)], ['closed', ago(9)]]), daily('main', ['open', 'in_progress', 'closed'])];

    const { decisionMap } = decisionsIn([project(tickets)]);
    expect(decisionMap.total).toBe(0);
    expect(decisionMap.cells).toHaveLength(7);
    expect(decisionMap.cells.every((hours) => hours.length === 24 && hours.every((count) => count === 0))).toBe(true);
  });
});
