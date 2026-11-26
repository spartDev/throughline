import { useId, type ReactNode } from 'react';
import type {
  MetricsAcceptance,
  MetricsCountTile,
  MetricsDecisions,
  MetricsDecisionsWeek,
  MetricsEvidence,
  MetricsEvidencedDeliveries,
  MetricsResponse,
} from '../../shared/api';
import { useFormat, useLanguage, useT } from '../i18n';
import { ActivityPanel, DecisionMapPanel } from './ActivityMap';
import { CountList, HumanWaitTile } from './AgentChain';
import { EmptyChart } from './CfdChart';
import { ChartCard, DataTable, Legend, SectionHeading } from './ChartParts';
import type { Comparison } from './comparison';
import { dayInZone } from './format';
import { BarPlot, LinePlot, Plot } from './LongTrendPanel';
import { TicketList } from './ReworkPanel';
import { projectColor, type SeriesContext } from './series';
import { NotSignificant, Provisional, Tile, Trend, Value } from './Tiles';
import { MEASURES } from './trend';

/**
 * L'onglet Décisions de la page Métriques (bdesk-3e9.7) : ce que l'utilisateur décide des tickets À valider, et ce que la chaîne lui demande. Il n'existe que
 * si un Projet de la vue a les Statuts de relais (`MetricsResponse.handoff`). Dans l'ordre du ticket :
 *
 * 1. Décisions tenues : par semaine sur 12 semaines (l'indicateur principal), puis la période, ses Décisions par sens, ses Renoncements et l'Attente humaine ;
 * 2. Livraisons prouvées : leur part, la preuve qui manque le plus, et la liste des Livraisons sans Feu vert ;
 * 3. Coût d'attention, et sa tendance sur 12 semaines ;
 * 4. Intention : l'Acceptation au premier passage avec et sans Intention écrite (la part des Epics qui ont un Outcome visé viendra avec bdesk-3e9.9) ;
 * 5. les deux horloges : la Carte d'activité des Transitions et la Carte des Décisions, côte à côte.
 *
 * Tout est déjà calculé par le serveur (`MetricsResponse.decisions`, `review`, `cycleTimeBreakdown`, `health`) : l'onglet ne fait qu'afficher.
 */
export function DecisionsTab({
  data,
  comparison,
  ctx,
  showProject,
}: {
  data: MetricsResponse;
  comparison: Comparison;
  ctx: SeriesContext;
  showProject: boolean;
}) {
  const texts = useT().metrics.decisionsTab;
  const { decisions } = data;
  const { byWrittenIntent, minReviewed } = data.review.firstPassAcceptance;
  return (
    <>
      <DecisionsSection heading={texts.heldHeading} intro={texts.heldIntro}>
        <HeldDecisionsPanel weeks={decisions.weeks} />
        <div className="grid min-w-0 gap-3 @min-[36rem]:grid-cols-2 @min-[68rem]:grid-cols-4">
          <HeldDecisionsTile decisions={decisions} />
          <DecisionSensesTile decisions={decisions} />
          <DeclinesTile declines={data.health.declines} comparison={comparison} />
          <HumanWaitTile breakdown={data.cycleTimeBreakdown} />
        </div>
      </DecisionsSection>

      <DecisionsSection heading={texts.evidencedHeading} intro={texts.evidencedIntro}>
        <div className="grid min-w-0 gap-3 @min-[56rem]:grid-cols-3">
          <EvidencedDeliveriesTile evidenced={decisions.evidencedDeliveries} />
          <div className="min-w-0 @min-[56rem]:col-span-2">
            <WithoutGreenLightPanel evidenced={decisions.evidencedDeliveries} timeZone={data.timeZone} ctx={ctx} showProject={showProject} />
          </div>
        </div>
      </DecisionsSection>

      <DecisionsSection heading={texts.attentionHeading} intro={texts.attentionIntro}>
        <div className="grid min-w-0 gap-3 @min-[56rem]:grid-cols-3">
          <AttentionCostTile decisions={decisions} />
          <div className="min-w-0 @min-[56rem]:col-span-2">
            <AttentionCostPanel weeks={decisions.weeks} />
          </div>
        </div>
      </DecisionsSection>

      <DecisionsSection heading={texts.intentHeading} intro={texts.intentIntro}>
        <div className="grid min-w-0 gap-3 @min-[36rem]:grid-cols-2">
          <IntentAcceptanceTile which="withIntent" acceptance={byWrittenIntent.withIntent} minReviewed={minReviewed} />
          <IntentAcceptanceTile which="withoutIntent" acceptance={byWrittenIntent.withoutIntent} minReviewed={minReviewed} />
        </div>
      </DecisionsSection>

      <DecisionsSection heading={texts.clocksHeading} intro={texts.clocksIntro}>
        <div className="grid min-w-0 gap-3 @min-[56rem]:grid-cols-2">
          <div className="min-w-0">
            <ActivityPanel activity={data.health.activity} timeZone={data.timeZone} />
          </div>
          <div className="min-w-0">
            <DecisionMapPanel map={decisions.decisionMap} timeZone={data.timeZone} />
          </div>
        </div>
      </DecisionsSection>
    </>
  );
}

