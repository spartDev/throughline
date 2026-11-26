import type {
  DeclaredStatuses,
  MetricsAttentionCost,
  MetricsDecisions,
  MetricsDecisionTally,
  MetricsEvidence,
  MetricsEvidencedDeliveries,
  MetricsJudgedDecisions,
} from '../shared/api';
import { resolvePeriod, weeksUntil } from './calendar';
import { LONG_TREND_WEEKS } from './longTrend';
import type { MetricsInput, MetricsOptions, TrackedTicket } from './metrics';
import { isDevelopment } from './review';
import { isHandoffStatus } from './statuses';
import type { Step } from './timeline';

/**
 * Décisions, Décision tenue et Coût d'attention (bdesk-3e9.3, CONTEXT.md). Tout se lit dans les Transitions déjà analysées (`TicketTimeline.steps`), sans
 * autre source. Du code pur, comme `computeReview` : composé avec `computeMetrics` par le service de métriques (`MetricsResponse.decisions`), il lit les
 * types de `metrics.ts`, qui ne l'importe pas en retour.
 *
 * Une Décision appartient à la période de sa Transition. Le Coût d'attention, lui, appartient à celle de la Livraison qu'il décrit, datée de sa dernière
 * clôture comme le Débit : il compte toutes les Décisions qu'elle a demandées, à quelque date que ce soit.
 *
 * Livraison prouvée et Livraison sans Feu vert (bdesk-3e9.5) : ici aussi, parce qu'elles se lisent dans les mêmes Décisions et sur la même Livraison passée
 * par la chaîne, et que l'onglet Décisions les montre avec elles (`MetricsDecisions.evidencedDeliveries`). Une Livraison y appartient, comme pour le Coût
 * d'attention, à la période de sa dernière clôture.
 */

/**
 * Une Décision : la Transition qui fait sortir un ticket de À valider, datée (ms epoch), et son sens, lu au statut d'arrivée. Un Feu vert ou un Refus est tenu
 * tant que rien ne l'a démenti ; une Relance ou un Report ne sont jamais ni tenus ni démentis.
 */
export type Decision = { at: number; sense: 'greenLight' | 'rejection'; held: boolean } | { at: number; sense: 'rerun' | 'postponement' };

/**
 * Les Décisions d'une suite de statuts datés (`TicketTimeline.steps` : le statut de création, puis les Transitions), dans l'ordre de l'historique. Deux statuts
 * qui se suivent ne se répètent jamais (`recordedTransitions`) : chaque statut qui suit À valider en est une. Un ticket créé À valider en porte une dès qu'il
 * en sort, bien que sa création ne soit pas une Transition ; un ticket qui n'est jamais passé À valider n'en porte aucune.
 *
 * Le sens, selon le statut d'arrivée :
 * - fermé : un Feu vert si la clôture est une Livraison, un Refus sinon (Abandon ou Renoncement). C'est `closesAs` qui le dit, la règle de clôture du Dernier
 *   commit, pour chacune des clôtures du ticket : comme la Livraison, elle ne lit pas les liens ni le label `declined` tels qu'ils étaient à cette clôture-là ;
 * - En intégration : un Feu vert ;
 * - en cours, rattaché à un agent, un statut déclaré `wip` (`isDevelopment` : c'est aussi un Retour, d'origine validation), ou En relecture : une Relance ;
 * - tout autre statut non fermé : un Report (ouvert, différé, bloqué, épinglé, un statut inconnu…).
 *
 * Un Feu vert est démenti quand la clôture qui le suit (la sienne, s'il ferme le ticket ; sinon la suivante) est une Livraison, et qu'elle est rouverte ou
 * qu'elle est sa dernière clôture et a reçu un Bug d'origine (`failed`). Un Abandon ou un Renoncement qui suit un Feu vert vers En intégration, rouvert ou
 * non, ne le dément pas ; un Retour d'intégration non plus : la chaîne a fait son travail. Tant qu'aucune clôture ne le suit, rien ne l'a démenti. Un Refus est
 * démenti quand sa clôture est rouverte.
 *
 * `declared` : les statuts personnalisés que le Projet déclare, qui disent lesquels de ses autres statuts comptent comme en cours.
 */
export function decisionsOf(steps: readonly Step[], ticket: Pick<TrackedTicket, 'closesAs' | 'failed'>, declared: DeclaredStatuses): Decision[] {
  const delivers = ticket.closesAs === 'delivered'; // chacune de ses clôtures est une Livraison, ou aucune (`closesAs`)
  const reopened = (index: number) => index < steps.length - 1; // une clôture suivie d'un autre statut, forcément non fermé : une Réouverture
  // Pour chaque statut, la Livraison qui le suit (lui compris) a-t-elle été démentie ? undefined : aucune Livraison ne le suit, faute de clôture ou parce que
  // ses clôtures sont des Abandons ou des Renoncements.
  const contradicted: Array<boolean | undefined> = [];
  let next: boolean | undefined;
  for (let index = steps.length - 1; index >= 0; index--) {
    if (delivers && steps[index]?.status === 'closed') next = reopened(index) || ticket.failed;
    contradicted[index] = next;
  }

  return steps.flatMap((step, index): Decision[] => {
    if (steps[index - 1]?.status !== 'awaiting_human') return [];
    const { at, status } = step;
    if (status === 'closed' && !delivers) return [{ at, sense: 'rejection', held: !reopened(index) }];
    if (status === 'closed' || status === 'in_integration') return [{ at, sense: 'greenLight', held: contradicted[index] !== true }];
    if (status === 'in_review' || isDevelopment(status, declared)) return [{ at, sense: 'rerun' }];
    return [{ at, sense: 'postponement' }];
  });
}

