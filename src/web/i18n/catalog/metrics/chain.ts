/**
 * Zone « metrics », groupes de la Chaîne d'agents (bdesk-pz0.8, voir `../metrics.ts`) : la section de la page Métriques et ses tuiles
 * (`metrics/AgentChain.tsx`), la Décomposition du Cycle Time (`metrics/BreakdownChart.tsx`, `metrics/breakdown.ts`) et l'Attente humaine. Leur aide
 * est avec celle des autres tuiles (`metricHelp`, `tiles.ts`). Les nombres, pourcentages et durées arrivent écrits ; un nombre brut ne sert qu'au pluriel.
 */
const fr = {
  /** La section et ses cinq tuiles (`AgentChainSection`). */
  agentChain: {
    heading: 'Chaîne d’agents',
    intro: 'Ce que la relecture, l’intégration et la validation font des Livraisons de la période : ce qui passe du premier coup, ce qui revient, et où va le Cycle Time.',
    firstPassAcceptance: 'Acceptation au premier passage',
    reviewedDeliveries: (n: number, count: string) => `${count} ${n >= 2 ? 'Livraisons relues' : 'Livraison relue'}`,
    /** Sous la valeur : les Livraisons relues sans aucun Retour, sur toutes les Livraisons relues. */
    acceptedOf: (accepted: string, reviewed: string) => `${accepted} sur ${reviewed} sans Retour`,
    fewReviewed: (reviewed: string, minimum: string) => `Trop peu de Livraisons relues pour conclure : ${reviewed} (minimum ${minimum}).`,
    noReviewed: 'Aucune Livraison relue sur la période.',
    reviewCoverage: 'Couverture de relecture',
    /** L'accord se fait avec les Livraisons relues (`n`) : « 1 sur 18 relue », « 12 sur 18 relues ». */
    reviewedOf: (reviewed: string, n: number, deliveries: string) => `${reviewed} sur ${deliveries} ${n >= 2 ? 'relues' : 'relue'}`,
    reviewRounds: 'Tours par Livraison',
    roundsList: 'Livraisons relues selon leur nombre de Tours de relecture',
    rounds: { one: '1 Tour', two: '2 Tours', three: '3 Tours', fourOrMore: '4 Tours ou plus' },
    sendBacks: 'Retours par origine',
    sendBacksCaption: 'Retours des Livraisons de la période',
    sendBacksList: 'Retours selon le Statut de relais qu’ils quittent',
    origins: { review: 'Relecture', integration: 'Intégration', validation: 'Validation' },
    /** Le nom de ce qu'une ligne compte, pour les lecteurs d'écran : l'écran n'écrit que le nombre. */
    deliveriesNoun: (n: number): string => (n >= 2 ? 'Livraisons' : 'Livraison'),
    sendBacksNoun: (n: number): string => (n >= 2 ? 'Retours' : 'Retour'),
    failureRateAfterReview: 'Taux d’échec après relecture',
    /** Sous la valeur (le taux des Livraisons relues) : `failedOf` est « 1 sur 12 en échec », déjà écrit. */
    reviewedFailed: (failedOf: string) => `Livraisons relues : ${failedOf}`,
    unreviewedFailed: (percent: string, failedOf: string) => `Livraisons non relues : ${percent} (${failedOf})`,
    noUnreviewed: 'Aucune Livraison non relue sur la période.',
    /** Non significatif, en retrait : chaque partie, son taux observé et ses comptes, déjà écrits. */
    observedReviewed: (percent: string, failed: string, deliveries: string) => `Observé, Livraisons relues : ${percent} (${failed} sur ${deliveries})`,
    observedUnreviewed: (percent: string, failed: string, deliveries: string) => `Observé, Livraisons non relues : ${percent} (${failed} sur ${deliveries})`,
  },
  /** La Décomposition du Cycle Time (`CycleTimeBreakdownPanel`). */
  cycleTimeBreakdown: {
    title: 'Décomposition du Cycle Time',
    descriptionEmpty: 'Le Cycle Time cumulé des Livraisons de la période, réparti en six parts qui s’additionnent.',
    description: (deliveries: string, n: number, total: string) =>
      `Le Cycle Time cumulé de ${deliveries} ${n >= 2 ? 'Livraisons' : 'Livraison'} (${total}), réparti en six parts qui s’additionnent. Un temps à la fois de relais et de Blocage compte en Blocage.`,
    noDeliveries: 'Aucune Livraison sur la période.',
    zeroCycleTime: 'Aucun Cycle Time à décomposer : les Livraisons de la période n’ont jamais été démarrées.',
    /** `parts` : « Développement 40,0 %, Relecture 12,5 %… ». */
    bar: (parts: string) => `Décomposition du Cycle Time : ${parts}.`,
    partsList: 'Parts du Cycle Time',
    caption: 'Parts du Cycle Time cumulé des Livraisons de la période',
    partHeader: 'Part',
    durationHeader: 'Durée cumulée',
    shareHeader: 'Part du Cycle Time',
    total: 'Cycle Time cumulé',
    /** Les six parts, dans l'ordre de la barre ; `none` est ce qu'on écrit d'une durée exactement nulle, accordé au libellé. */
    parts: {
      development: {
        label: 'Développement',
        description: 'Le travail hors Blocage (en cours, rattaché à un agent, ou un statut que le Projet déclare comme travail) avant le premier Retour.',
        none: 'Aucun',
      },
      correction: { label: 'Correction', description: 'Ce même travail à partir du premier Retour, Réouvertures comprises.', none: 'Aucune' },
      review: { label: 'Relecture', description: 'Le temps En relecture hors Blocage.', none: 'Aucune' },
      integration: { label: 'Intégration', description: 'Le temps En intégration hors Blocage.', none: 'Aucune' },
      humanWait: { label: 'Attente humaine', description: 'Le temps À valider hors Blocage : la chaîne attendait votre décision.', none: 'Aucune' },
      blocked: { label: 'Blocage', description: 'Le Cycle Time passé en Blocage, Statuts de relais compris.', none: 'Aucun' },
    },
  },
  /** L'Attente humaine (`HumanWaitTile`). */
  humanWait: {
    title: 'Attente humaine',
    waited: (n: number, count: string) => `${count} ${n >= 2 ? 'Livraisons ont' : 'Livraison a'} attendu`,
    /** `percent` : la part de l'Attente humaine dans le Cycle Time cumulé, déjà écrite. */
    share: (percent: string) => `${percent} du Cycle Time des Livraisons de la période`,
    unreliable: (minimum: string) => `Moins de ${minimum} Livraisons ont attendu : les centiles ne disent pas grand-chose.`,
    none: 'Aucune Livraison de la période n’a attendu votre validation (À valider).',
  },
};

