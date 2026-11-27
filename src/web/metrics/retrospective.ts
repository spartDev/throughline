import type { MetricsTrend, SignalsResponse } from '../../shared/api';
import { ticketTitle } from '../data/helpers';
import { projectLabel } from '../data/projectNames';
import { CATALOGS } from '../i18n/catalog';
import type { Language } from '../i18n/language';
import { signalKinds, signalSentence } from '../lib/signals';
import type { NamedMetricsResponse } from './api';
import { describeComparison } from './comparison';
import { failureRateReason } from './failureReason';
import { dayInZone, FORMATS, formatTime } from './format';
import { hasTabs } from './params';
import { describeTrend, MEASURES, type Measure } from './trend';

/**
 * Les Signaux du rapport : la réponse, ou pourquoi il n'y en a pas. Ils sont lus à part des métriques (`GET /api/signals`) : leur absence ne doit pas
 * empêcher de copier le reste.
 */
export type RetrospectiveSignals = { status: 'ok'; response: SignalsResponse } | { status: 'error' };

export interface RetrospectiveInput {
  /** Ce que le rapport mesure, tel que le titre le dit : le nom du Projet, ou « Vue globale ». */
  scopeName: string;
  metrics: NamedMetricsResponse;
  signals: RetrospectiveSignals;
  /** La langue du rapport : celle de l'interface. */
  language: Language;
}

const textsIn = (language: Language) => CATALOGS[language].metrics.retrospective;

const DASH = '—';

/**
 * Un texte venu des données (titre de ticket, nom de Projet) écrit tel quel dans le markdown : ses caractères de mise en forme sont échappés, pour qu'un
 * titre « Fix *config* | auth » ne crée ni italique ni colonne de tableau. Les fins de ligne deviennent des espaces : une ligne de liste ou de tableau ne se
 * coupe pas.
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(/([\\`*_[\]<>|#~])/g, '\\$1');
}

/** Un nombre accordé : `text` reçoit le nombre écrit dans la langue, puis le nombre lui-même pour le pluriel. */
const counted = (language: Language, count: number, text: (written: string, n: number) => string) => text(FORMATS[language].formatCount(count), count);

/** L'évolution d'une grandeur, pour la colonne du tableau : « +3 (+33 %), en mieux », « stable », « — » sans comparaison. */
export function evolution(trend: MetricsTrend, measure: Measure): string {
  const texts = textsIn(measure.language);
  const view = describeTrend(trend, measure);
  if (view.direction === 'none') return DASH;
  if (view.direction === 'flat') return texts.stable;
  const verdict = view.tone === 'good' ? texts.better : view.tone === 'bad' ? texts.worse : '';
  return `${view.delta}${view.ratio ? ` (${view.ratio})` : ''}${verdict}`;
}

const previousOf = (trend: MetricsTrend, measure: Measure): string => (trend.previous === null ? DASH : measure.format(trend.previous));

const row = (cells: string[]) => `| ${cells.join(' | ')} |`;

