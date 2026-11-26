import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../ui/Tip';
import { ActivityPanel, DecisionMapPanel } from './ActivityMap';
import { decisionsFixture, emptyHealthFixture, healthFixture, heldDecisionsFixture, plain, stubChartWidth } from './testing';

beforeEach(() => stubChartWidth(640));
afterEach(() => vi.restoreAllMocks());

const NBSP = ' ';
const hitArea = (container: HTMLElement) => container.querySelector<SVGRectElement>('[data-chart-hit]')!;
const cell = (container: HTMLElement, weekday: number, hour: number) => container.querySelector<SVGRectElement>(`[data-cell="${weekday}-${hour}"]`)!;

/** Le centre d'une case, dans le repère de la zone sensible (celui de la grille). */
function centerOf(target: SVGRectElement): { clientX: number; clientY: number } {
  const [x, y, width, height] = ['x', 'y', 'width', 'height'].map((name) => Number(target.getAttribute(name)));
  return { clientX: (x ?? 0) + (width ?? 0) / 2, clientY: (y ?? 0) + (height ?? 0) / 2 };
}

/** La carte a son aide, une infobulle : elle se rend sous le `TooltipProvider` de l'application. */
const renderPanel = (activity = healthFixture().activity, timeZone = 'Europe/Paris') =>
  render(
    <TooltipProvider>
      <ActivityPanel activity={activity} timeZone={timeZone} />
    </TooltipProvider>,
  );