/**
 * Les statuts d'une Livraison depuis sa dernière Réouverture, ou depuis sa création (le statut de création compris) : l'intervalle où se lisent la Livraison
 * passée par la chaîne et les preuves d'une Livraison prouvée. Le premier, celui où la Réouverture a remis le ticket, n'est jamais une Décision.
 */
function sinceLastReopening<S extends Pick<Step, 'status'>>(steps: readonly S[]): readonly S[] {
  const lastReopening = steps.findLastIndex((_, index) => steps[index - 1]?.status === 'closed');
  return steps.slice(Math.max(lastReopening, 0));
}

/**
 * Livraison passée par la chaîne : une Livraison passée par au moins un Statut de relais depuis sa dernière Réouverture, ou depuis sa création (le statut de
 * création compte). `steps` : ceux de la Livraison, qui finissent à sa dernière clôture.
 */
export function throughChain(steps: readonly Pick<Step, 'status'>[]): boolean {
  return sinceLastReopening(steps).some(({ status }) => isHandoffStatus(status));
}

/** Les preuves d'une Livraison prouvée, dans l'ordre où la chaîne les produit d'habitude : celui qui départage l'élément manquant le plus fréquent. */
const EVIDENCE = ['writtenIntent', 'reviewRound', 'integration', 'greenLight'] as const satisfies readonly MetricsEvidence[];

/**
 * Les preuves qui manquent à une Livraison passée par la chaîne, dans l'ordre de `EVIDENCE` : aucune, c'est une Livraison prouvée ; le Feu vert parmi elles,
 * une Livraison sans Feu vert. null pour une Livraison qui n'est pas passée par la chaîne, le travail fait à la main : ni l'une ni l'autre.
 *
 * Chacune se lit depuis sa dernière Réouverture, ou sa création, jusqu'à sa dernière clôture, sauf l'Intention écrite, qui se lit à son premier démarrage :
 * - Intention écrite : `writtenIntent` vrai. Inconnue (null : l'historique ne dit pas ses critères d'acceptation à ce démarrage), elle manque : rien ne la
 *   prouve ;
 * - Tour de relecture : un statut En relecture, qu'une Transition l'y ait mis ou qu'il y ait été créé ;
 * - passage En intégration : un statut En intégration ;
 * - Feu vert : une Décision de ce sens (`decisionsOf`). Un Feu vert reçu avant la dernière Réouverture ne compte pas : c'est la Livraison rouverte qu'il
 *   avait laissée passer.
 *
 * `steps` : ceux de la Livraison, qui finissent à sa dernière clôture ; `declared`, comme pour `decisionsOf`.
 */
export function missingEvidence(
  steps: readonly Step[],
  ticket: Pick<TrackedTicket, 'closesAs' | 'failed' | 'writtenIntent'>,
  declared: DeclaredStatuses,
): MetricsEvidence[] | null {
  if (!throughChain(steps)) return null;
  const since = sinceLastReopening(steps);
  const passed = (status: string) => since.some((step) => step.status === status);
  const shown: Record<MetricsEvidence, boolean> = {
    writtenIntent: ticket.writtenIntent === true,
    reviewRound: passed('in_review'),
    integration: passed('in_integration'),
    greenLight: decisionsOf(since, ticket, declared).some(({ sense }) => sense === 'greenLight'),
  };
  return EVIDENCE.filter((evidence) => !shown[evidence]);
}

/** Une Livraison passée par la chaîne, telle que les Livraisons prouvées la lisent. */
interface Chained {
  /** Sa dernière clôture. */
  at: number;
  ticket: TrackedTicket;
  /** L'identifiant de son Projet. */
  project: string;
  /** Les preuves qui lui manquent (`missingEvidence`). */
  missing: MetricsEvidence[];
}

/** Un ticket mesuré, tel que les Décisions le lisent. */
interface Decided {
  decisions: Decision[];
  /** Son Projet a À valider, déclaré ou porté par un ticket (`ProjectAnalysis.handoff`) : sans lui, une Livraison ne peut demander aucune Décision. */
  gated: boolean;
  /** S'il est une Livraison passée par la chaîne : ce qu'en lisent le Coût d'attention et les Livraisons prouvées ; null sinon. */
  chained: Chained | null;
}

/** Une fenêtre de temps (ms epoch) : son premier instant compris, le premier instant qui suit exclu. */
interface Window {
  start: number;
  end: number;
}