function indicators({ tiles, health }: NamedMetricsResponse, language: Language): string[] {
  const texts = textsIn(language);
  const soundName = CATALOGS[language].metrics.tiles.soundThroughput;
  const { formatCount } = FORMATS[language];
  const { throughput, soundThroughput: sound, leadTime, failureRate } = tiles;
  const { reopening } = health;
  const { count, duration, rate } = MEASURES[language];
  const failureValue =
    failureRate.rate === null
      ? DASH
      : `${rate.format(failureRate.rate)} (${texts.outOf(formatCount(failureRate.failed), counted(language, failureRate.deliveries, texts.deliveries))})${failureRate.significant ? '' : texts.notSignificant}`;
  // Le Débit sain (bdesk-3e9.8) se lit comme sa tuile : provisoire tant que la période court, sauf sans Livraison, où rien ne peut revenir.
  const soundProvisional = sound.provisional && sound.deliveries > 0;
  const soundCount =
    sound.deliveries === 0 ? counted(language, 0, texts.deliveries) : texts.outOf(formatCount(sound.total), counted(language, sound.deliveries, texts.deliveries));
  const soundValue = `${soundCount}${sound.significant ? '' : texts.notSignificant}${soundProvisional ? texts.provisional : ''}`;
  const lines = [
    row([texts.indicator, texts.period, texts.previous, texts.evolution]),
    row(['---', '---:', '---:', '---']),
    row([texts.throughput, counted(language, throughput.total, texts.deliveries), previousOf(throughput.trend, count), evolution(throughput.trend, count)]),
    row([soundName, soundValue, previousOf(sound.trend, count), evolution(sound.trend, count)]),
    row([texts.leadTimeMedian, duration.format(leadTime.median ?? Number.NaN), previousOf(leadTime.trend.median, duration), evolution(leadTime.trend.median, duration)]),
    row([texts.leadTimeP85, duration.format(leadTime.p85 ?? Number.NaN), previousOf(leadTime.trend.p85, duration), evolution(leadTime.trend.p85, duration)]),
    row([
      texts.reopenRate,
      reopening.rate === null ? DASH : `${rate.format(reopening.rate)} (${texts.outOf(formatCount(reopening.reopened), counted(language, reopening.closures, texts.closures))})`,
      previousOf(reopening.trend, rate),
      reopening.rate === null ? DASH : evolution(reopening.trend, rate),
    ]),
    row([texts.failureRate, failureValue, previousOf(failureRate.trend, rate), failureRate.rate === null ? DASH : evolution(failureRate.trend, rate)]),
  ];
  // Non significatifs, le Débit sain et le Taux d'échec ne se lisent pas sans leur raison (Couverture faible, trop peu de bugs) : elle suit le tableau, dans
  // l'ordre des lignes. Le motif est écrit ici, dans la langue du rapport, à partir des codes de l'API (`failureRateReason`), comme sur les tuiles : celui du
  // serveur (`reason`) est en français.
  const notes: string[] = [];
  const soundReason = sound.significant ? null : failureRateReason(sound, language);
  if (soundReason !== null) notes.push(texts.notSignificantNote(soundName, escapeMarkdown(soundReason)));
  if (soundProvisional) notes.push(texts.soundProvisional);
  const reason = failureRate.significant ? null : failureRateReason(failureRate, language);
  if (reason !== null) notes.push(texts.notSignificantNote(texts.failureRate, escapeMarkdown(reason)));
  for (const note of notes) lines.push('', `_${note}_`);
  return lines;
}

/**
 * La Chaîne d'agents (bdesk-pz0.8), comme la page la montre : seulement si une Livraison de la période est passée par un Statut de relais. L'Acceptation au
 * premier passage avec son évolution, comme les indicateurs, sauf face à une période précédente non significative, et l'Attente humaine, que l'API ne compare
 * pas à la période précédente.
 */
function agentChain({ review, cycleTimeBreakdown }: NamedMetricsResponse, language: Language): string[] {
  if (review.handedOff === 0) return [];
  const texts = textsIn(language);
  const catalog = CATALOGS[language].metrics;
  const { formatCount, formatPercent } = FORMATS[language];
  const { acceptance, duration } = MEASURES[language];
  const { accepted, reviewed, rate, significant, minReviewed, trend } = review.firstPassAcceptance;
  const { waited, stats, reliable, minDeliveries, share } = cycleTimeBreakdown.humanWaits;
  const acceptanceValue =
    rate === null
      ? DASH
      : `${acceptance.format(rate)} (${texts.outOf(formatCount(accepted), counted(language, reviewed, texts.reviewedDeliveries))})${significant ? '' : texts.notSignificant}`;
  // Une période précédente sous le seuil a un taux, mais il ne dit rien : la colonne le dit, et l'évolution n'en tire pas de verdict.
  const previousValue = `${previousOf(trend, acceptance)}${trend.previous === null || trend.previousSignificant ? '' : texts.notSignificant}`;
  const lines = [
    `## ${catalog.agentChain.heading}`,
    '',
    row([texts.indicator, texts.period, texts.previous, texts.evolution]),
    row(['---', '---:', '---:', '---']),
    row([catalog.agentChain.firstPassAcceptance, acceptanceValue, previousValue, rate === null || !trend.previousSignificant ? DASH : evolution(trend, acceptance)]),
    row([texts.humanWaitMedian, duration.format(stats.median ?? Number.NaN), DASH, DASH]),
    row([texts.humanWaitP85, duration.format(stats.p85 ?? Number.NaN), DASH, DASH]),
  ];
  if (!significant) lines.push('', `_${texts.acceptanceNote(formatCount(reviewed), reviewed, formatCount(minReviewed))}_`);
  const wait =
    waited === 0
      ? catalog.humanWait.none
      : `${texts.humanWaitNote(counted(language, waited, texts.deliveries), waited, formatPercent(share, { precise: true }))}${reliable ? '' : texts.humanWaitUnreliable(formatCount(minDeliveries))}`;
  lines.push('', `_${wait}_`);
  return lines;
}