/** La carte d'activité de la fixture : 100 Transitions, pic le jeudi de 9 h à 10 h (6). */
describe('ActivityPanel : la carte d’activité', () => {
  it('dit ce qu’elle compte, dans quel fuseau, et le pic', () => {
    renderPanel();

    expect(screen.getByRole('region', { name: 'Carte d’activité' })).toBeTruthy();
    expect(plain(screen.getByText(/^100 Transitions/).textContent)).toContain(
      '100 Transitions par jour de la semaine et par heure, dans le fuseau Europe/Paris. Pic : jeudi, de 9 h à 10 h (6).',
    );
  });

  it('a son aide, comme la Carte des Décisions à côté d’elle : ce qu’elle compte, dans quel fuseau, et que ses comptes sont bruts', async () => {
    renderPanel();

    await userEvent.setup().hover(screen.getByRole('button', { name: 'À propos de Carte d’activité' }));
    const help = plain((await screen.findByRole('tooltip')).textContent);
    expect(help).toContain('Les Transitions de la période');
    expect(help).toContain('dans votre fuseau');
    expect(help).toContain('Comptes bruts');
  });

  it('dit que les comptes ne sont pas rapportés au nombre de chaque jour de la semaine dans la période : 30 jours comptent quatre ou cinq lundis', () => {
    renderPanel();

    expect(plain(screen.getByText(/^100 Transitions/).textContent)).toBe(
      '100 Transitions par jour de la semaine et par heure, dans le fuseau Europe/Paris. Pic : jeudi, de 9 h à 10 h (6). ' +
        'Comptes bruts, non rapportés au nombre de chaque jour de la semaine dans la période. ' +
        'Heures à l’arrêt : 30 h, avec 6,5 Prêts en moyenne, sans aucune Transition depuis plus de 12 heures.',
    );
  });

  it('dit qu’il n’y a eu aucune Heure à l’arrêt, sans prétendre qu’il n’y a jamais eu 3 Prêts : un Projet en sommeil en a peut-être', () => {
    renderPanel({ ...healthFixture().activity, stalled: { duration: 0, ready: null } });

    expect(plain(screen.getByText(/^100 Transitions/).textContent)).toContain('Aucune Heure à l’arrêt sur la période.');
  });

  it('n’écrit pas « 0 h » pour un arrêt de moins d’une heure', () => {
    renderPanel({ ...healthFixture().activity, stalled: { duration: 20 * 60_000, ready: 3 } });

    expect(plain(screen.getByText(/^100 Transitions/).textContent)).toContain('Heures à l’arrêt : moins d’1 h, avec 3 Prêts en moyenne');
  });

  it('le dit aussi sans Transition : la phrase décrit la carte, pas ses données', () => {
    renderPanel(emptyHealthFixture().activity);

    expect(plain(screen.getByText(/^Les Transitions par jour de la semaine/).textContent)).toBe(
      'Les Transitions par jour de la semaine et par heure, dans le fuseau Europe/Paris. Comptes bruts, non rapportés au nombre de chaque jour de la semaine dans la période. ' +
        'Aucune Heure à l’arrêt sur la période.',
    );
  });

  it('résume le dessin pour les lecteurs d’écran', () => {
    renderPanel();

    expect(screen.getByRole('img', { name: `Carte d’activité : 100 Transitions, pic le jeudi de 9${NBSP}h à 10${NBSP}h (6 Transitions).` })).toBeTruthy();
  });

  it('dessine 168 cases, une par heure et par jour, et donne à chacune son niveau', () => {
    const { container } = renderPanel();

    expect(container.querySelectorAll('[data-cell]')).toHaveLength(168);
    expect(cell(container, 3, 9).getAttribute('data-level')).toBe('4'); // le pic
    expect(cell(container, 3, 9).getAttribute('data-count')).toBe('6');
    expect(cell(container, 1, 9).getAttribute('data-level')).toBe('4'); // 5 sur 6
    expect(cell(container, 0, 9).getAttribute('data-level')).toBe('2'); // 2 sur 6
    expect(cell(container, 5, 11).getAttribute('data-level')).toBe('1'); // 1 sur 6
    expect(cell(container, 6, 3).getAttribute('data-level')).toBe('0');
  });

  it('cerne les cases qui ont des Transitions de leur trait, et laisse les cases vides sans contour', () => {
    const { container } = renderPanel();

    expect(cell(container, 6, 3).getAttribute('stroke')).toBe('none');
    expect(cell(container, 3, 9).getAttribute('stroke')).toContain('color-mix');
    expect(cell(container, 5, 11).getAttribute('stroke')).toContain('color-mix');
  });

  it('étiquette les jours du lundi au dimanche et quelques heures', () => {
    const { container } = renderPanel();

    const labels = [...container.querySelectorAll('svg text')].map((node) => node.textContent);
    expect(labels).toEqual(expect.arrayContaining(['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']));
    expect(labels).toEqual(expect.arrayContaining(['0', '6', '12', '18']));
  });

  it('donne la légende des niveaux, de moins à plus', () => {
    renderPanel();

    const legend = screen.getByRole('list', { name: 'Légende de la carte d’activité' });
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Moins', 'Plus']);
    expect(legend.querySelectorAll('[data-legend-level]')).toHaveLength(5);
  });

  it('détaille une case au survol : le créneau et le nombre de Transitions', () => {
    const { container } = renderPanel();

    fireEvent.pointerMove(hitArea(container), { ...centerOf(cell(container, 3, 9)), pointerType: 'mouse' });

    const tooltip = container.querySelector<HTMLElement>('[data-chart-tooltip]')!;
    expect(plain(tooltip.textContent)).toContain('jeudi, de 9 h à 10 h');
    expect(plain(tooltip.textContent)).toContain('6 Transitions');
  });

  it('efface l’infobulle quand la souris quitte la carte, mais pas quand le doigt se lève', () => {
    const { container } = renderPanel();

    fireEvent.pointerMove(hitArea(container), { ...centerOf(cell(container, 3, 9)), pointerType: 'mouse' });
    expect(container.querySelector('[data-chart-tooltip]')).toBeTruthy();
    fireEvent.pointerLeave(hitArea(container), { pointerType: 'mouse' });
    expect(container.querySelector('[data-chart-tooltip]')).toBeNull();

    fireEvent.pointerDown(hitArea(container), { ...centerOf(cell(container, 3, 9)), pointerType: 'touch' });
    fireEvent.pointerLeave(hitArea(container), { pointerType: 'touch' });
    expect(container.querySelector('[data-chart-tooltip]')).toBeTruthy();
  });

  it('garde des cases d’au moins 14 px de haut sur un petit écran, et d’au plus 26 px sur un grand', () => {
    const height = () => Number(renderPanel().container.querySelector('[data-cell]')?.getAttribute('height'));

    stubChartWidth(300);
    expect(height()).toBe(14 - 2);
    cleanup();
    stubChartWidth(2000);
    expect(height()).toBe(26 - 2);
  });

  it('accorde « 1 Transition » et « Aucune Transition » d’une case', () => {
    const { container } = renderPanel();

    fireEvent.pointerMove(hitArea(container), { ...centerOf(cell(container, 5, 11)), pointerType: 'mouse' });
    expect(plain(container.querySelector('[data-chart-tooltip]')?.textContent)).toContain('1 Transition');
    expect(plain(container.querySelector('[data-chart-tooltip]')?.textContent)).not.toContain('1 Transitions');

    fireEvent.pointerMove(hitArea(container), { ...centerOf(cell(container, 6, 3)), pointerType: 'mouse' });
    expect(plain(container.querySelector('[data-chart-tooltip]')?.textContent)).toContain('Aucune Transition');
  });

  it('range les mêmes comptes en tableau : une heure par ligne, un jour par colonne, les totaux au bout, assez étroit pour tenir dans la carte', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByText('Données du graphique'));
    const table = screen.getByRole('table', { name: 'Transitions par jour de la semaine et par heure' });
    const rows = within(table).getAllByRole('row');

    // En-tête, vingt-quatre heures, le total : sept colonnes de jours (nommées en toutes lettres pour les lecteurs d'écran) et le total.
    expect(rows).toHaveLength(26);
    const header = within(rows[0]!).getAllByRole('columnheader').map((th) => th.getAttribute('aria-label') ?? plain(th.textContent));
    expect(header).toEqual(['Heure', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche', 'Total']);
    expect(within(rows[0]!).getAllByRole('columnheader').map((th) => plain(th.textContent)).slice(1, 8)).toEqual(['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']);

    const nine = within(rows[1 + 9]!);
    expect(plain(nine.getByRole('rowheader').textContent)).toBe('9 h');
    expect(nine.getAllByRole('cell').map((td) => td.textContent)).toEqual(['2', '5', '4', '6', '2', '0', '0', '19']); // jeudi, 9 h : 6 ; toute la ligne : 19
    expect(within(rows[1 + 20]!).getAllByRole('cell').map((td) => td.textContent)).toEqual(['0', '0', '0', '1', '0', '0', '0', '1']); // jeudi, 20 h

    const total = within(rows.at(-1)!);
    expect(total.getByRole('rowheader').textContent).toBe('Total');
    expect(total.getAllByRole('cell').map((td) => td.textContent)).toEqual(['8', '30', '24', '31', '6', '1', '0', '100']);
  });

  it('dit qu’il n’y a eu aucune Transition plutôt que de dessiner une grille vide', () => {
    const { container } = renderPanel(emptyHealthFixture().activity);

    expect(screen.getByText('Aucune Transition sur cette période.')).toBeTruthy();
    // Pas de grille : ni case ni dessin. L'icône de l'aide, elle, reste.
    expect(container.querySelector('[data-cell]')).toBeNull();
    expect(screen.queryByRole('img', { name: /^Carte d’activité/ })).toBeNull();
  });
});