const en: typeof fr = {
  agentChain: {
    heading: 'Agent chain',
    intro: 'What review, integration and validation do to the period’s Deliveries: what passes first time, what comes back, and where Cycle Time goes.',
    firstPassAcceptance: 'First-pass acceptance',
    reviewedDeliveries: (n, count) => `${count} ${n === 1 ? 'Reviewed delivery' : 'Reviewed deliveries'}`,
    acceptedOf: (accepted, reviewed) => `${accepted} of ${reviewed} with no Send-back`,
    fewReviewed: (reviewed, minimum) => `Too few Reviewed deliveries to conclude: ${reviewed} (minimum ${minimum}).`,
    noReviewed: 'No Reviewed deliveries in the period.',
    reviewCoverage: 'Review coverage',
    reviewedOf: (reviewed, _n, deliveries) => `${reviewed} of ${deliveries} reviewed`,
    reviewRounds: 'Review rounds per delivery',
    roundsList: 'Reviewed deliveries by number of Review rounds',
    rounds: { one: '1 round', two: '2 rounds', three: '3 rounds', fourOrMore: '4 rounds or more' },
    sendBacks: 'Send-backs by origin',
    sendBacksCaption: 'Send-backs of the period’s Deliveries',
    sendBacksList: 'Send-backs by the Handoff status they leave',
    origins: { review: 'Review', integration: 'Integration', validation: 'Validation' },
    deliveriesNoun: (n) => (n === 1 ? 'Delivery' : 'Deliveries'),
    sendBacksNoun: (n) => (n === 1 ? 'Send-back' : 'Send-backs'),
    failureRateAfterReview: 'Change failure rate after review',
    reviewedFailed: (failedOf) => `Reviewed deliveries: ${failedOf}`,
    unreviewedFailed: (percent, failedOf) => `Deliveries not reviewed: ${percent} (${failedOf})`,
    noUnreviewed: 'No Deliveries without review in the period.',
    observedReviewed: (percent, failed, deliveries) => `Observed, Reviewed deliveries: ${percent} (${failed} of ${deliveries})`,
    observedUnreviewed: (percent, failed, deliveries) => `Observed, Deliveries not reviewed: ${percent} (${failed} of ${deliveries})`,
  },
  cycleTimeBreakdown: {
    title: 'Cycle Time breakdown',
    descriptionEmpty: 'The cumulative Cycle Time of the period’s Deliveries, split into six parts that add up.',
    description: (deliveries, n, total) =>
      `The cumulative Cycle Time of ${deliveries} ${n === 1 ? 'Delivery' : 'Deliveries'} (${total}), split into six parts that add up. Time that is both a handoff and a Blockage counts as Blockage.`,
    noDeliveries: 'No Deliveries in the period.',
    zeroCycleTime: 'No Cycle Time to break down: the period’s Deliveries were never started.',
    bar: (parts) => `Cycle Time breakdown: ${parts}.`,
    partsList: 'Cycle Time parts',
    caption: 'Parts of the cumulative Cycle Time of the period’s Deliveries',
    partHeader: 'Part',
    durationHeader: 'Cumulative duration',
    shareHeader: 'Share of Cycle Time',
    total: 'Cumulative Cycle Time',
    parts: {
      development: {
        label: 'Development',
        description: 'Work outside Blockage (in progress, assigned to an agent, or a status the Project declares as work) before the first Send-back.',
        none: 'None',
      },
      correction: { label: 'Fixing', description: 'The same work from the first Send-back on, Reopens included.', none: 'None' },
      review: { label: 'Review', description: 'Time In review outside Blockage.', none: 'None' },
      integration: { label: 'Integration', description: 'Time In integration outside Blockage.', none: 'None' },
      humanWait: { label: 'Human wait', description: 'Time Awaiting validation outside Blockage: the chain was waiting for your decision.', none: 'None' },
      blocked: { label: 'Blockage', description: 'Cycle Time spent in Blockage, Handoff statuses included.', none: 'None' },
    },
  },
  humanWait: {
    title: 'Human wait',
    waited: (n, count) => `${count} ${n === 1 ? 'Delivery' : 'Deliveries'} waited`,
    share: (percent) => `${percent} of the period’s Deliveries’ Cycle Time`,
    unreliable: (minimum) => `Fewer than ${minimum} Deliveries waited: the percentiles say little.`,
    none: 'No Delivery of the period waited for your validation (Awaiting validation).',
  },
};

export const chain = { fr, en };