/** Une section de l'onglet : son intertitre, la phrase qui dit ce qu'elle mesure, et ses tuiles et cartes. */
function DecisionsSection({ heading, intro, children }: { heading: string; intro: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <SectionHeading id={titleId}>{heading}</SectionHeading>
        <p className="max-w-[90ch] text-micro text-ink-2">{intro}</p>
      </div>
      {children}
    </section>
  );
}

const judgedOf = ({ greenLights, rejections }: Pick<MetricsDecisions, 'greenLights' | 'rejections'>) => greenLights.total + rejections.total;
const heldOf = ({ greenLights, rejections }: Pick<MetricsDecisions, 'greenLights' | 'rejections'>) => greenLights.held + rejections.held;

/** Les Feux verts et les Refus d'une semaine : en barres, sous eux ceux que rien n'a démentis. */
const JUDGED = 'var(--flow-awaiting)';
/** Les Décisions tenues : le vert de ce qui a tenu, comme le Terminé du CFD. */
const HELD = 'var(--flow-done)';
/** Le Coût d'attention par semaine : une teinte de la série des Projets, celle du Lead Time de la Tendance longue. */
const ATTENTION = projectColor(258);

/**
 * Les Décisions tenues par semaine, l'indicateur principal de l'onglet : les Feux verts et les Refus de chacune des 12 semaines en barres, et dessous, à la
 * même échelle, ceux que rien n'a démentis, comme le Débit sain sous le Débit de la Tendance longue. La semaine en cours est hachurée : ses Décisions tenues sont
 * provisoires, l'infobulle de sa barre et la remarque de sa ligne le disent.
 */
