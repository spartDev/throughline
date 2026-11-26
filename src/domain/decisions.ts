import type { DeclaredStatuses, MetricsAttentionCost, MetricsDecisions, MetricsDecisionTally, MetricsJudgedDecisions } from '../shared/api';
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
 * Livraison passée par la chaîne : une Livraison passée par au moins un Statut de relais depuis sa dernière Réouverture, ou depuis sa création (le statut de
 * création compte). `steps` : ceux de la Livraison, qui finissent à sa dernière clôture.
 */
export function throughChain(steps: readonly Pick<Step, 'status'>[]): boolean {
  const lastReopening = steps.findLastIndex((_, index) => steps[index - 1]?.status === 'closed');
  return steps.slice(Math.max(lastReopening, 0)).some(({ status }) => isHandoffStatus(status));
}

/** Un ticket mesuré, tel que les Décisions le lisent. */
interface Decided {
  decisions: Decision[];
  /** La date de sa Livraison s'il est une Livraison passée par la chaîne d'un Projet qui a À valider ; null sinon. */
  chainedAt: number | null;
}

/** Une fenêtre de temps (ms epoch) : son premier instant compris, le premier instant qui suit exclu. */
interface Window {
  start: number;
  end: number;
}

/**
 * Les Décisions de la période demandée, sur l'union des tickets des Projets (la Vue globale, ou un seul Projet) : leur nombre par sens, les Feux verts et
 * les Refus tenus ou démentis, le Coût d'attention, et les mêmes semaine par semaine sur les 12 semaines de la Tendance longue. La période en cours est
 * comptée jusqu'à `asOf` (maintenant), la semaine en cours aussi.
 */
export function computeDecisions(projects: MetricsInput[], { period, now, timeZone }: MetricsOptions): MetricsDecisions {
  const instant = now.getTime();
  const { current, asOf } = resolvePeriod(period, instant, timeZone);
  const tickets = projects.flatMap(({ analysis }): Decided[] => {
    // À valider, déclaré ou porté par un ticket (`ProjectAnalysis.handoff`) : sans lui, une Livraison ne peut demander aucune Décision.
    const gated = analysis.handoff.includes('awaiting_human');
    return analysis.tickets.map((ticket) => ({
      decisions: decisionsOf(ticket.timeline.steps, ticket, analysis.declaredStatuses),
      chainedAt: gated && ticket.deliveredAt !== null && throughChain(ticket.timeline.steps) ? ticket.deliveredAt : null,
    }));
  });
  const measured = (window: Window) => ({ ...tallyIn(tickets, window), attentionCost: attentionCostIn(tickets, window) });

  return {
    ...measured({ start: current.start, end: asOf }),
    provisional: asOf < current.end,
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

/** Le Coût d'attention de la fenêtre : les Décisions qu'ont demandées ses Livraisons passées par la chaîne, par Livraison. */
function attentionCostIn(tickets: readonly Decided[], window: Window): MetricsAttentionCost {
  const chained = tickets.filter(({ chainedAt }) => within(chainedAt, window));
  const decisions = chained.reduce((sum, ticket) => sum + ticket.decisions.length, 0);
  return { deliveries: chained.length, decisions, perDelivery: chained.length === 0 ? null : decisions / chained.length };
}

const within = (instant: number | null, window: Window): boolean => instant !== null && instant >= window.start && instant < window.end;
