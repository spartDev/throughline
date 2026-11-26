import { useMemo } from 'react';
import type { MetricsCycleTimeBreakdown, MetricsLeadTimeBreakdown } from '../../shared/api';
import { type DisplayFormat, useFormat, useLanguage, useT } from '../i18n';
import { type BreakdownPart, describeBreakdown, describeCycleTimeBreakdown } from './breakdown';
import { ChartCard, DataTable, Swatch } from './ChartParts';
import { EmptyChart } from './CfdChart';
import { outlineOf } from './palette';
import { DurationText, SpokenText } from './SpokenText';

const percent = (format: DisplayFormat, share: number | null) => format.formatPercent(share, { precise: true });

/** Les hachures d'une part : celles de la pastille de la légende (`Swatch`), pour que la barre et la légende se ressemblent. */
const hatchOf = (color: string) => `repeating-linear-gradient(45deg, ${outlineOf(color)} 0 1.5px, transparent 1.5px 4px)`;

/**
 * La carte « Décomposition du Lead Time » : le Lead Time cumulé des Livraisons de la période, en cinq parts qui s'additionnent
 * (Attente de dépendance, Attente en Prêt, autre attente, travail, Blocage), avec ce que l'Attente de dépendance a coûté aux
 * Livraisons qui l'ont subie. Une barre unique plutôt qu'un graphique à axes : la somme des parts est la mesure, et chaque part
 * se lit dans la légende, en durée et en pourcentage, comme dans le tableau des données. Sans Livraison, ou sans Lead Time à
 * répartir, la carte le dit : pas de durée nulle écrite comme une durée, pas de tableau de zéros. Une durée sous la minute s'écrit
 * « < 1 min » et se dit « moins d'une minute » (`SpokenText`) : un lecteur d'écran lirait le chevron tel quel.
 */
export function BreakdownPanel({ breakdown }: { breakdown: MetricsLeadTimeBreakdown }) {
  const { language } = useLanguage();
  const t = useT().metrics.leadTimeBreakdown;
  const format = useFormat();
  const view = useMemo(() => describeBreakdown(breakdown, language), [breakdown, language]);
  /** Une phrase écrite avec `formatDuration`, et la même dite avec `spokenDuration` : l'une pour l'écran, l'autre pour les lecteurs d'écran. */
  const said = (sentence: (duration: (ms: number | null) => string) => string) => (
    <SpokenText written={sentence(format.formatDuration)} spoken={sentence((ms) => (ms === null ? format.formatDuration(null) : format.spokenDuration(ms)))} />
  );

  return (
    <ChartCard
      className="h-full"
      title={t.title}
      description={
        view.empty ? t.descriptionEmpty : said((duration) => t.description(format.formatCount(view.deliveries), view.deliveries, duration(view.total)))
      }
      data={view.empty ? undefined : <PartsTable parts={view.parts} total={view.total} texts={t} />}
    >
      {view.empty ? (
        <EmptyChart>
          {view.deliveries === 0 ? t.noDeliveries : t.zeroLeadTime}
        </EmptyChart>
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <PartsBar parts={view.parts} label={t.bar} />
          <PartsList parts={view.parts} label={t.partsList} />

          <p className="max-w-[90ch] text-micro leading-4 text-ink-3">
            {view.waited === 0
              ? t.noneWaited
              : said((duration) =>
                  t.waited(
                    format.formatCount(view.waited),
                    view.waited,
                    format.formatCount(view.deliveries),
                    view.deliveries,
                    duration(view.waits.median),
                    duration(view.waits.p85),
                  ),
                )}
          </p>
        </div>
      )}
    </ChartCard>
  );
}

/**
 * La carte « Décomposition du Cycle Time » (bdesk-pz0.8) : le Cycle Time cumulé des Livraisons de la période, en six parts qui s'additionnent
 * (Développement, Correction, Relecture, Intégration, Attente humaine, Blocage), dessinée comme la Décomposition du Lead Time dont elle détaille les parts
 * travail et Blocage. Sans Livraison, ou sans Cycle Time à répartir, la carte le dit.
 */