function HeldDecisionsPanel({ weeks }: { weeks: readonly MetricsDecisionsWeek[] }) {
  const t = useT();
  const format = useFormat();
  const texts = t.metrics.heldDecisions;
  // Des Relances et des Reports seuls ne dessinent rien : seuls les Feux verts et les Refus sont tenus ou démentis.
  const empty = weeks.every((week) => judgedOf(week) === 0);
  const top = Math.max(0, ...weeks.map(judgedOf));
  const sum = (value: (week: MetricsDecisionsWeek) => number) => weeks.reduce((total, week) => total + value(week), 0);
  const weekCount = format.formatCount(weeks.length);
  const judged = (n: number) => texts.judged(n, format.formatCount(n));
  const held = (n: number) => texts.held(n, format.formatCount(n));

  return (
    <ChartCard
      title={texts.weeklyTitle}
      help={t.metrics.metricHelp.heldDecisionsWeekly}
      description={texts.weeklyDescription}
      legend={
        <Legend
          label={texts.weeklyLegend}
          items={[
            { key: 'judged', label: texts.judgedPlot, color: JUDGED },
            { key: 'held', label: texts.heldPlot, color: HELD },
            { key: 'partial', label: texts.partial, color: JUDGED, hatched: true },
          ]}
        />
      }
      data={<HeldDecisionsTable weeks={weeks} />}
    >
      {empty ? (
        <EmptyChart>{texts.weeklyEmpty}</EmptyChart>
      ) : (
        <div className="flex flex-col gap-2">
          <Plot title={texts.judgedPlot}>
            {({ width, height }) => (
              <BarPlot
                weeks={weeks}
                value={judgedOf}
                top={top}
                color={JUDGED}
                label={texts.judgedLabel(judged(sum(judgedOf)), weekCount)}
                describe={(count) => judged(count)}
                width={width}
                height={height}
              />
            )}
          </Plot>
          <Plot title={texts.heldPlot}>
            {({ width, height }) => (
              <BarPlot
                weeks={weeks}
                value={heldOf}
                top={top}
                color={HELD}
                label={texts.heldLabel(held(sum(heldOf)), weekCount)}
                describe={(count, week) => (week.partial ? texts.provisionalPoint(held(count), count) : held(count))}
                width={width}
                height={height}
              />
            )}
          </Plot>
        </div>
      )}
    </ChartCard>
  );
}

/** Le tableau des 12 semaines : toutes les Décisions, les Feux verts et les Refus, et parmi eux les tenus et les démentis. */
function HeldDecisionsTable({ weeks }: { weeks: readonly MetricsDecisionsWeek[] }) {
  const texts = useT().metrics.heldDecisions;
  const { formatCount, formatDayRange } = useFormat();
  const columns = [texts.decisionsColumn, texts.greenLightsColumn, texts.rejectionsColumn, texts.heldColumn, texts.contradictedColumn];
  return (
    <DataTable
      caption={texts.caption}
      head={
        <tr>
          <th scope="col" className="px-3 py-1.5 font-medium">
            {texts.weekColumn}
          </th>
          {columns.map((column) => (
            <th key={column} scope="col" className="px-3 py-1.5 text-right font-medium">
              {column}
            </th>
          ))}
          <th scope="col" className="px-3 py-1.5 font-medium">
            {texts.remarkColumn}
          </th>
        </tr>
      }
    >
      {weeks.map((week) => (
        <tr key={week.from}>
          <th scope="row" className="whitespace-nowrap px-3 py-1 text-left font-normal text-ink-2">
            {formatDayRange(week.from, week.to)}
          </th>
          <td className="px-3 py-1 text-right font-medium">{formatCount(week.total)}</td>
          <td className="px-3 py-1 text-right">{formatCount(week.greenLights.total)}</td>
          <td className="px-3 py-1 text-right">{formatCount(week.rejections.total)}</td>
          <td data-held="" className="px-3 py-1 text-right">
            {formatCount(heldOf(week))}
          </td>
          <td className="px-3 py-1 text-right">{formatCount(week.greenLights.contradicted + week.rejections.contradicted)}</td>
          <td className="px-3 py-1 text-ink-2">
            {[week.partial ? texts.inProgress : '', week.partial && judgedOf(week) > 0 ? texts.heldProvisional : ''].filter(Boolean).join(texts.remarkSeparator)}
          </td>
        </tr>
      ))}
    </DataTable>
  );
}

/**
 * Les Décisions tenues de la période : leur nombre en grand, leur part des Feux verts et des Refus dessous, puis chaque sens. Tant que la période court, elles
 * sont provisoires, et la tuile le dit, comme celle du Débit sain ; sans Feu vert ni Refus, il n'y a rien qui puisse être démenti, et elle ne le dit pas.
 */
