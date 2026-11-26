import { Group } from '@visx/group';
import { useMemo, type PointerEvent } from 'react';
import type { MetricsActivity, MetricsWeekHourMap } from '../../shared/api';
import { useFormat, useLanguage, useT } from '../i18n';
import { type ActivityLevel, type ActivityView, describeActivity, hourSpan, slotLabel, weekdaysIn } from './activity';
import { ChartCard, ChartTooltip, DataTable, pointerIn, useActive } from './ChartParts';
import { EmptyChart } from './CfdChart';
import { AXIS_TEXT } from './axes';
import { outlineOf } from './palette';
import { Skeleton } from '../ui/states';
import { useElementWidth } from './useElementWidth';

/** Les marges de la grille : les jours à gauche, les heures au-dessus. */
const LABELS = { left: 30, top: 18, right: 2 };
const GAP = 2;
const HOUR = 3_600_000;
const COLUMNS = 24;
const ROWS = 7;
const HOUR_LABELS = [0, 6, 12, 18];

/** La teinte d'un niveau (metrics.css) : cinq niveaux d'une même couleur, du vide au plus chargé. */
const levelColor = (level: ActivityLevel) => `var(--activity-${level})`;

interface Slot {
  weekday: number;
  hour: number;
}

/**
 * Ce que compte une carte, en mots : les Transitions (Carte d'activité) ou les Décisions (Carte des Décisions, bdesk-3e9.7). Le reste, la grille, les niveaux,
 * la légende et le tableau, est le même : les deux horloges se lisent de la même façon.
 */
interface MapWords {
  /** « 3 Transitions » : `count` est déjà écrit, `n` choisit le pluriel. */
  counted: (count: string, n: number) => string;
  /** Une case vide, dans son infobulle. */
  none: string;
  /** Le nom du dessin : ce qu'il compte, et son pic (null sans rien). */
  plot: (counted: string, peak: string | null, peakCounted: string) => string;
  legend: string;
  caption: string;
}

/** Les mots de la Carte d'activité. */
function useActivityWords(): MapWords {
  const t = useT().metrics.activityMap;
  return { counted: t.transitions, none: t.noTransition, plot: t.plot, legend: t.legend, caption: t.caption };
}

/** Les mots de la Carte des Décisions. */
function useDecisionWords(): MapWords {
  const t = useT().metrics.decisionMap;
  return { counted: t.decisions, none: t.noDecision, plot: t.plot, legend: t.legend, caption: t.caption };
}

/**
 * La carte, à la largeur donnée : sept lignes (du lundi au dimanche) de vingt-quatre cases, une par heure. La hauteur d'une
 * case suit sa largeur, entre 14 et 26 px : sur mobile, les cases restent assez hautes pour être lisibles. Une case vide est un
 * aplat discret ; une case non vide est cernée de son trait, comme les autres formes pleines des graphiques.
 */
