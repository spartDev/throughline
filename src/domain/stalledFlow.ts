import type { ProjectAnalysis } from './metrics';
import { columnAt } from './timeline';

/**
 * Flux à l'arrêt (CONTEXT.md) : un Projet qui a au moins 3 Prêts et dont aucun ticket n'a fait de Transition depuis plus de 12 heures, sans dormir
 * (dernière Transition de plus de 7 jours). Le Signal le lit à un instant ; les Heures à l'arrêt en somment la durée sur une fenêtre. Une seule règle
 * pour les deux, ici.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Un Projet a au moins ce nombre de Prêts pour que son Flux soit à l'arrêt. */
export const STALLED_FLOW_READY_FROM = 3;
/** Sans Transition depuis plus que cela, le Flux d'un Projet qui a des Prêts est à l'arrêt : plus de 12 heures de Durée écoulée, pas 12 heures pile. */
export const STALLED_FLOW_AFTER = 12 * HOUR;
/** Un Projet dont la dernière Transition a plus que cela dort : son Flux n'est pas à l'arrêt, il n'est pas en marche. 7 jours pile, il vit encore. */
export const DORMANT_AFTER = 7 * DAY;

/** Ce que le Signal dit d'un Projet à `now`, s'il est à l'arrêt : ses Prêts, et sa dernière Transition. */
export function stalledFlowAt(analysis: ProjectAnalysis, now: number): { ready: number; since: number } | null {
  const transitions = transitionsOf(analysis);
  const since = transitions.findLast((at) => at <= now);
  if (since === undefined || now - since <= STALLED_FLOW_AFTER || now - since > DORMANT_AFTER) return null;
  const ready = readyAt(analysis, now);
  return ready >= STALLED_FLOW_READY_FROM ? { ready, since } : null;
}

/** Les Heures à l'arrêt d'un Projet sur une fenêtre : leur durée (ms), et la somme des Prêts × durée, pour une moyenne pesée par le temps. */
export interface StalledTime {
  duration: number;
  readyTime: number;
}

/**
 * La durée de la fenêtre `[start, end)` pendant laquelle le Flux du Projet était à l'arrêt. Entre deux Transitions T0 et T1, il peut l'être de T0 + 12 h
 * à min(T1, T0 + 7 j), quand le Projet a au moins 3 Prêts. Avant la première Transition, le Projet n'a jamais été en marche : rien ne compte.
 *
 * Un seul parcours du temps : les entrées et sorties de la colonne Prêt de tous les tickets, triées, tiennent le compte des Prêts à jour, au lieu de le
 * relire sur tous les tickets à chaque changement (un coût au carré du nombre de tickets sur un long historique).
 */
export function stalledTimeIn(analysis: ProjectAnalysis, start: number, end: number): StalledTime {
  const transitions = transitionsOf(analysis);
  const moves = readyMoves(analysis);
  let duration = 0;
  let readyTime = 0;
  let ready = 0;
  let next = 0;
  /** Avance le compte des Prêts jusqu'à `at` compris, comme `columnAt` lit la colonne d'un instant. */
  const advanceTo = (at: number) => {
    for (; next < moves.length && (moves[next] as ReadyMove).at <= at; next++) ready += (moves[next] as ReadyMove).delta;
  };
  transitions.forEach((at, i) => {
    const from = Math.max(start, at + STALLED_FLOW_AFTER);
    const to = Math.min(end, transitions[i + 1] ?? Number.POSITIVE_INFINITY, at + DORMANT_AFTER);
    if (from >= to) return;
    advanceTo(from);
    let cursor = from;
    while (cursor < to) {
      const change = next < moves.length ? (moves[next] as ReadyMove).at : Number.POSITIVE_INFINITY;
      const until = Math.min(to, change);
      if (ready >= STALLED_FLOW_READY_FROM) {
        duration += until - cursor;
        readyTime += ready * (until - cursor);
      }
      cursor = until;
      if (cursor < to) advanceTo(cursor);
    }
  });
  return { duration, readyTime };
}

/** Un ticket entre dans la colonne Prêt (+1) ou en sort (-1) à cet instant. */
interface ReadyMove {
  at: number;
  delta: 1 | -1;
}

/** Les entrées et sorties de la colonne Prêt de tous les tickets du Projet, triées par instant : les segments de leurs chronologies. */
function readyMoves(analysis: ProjectAnalysis): ReadyMove[] {
  const moves: ReadyMove[] = [];
  for (const ticket of analysis.tickets) {
    const { segments } = ticket.timeline;
    segments.forEach((segment, i) => {
      if (segment.column !== 'ready') return;
      moves.push({ at: segment.from, delta: 1 });
      const after = segments[i + 1];
      if (after) moves.push({ at: after.from, delta: -1 });
    });
  }
  return moves.sort((a, b) => a.at - b.at);
}

/**
 * Les instants des Transitions du Projet, triés et sans doublon, tous tickets confondus. La création d'un ticket n'en est pas une (c'est une Arrivée, la
 * règle de la Carte d'activité) : créer des tickets ne fait pas avancer le flux.
 */
function transitionsOf(analysis: ProjectAnalysis): number[] {
  const instants = analysis.tickets.flatMap((ticket) => ticket.timeline.steps.slice(1).map((step) => step.at));
  return [...new Set(instants)].sort((a, b) => a - b);
}

/** Les Prêts du Projet à cet instant : la colonne Prêt du tableau, la même lecture que le Prêt qui stagne. */
const readyAt = (analysis: ProjectAnalysis, at: number) => analysis.tickets.filter((ticket) => columnAt(ticket.timeline, at) === 'ready').length;