function HeldDecisionsTile({ decisions }: { decisions: MetricsDecisions }) {
  const t = useT();
  const { formatCount, formatPercent } = useFormat();
  const texts = t.metrics.heldDecisions;
  const judged = judgedOf(decisions);
  const held = heldOf(decisions);
  const { greenLights, rejections } = decisions;
  return (
    <Tile title={texts.title} help={t.metrics.metricHelp.heldDecisions} sample={texts.judged(judged, formatCount(judged))}>
      <Value muted={judged === 0} caption={judged === 0 ? texts.none : texts.heldOf(texts.judged(judged, formatCount(judged)), formatPercent(held / judged, { precise: true }))}>
        {formatCount(held)}
      </Value>
      {judged > 0 ? (
        <div className="flex flex-col gap-1 border-t border-line pt-2">
          <p className="text-micro text-ink-3 tnum">{texts.greenLights(formatCount(greenLights.held), greenLights.held, formatCount(greenLights.total))}</p>
          <p className="text-micro text-ink-3 tnum">{texts.rejections(formatCount(rejections.held), rejections.held, formatCount(rejections.total))}</p>
          {decisions.provisional ? <Provisional>{texts.provisional}</Provisional> : null}
        </div>
      ) : null}
    </Tile>
  );
}

const SENSES = ['greenLights', 'reruns', 'rejections', 'postponements'] as const;

/** Les Décisions de la période par sens, zéros compris : la répartition est la mesure, chaque sens avec sa part. */
function DecisionSensesTile({ decisions }: { decisions: MetricsDecisions }) {
  const t = useT();
  const { formatCount } = useFormat();
  const texts = t.metrics.decisionSenses;
  const count = (sense: (typeof SENSES)[number]) => (sense === 'greenLights' || sense === 'rejections' ? decisions[sense].total : decisions[sense]);
  return (
    <Tile title={texts.title} help={t.metrics.metricHelp.decisionSenses}>
      <Value muted={decisions.total === 0} caption={decisions.total === 0 ? texts.none : texts.caption}>
        {formatCount(decisions.total)}
      </Value>
      {decisions.total > 0 ? (
        <div className="border-t border-line pt-2">
          <CountList
            label={texts.list}
            rows={SENSES.map((sense) => ({ key: sense, label: texts.senses[sense], count: count(sense) }))}
            noun={texts.noun}
            total={decisions.total}
          />
        </div>
      ) : null}
    </Tile>
  );
}

/** Les Renoncements de la période, à côté des Décisions : ce que l'utilisateur a décidé de ne pas faire. Leur tendance n'a ni bon ni mauvais sens. */
function DeclinesTile({ declines, comparison }: { declines: MetricsCountTile; comparison: Comparison }) {
  const t = useT();
  const { formatCount } = useFormat();
  const { language } = useLanguage();
  const texts = t.metrics.declines;
  return (
    <Tile title={texts.title} help={t.metrics.metricHelp.declines}>
      <Value caption={texts.caption}>{formatCount(declines.total)}</Value>
      <Trend trend={declines.trend} measure={MEASURES[language].tally} comparison={comparison} />
    </Tile>
  );
}

const EVIDENCE = ['writtenIntent', 'reviewRound', 'integration', 'greenLight'] as const satisfies readonly MetricsEvidence[];

/**
 * Les Livraisons prouvées de la période : leur part en grand, la preuve qui manque le plus souvent, puis le nombre de Livraisons auxquelles manque chacune,
 * dans l'ordre où la chaîne les produit. Sans Livraison passée par la chaîne, il n'y a pas de part.
 */