export function CycleTimeBreakdownPanel({ breakdown }: { breakdown: MetricsCycleTimeBreakdown }) {
  const { language } = useLanguage();
  const t = useT().metrics;
  const texts = t.cycleTimeBreakdown;
  const format = useFormat();
  const view = useMemo(() => describeCycleTimeBreakdown(breakdown, language), [breakdown, language]);
  const total = (duration: (ms: number) => string) => texts.description(format.formatCount(view.deliveries), view.deliveries, duration(view.total));

  return (
    <ChartCard
      className="h-full"
      title={texts.title}
      help={t.metricHelp.cycleTimeBreakdown}
      description={view.empty ? texts.descriptionEmpty : <SpokenText written={total(format.formatDuration)} spoken={total(format.spokenDuration)} />}
      data={view.empty ? undefined : <PartsTable parts={view.parts} total={view.total} texts={texts} />}
    >
      {view.empty ? (
        <EmptyChart>{view.deliveries === 0 ? texts.noDeliveries : texts.zeroCycleTime}</EmptyChart>
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <PartsBar parts={view.parts} label={texts.bar} />
          <PartsList parts={view.parts} label={texts.partsList} />
        </div>
      )}
    </ChartCard>
  );
}

/**
 * La barre des parts : une seule barre dont chaque segment est une part, à sa proportion, nommée pour les lecteurs d'écran par la liste des parts et de leur
 * pourcentage (`label`). Une part nulle n'y a pas de segment ; la liste et le tableau la nomment quand même.
 */
function PartsBar({ parts, label }: { parts: readonly BreakdownPart<string>[]; label: (parts: string) => string }) {
  const format = useFormat();
  return (
    <div role="img" aria-label={label(parts.map((part) => `${part.label} ${percent(format, part.share)}`).join(', '))} className="flex h-8 w-full overflow-hidden rounded-md">
      {parts
        .filter((part) => part.duration > 0)
        .map((part) => (
          <div
            key={part.key}
            data-part={part.key}
            className="h-full min-w-px"
            style={{
              width: `${((part.share ?? 0) * 100).toFixed(6)}%`,
              background: part.hatched ? hatchOf(part.color) : part.color,
              boxShadow: `inset 0 0 0 1.25px ${outlineOf(part.color)}`,
            }}
          />
        ))}
    </div>
  );
}

/** La légende de la barre : chaque part avec sa pastille, sa durée, son pourcentage et ce qu'elle compte. */
function PartsList({ parts, label }: { parts: readonly BreakdownPart<string>[]; label: string }) {
  return (
    <ul aria-label={label} className="grid gap-x-6 gap-y-1.5 @min-[36rem]:grid-cols-2">
      {parts.map((part) => (
        <PartRow key={part.key} part={part} />
      ))}
    </ul>
  );
}

function PartRow({ part }: { part: BreakdownPart<string> }) {
  const format = useFormat();
  return (
    <li className="flex min-w-0 flex-col gap-0.5 text-ui">
      <span className="flex min-w-0 items-center gap-2">
        <Swatch color={part.color} hatched={part.hatched} />
        <span className="min-w-0 flex-1 text-ink-2">{part.label}</span>
        <span className="tnum font-semibold text-ink">
          <SpokenText written={part.text} spoken={part.spoken} />
        </span>
        <span className="tnum w-14 shrink-0 text-right text-ink-3">{percent(format, part.share)}</span>
      </span>
      <span className="pl-[18px] text-micro leading-4 text-ink-3">{part.description}</span>
    </li>
  );
}

/** Les textes du tableau d'une décomposition : sa légende, ses en-têtes et sa ligne de total. */
interface PartsTableTexts {
  caption: string;
  partHeader: string;
  durationHeader: string;
  shareHeader: string;
  total: string;
}

function PartsTable({ parts, total, texts }: { parts: readonly BreakdownPart<string>[]; total: number; texts: PartsTableTexts }) {
  const format = useFormat();
  return (
    <DataTable
      caption={texts.caption}
      head={
        <tr>
          <th scope="col" className="px-3 py-1.5 font-medium">
            {texts.partHeader}
          </th>
          <th scope="col" className="px-3 py-1.5 text-right font-medium">
            {texts.durationHeader}
          </th>
          <th scope="col" className="px-3 py-1.5 text-right font-medium">
            {texts.shareHeader}
          </th>
        </tr>
      }
    >
      {parts.map((part) => (
        <tr key={part.key}>
          <th scope="row" className="whitespace-nowrap px-3 py-1 text-left font-normal text-ink-2">
            {part.label}
          </th>
          <td className="whitespace-nowrap px-3 py-1 text-right">
            <SpokenText written={part.text} spoken={part.spoken} />
          </td>
          <td className="px-3 py-1 text-right font-medium">{percent(format, part.share)}</td>
        </tr>
      ))}
      <tr className="bg-well font-medium">
        <th scope="row" className="whitespace-nowrap px-3 py-1 text-left font-medium text-ink">
          {texts.total}
        </th>
        <td className="whitespace-nowrap px-3 py-1 text-right">
          <DurationText ms={total} />
        </td>
        <td className="px-3 py-1 text-right">{percent(format, total > 0 ? 1 : null)}</td>
      </tr>
    </DataTable>
  );
}
