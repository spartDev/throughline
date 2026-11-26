/**
 * Zone « metrics », groupes de l'onglet Décisions (bdesk-3e9.7, voir `../metrics.ts`) : les onglets de la page (`metrics/MetricsTabs.tsx`), les sections de
 * l'onglet et leurs tuiles et cartes (`metrics/DecisionsTab.tsx`), et la Carte des Décisions (`metrics/ActivityMap.tsx`). Leur aide est avec celle des autres
 * tuiles (`metricHelp`, `tiles.ts`). Les nombres, pourcentages et dates arrivent écrits ; un nombre brut ne sert qu'au pluriel.
 */
const fr = {
  /** Les onglets de la page, quand un Projet de la vue a les Statuts de relais. */
  metricsTabs: {
    label: 'Vues des métriques',
    decisions: 'Décisions',
    flow: 'Flux',
  },
  /** Les sections de l'onglet Décisions, dans leur ordre. */
  decisionsTab: {
    heldHeading: 'Décisions tenues',
    heldIntro:
      'Ce que vous avez décidé des tickets À valider, et ce que l’historique en dit depuis : un Feu vert ou un Refus est tenu tant que rien ne l’a démenti.',
    evidencedHeading: 'Livraisons prouvées',
    evidencedIntro:
      'Les Livraisons passées par la chaîne qui en portent toutes les preuves : une Intention écrite, un Tour de relecture, un passage En intégration et votre Feu vert.',
    attentionHeading: 'Coût d’attention',
    attentionIntro: 'Combien de Décisions, en moyenne, une Livraison passée par la chaîne vous a demandées.',
    intentHeading: 'Intention',
    intentIntro: 'L’Acceptation au premier passage des Livraisons relues de la période, selon qu’elles avaient une Intention écrite à leur premier démarrage.',
    clocksHeading: 'Les deux horloges',
    clocksIntro: 'Quand le travail avance (les Transitions) et quand vous décidez (les Décisions), par jour de la semaine et par heure, à la même échelle de lecture.',
  },
  /** La tuile des Décisions tenues de la période et la carte des 12 semaines. */
  heldDecisions: {
    title: 'Décisions tenues',
    /** Les Feux verts et les Refus, seuls à pouvoir être tenus ou démentis. */
    judged: (n: number, count: string) => (n === 0 ? 'aucun Feu vert ni Refus' : `${count} ${n >= 2 ? 'Feux verts et Refus' : 'Feu vert ou Refus'}`),
    /** Sous la valeur : `judged` est déjà écrit, `percent` la part tenue. */
    heldOf: (judged: string, percent: string) => `sur ${judged}, ${percent}`,
    none: 'Aucun Feu vert ni Refus sur la période.',
    /** Le détail par sens : « Feux verts : 10 tenus sur 11 ». */
    greenLights: (held: string, total: string) => `Feux verts : ${held} tenus sur ${total}`,
    rejections: (held: string, total: string) => `Refus : ${held} tenus sur ${total}`,
    provisional: 'Provisoire : la période court, et ses Décisions n’ont pas toutes eu le temps d’être démenties.',
    weeklyTitle: 'Décisions tenues par semaine',
    weeklyDescription:
      'Les Feux verts et les Refus de chacune des 12 dernières semaines, du lundi au dimanche, quelle que soit la période choisie, et ceux que rien n’a démentis depuis. Chaque semaine est comptée seule, sans lissage.',
    weeklyLegend: 'Légende des Décisions tenues par semaine',
    judgedPlot: 'Feux verts et Refus',
    heldPlot: 'Tenus',
    partial: 'Semaine en cours',
    weeklyEmpty: 'Aucun Feu vert ni Refus sur les 12 dernières semaines.',
    judgedLabel: (judged: string, weeks: string) => `Feux verts et Refus par semaine : ${judged} sur ${weeks} semaines.`,
    held: (n: number, count: string) => (n === 0 ? 'aucun tenu' : `${count} ${n >= 2 ? 'tenus' : 'tenu'}`),
    heldLabel: (held: string, weeks: string) => `Décisions tenues par semaine : ${held} sur ${weeks} semaines.`,
    /** Les Décisions tenues de la semaine en cours, dans l'infobulle de sa barre : `value` est déjà écrit (« 3 tenus »). */
    provisionalPoint: (value: string) => `${value}, provisoire : rien ne les a encore démentis`,
    caption: 'Décisions, Feux verts, Refus et Décisions tenues de chacune des 12 dernières semaines',
    weekColumn: 'Semaine',
    decisionsColumn: 'Décisions',
    greenLightsColumn: 'Feux verts',
    rejectionsColumn: 'Refus',
    heldColumn: 'Tenues',
    contradictedColumn: 'Démenties',
    remarkColumn: 'Remarque',
    inProgress: 'En cours',
    heldProvisional: 'Décisions tenues provisoires',
    remarkSeparator: ', ',
  },
  /** La répartition par sens des Décisions de la période. */
  decisionSenses: {
    title: 'Décisions par sens',
    caption: 'Décisions de la période',
    none: 'Aucune Décision sur la période.',
    list: 'Décisions de la période selon leur sens',
    senses: { greenLights: 'Feux verts', reruns: 'Relances', rejections: 'Refus', postponements: 'Reports' },
    /** Le nom de ce qu'une ligne compte, pour les lecteurs d'écran : l'écran n'écrit que le nombre. */
    noun: (n: number): string => (n >= 2 ? 'Décisions' : 'Décision'),
  },
  /** Les Renoncements de la période, à côté des Décisions par sens. */
  declines: {
    title: 'Renoncements',
    caption: 'Tickets fermés que vous avez décidé de ne pas faire',
  },
  /** La tuile des Livraisons prouvées de la période. */
  evidenced: {
    title: 'Livraisons prouvées',
    chained: (n: number, count: string) => `${count} ${n >= 2 ? 'passées par la chaîne' : 'passée par la chaîne'}`,
    /** Sous la valeur : « 6 sur 9 prouvées ». */
    evidencedOf: (evidenced: string, deliveries: string) => `${evidenced} sur ${deliveries} prouvées`,
    none: 'Aucune Livraison passée par la chaîne sur la période.',
    /** `evidence` : le nom de la preuve, déjà écrit. */
    mostMissing: (evidence: string) => `Le plus souvent, il manque : ${evidence}.`,
    allEvidenced: 'Aucune preuve ne manque.',
    missingList: 'Livraisons auxquelles manque chaque preuve',
    evidence: { writtenIntent: 'Intention écrite', reviewRound: 'Tour de relecture', integration: 'Passage En intégration', greenLight: 'Feu vert' },
    deliveriesNoun: (n: number): string => (n >= 2 ? 'Livraisons' : 'Livraison'),
  },
  /** La liste des Livraisons sans Feu vert, de la même forme que celle du Retravail. */
  withoutGreenLight: {
    title: 'Livraisons sans Feu vert',
    description: 'Les Livraisons de la période passées par la chaîne qui ont été fermées sans votre Feu vert depuis leur dernière Réouverture. De la plus récente à la plus ancienne.',
    list: 'Livraisons sans Feu vert de la période',
    /** `day` : le jour de la Livraison, déjà écrit. */
    deliveredOn: (day: string) => `Livrée le ${day}`,
    empty: 'Toutes les Livraisons passées par la chaîne ont reçu votre Feu vert sur la période.',
    noChained: 'Aucune Livraison passée par la chaîne sur la période.',
  },
  /** La tuile du Coût d'attention de la période et la carte des 12 semaines. */
  attentionCost: {
    title: 'Coût d’attention',
    caption: 'Décisions par Livraison passée par la chaîne',
    chained: (n: number, count: string) => `${count} ${n >= 2 ? 'Livraisons' : 'Livraison'}`,
    detail: (decisions: string, n: number, deliveries: string) => `${decisions} ${n >= 2 ? 'Décisions' : 'Décision'} pour ${deliveries}`,
    none: 'Aucune Livraison passée par la chaîne sur la période.',
    weeklyTitle: 'Coût d’attention par semaine',
    weeklyDescription:
      'Le Coût d’attention de chacune des 12 dernières semaines, du lundi au dimanche, quelle que soit la période choisie : les Décisions qu’ont demandées les Livraisons passées par la chaîne de la semaine, par Livraison, sans lissage.',
    weeklyEmpty: 'Aucune Livraison passée par la chaîne sur les 12 dernières semaines.',
    subject: 'Coût d’attention par semaine',
    tableCaption: 'Coût d’attention de chacune des 12 dernières semaines',
    deliveriesColumn: 'Livraisons passées par la chaîne',
    decisionsColumn: 'Décisions',
    costColumn: 'Coût d’attention',
  },
  /** L'Acceptation au premier passage avec et sans Intention écrite. */
  writtenIntent: {
    withIntent: 'Avec Intention écrite',
    withoutIntent: 'Sans Intention écrite',
    /** Sous le titre : ce que la tuile mesure. */
    measure: 'Acceptation au premier passage',
  },
  /** La Carte des Décisions, à côté de la Carte d'activité (`DecisionMapPanel`). */
  decisionMap: {
    title: 'Carte des Décisions',
    decisions: (count: string, n: number) => `${count} ${n >= 2 ? 'Décisions' : 'Décision'}`,
    noDecision: 'Aucune Décision',
    /** `peak` : « jeudi de 14 h à 15 h », ou null sans Décision. */
    plot: (decisions: string, peak: string | null, peakDecisions: string) =>
      `Carte des Décisions : ${decisions}${peak ? `, pic le ${peak} (${peakDecisions})` : ''}.`,
    descriptionEmpty: (timeZone: string) => `Les Décisions par jour de la semaine et par heure, dans le fuseau ${timeZone}.`,
    description: (decisions: string, timeZone: string) => `${decisions} par jour de la semaine et par heure, dans le fuseau ${timeZone}.`,
    legend: 'Légende de la carte des Décisions',
    empty: 'Aucune Décision sur cette période.',
    caption: 'Décisions par jour de la semaine et par heure',
  },
};