/**
 * Une ligne de liste d'un ticket, la même pour le Retravail et les Livraisons sans Feu vert : son identifiant en code, son titre, son Projet quand la vue en
 * mesure plusieurs (`projectName`, null sinon), puis ce qu'elle en dit.
 */
function ticketItem(ticket: { id: string; title: string; project: string }, detail: string, projectName: ((id: string) => string) | null, language: Language): string {
  const where = projectName ? ` (${escapeMarkdown(projectName(ticket.project))})` : '';
  return `- ${textsIn(language).item(`\`${ticket.id}\` ${escapeMarkdown(ticketTitle(ticket, language))}${where}`, detail)}`;
}

/**
 * Les Décisions (bdesk-3e9.8), comme l'onglet du même nom, et à la même condition : un Projet de la vue a les Statuts de relais (`hasTabs`). Les Décisions
 * tenues et la répartition par sens, la part des Livraisons prouvées, le Coût d'attention, puis la liste des Livraisons sans Feu vert, de la forme de celle du
 * Retravail. Titres, phrases et arrondis sont ceux de l'onglet ; l'API ne compare pas ces mesures à la période précédente.
 */
function decisions(metrics: NamedMetricsResponse, projectName: (id: string) => string, language: Language): string[] {
  if (!hasTabs(metrics)) return [];
  const texts = textsIn(language);
  const { metricsTabs, decisionsTab, heldDecisions, decisionSenses, evidenced, attentionCost, withoutGreenLight } = CATALOGS[language].metrics;
  const { formatCount, formatDay, formatDecimal, formatPercent } = FORMATS[language];
  const tally = metrics.decisions;
  const { greenLights, rejections } = tally;
  const judged = greenLights.total + rejections.total;
  const lines = [`## ${metricsTabs.decisions}`, '', `### ${decisionsTab.heldHeading}`, ''];
  if (tally.total === 0) {
    lines.push(decisionSenses.none);
  } else {
    const held = greenLights.held + rejections.held;
    lines.push(judged === 0 ? heldDecisions.none : `${formatCount(held)} ${heldDecisions.heldOf(heldDecisions.judged(judged, formatCount(judged)), formatPercent(held / judged, { precise: true }))}`, '');
    // Chaque sens, zéros compris, avec sa part des Décisions comme sur la tuile ; les Feux verts et les Refus disent aussi combien ont tenu.
    const senses: { sense: keyof typeof decisionSenses.senses; count: number; held?: number }[] = [
      { sense: 'greenLights', count: greenLights.total, held: greenLights.held },
      { sense: 'reruns', count: tally.reruns },
      { sense: 'rejections', count: rejections.total, held: rejections.held },
      { sense: 'postponements', count: tally.postponements },
    ];
    for (const { sense, count, held: senseHeld } of senses) {
      const share = `${formatCount(count)} (${formatPercent(count / tally.total, { precise: true })})`;
      lines.push(`- ${texts.item(decisionSenses.senses[sense], senseHeld === undefined ? share : `${share}, ${texts.held(senseHeld, formatCount(senseHeld))}`)}`);
    }
    if (tally.provisional && judged > 0) lines.push('', `_${heldDecisions.provisional}_`);
  }

  const proved = tally.evidencedDeliveries;
  lines.push('', `### ${decisionsTab.evidencedHeading}`, '');
  lines.push(
    proved.share === null
      ? evidenced.none
      : `${formatPercent(proved.share, { precise: true })} (${evidenced.evidencedOf(formatCount(proved.evidenced), proved.evidenced, formatCount(proved.deliveries))}). ${proved.mostMissing === null ? evidenced.allEvidenced : evidenced.mostMissing(evidenced.evidence[proved.mostMissing])}`,
  );

  const { deliveries, decisions: asked, perDelivery } = tally.attentionCost;
  lines.push('', `### ${decisionsTab.attentionHeading}`, '');
  lines.push(
    perDelivery === null
      ? attentionCost.none
      : texts.item(attentionCost.caption, `${formatDecimal(perDelivery, 1)} (${attentionCost.detail(formatCount(asked), asked, attentionCost.chained(deliveries, formatCount(deliveries)))})`),
  );

  const tickets = proved.withoutGreenLight;
  lines.push('', `### ${texts.headingCount(withoutGreenLight.title, counted(language, tickets.length, texts.deliveries))}`, '');
  if (tickets.length === 0) lines.push(proved.deliveries === 0 ? withoutGreenLight.noChained : withoutGreenLight.empty);
  const where = metrics.projects.length > 1 ? projectName : null;
  for (const ticket of tickets) {
    lines.push(ticketItem(ticket, withoutGreenLight.deliveredOn(formatDay(dayInZone(ticket.deliveredAt, metrics.timeZone))), where, language));
  }
  return lines;
}

