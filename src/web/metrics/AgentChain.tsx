import { useId } from 'react';
import type { MetricsCycleTimeBreakdown, MetricsReview, MetricsReviewFailureRate, MetricsSendBackOrigin } from '../../shared/api';
import { useFormat, useLanguage, useT } from '../i18n';
import { CycleTimeBreakdownPanel } from './BreakdownChart';
import { SectionHeading } from './ChartParts';
import type { Comparison } from './comparison';
import { failureRateReason } from './failureReason';
import { DurationText } from './SpokenText';
import { NotSignificant, Tile, Trend, Value } from './Tiles';
import { MEASURES } from './trend';

/**
 * La grille des cinq tuiles de la Chaîne d'agents, sans case vide quelle que soit la largeur du conteneur, l'Acceptation au premier passage en tête : c'est
 * l'indicateur principal. Sur une colonne (écran étroit), elles se suivent ; de 36rem à 48rem, deux colonnes, elle à côté de la Couverture de relecture, qui
 * dit si elle est représentative, puis les Tours et les Retours, puis le Taux d'échec après relecture sur toute la ligne ; dès 48rem, deux rangées sur six
 * colonnes, elle et la Couverture trois chacune, les trois autres deux. Les tuiles des Tours et des Retours sont des listes : plus étroites (deux par ligne
 * sous 36rem, trois sous 48rem, six sur une ligne aux plus grandes largeurs), elles coupaient leurs libellés.
 */
export const AGENT_CHAIN_GRID = 'grid gap-3 @min-[36rem]:grid-cols-2 @min-[48rem]:grid-cols-6';

/** La portée en colonnes de chaque tuile, dans l'ordre : Acceptation au premier passage, Couverture de relecture, Tours, Retours, Taux d'échec après relecture. */
export const AGENT_CHAIN_SPANS = [
  '@min-[48rem]:col-span-3',
  '@min-[48rem]:col-span-3',
  '@min-[48rem]:col-span-2',
  '@min-[48rem]:col-span-2',
  '@min-[36rem]:col-span-2',
] as const;

const ORIGINS: readonly MetricsSendBackOrigin[] = ['review', 'integration', 'validation'];
const ROUNDS = ['one', 'two', 'three', 'fourOrMore'] as const;

/**
 * La Chaîne d'agents (bdesk-pz0.8, ADR 0007) : ce que la relecture, l'intégration et la validation font des Livraisons de la période. Dans l'ordre du
 * ticket : l'Acceptation au premier passage en tête, avec sa tendance, puis la Couverture de relecture, les Tours par Livraison, les Retours par origine, le
 * Taux d'échec après relecture ; dessous, la Décomposition du Cycle Time. La page ne la montre, dans l'onglet Flux, que si une Livraison de la période est
 * passée par un Statut de relais (`MetricsReview.handedOff`) : ailleurs, elle ne dirait que des zéros.
 *
 * L'Attente humaine (`HumanWaitTile`) n'y est plus : c'est le temps que la chaîne vous attend, et elle est dans l'onglet Décisions (bdesk-3e9.7), qui existe
 * dès qu'une Livraison est passée par un Statut de relais (son Projet l'a porté : `MetricsResponse.handoff`).
 */
export function AgentChainSection({ review, breakdown, comparison }: { review: MetricsReview; breakdown: MetricsCycleTimeBreakdown; comparison: Comparison }) {
  const titleId = useId();
  const texts = useT().metrics.agentChain;
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <SectionHeading id={titleId}>{texts.heading}</SectionHeading>
        <p className="max-w-[90ch] text-micro text-ink-2">{texts.intro}</p>
      </div>
      <div className={AGENT_CHAIN_GRID}>
        <FirstPassAcceptanceTile review={review} comparison={comparison} className={AGENT_CHAIN_SPANS[0]} />
        <ReviewCoverageTile review={review} className={AGENT_CHAIN_SPANS[1]} />
        <ReviewRoundsTile review={review} className={AGENT_CHAIN_SPANS[2]} />
        <SendBacksTile review={review} className={AGENT_CHAIN_SPANS[3]} />
        <FailureRateAfterReviewTile review={review} className={AGENT_CHAIN_SPANS[4]} />
      </div>
      <CycleTimeBreakdownPanel breakdown={breakdown} />
    </section>
  );
}

/**
 * L'Acceptation au premier passage : la part des Livraisons relues sans aucun Retour, avec sa tendance. Sous 10 Livraisons relues, elle ne dit rien : la
 * tuile le dit, avec le motif, garde le taux observé en retrait et n'avance pas de tendance, comme le Taux d'échec. Celle de la période précédente non
 * plus : sous ce seuil, la tuile le dit à la place de la tendance.
 */