function EvidencedDeliveriesTile({ evidenced }: { evidenced: MetricsEvidencedDeliveries }) {
  const t = useT();
  const { formatCount, formatPercent } = useFormat();
  const texts = t.metrics.evidenced;
  const { deliveries, share, mostMissing, missing } = evidenced;
  return (
    <Tile title={texts.title} help={t.metrics.metricHelp.evidencedDeliveries} sample={texts.chained(deliveries, formatCount(deliveries))}>
      <Value muted={share === null} caption={share === null ? texts.none : texts.evidencedOf(formatCount(evidenced.evidenced), evidenced.evidenced, formatCount(deliveries))}>
        {formatPercent(share, { precise: true })}
      </Value>
      {deliveries > 0 ? (
        <div className="flex flex-col gap-2 border-t border-line pt-2">
          <p data-most-missing="" className="text-micro font-medium text-ink-2">
            {mostMissing === null ? texts.allEvidenced : texts.mostMissing(texts.evidence[mostMissing])}
          </p>
          <CountList
            label={texts.missingList}
            rows={EVIDENCE.map((evidence) => ({ key: evidence, label: texts.evidence[evidence], count: missing[evidence] }))}
            noun={texts.deliveriesNoun}
            total={deliveries}
          />
        </div>
      ) : null}
    </Tile>
  );
}

/** Les Livraisons sans Feu vert de la période, de la même forme que le Retravail : chacune avec le jour de sa Livraison, dans le Fuseau de l'utilisateur. */
function WithoutGreenLightPanel({
  evidenced,
  timeZone,
  ctx,
  showProject,
}: {
  evidenced: MetricsEvidencedDeliveries;
  timeZone: string;
  ctx: SeriesContext;
  showProject: boolean;
}) {
  const t = useT();
  const { formatDay } = useFormat();
  const texts = t.metrics.withoutGreenLight;
  const tickets = evidenced.withoutGreenLight;
  return (
    <ChartCard className="h-full" title={texts.title} help={t.metrics.metricHelp.withoutGreenLight} description={texts.description}>
      {tickets.length === 0 ? (
        <EmptyChart>{evidenced.deliveries === 0 ? texts.noChained : texts.empty}</EmptyChart>
      ) : (
        <TicketList
          label={texts.list}
          tickets={tickets}
          ctx={ctx}
          showProject={showProject}
          detail={(ticket) => texts.deliveredOn(formatDay(dayInZone(ticket.deliveredAt, timeZone)))}
        />
      )}
    </ChartCard>
  );
}

/** Le Coût d'attention de la période : les Décisions par Livraison passée par la chaîne, en grand, à une décimale ; ses deux termes dessous. */
function AttentionCostTile({ decisions }: { decisions: MetricsDecisions }) {
  const t = useT();
  const { formatCount, formatDecimal } = useFormat();
  const texts = t.metrics.attentionCost;
  const { deliveries, decisions: asked, perDelivery } = decisions.attentionCost;
  return (
    <Tile title={texts.title} help={t.metrics.metricHelp.attentionCost} sample={texts.chained(deliveries, formatCount(deliveries))}>
      <Value muted={perDelivery === null} caption={perDelivery === null ? texts.none : texts.caption}>
        {perDelivery === null ? '—' : formatDecimal(perDelivery, 1)}
      </Value>
      {perDelivery === null ? null : (
        <p className="border-t border-line pt-2 text-micro text-ink-3 tnum">
          {texts.detail(formatCount(asked), asked, texts.chained(deliveries, formatCount(deliveries)))}
        </p>
      )}
    </Tile>
  );
}

/** Le Coût d'attention de chacune des 12 semaines, en courbe sans lissage : une semaine sans Livraison passée par la chaîne n'a pas de point. */
function AttentionCostPanel({ weeks }: { weeks: readonly MetricsDecisionsWeek[] }) {
  const t = useT();
  const { formatDecimal } = useFormat();
  const texts = t.metrics.attentionCost;
  const empty = weeks.every((week) => week.attentionCost.perDelivery === null);
  return (
    <ChartCard className="h-full" title={texts.weeklyTitle} help={t.metrics.metricHelp.attentionCostWeekly} description={texts.weeklyDescription} data={<AttentionCostTable weeks={weeks} />}>
      {empty ? (
        <EmptyChart>{texts.weeklyEmpty}</EmptyChart>
      ) : (
        <Plot title={texts.title}>
          {({ width, height }) => (
            <LinePlot
              subject={texts.subject}
              weeks={weeks}
              value={(week) => week.attentionCost.perDelivery}
              dashed={() => false}
              ticks={(max) => ({ top: max > 0 ? max : 1, values: [] })}
              format={(value) => formatDecimal(value, 1)}
              speak={(value) => formatDecimal(value, 1)}
              color={ATTENTION}
              width={width}
              height={height}
            />
          )}
        </Plot>
      )}
    </ChartCard>
  );
}