/**
 * Les Décisions de la période demandée, sur l'union des tickets des Projets (la Vue globale, ou un seul Projet) : leur nombre par sens, les Feux verts et
 * les Refus tenus ou démentis, le Coût d'attention, et les mêmes semaine par semaine sur les 12 semaines de la Tendance longue ; les Livraisons prouvées de
 * la période, sans les semaines. La période en cours est comptée jusqu'à `asOf` (maintenant), la semaine en cours aussi.
 */
export function computeDecisions(projects: MetricsInput[], { period, now, timeZone }: MetricsOptions): MetricsDecisions {
  const instant = now.getTime();
  const { current, asOf } = resolvePeriod(period, instant, timeZone);
  const tickets = projects.flatMap(({ id: project, analysis }): Decided[] => {
    const { declaredStatuses: declared } = analysis;
    const gated = analysis.handoff.includes('awaiting_human');
    return analysis.tickets.map((ticket): Decided => {
      const { deliveredAt: at, timeline } = ticket;
      const missing = at === null ? null : missingEvidence(timeline.steps, ticket, declared);
      return {
        decisions: decisionsOf(timeline.steps, ticket, declared),
        gated,
        chained: at === null || missing === null ? null : { at, ticket, project, missing },
      };
    });
  });
  const measured = (window: Window) => ({ ...tallyIn(tickets, window), attentionCost: attentionCostIn(tickets, window) });
  const window = { start: current.start, end: asOf };

  return {
    ...measured(window),
    provisional: asOf < current.end,
    evidencedDeliveries: evidencedIn(tickets, window),
    weeks: weeksUntil(instant, LONG_TREND_WEEKS, timeZone).map((week) => ({
      from: week.from,
      to: week.to,
      start: new Date(week.start).toISOString(),
      end: new Date(week.end).toISOString(),
      partial: week.end > instant,
      ...measured({ start: week.start, end: Math.min(week.end, instant) }),
    })),
  };
}

/** Les Décisions de la fenêtre, datées de leur Transition, par sens. */
function tallyIn(tickets: readonly Decided[], window: Window): MetricsDecisionTally {
  const judged = (): MetricsJudgedDecisions => ({ total: 0, held: 0, contradicted: 0 });
  const tally = { total: 0, greenLights: judged(), rejections: judged(), reruns: 0, postponements: 0 };
  for (const { decisions } of tickets) {
    for (const decision of decisions) {
      if (!within(decision.at, window)) continue;
      tally.total++;
      if ('held' in decision) {
        const sense = decision.sense === 'greenLight' ? tally.greenLights : tally.rejections;
        sense.total++;
        if (decision.held) sense.held++;
        else sense.contradicted++;
      } else if (decision.sense === 'rerun') tally.reruns++;
      else tally.postponements++;
    }
  }
  return tally;
}

/** Le Coût d'attention de la fenêtre : les Décisions qu'ont demandées ses Livraisons passées par la chaîne, par Livraison, dans les Projets qui ont À valider. */
function attentionCostIn(tickets: readonly Decided[], window: Window): MetricsAttentionCost {
  const chained = tickets.filter(({ gated, chained }) => gated && within(chained?.at ?? null, window));
  const decisions = chained.reduce((sum, ticket) => sum + ticket.decisions.length, 0);
  return { deliveries: chained.length, decisions, perDelivery: chained.length === 0 ? null : decisions / chained.length };
}

/**
 * Les Livraisons prouvées de la fenêtre, parmi ses Livraisons passées par la chaîne des Projets qui ont À valider, datées de leur dernière clôture : leur part, ce qui
 * manque aux autres et le plus souvent, et les Livraisons sans Feu vert.
 */
function evidencedIn(tickets: readonly Decided[], window: Window): MetricsEvidencedDeliveries {
  // Seuls les Projets qui ont À valider comptent, comme pour le Coût d'attention : ailleurs, aucune Livraison ne peut recevoir de Feu vert.
  const chained = tickets.flatMap(({ gated, chained }) => (gated && chained !== null && within(chained.at, window) ? [chained] : []));
  const missing: Record<MetricsEvidence, number> = { writtenIntent: 0, reviewRound: 0, integration: 0, greenLight: 0 };
  for (const delivery of chained) for (const evidence of delivery.missing) missing[evidence]++;
  const evidenced = chained.filter((delivery) => delivery.missing.length === 0).length;
  return {
    deliveries: chained.length,
    evidenced,
    share: chained.length === 0 ? null : evidenced / chained.length,
    missing,
    // Strictement plus : à égalité, la première dans l'ordre de `EVIDENCE` garde la place.
    mostMissing: EVIDENCE.reduce<MetricsEvidence | null>((most, evidence) => (missing[evidence] > (most === null ? 0 : missing[most]) ? evidence : most), null),
    withoutGreenLight: chained
      .filter((delivery) => delivery.missing.includes('greenLight'))
      .sort((a, b) => b.at - a.at || compareText(a.project, b.project) || compareText(a.ticket.id, b.ticket.id))
      .map(({ at, ticket: { id, title, type, priority }, project }) => ({ id, title, type, priority, project, deliveredAt: new Date(at).toISOString() })),
  };
}

const within = (instant: number | null, window: Window): boolean => instant !== null && instant >= window.start && instant < window.end;
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