export function ActivityPlot({ view, width, words }: { view: ActivityView; width: number; words: MapWords }) {
  const { active, frame, show, leave } = useActive<Slot>();
  const format = useFormat();
  const { language } = useLanguage();
  const WEEKDAYS = weekdaysIn(language);
  const counted = (n: number) => words.counted(format.formatCount(n), n);
  const innerWidth = Math.max(0, width - LABELS.left - LABELS.right);
  const cellWidth = innerWidth / COLUMNS;
  const pitch = Math.min(26, Math.max(14, Math.floor(cellWidth)));
  const height = LABELS.top + ROWS * pitch;

  const pick = (event: PointerEvent<SVGRectElement>) => {
    const at = pointerIn(event, event.currentTarget);
    const hour = Math.min(COLUMNS - 1, Math.max(0, Math.floor(at.x / cellWidth)));
    const weekday = Math.min(ROWS - 1, Math.max(0, Math.floor(at.y / pitch)));
    show({ value: { weekday, hour }, x: LABELS.left + (hour + 0.5) * cellWidth, y: LABELS.top + (weekday + 0.5) * pitch });
  };

  const hovered = active ? view.cells[active.value.weekday * COLUMNS + active.value.hour] : undefined;
  const peak = view.peak;

  return (
    <div ref={frame} className="relative">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={words.plot(
          counted(view.total),
          peak ? `${WEEKDAYS[peak.weekday]?.name ?? ''} ${hourSpan(peak.hour, language)}` : null,
          peak ? counted(peak.count) : '',
        )}
        className="block overflow-visible"
      >
        <Group left={LABELS.left} top={LABELS.top}>
          {WEEKDAYS.map((day, weekday) => (
            <text key={day.short} x={-6} y={weekday * pitch + pitch / 2} textAnchor="end" dominantBaseline="central" {...AXIS_TEXT}>
              {day.short}
            </text>
          ))}
          {HOUR_LABELS.map((hour) => (
            <text key={hour} x={hour * cellWidth + GAP / 2} y={-6} textAnchor="start" {...AXIS_TEXT}>
              {hour}
            </text>
          ))}
          {view.cells.map((cell) => (
            <rect
              key={`${cell.weekday}-${cell.hour}`}
              data-cell={`${cell.weekday}-${cell.hour}`}
              data-level={cell.level}
              data-count={cell.count}
              x={cell.hour * cellWidth + GAP / 2}
              y={cell.weekday * pitch + GAP / 2}
              width={Math.max(1, cellWidth - GAP)}
              height={pitch - GAP}
              rx={2}
              fill={levelColor(cell.level)}
              stroke={cell.level === 0 ? 'none' : outlineOf(levelColor(cell.level))}
              strokeWidth={1}
              pointerEvents="none"
            />
          ))}
          {active && hovered ? (
            <rect
              x={hovered.hour * cellWidth + GAP / 2 - 1}
              y={hovered.weekday * pitch + GAP / 2 - 1}
              width={Math.max(1, cellWidth - GAP) + 2}
              height={pitch - GAP + 2}
              rx={3}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={1.5}
              pointerEvents="none"
            />
          ) : null}
          <rect
            data-chart-hit=""
            width={innerWidth}
            height={ROWS * pitch}
            fill="transparent"
            style={{ touchAction: 'pan-y' }}
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={leave}
          />
        </Group>
      </svg>
      {active && hovered ? (
        <ChartTooltip pointer={active} bounds={{ width, height }}>
          <p className="font-medium">{slotLabel(hovered.weekday, hovered.hour, language)}</p>
          <p className="tnum">{hovered.count === 0 ? words.none : counted(hovered.count)}</p>
        </ChartTooltip>
      ) : null}
    </div>
  );
}

/** Le cadre de la carte : sa largeur est mesurée (comme celle des autres graphiques), sa hauteur en découle. */
function ActivityFrame({ view, words }: { view: ActivityView; words: MapWords }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  return (
    <div ref={ref} data-chart-frame="" className="relative w-full select-none">
      {width > 0 ? <ActivityPlot view={view} width={width} words={words} /> : <Skeleton className="h-48 w-full" />}
    </div>
  );
}

/** La légende des niveaux, de « Moins » à « Plus » : la même pour les deux cartes. */
function LevelLegend({ label }: { label: string }) {
  const t = useT().metrics.activityMap;
  return (
    <ul aria-label={label} className="flex flex-wrap items-center gap-x-1.5 text-micro text-ink-2">
      <li>{t.less}</li>
      <li aria-hidden="true" className="inline-flex items-center gap-0.5">
        {([0, 1, 2, 3, 4] as const).map((level) => (
          <span
            key={level}
            data-legend-level={level}
            className="inline-block size-3 rounded-[3px]"
            style={{ background: levelColor(level), boxShadow: level === 0 ? undefined : `inset 0 0 0 1px ${outlineOf(levelColor(level))}` }}
          />
        ))}
      </li>
      <li>{t.more}</li>
    </ul>
  );
}

/**
 * La carte « Carte d'activité » : les Transitions de la période par jour de la semaine et par heure du fuseau des métriques,
 * son pic, et toutes les valeurs en tableau.
 */
export function ActivityPanel({ activity, timeZone }: { activity: MetricsActivity; timeZone: string }) {
  const view = useMemo(() => describeActivity(activity), [activity]);
  const peak = view.peak;
  const t = useT().metrics.activityMap;
  const words = useActivityWords();
  const format = useFormat();
  const { language } = useLanguage();

  return (
    <ChartCard
      className="h-full"
      title={t.title}
      description={
        (view.empty
          ? t.descriptionEmpty(timeZone)
          : t.description(t.transitions(format.formatCount(view.total), view.total), timeZone) +
            (peak ? t.peak(slotLabel(peak.weekday, peak.hour, language), format.formatCount(peak.count)) : '')) +
        // Les comptes sont bruts : 30 jours comptent quatre ou cinq lundis, et la carte ne le corrige pas.
        t.rawCounts +
        // Les Heures à l'arrêt : quand rien n'a bougé alors que du travail attendait, ce que les cases vides de la carte ne disent pas à elles seules.
        (activity.stalled.ready === null
          ? t.noStalled
          : t.stalled(
              // Sous une heure, l'arrondi écrirait « 0 h » à côté d'une moyenne de Prêts : la carte dirait un arrêt de rien.
              activity.stalled.duration < HOUR ? null : format.formatCount(Math.round(activity.stalled.duration / HOUR)),
              format.formatDecimal(activity.stalled.ready, 1),
            ))
      }
      legend={view.empty ? undefined : <LevelLegend label={words.legend} />}
      data={<ActivityTable view={view} caption={words.caption} />}
    >
      {view.empty ? <EmptyChart>{t.empty}</EmptyChart> : <ActivityFrame view={view} words={words} />}
    </ChartCard>
  );
}

