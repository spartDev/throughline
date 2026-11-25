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
 * à min(T1, T0 + 7 j), quand le Projet a au moins 3 Prêts ; ses Prêts ne changent qu'aux débuts de segment de ses tickets (une création, la fin d'un
 * Blocage par une dépendance retirée), où l'on relit leur nombre. Avant la première Transition, le Projet n'a jamais été en marche : rien ne compte.
 */
export function stalledTimeIn(analysis: ProjectAnalysis, start: number, end: number): StalledTime {
  const transitions = transitionsOf(analysis);
  const changes = [...new Set(analysis.tickets.flatMap((ticket) => ticket.timeline.segments.map((segment) => segment.from)))].sort((a, b) => a - b);
  let duration = 0;
  let readyTime = 0;
  transitions.forEach((at, i) => {
    const from = Math.max(start, at + STALLED_FLOW_AFTER);
    const to = Math.min(end, transitions[i + 1] ?? Number.POSITIVE_INFINITY, at + DORMANT_AFTER);
    if (from >= to) return;
    const cuts = [from, ...changes.filter((instant) => instant > from && instant < to), to];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const [a, b] = [cuts[k] as number, cuts[k + 1] as number];
      const ready = readyAt(analysis, a);
      if (ready < STALLED_FLOW_READY_FROM) continue;
      duration += b - a;
      readyTime += ready * (b - a);
    }
  });
  return { duration, readyTime };
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