function AttentionCostTable({ weeks }: { weeks: readonly MetricsDecisionsWeek[] }) {
  const t = useT();
  const { formatCount, formatDayRange, formatDecimal } = useFormat();
  const texts = t.metrics.attentionCost;
  return (
    <DataTable
      caption={texts.tableCaption}
      head={
        <tr>
          <th scope="col" className="px-3 py-1.5 font-medium">
            {t.metrics.heldDecisions.weekColumn}
          </th>
          {[texts.deliveriesColumn, texts.decisionsColumn, texts.costColumn].map((column) => (
            <th key={column} scope="col" className="px-3 py-1.5 text-right font-medium">
              {column}
            </th>
          ))}
        </tr>
      }
    >
      {weeks.map(({ from, to, attentionCost }) => (
        <tr key={from}>
          <th scope="row" className="whitespace-nowrap px-3 py-1 text-left font-normal text-ink-2">
            {formatDayRange(from, to)}
          </th>
          <td className="px-3 py-1 text-right">{formatCount(attentionCost.deliveries)}</td>
          <td className="px-3 py-1 text-right">{formatCount(attentionCost.decisions)}</td>
          <td className="px-3 py-1 text-right font-medium">{attentionCost.perDelivery === null ? '—' : formatDecimal(attentionCost.perDelivery, 1)}</td>
        </tr>
      ))}
    </DataTable>
  );
}

/**
 * L'Acceptation au premier passage d'une partie des Livraisons relues, avec ou sans Intention écrite. Sous 10 Livraisons relues, elle ne dit rien : la tuile
 * le dit avec le motif et garde le taux observé en retrait, comme celle de la Chaîne d'agents. Pas de tendance : l'onglet compare les deux parties entre elles.
 */
function IntentAcceptanceTile({ which, acceptance, minReviewed }: { which: 'withIntent' | 'withoutIntent'; acceptance: MetricsAcceptance; minReviewed: number }) {
  const t = useT();
  const { formatCount, formatPercent } = useFormat();
  const chain = t.metrics.agentChain;
  const texts = t.metrics.writtenIntent;
  const { accepted, reviewed, rate, significant } = acceptance;
  const frame = {
    title: texts[which],
    help: which === 'withIntent' ? t.metrics.metricHelp.acceptanceWithIntent : t.metrics.metricHelp.acceptanceWithoutIntent,
    sample: chain.reviewedDeliveries(reviewed, formatCount(reviewed)),
  };
  const measure = <p className="-mt-1.5 text-micro text-ink-3">{texts.measure}</p>;

  if (!significant || rate === null) {
    return (
      <Tile {...frame} indicative>
        {measure}
        <NotSignificant reason={chain.fewReviewed(formatCount(reviewed), formatCount(minReviewed))}>
          <p className="text-micro text-ink-3 tnum">
            {rate === null ? chain.noReviewed : t.metrics.tiles.observed(formatPercent(rate, { precise: true }), formatCount(accepted), formatCount(reviewed))}
          </p>
        </NotSignificant>
      </Tile>
    );
  }

  return (
    <Tile {...frame}>
      {measure}
      <Value caption={chain.acceptedOf(formatCount(accepted), formatCount(reviewed))}>{formatPercent(rate, { precise: true })}</Value>
    </Tile>
  );
}
