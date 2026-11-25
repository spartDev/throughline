import { type Period, weeksUntil } from './calendar';
import type { ProjectAnalysis, TrackedTicket } from './metrics';
import { statusAt } from './timeline';

/**
 * Stock en hausse (CONTEXT.md) : un Projet dont le Stock monte, semaine après semaine. Son Stock a monté chacune des 3 dernières semaines pleines (du
 * lundi au dimanche, dans le Fuseau de l'utilisateur), a crû sur ces 3 semaines d'au moins 25 % et d'au moins 3 tickets, et aucune d'elles ne porte plus
 * de la moitié de cette hausse. Une rafale d'un jour (la planification d'une Epic) ne le fait pas : elle porte presque toute la hausse sur une semaine.
 * Sa limite : une rafale à cheval sur dimanche minuit, partagée à parts égales entre deux semaines, en fait un si la troisième monte aussi.
 *
 * Le Stock à un instant : les tickets du Projet (hors Epics, comme toute mesure) créés à cet instant ou avant, et dont le statut d'alors n'est pas fermé.
 * Une Livraison, un Abandon ou un Renoncement en sort ; une Réouverture l'y remet. Chaque semaine se juge sur le Stock d'alors, lu à ses bornes : ce qui
 * arrive après les 3 semaines (une Réouverture, une nouvelle clôture, un label `declined`) ne change pas leur verdict. L'Écart Arrivées–Débit, lui, date
 * une Livraison de sa dernière clôture et la reconnaît à son label, tels que le Dernier commit les montre : il réécrirait les semaines passées, et le
 * Signal ne le lit pas.
 */

/** Le Stock en hausse se lit sur ce nombre de semaines pleines, les dernières avant la semaine en cours, qui n'est pas finie. */
export const RISING_STOCK_WEEKS = 3;
/** Sur ces semaines, le Stock croît au moins de cette part : 25 % pile suffit. */
export const RISING_STOCK_GROWTH_FROM = 0.25;
/**
 * Et au moins de ce nombre de tickets, pile compris. Sur 3 semaines qui montent chacune d'au moins un ticket, il est toujours atteint : il ne décide
 * seul que si le nombre de semaines change.
 */
export const RISING_STOCK_TICKETS_FROM = 3;
/** Aucune semaine ne porte plus de cette part de la hausse des 3 semaines : la moitié pile suffit. Une rafale d'un jour en porte presque toute. */
export const RISING_STOCK_WEEK_SHARE_MAX = 0.5;

/** Ce que le Signal dit d'un Projet dont le Stock est en hausse. Instants en ms. */
export interface RisingStock {
  /** Son Stock au début de la première semaine, puis à la fin de chacune : `RISING_STOCK_WEEKS + 1` valeurs. */
  stock: number[];
  /** Le début de la première semaine : minuit du lundi, dans le Fuseau de l'utilisateur. */
  since: number;
}

/** Le Stock en hausse d'un Projet à `now`, s'il l'est. Un parcours des tickets par borne : le coût croît avec l'historique, pas avec son carré. */
export function risingStockAt(analysis: ProjectAnalysis, now: number, timeZone: string): RisingStock | null {
  const weeks = weeksUntil(now, RISING_STOCK_WEEKS + 1, timeZone).slice(0, -1);
  // `weeksUntil` rend autant de semaines qu'on lui en demande : au moins une ici.
  const since = (weeks[0] as Period).start;
  // La fin d'une semaine est le début de la suivante : le Stock y est lu une fois.
  const stock = [since, ...weeks.map((week) => week.end)].map((bound) => stockBefore(analysis.tickets, bound));
  const [from, to] = [stock[0] as number, stock.at(-1) as number];
  const rise = to - from;
  // Ce que chaque semaine ajoute au Stock : leur somme est la hausse des 3 semaines.
  const weekly = stock.slice(1).map((end, k) => end - (stock[k] as number));
  const rising =
    weekly.every((added) => added > 0 && added <= rise * RISING_STOCK_WEEK_SHARE_MAX) &&
    rise >= RISING_STOCK_TICKETS_FROM &&
    to >= from * (1 + RISING_STOCK_GROWTH_FROM);
  return rising ? { stock, since } : null;
}

/**
 * Le Stock juste avant `bound` : à son dernier instant (les instants sont des ms entières). Ce qui est daté de `bound` appartient à la semaine qui y
 * commence. Avant sa création, un ticket n'a pas de statut.
 */
function stockBefore(tickets: readonly TrackedTicket[], bound: number): number {
  return tickets.filter((ticket) => {
    const status = statusAt(ticket.timeline, bound - 1);
    return status !== undefined && status !== 'closed';
  }).length;
}
