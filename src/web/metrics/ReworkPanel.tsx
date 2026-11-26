import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { MetricsRework, MetricsReworkTicket } from '../../shared/api';
import { ticketTitle } from '../data/helpers';
import { useFormat, useT } from '../i18n';
import { paths } from '../paths';
import { Button } from '../ui/Button';
import { PriorityBadge, TypeGlyph } from '../ui/IssueBadges';
import { EmptyChart } from './CfdChart';
import { ChartCard } from './ChartParts';
import type { SeriesContext } from './series';

/** Combien de tickets une liste montre avant « Afficher les N autres ». */
const VISIBLE_REWORK = 10;

export interface ReworkPanelProps {
  rework: MetricsRework;
  ctx: SeriesContext;
  /** Les Projets sont plusieurs : leur nom a un sens. */
  showProject: boolean;
}

/**
 * Le Retravail de la période : les tickets qui reviennent, chacun avec ce qui l'y met (Réouvertures, Prises rendues, Bugs d'origine). Le Taux de
 * Réouverture et le Taux d'échec en donnent la proportion ; cette liste dit lesquels. Neutre : sans couleur de découpage, le type et la priorité
 * sont sur chaque ligne.
 */
export function ReworkPanel({ rework, ctx, showProject }: ReworkPanelProps) {
  const texts = useT().metrics.rework;
  return (
    <ChartCard title={texts.title} description={texts.description}>
      {rework.tickets.length === 0 ? (
        <EmptyChart>{texts.empty}</EmptyChart>
      ) : (
        <TicketList label={texts.list} tickets={rework.tickets} ctx={ctx} showProject={showProject} detail={(ticket) => <Causes ticket={ticket} />} />
      )}
    </ChartCard>
  );
}

/** Ce qu'une ligne de `TicketList` montre d'un ticket. */
export interface ListedTicket {
  id: string;
  title: string;
  type: string;
  priority: number;
  /** L'identifiant de son Projet. */
  project: string;
}

/**
 * Une liste de tickets de la page Métriques, chacun un lien vers son Panneau : le type, le titre et la priorité, puis l'identifiant, le Projet quand ils sont
 * plusieurs, et ce que la liste en dit (`detail`). Les `VISIBLE_REWORK` premiers, puis « Afficher les N autres ». Celle du Retravail, et celle des Livraisons
 * sans Feu vert de l'onglet Décisions (bdesk-3e9.7), de la même forme.
 */
export function TicketList<T extends ListedTicket>({
  label,
  tickets,
  ctx,
  showProject,
  detail,
}: {
  label: string;
  tickets: readonly T[];
  ctx: SeriesContext;
  showProject: boolean;
  detail: (ticket: T) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? tickets : tickets.slice(0, VISIBLE_REWORK);
  const hidden = tickets.length - shown.length;
  const t = useT();
  const { formatCount } = useFormat();
  return (
    <>
      <ul aria-label={label} className="flex flex-col gap-2">
        {shown.map((ticket) => (
          <li key={`${ticket.project}/${ticket.id}`} data-ticket={ticket.id}>
            <Link to={paths.issue(ticket.project, ticket.id)} className="group/rework -mx-2 flex flex-col gap-1 rounded-md px-2 py-1 transition-colors hover:bg-hover">
              <span className="flex min-w-0 items-center gap-2">
                <TypeGlyph type={ticket.type} />
                <span className="min-w-0 flex-1 truncate font-medium text-ink group-hover/rework:underline">{ticketTitle(ticket)}</span>
                <PriorityBadge priority={ticket.priority} className="shrink-0 text-xs" />
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 pl-[22px] text-micro text-ink-3">
                <span className="min-w-0 break-all font-mono">{ticket.id}</span>
                {showProject ? <span>{ctx.projectName(ticket.project)}</span> : null}
                <span className="font-medium text-ink-2">{detail(ticket)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {hidden > 0 || expanded ? (
        <Button variant="ghost" className="self-start" aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>
          {expanded ? t.metrics.chartParts.collapse : t.metrics.chartParts.showMore(formatCount(hidden))}
        </Button>
      ) : null}
    </>
  );
}

/** Ce qui met le ticket en Retravail : « 2 Réouvertures, 1 Prise rendue, Bug d’origine bdesk-b9 ». */
function Causes({ ticket: { reopenings, returns, originBugs } }: { ticket: MetricsReworkTicket }) {
  const t = useT();
  const { formatCount } = useFormat();
  const texts = t.metrics.rework;
  const causes: string[] = [];
  if (reopenings > 0) causes.push(texts.reopens(reopenings, formatCount(reopenings)));
  if (returns > 0) causes.push(texts.handbacks(returns, formatCount(returns)));
  // Les identifiants des bugs sont du contenu de ticket : jamais traduits, joints comme une liste.
  if (originBugs.length > 0) causes.push(texts.escapedBugs(originBugs.length, originBugs.join(texts.separator)));
  return <>{causes.join(texts.separator)}</>;
}
