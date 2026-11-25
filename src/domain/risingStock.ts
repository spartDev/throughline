import { type Period, weeksUntil } from './calendar';
import type { ProjectAnalysis, TrackedTicket } from './metrics';
import { statusAt } from './timeline';

/**
 * Stock en hausse (CONTEXT.md) : un Projet qui crée plus qu'il ne livre, semaine après semaine. Son Écart Arrivées–Débit est positif chacune des 3
 * dernières semaines pleines (du lundi au dimanche, dans le Fuseau de l'utilisateur), et son Stock a crû sur ces 3 semaines d'au moins 25 % et d'au
 * moins 3 tickets. Une rafale d'un jour (la planification d'une Epic) ne le fait pas : elle ne rend positive qu'une semaine.
 *
 * Le Stock à un instant : les tickets du Projet (hors Epics, comme toute mesure) créés à cet instant ou avant, et dont le statut d'alors n'est pas fermé.
 * Une Livraison, un Abandon ou un Renoncement en sort ; une Réouverture l'y remet. Seules les Livraisons font le Débit.
 */

/** Le Stock en hausse se lit sur ce nombre de semaines pleines, les dernières avant la semaine en cours, qui n'est pas finie. */
export const RISING_STOCK_WEEKS = 3;
/** Sur ces semaines, le Stock croît au moins de cette part : 25 % pile suffit. */
export const RISING_STOCK_GROWTH_FROM = 0.25;
/** Et au moins de ce nombre de tickets, pile compris : de 4 à 5, ou de 0 à 1, le Stock ne monte pas. */
export const RISING_STOCK_TICKETS_FROM = 3;

/** Ce que le Signal dit d'un Projet dont le Stock est en hausse. Instants en ms. */
export interface RisingStock {
  /** Son Stock au début de la première semaine, puis à la fin de chacune : `RISING_STOCK_WEEKS + 1` valeurs. */
  stock: number[];
  /** Le début de la première semaine : minuit du lundi, dans le Fuseau de l'utilisateur. */
  since: number;
}

/**
 * Le Stock en hausse d'un Projet à `now`, s'il l'est. Quelques parcours des tickets, un par semaine et un par borne : le coût croît avec l'historique,
 * pas avec son carré.
 */
export function risingStockAt(analysis: ProjectAnalysis, now: number, timeZone: string): RisingStock | null {
  const weeks = weeksUntil(now, RISING_STOCK_WEEKS + 1, timeZone).slice(0, -1);
  if (weeks.some((week) => gapIn(analysis.tickets, week) <= 0)) return null;
  // `weeksUntil` rend autant de semaines qu'on lui en demande : au moins une ici.
  const since = (weeks[0] as Period).start;
  // La fin d'une semaine est le début de la suivante : le Stock y est lu une fois.
  const stock = [since, ...weeks.map((week) => week.end)].map((bound) => stockBefore(analysis.tickets, bound));
  const [from, to] = [stock[0] as number, stock.at(-1) as number];
  const rising = to - from >= RISING_STOCK_TICKETS_FROM && to >= from * (1 + RISING_STOCK_GROWTH_FROM);
  return rising ? { stock, since } : null;
}

/** L'Écart Arrivées–Débit de la semaine : les tickets créés, moins les Livraisons, datées de leur dernière clôture (les règles de `computeMetrics`). */
function gapIn(tickets: readonly TrackedTicket[], week: Period): number {
  const within = (instant: number | null) => instant !== null && instant >= week.start && instant < week.end;
  return tickets.filter((ticket) => within(ticket.createdAt)).length - tickets.filter((ticket) => within(ticket.deliveredAt)).length;
}

/**
 * Le Stock juste avant `bound` : à son dernier instant (les instants sont des ms entières). Ce qui est daté de `bound` appartient à la semaine qui y
 * commence, comme ses Arrivées et ses Livraisons. Avant sa création, un ticket n'a pas de statut.
 */
function stockBefore(tickets: readonly TrackedTicket[], bound: number): number {
  return tickets.filter((ticket) => {
    const status = statusAt(ticket.timeline, bound - 1);
    return status !== undefined && status !== 'closed';
  }).length;
}
