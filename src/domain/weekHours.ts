import type { MetricsWeekHourMap } from '../shared/api';
import { lruMemo } from './lru';
import { MAX_ZONE_FORMATTERS } from './time-zone';

/**
 * La grille jour de la semaine × heure du mur, dans le Fuseau de l'utilisateur : celle de la Carte d'activité (les Transitions, `computeHealth`) et de la
 * Carte des Décisions (les Décisions, `computeDecisions`). Les deux horloges se lisent sur la même grille, comptée de la même façon.
 */

const WEEKDAYS: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** Le formateur d'un fuseau : un cache borné (le fuseau d'une requête vient du client), voir `lruMemo`. */
const formatterOf = lruMemo(
  MAX_ZONE_FORMATTERS,
  (timeZone: string) => new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', hourCycle: 'h23' }),
);

/** Le jour de la semaine (0 pour le lundi) et l'heure du mur (0 à 23) de l'instant dans le fuseau. */
function slotOf(instant: number, timeZone: string): { weekday: number; hour: number } {
  const formatter = formatterOf(timeZone);
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
  return { weekday: WEEKDAYS[parts.weekday ?? ''] ?? 0, hour: Number(parts.hour) % 24 };
}

/**
 * Des instants (ms epoch) rangés par jour de la semaine et heure du mur dans le fuseau. L'heure est celle du mur, pas une Durée écoulée : au changement
 * d'heure d'automne, 02:30 revient deux fois et compte deux fois dans la même case ; au printemps, l'heure sautée reste vide.
 */
export function weekHourMap(instants: Iterable<number>, timeZone: string): MetricsWeekHourMap {
  const cells = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  let total = 0;
  for (const instant of instants) {
    const { weekday, hour } = slotOf(instant, timeZone);
    const day = cells[weekday];
    if (day) day[hour] = (day[hour] ?? 0) + 1;
    total++;
  }
  return { cells, total };
}