function FirstPassAcceptanceTile({ review, comparison, className }: { review: MetricsReview; comparison: Comparison; className: string }) {
  const t = useT();
  const { formatCount, formatPercent } = useFormat();
  const { language } = useLanguage();
  const texts = t.metrics.agentChain;
  const { accepted, reviewed, rate, significant, minReviewed, trend } = review.firstPassAcceptance;
  const frame = {
    title: texts.firstPassAcceptance,
    help: t.metrics.metricHelp.firstPassAcceptance,
    sample: texts.reviewedDeliveries(reviewed, formatCount(reviewed)),
    className,
  };

  if (!significant || rate === null) {
    return (
      <Tile {...frame} indicative>
        <NotSignificant reason={texts.fewReviewed(formatCount(reviewed), formatCount(minReviewed))}>
          <p className="text-micro text-ink-3 tnum">
            {rate === null ? texts.noReviewed : t.metrics.tiles.observed(formatPercent(rate, { precise: true }), formatCount(accepted), formatCount(reviewed))}
          </p>
        </NotSignificant>
      </Tile>
    );
  }

  return (
    <Tile {...frame}>
      <Value caption={texts.acceptedOf(formatCount(accepted), formatCount(reviewed))}>{formatPercent(rate, { precise: true })}</Value>
      {trend.previous === null || trend.previousSignificant ? (
        <Trend trend={trend} measure={MEASURES[language].acceptance} comparison={comparison} />
      ) : (
        <p className="text-micro text-ink-3">{texts.previousNotSignificant(formatCount(minReviewed))}</p>
      )}
    </Tile>
  );
}

/** La Couverture de relecture : la part des Livraisons de la période qui sont des Livraisons relues. */
function ReviewCoverageTile({ review, className }: { review: MetricsReview; className: string }) {
  const t = useT();
  const { formatCount, formatPercent } = useFormat();
  const texts = t.metrics.agentChain;
  const { deliveries, reviewed, coverage } = review;
  return (
    <Tile title={texts.reviewCoverage} help={t.metrics.metricHelp.reviewCoverage} sample={t.metrics.tiles.deliveries(deliveries, formatCount(deliveries))} className={className}>
      <Value muted={coverage === null} caption={coverage === null ? t.metrics.tiles.noDeliveries : texts.reviewedOf(formatCount(reviewed), reviewed, formatCount(deliveries))}>
        {formatPercent(coverage, { precise: true })}
      </Value>
    </Tile>
  );
}

/** Les Tours par Livraison : les Livraisons relues selon leur nombre de Tours de relecture, chacune avec sa part. */
function ReviewRoundsTile({ review, className }: { review: MetricsReview; className: string }) {
  const t = useT();
  const { formatCount } = useFormat();
  const texts = t.metrics.agentChain;
  const { reviewed, roundsPerDelivery } = review;
  return (
    <Tile title={texts.reviewRounds} help={t.metrics.metricHelp.reviewRounds} sample={texts.reviewedDeliveries(reviewed, formatCount(reviewed))} className={className}>
      {reviewed === 0 ? (
        <p className="text-micro text-ink-3">{texts.noReviewed}</p>
      ) : (
        <CountList
          label={texts.roundsList}
          rows={ROUNDS.map((key) => ({ key, label: texts.rounds[key], count: roundsPerDelivery[key] }))}
          noun={texts.deliveriesNoun}
          total={reviewed}
        />
      )}
    </Tile>
  );
}

/** Les Retours par origine : leur nombre en grand, puis chaque origine (le Statut de relais quitté), zéros compris : la répartition est la mesure. */
function SendBacksTile({ review, className }: { review: MetricsReview; className: string }) {
  const t = useT();
  const { formatCount } = useFormat();
  const texts = t.metrics.agentChain;
  const total = ORIGINS.reduce((sum, origin) => sum + review.sendBacks[origin], 0);
  return (
    <Tile title={texts.sendBacks} help={t.metrics.metricHelp.sendBacks} className={className}>
      <Value caption={texts.sendBacksCaption}>{formatCount(total)}</Value>
      <div className="border-t border-line pt-2">
        <CountList
          label={texts.sendBacksList}
          rows={ORIGINS.map((origin) => ({ key: origin, label: texts.origins[origin], count: review.sendBacks[origin] }))}
          noun={texts.sendBacksNoun}
        />
      </div>
    </Tile>
  );
}

/**
 * Le Taux d'échec après relecture, à côté de celui des Livraisons non relues. Significatif par la règle du Taux d'échec : sinon la tuile le dit avec le même
 * motif, et garde les deux taux observés en retrait.
 */