function longTrend({ longTrend: trend }: NamedMetricsResponse, language: Language): string[] {
  if (trend.weeks.length === 0) return [];
  const texts = textsIn(language);
  const { formatCount, formatDay, formatPercent } = FORMATS[language];
  const lines = [
    `## ${texts.longTrend(formatCount(trend.weeks.length), trend.weeks.length)}`,
    '',
    row([texts.weekOf, texts.throughput, texts.leadTimeP85, texts.reopenRate]),
    row(['---', '---:', '---:', '---:']),
  ];
  for (const week of trend.weeks) {
    const p85 = week.leadTimeP85 === null ? DASH : `${MEASURES[language].duration.format(week.leadTimeP85)}${week.reliable ? '' : ' \\*'}`;
    lines.push(
      row([
        `${formatDay(week.from)}${week.partial ? texts.running : ''}`,
        formatCount(week.throughput),
        p85,
        week.reopeningRate === null ? DASH : formatPercent(week.reopeningRate, { precise: true }),
      ]),
    );
  }
  if (trend.weeks.some((week) => week.leadTimeP85 !== null && !week.reliable)) {
    lines.push('', `\\* ${texts.unreliable(formatCount(trend.minDeliveries))}`);
  }
  return lines;
}

function rework({ health, projects }: NamedMetricsResponse, projectName: (id: string) => string, language: Language): string[] {
  const texts = textsIn(language);
  const { tickets } = health.rework;
  const lines = [`## ${texts.rework(counted(language, tickets.length, texts.tickets))}`, ''];
  if (tickets.length === 0) return [...lines, texts.noRework];
  const where = projects.length > 1 ? projectName : null;
  for (const ticket of tickets) {
    const causes: string[] = [];
    if (ticket.reopenings > 0) causes.push(counted(language, ticket.reopenings, texts.reopens));
    if (ticket.returns > 0) causes.push(counted(language, ticket.returns, texts.handbacks));
    if (ticket.originBugs.length > 0) causes.push(texts.originBugs(ticket.originBugs.length, ticket.originBugs.map((id) => `\`${id}\``).join(', ')));
    lines.push(ticketItem(ticket, causes.join(', '), where, language));
  }
  return lines;
}