const renderDecisionMap = (map = heldDecisionsFixture().decisionMap) =>
  render(
    <TooltipProvider>
      <DecisionMapPanel map={map} timeZone="Europe/Paris" />
    </TooltipProvider>,
  );

/**
 * La Carte des Décisions (bdesk-3e9.7) : la même grille que la Carte d'activité, la même légende et les mêmes niveaux, mais des Décisions. Fixture : 9
 * Décisions, 5 le lundi de 9 h à 10 h, 3 le mercredi de 14 h à 15 h, 1 le vendredi de 22 h à 23 h.
 */
describe('DecisionMapPanel : la Carte des Décisions', () => {
  it('dit ce qu’elle compte, dans quel fuseau, et le pic, sur la même grille que la Carte d’activité', () => {
    const { container } = renderDecisionMap();

    expect(screen.getByRole('region', { name: 'Carte des Décisions' })).toBeTruthy();
    expect(plain(screen.getByText(/^9 Décisions/).textContent)).toBe(
      '9 Décisions par jour de la semaine et par heure, dans le fuseau Europe/Paris. Pic : lundi, de 9 h à 10 h (5). ' +
        'Comptes bruts, non rapportés au nombre de chaque jour de la semaine dans la période.',
    );
    expect(screen.getByRole('img', { name: `Carte des Décisions : 9 Décisions, pic le lundi de 9${NBSP}h à 10${NBSP}h (5 Décisions).` })).toBeTruthy();
    expect(container.querySelectorAll('[data-cell]')).toHaveLength(168);
    expect(cell(container, 0, 9).getAttribute('data-count')).toBe('5');
    expect(cell(container, 0, 9).getAttribute('data-level')).toBe('4');
    expect(cell(container, 2, 14).getAttribute('data-level')).toBe('3'); // 3 sur 5
    expect(cell(container, 4, 22).getAttribute('data-level')).toBe('1'); // 1 sur 5
    expect(screen.getByRole('list', { name: 'Légende de la carte des Décisions' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'À propos de Carte des Décisions' })).toBeTruthy();
  });

  it('détaille une case au survol en Décisions', () => {
    const { container } = renderDecisionMap();

    fireEvent.pointerMove(hitArea(container), { ...centerOf(cell(container, 0, 9)), pointerType: 'mouse' });
    expect(plain(container.querySelector('[data-chart-tooltip]')?.textContent)).toContain('5 Décisions');
  });

  it('dit qu’il n’y a eu aucune Décision sur la période plutôt que de dessiner une grille vide', () => {
    const { container } = renderDecisionMap(decisionsFixture().decisionMap);

    expect(screen.getByRole('status').textContent).toBe('Aucune Décision sur cette période.');
    expect(container.querySelector('[data-cell]')).toBeNull();
    expect(screen.queryByRole('img', { name: /^Carte des Décisions/ })).toBeNull();
    expect(plain(screen.getByText(/^Les Décisions par jour de la semaine/).textContent)).toBe(
      'Les Décisions par jour de la semaine et par heure, dans le fuseau Europe/Paris.',
    );
  });
});