function FailureRateAfterReviewTile({ review, className }: { review: MetricsReview; className: string }) {
  const t = useT();
  const { formatCount, formatPercent } = useFormat();
  const { language } = useLanguage();
  const texts = t.metrics.agentChain;
  const { reviewed, unreviewed, significant } = review.failureRate;
  const percent = (part: MetricsReviewFailureRate) => formatPercent(part.rate, { precise: true });
  const failedOf = (part: MetricsReviewFailureRate) => t.metrics.tiles.failedOf(formatCount(part.failed), formatCount(part.deliveries));
  const frame = {
    title: texts.failureRateAfterReview,
    help: t.metrics.metricHelp.failureRateAfterReview,
    sample: t.metrics.tiles.deliveries(review.deliveries, formatCount(review.deliveries)),
    className,
  };

  if (!significant) {
    const observed = (part: MetricsReviewFailureRate, text: typeof texts.observedReviewed, none: string) => (
      <p className="text-micro text-ink-3 tnum">{part.rate === null ? none : text(percent(part), formatCount(part.failed), formatCount(part.deliveries))}</p>
    );
    return (
      <Tile {...frame} indicative>
        <NotSignificant reason={failureRateReason(review.failureRate, language)}>
          {observed(reviewed, texts.observedReviewed, texts.noReviewed)}
          {observed(unreviewed, texts.observedUnreviewed, texts.noUnreviewed)}
        </NotSignificant>
      </Tile>
    );
  }

  return (
    <Tile {...frame}>
      <Value muted={reviewed.rate === null} caption={reviewed.rate === null ? texts.noReviewed : texts.reviewedFailed(failedOf(reviewed))}>
        {percent(reviewed)}
      </Value>
      <p className="border-t border-line pt-2 text-micro text-ink-3 tnum">
        {unreviewed.rate === null ? texts.noUnreviewed : texts.unreviewedFailed(percent(unreviewed), failedOf(unreviewed))}
      </p>
    </Tile>
  );
}

/**
 * L'Attente humaine des Livraisons de la période : la médiane en grand, le P85 et sa part du Cycle Time cumulé dessous. Médiane et P85 ne portent que sur les
 * Livraisons qui ont attendu ; sous 4, ils sont donnés mais ne disent pas grand-chose : la tuile est en pointillé et le dit. Dans l'onglet Décisions
 * (bdesk-3e9.7), à côté des Décisions par sens.
 */
export function HumanWaitTile({ breakdown, className }: { breakdown: MetricsCycleTimeBreakdown; className?: string }) {
  const t = useT();
  const { formatCount, formatPercent } = useFormat();
  const texts = t.metrics.humanWait;
  const { waited, stats, reliable, minDeliveries, share } = breakdown.humanWaits;
  const any = waited > 0;
  return (
    <Tile
      title={texts.title}
      help={t.metrics.metricHelp.humanWait}
      sample={any ? texts.waited(waited, formatCount(waited)) : undefined}
      indicative={any && !reliable}
      className={className}
    >
      <Value muted={!any} caption={any ? t.metrics.tiles.median : texts.none}>
        <DurationText ms={stats.median} />
      </Value>
      {any ? (
        <div className="flex flex-col gap-1 border-t border-line pt-2">
          <p className="flex items-baseline gap-1.5">
            <span className="text-micro text-ink-3">{t.metrics.tiles.p85}</span>
            <span data-p85="" className="tnum text-base font-bold leading-6 text-ink">
              <DurationText ms={stats.p85} />
            </span>
          </p>
          <p data-share="" className="text-micro text-ink-3 tnum">
            {texts.share(formatPercent(share, { precise: true }))}
          </p>
          {reliable ? null : <p className="text-micro leading-4 text-ink-2">{texts.unreliable(formatCount(minDeliveries))}</p>}
        </div>
      ) : null}
    </Tile>
  );
}

/**
 * Des comptes en lignes : un libellé, le nombre, et sa part de `total` s'il est donné, à une décimale comme les autres parts de la section. L'écran
 * n'écrit que le nombre ; les lecteurs d'écran entendent ce qu'il compte (`noun`) : « 1 Tour, 8 Livraisons, 66,7 % ». L'onglet Décisions s'en sert aussi
 * (les Décisions par sens, les preuves qui manquent).
 */
export function CountList({
  label,
  rows,
  noun,
  total,
}: {
  label: string;
  rows: readonly { key: string; label: string; count: number }[];
  noun: (n: number) => string;
  total?: number;
}) {
  const { formatCount, formatPercent } = useFormat();
  return (
    <ul aria-label={label} className="flex flex-col gap-1">
      {rows.map((row) => (
        <li key={row.key} data-row={row.key} className="flex min-w-0 items-baseline gap-2 text-ui">
          <span className="min-w-0 flex-1 text-ink-2">{row.label}</span>
          <span className="tnum font-semibold text-ink">
            {formatCount(row.count)}
            <span className="sr-only"> {noun(row.count)}</span>
          </span>
          {total === undefined ? null : <span className="tnum w-12 shrink-0 text-right text-micro text-ink-3">{formatPercent(row.count / total, { precise: true })}</span>}
        </li>
      ))}
    </ul>
  );
}
