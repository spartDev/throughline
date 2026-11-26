import type { MetricsCycleTimeBreakdown, MetricsDurationStats, MetricsLeadTimeBreakdown } from '../../shared/api';
import { CATALOGS } from '../i18n/catalog';
import type { Language } from '../i18n/language';
import { FORMATS } from './format';

/**
 * Décomposition du Lead Time : le Lead Time cumulé des Livraisons de la période, en cinq parts qui s'additionnent. Chaque part
 * prend la couleur de la colonne du flux qu'elle rappelle (Backlog, Prêt, En cours, Bloqué) : l'Attente de dépendance est du
 * temps passé en Backlog, l'Attente en Prêt du temps Prêt, le travail du temps En cours, le Blocage du temps Bloqué. L'autre
 * attente (le reste) reprend la couleur du Backlog, hachurée : elle s'en distingue autrement que par la couleur.
 *
 * Décomposition du Cycle Time (bdesk-pz0.8) : le Cycle Time cumulé, en six parts, de la même façon. Développement et Correction, le
 * travail avant et après le premier Retour, prennent la couleur d'En cours, la Correction hachurée ; les parts de relais celles des
 * colonnes de leur Statut de relais (En relecture, En intégration, À valider), le Blocage celle de Bloqué.
 */

export type PartKey = 'dependencyWait' | 'readyWait' | 'otherWait' | 'work' | 'blocked';

/** Les parts de la Décomposition du Cycle Time, dans l'ordre de la barre : le travail, puis les Statuts de relais dans l'ordre de la chaîne, puis le Blocage. */
export type CycleTimePartKey = 'development' | 'correction' | 'review' | 'integration' | 'humanWait' | 'blocked';

export interface BreakdownPart<Key extends string = PartKey> {
  key: Key;
  label: string;
  description: string;
  /** Référence CSS `var(--flow-…)` de la colonne du flux que la part rappelle. */
  color: string;
  /** La part est dessinée de hachures de cette couleur plutôt que de son aplat : elle partage la couleur d'une autre part. */
  hatched: boolean;
  /** Durée cumulée sur les Livraisons (ms). */
  duration: number;
  /** La durée écrite : « 21 j », ou « Aucun » (« Aucune » pour une attente) quand elle est exactement nulle, jamais « < 1 min ». */
  text: string;
  /** La durée dite aux lecteurs d'écran : « 21 jours », « moins d'une minute » là où `text` s'écrit « < 1 min », ou « Aucun » (« Aucune »). */
  spoken: string;
  /** Part de la durée cumulée (Lead Time ou Cycle Time), de 0 à 1 ; null quand il n'y a rien à répartir. */
  share: number | null;
}

export interface BreakdownView {
  parts: BreakdownPart[];
  /** Lead Time cumulé (ms). */
  total: number;
  deliveries: number;
  /** Livraisons qui ont attendu une dépendance avant leur premier démarrage, et la durée de leur attente. */
  waited: number;
  waits: MetricsDurationStats;
  /** Aucune Livraison, ou aucun Lead Time cumulé : pas de pourcentage à donner. */
  empty: boolean;
}

/** Une part sans ses mesures ni ses textes (libellé, description, et `none`, ce qu'on écrit d'une durée exactement nulle) : ceux-là sont au catalogue. */
type PartSpec<Key extends string> = Pick<BreakdownPart<Key>, 'key' | 'color' | 'hatched'>;

/** Les textes d'une part au catalogue. */
interface PartTexts {
  label: string;
  description: string;
  none: string;
}

const PARTS: readonly PartSpec<PartKey>[] = [
  { key: 'dependencyWait', color: 'var(--flow-backlog)', hatched: false },
  { key: 'readyWait', color: 'var(--flow-ready)', hatched: false },
  { key: 'otherWait', color: 'var(--flow-backlog)', hatched: true },
  { key: 'work', color: 'var(--flow-progress)', hatched: false },
  { key: 'blocked', color: 'var(--flow-blocked)', hatched: false },
];

const CYCLE_TIME_PARTS: readonly PartSpec<CycleTimePartKey>[] = [
  { key: 'development', color: 'var(--flow-progress)', hatched: false },
  { key: 'correction', color: 'var(--flow-progress)', hatched: true },
  { key: 'review', color: 'var(--flow-review)', hatched: false },
  { key: 'integration', color: 'var(--flow-integration)', hatched: false },
  { key: 'humanWait', color: 'var(--flow-awaiting)', hatched: false },
  { key: 'blocked', color: 'var(--flow-blocked)', hatched: false },
];

/** Les parts d'une durée cumulée `total`, mesurées dans `durations`, écrites dans la langue ; sans rien à répartir (`empty`), elles n'ont pas de part. */
function describeParts<Key extends string>(
  specs: readonly PartSpec<Key>[],
  durations: Record<Key, number>,
  texts: Record<Key, PartTexts>,
  total: number,
  empty: boolean,
  language: Language,
): BreakdownPart<Key>[] {
  const { formatDuration, spokenDuration } = FORMATS[language];
  return specs.map((part) => {
    const duration = durations[part.key];
    return {
      ...part,
      label: texts[part.key].label,
      description: texts[part.key].description,
      duration,
      // `formatDuration(0)` dirait « < 1 min » : une part exactement nulle n'a pas eu lieu, elle ne s'écrit pas comme une part minuscule.
      text: duration > 0 ? formatDuration(duration) : texts[part.key].none,
      spoken: duration > 0 ? spokenDuration(duration) : texts[part.key].none,
      share: empty ? null : duration / total,
    };
  });
}

export function describeBreakdown(breakdown: MetricsLeadTimeBreakdown, language: Language): BreakdownView {
  const empty = breakdown.deliveries === 0 || breakdown.total === 0;
  return {
    parts: describeParts(PARTS, breakdown, CATALOGS[language].metrics.leadTimeBreakdown.parts, breakdown.total, empty, language),
    total: breakdown.total,
    deliveries: breakdown.deliveries,
    waited: breakdown.waited,
    waits: breakdown.waits,
    empty,
  };
}

export interface CycleTimeBreakdownView {
  parts: BreakdownPart<CycleTimePartKey>[];
  /** Cycle Time cumulé (ms). */
  total: number;
  deliveries: number;
  /** Aucune Livraison, ou aucun Cycle Time cumulé (aucune n'a été démarrée) : pas de pourcentage à donner. */
  empty: boolean;
}

export function describeCycleTimeBreakdown(breakdown: MetricsCycleTimeBreakdown, language: Language): CycleTimeBreakdownView {
  const empty = breakdown.deliveries === 0 || breakdown.total === 0;
  return {
    parts: describeParts(CYCLE_TIME_PARTS, breakdown, CATALOGS[language].metrics.cycleTimeBreakdown.parts, breakdown.total, empty, language),
    total: breakdown.total,
    deliveries: breakdown.deliveries,
    empty,
  };
}