/**
 * La carte « Carte des Décisions » (bdesk-3e9.7) : les Décisions de la période par jour de la semaine et par heure du fuseau des métriques, sur la grille de la
 * Carte d'activité, à côté d'elle. Même échelle de lecture : les mêmes cinq niveaux, chacun par quart de la case la plus chargée de sa carte, la même légende
 * et le même tableau ; les comptes, eux, sont ceux de chaque carte, pour que des Décisions bien moins nombreuses que les Transitions se voient encore.
 */
export function DecisionMapPanel({ map, timeZone }: { map: MetricsWeekHourMap; timeZone: string }) {
  const view = useMemo(() => describeActivity(map), [map]);
  const peak = view.peak;
  const t = useT().metrics;
  const texts = t.decisionMap;
  const words = useDecisionWords();
  const format = useFormat();
  const { language } = useLanguage();

  return (
    <ChartCard
      className="h-full"
      title={texts.title}
      help={t.metricHelp.decisionMap}
      description={
        view.empty
          ? texts.descriptionEmpty(timeZone)
          : texts.description(texts.decisions(format.formatCount(view.total), view.total), timeZone) +
            (peak ? t.activityMap.peak(slotLabel(peak.weekday, peak.hour, language), format.formatCount(peak.count)) : '') +
            t.activityMap.rawCounts
      }
      legend={view.empty ? undefined : <LevelLegend label={words.legend} />}
      data={<ActivityTable view={view} caption={words.caption} />}
    >
      {view.empty ? <EmptyChart>{texts.empty}</EmptyChart> : <ActivityFrame view={view} words={words} />}
    </ChartCard>
  );
}

/**
 * Le tableau des données : une ligne par heure, une colonne par jour (24 lignes sur 7 colonnes tiennent dans la carte, où 24
 * colonnes sur 7 lignes la déborderaient de moitié). Les jours sont abrégés à l'écran et nommés en toutes lettres pour les
 * lecteurs d'écran ; les totaux par heure et par jour terminent les lignes et les colonnes.
 */
function ActivityTable({ view, caption }: { view: ActivityView; caption: string }) {
  const t = useT().metrics.activityMap;
  const format = useFormat();
  const weekdays = weekdaysIn(useLanguage().language);
  return (
    <DataTable
      caption={caption}
      head={
        <tr>
          <th scope="col" className="px-3 py-1.5 font-medium">
            {t.hourHeader}
          </th>
          {weekdays.map((day) => (
            <th key={day.name} scope="col" aria-label={day.name} className="px-2 py-1.5 text-right font-medium">
              {day.short}
            </th>
          ))}
          <th scope="col" className="px-3 py-1.5 text-right font-medium">
            {t.total}
          </th>
        </tr>
      }
    >
      {Array.from({ length: COLUMNS }, (_, hour) => (
        <tr key={hour}>
          <th scope="row" className="whitespace-nowrap px-3 py-1 text-left font-normal text-ink-2">
            {t.hour(hour)}
          </th>
          {weekdays.map((day, weekday) => {
            const count = view.cells[weekday * COLUMNS + hour]?.count ?? 0;
            return (
              <td key={day.name} className={count === 0 ? 'px-2 py-1 text-right text-ink-3' : 'px-2 py-1 text-right'}>
                {format.formatCount(count)}
              </td>
            );
          })}
          <td className="px-3 py-1 text-right font-medium">{format.formatCount(view.byHour[hour] ?? 0)}</td>
        </tr>
      ))}
      <tr className="bg-well font-medium">
        <th scope="row" className="whitespace-nowrap px-3 py-1 text-left font-medium text-ink">
          {t.total}
        </th>
        {weekdays.map((day, weekday) => (
          <td key={day.name} className="px-2 py-1 text-right">
            {format.formatCount(view.byWeekday[weekday] ?? 0)}
          </td>
        ))}
        <td className="px-3 py-1 text-right">{format.formatCount(view.total)}</td>
      </tr>
    </DataTable>
  );
}