function signals(input: RetrospectiveSignals, timeZone: string, projectName: (id: string) => string, showProject: boolean, language: Language): string[] {
  const texts = textsIn(language);
  if (input.status === 'error') return [`## ${texts.signalsHeading}`, '', `_${texts.signalsUnreadable}_`];
  const { response } = input;
  const at = CATALOGS[language].metrics.comparison.at(FORMATS[language].formatDay(dayInZone(response.generatedAt, timeZone)), formatTime(response.generatedAt, timeZone));
  const lines = [`## ${texts.signalsHeadingAt(counted(language, response.signals.length, texts.signals), at)}`, ''];
  if (response.signals.length === 0) return [...lines, texts.noSignals];
  for (const { kind, label } of signalKinds(language)) {
    const group = response.signals.filter((signal) => signal.kind === kind);
    if (group.length === 0) continue;
    lines.push(`### ${label}`, '');
    for (const signal of group) {
      const where = escapeMarkdown(projectName(signal.project));
      if (!('ticket' in signal)) {
        lines.push(`- ${texts.item(where, signalSentence(signal, language))}`);
      } else {
        lines.push(`- ${texts.item(`\`${signal.ticket.id}\` ${escapeMarkdown(ticketTitle(signal.ticket, language))}${showProject ? ` (${where})` : ''}`, signalSentence(signal, language))}`);
      }
    }
    lines.push('');
  }
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

/**
 * Le rapport de rétrospective d'une période, en markdown à copier : Débit, Débit sain, Lead Time, Taux de Réouverture et Taux d'échec avec leur évolution par
 * rapport à la période précédente (la même comparaison que les tuiles), la Chaîne d'agents quand la page la montre (Acceptation au premier passage et Attente
 * humaine), les Décisions quand la page a son onglet Décisions (Décisions tenues et leur répartition par sens, Livraisons prouvées, Coût d'attention et
 * Livraisons sans Feu vert : bdesk-3e9.8), la Tendance longue, les tickets en Retravail et les Signaux en cours. Ce qui mesure la période vient d'abord, la
 * Chaîne d'agents et les Décisions à la suite des indicateurs, puis les 12 semaines. Les Signaux disent maintenant, pas la période : le rapport le dit dans
 * leur titre.
 */
export function buildRetrospective({ scopeName, metrics, signals: signalsInput, language }: RetrospectiveInput): string {
  const texts = textsIn(language);
  const comparison = describeComparison(metrics, language);
  // Les Projets des métriques passent en dernier, donc l'emportent : ils portent leur nom écrit et `unnamed` (« Sans titre » est un repli). Chaque ligne nomme le sien
  // comme l'avis des Projets illisibles : « Un Projet sans nom » pour un repli, les autres entre guillemets dès que la liste en compte un.
  const known = new Map<string, { name: string; unnamed?: true }>(
    [...(signalsInput.status === 'ok' ? signalsInput.response.projects : []), ...metrics.projects].map((project) => [project.id, project]),
  );
  const among = [...known.values()];
  const projectName = (id: string) => {
    const project = known.get(id);
    return project ? projectLabel(project, among) : id;
  };
  const showProject = metrics.projects.length > 1 || (signalsInput.status === 'ok' && signalsInput.response.projects.length > 1);

  const sections = [
    [`# ${texts.title(escapeMarkdown(scopeName), FORMATS[language].formatDayRange(metrics.period.from, metrics.period.to))}`, '', comparison.summary],
    [`## ${texts.indicators}`, '', ...indicators(metrics, language)],
    agentChain(metrics, language),
    decisions(metrics, projectName, language),
    longTrend(metrics, language),
    rework(metrics, projectName, language),
    signals(signalsInput, metrics.timeZone, projectName, showProject, language),
  ];
  return `${sections
    .filter((section) => section.length > 0)
    .map((section) => section.join('\n'))
    .join('\n\n')}\n`;
}