const en: typeof fr = {
  metricsTabs: {
    label: 'Metrics views',
    decisions: 'Decisions',
    flow: 'Flow',
  },
  decisionsTab: {
    heldHeading: 'Held decisions',
    heldIntro: 'What you decided about tickets Awaiting validation, and what the history says since: a Green light or a Rejection is held as long as nothing contradicts it.',
    evidencedHeading: 'Evidenced deliveries',
    evidencedIntro: 'Deliveries through the chain that carry every piece of evidence: a Written intent, a Review round, a pass In integration and your Green light.',
    attentionHeading: 'Attention cost',
    attentionIntro: 'How many Decisions, on average, a Delivery through the chain asked of you.',
    intentHeading: 'Intent',
    intentIntro: 'First-pass acceptance of the period’s Reviewed deliveries, depending on whether they had a Written intent when first started.',
    clocksHeading: 'The two clocks',
    clocksIntro: 'When work moves (Transitions) and when you decide (Decisions), by day of the week and hour, read on the same scale.',
  },
  heldDecisions: {
    title: 'Held decisions',
    judged: (n, count) => (n === 0 ? 'no Green lights or Rejections' : `${count} ${n === 1 ? 'Green light or Rejection' : 'Green lights and Rejections'}`),
    heldOf: (judged, percent) => `of ${judged}, ${percent}`,
    none: 'No Green lights or Rejections in the period.',
    greenLights: (held, total) => `Green lights: ${held} held of ${total}`,
    rejections: (held, total) => `Rejections: ${held} held of ${total}`,
    provisional: 'Provisional: the period is still running, and its Decisions have not all had time to be contradicted.',
    weeklyTitle: 'Held decisions per week',
    weeklyDescription:
      'Green lights and Rejections for each of the last 12 weeks, Monday to Sunday, whatever the chosen period, and those nothing has contradicted since. Each week is counted on its own, without smoothing.',
    weeklyLegend: 'Held decisions per week legend',
    judgedPlot: 'Green lights and Rejections',
    heldPlot: 'Held',
    partial: 'Current week',
    weeklyEmpty: 'No Green lights or Rejections in the last 12 weeks.',
    judgedLabel: (judged, weeks) => `Green lights and Rejections per week: ${judged} over ${weeks} weeks.`,
    held: (n, count) => (n === 0 ? 'none held' : `${count} held`),
    heldLabel: (held, weeks) => `Held decisions per week: ${held} over ${weeks} weeks.`,
    provisionalPoint: (value) => `${value}, provisional: nothing has contradicted them yet`,
    caption: 'Decisions, Green lights, Rejections and Held decisions for each of the last 12 weeks',
    weekColumn: 'Week',
    decisionsColumn: 'Decisions',
    greenLightsColumn: 'Green lights',
    rejectionsColumn: 'Rejections',
    heldColumn: 'Held',
    contradictedColumn: 'Contradicted',
    remarkColumn: 'Note',
    inProgress: 'In progress',
    heldProvisional: 'Held decisions provisional',
    remarkSeparator: ', ',
  },
  decisionSenses: {
    title: 'Decisions by direction',
    caption: 'Decisions in the period',
    none: 'No Decisions in the period.',
    list: 'Decisions in the period by direction',
    senses: { greenLights: 'Green lights', reruns: 'Reruns', rejections: 'Rejections', postponements: 'Postponements' },
    noun: (n) => (n === 1 ? 'Decision' : 'Decisions'),
  },
  declines: {
    title: 'Declines',
    caption: 'Closed tickets you decided not to do',
  },
  evidenced: {
    title: 'Evidenced deliveries',
    chained: (n, count) => `${count} through the chain`,
    evidencedOf: (evidenced, deliveries) => `${evidenced} of ${deliveries} evidenced`,
    none: 'No Deliveries through the chain in the period.',
    mostMissing: (evidence) => `Most often missing: ${evidence}.`,
    allEvidenced: 'No evidence is missing.',
    missingList: 'Deliveries missing each piece of evidence',
    evidence: { writtenIntent: 'Written intent', reviewRound: 'Review round', integration: 'Pass In integration', greenLight: 'Green light' },
    deliveriesNoun: (n) => (n === 1 ? 'Delivery' : 'Deliveries'),
  },
  withoutGreenLight: {
    title: 'Deliveries without green light',
    description: 'The period’s Deliveries through the chain that were closed without your Green light since their last Reopen. Most recent first.',
    list: 'Deliveries without green light in the period',
    deliveredOn: (day) => `Delivered on ${day}`,
    empty: 'Every Delivery through the chain received your Green light in the period.',
    noChained: 'No Deliveries through the chain in the period.',
  },
  attentionCost: {
    title: 'Attention cost',
    caption: 'Decisions per Delivery through the chain',
    chained: (n, count) => `${count} ${n === 1 ? 'Delivery' : 'Deliveries'}`,
    detail: (decisions, n, deliveries) => `${decisions} ${n === 1 ? 'Decision' : 'Decisions'} for ${deliveries}`,
    none: 'No Deliveries through the chain in the period.',
    weeklyTitle: 'Attention cost per week',
    weeklyDescription:
      'The Attention cost of each of the last 12 weeks, Monday to Sunday, whatever the chosen period: the Decisions that the week’s Deliveries through the chain asked for, per Delivery, without smoothing.',
    weeklyEmpty: 'No Deliveries through the chain in the last 12 weeks.',
    subject: 'Attention cost per week',
    tableCaption: 'Attention cost for each of the last 12 weeks',
    deliveriesColumn: 'Deliveries through the chain',
    decisionsColumn: 'Decisions',
    costColumn: 'Attention cost',
  },
  writtenIntent: {
    withIntent: 'With Written intent',
    withoutIntent: 'Without Written intent',
    measure: 'First-pass acceptance',
  },
  decisionMap: {
    title: 'Decision map',
    decisions: (count, n) => `${count} ${n === 1 ? 'Decision' : 'Decisions'}`,
    noDecision: 'No Decisions',
    plot: (decisions, peak, peakDecisions) => `Decision map: ${decisions}${peak ? `, peak on ${peak} (${peakDecisions})` : ''}.`,
    descriptionEmpty: (timeZone) => `Decisions by day of the week and hour, in the ${timeZone} time zone.`,
    description: (decisions, timeZone) => `${decisions} by day of the week and hour, in the ${timeZone} time zone.`,
    legend: 'Decision map legend',
    empty: 'No Decisions in this period.',
    caption: 'Decisions by day of the week and hour',
  },
};

export const decisions = { fr, en };
