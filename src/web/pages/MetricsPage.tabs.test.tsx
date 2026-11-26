import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MetricsResponse } from '../../shared/api';
import { LANGUAGE_STORAGE_KEY } from '../i18n/language';
import { agentChainFixture, metricsFixture, plain, stubChartWidth, stubMetricsApi, warmUpMetricsPages } from '../metrics/testing';
import { bdeskIssues, mpmIssues, projectsResponse } from '../test/fixtures';
import { renderApp } from '../test/render';
import { withTimeZone } from '../test/timeZone';

/**
 * Les onglets Décisions et Flux de la page Métriques (bdesk-3e9.7), montés dans l'application entière devant un faux serveur. Ils n'existent que si un Projet
 * de la vue a les Statuts de relais (`MetricsResponse.handoff`) ; la page s'ouvre alors sur Décisions, et l'onglet vit dans l'adresse comme la période.
 * Fixture avec onglets : `agentChainFixture` (ses Décisions sont celles de `heldDecisionsFixture`).
 */

const api = (data: MetricsResponse) => stubMetricsApi({ projects: projectsResponse, issues: { bdesk: bdeskIssues, mpm: mpmIssues } }, () => data);
const ONE_PROJECT = [{ id: 'bdesk', name: 'beads-desktop' }];

warmUpMetricsPages();
withTimeZone('Europe/Paris');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-02T19:00:15.242Z'));
  stubChartWidth(640);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const pathname = (router: { state: { location: { pathname: string; search: string } } }) => router.state.location.pathname + router.state.location.search;
const main = () => within(screen.getByRole('main'));
const sections = () => main().getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
const tablist = () => screen.getByRole('tablist', { name: 'Vues des métriques' });
const tab = (name: 'Décisions' | 'Flux') => within(tablist()).getByRole('tab', { name });
const panel = () => screen.getByRole('tabpanel');
const tile = (name: string) => within(panel()).getByRole('article', { name });

/** La page est prête quand ses chiffres sont là : le Parcours d'un ticket, commun aux deux onglets, est au-dessus d'eux. */
async function loaded(path: string, options?: Parameters<typeof renderApp>[1]) {
  const app = renderApp(path, options);
  await screen.findByRole('region', { name: /^(Le parcours d’un ticket|Ticket journey)$/ });
  return app;
}

/** Les intertitres de la page d'un Projet sans Statut de relais, tels qu'ils étaient avant les onglets. */
const BEFORE_TABS = ['Le parcours d’un ticket', 'Indicateurs', 'Graphiques', 'Santé du flux', 'Analyse du flux', 'Découpage par type'];
const DECISIONS_SECTIONS = ['Décisions tenues', 'Livraisons prouvées', 'Coût d’attention', 'Intention', 'Les deux horloges'];

describe('sans Statut de relais : pas d’onglets', () => {
  it('la page est celle d’avant, sans liste d’onglets ni panneau', async () => {
    const data = metricsFixture({ projects: ONE_PROJECT });
    expect(data.handoff).toEqual([]);
    api(data);
    await loaded('/p/bdesk/metrics');

    expect(sections()).toEqual(BEFORE_TABS);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('tabpanel')).toBeNull();
    expect(main().queryByRole('heading', { level: 2, name: 'Décisions tenues' })).toBeNull();
  });

  it('une adresse qui demande Décisions montre quand même le Flux : l’onglet n’existe pas', async () => {
    api(metricsFixture({ projects: ONE_PROJECT }));
    await loaded('/p/bdesk/metrics?tab=decisions');

    expect(sections()).toEqual(BEFORE_TABS);
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});

describe('avec les Statuts de relais : les onglets Décisions et Flux', () => {
  it('s’ouvre sur Décisions ; la barre d’outils et le Parcours d’un ticket sont au-dessus des onglets', async () => {
    api(agentChainFixture({ projects: ONE_PROJECT }));
    const { router } = await loaded('/p/bdesk/metrics');

    expect(pathname(router)).toBe('/p/bdesk/metrics');
    expect(within(tablist()).getAllByRole('tab').map((element) => element.textContent)).toEqual(['Décisions', 'Flux']);
    expect(tab('Décisions').getAttribute('aria-selected')).toBe('true');
    expect(tab('Flux').getAttribute('aria-selected')).toBe('false');
    expect(sections()).toEqual(['Le parcours d’un ticket', ...DECISIONS_SECTIONS]);
    // La période et le Parcours d'un ticket précèdent les onglets, hors du panneau.
    const toolbar = screen.getByRole('group', { name: 'Période' });
    const journey = screen.getByRole('region', { name: 'Le parcours d’un ticket' });
    expect(toolbar.compareDocumentPosition(tablist()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(journey.compareDocumentPosition(tablist()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(panel().contains(journey)).toBe(false);
    // Le Flux n'est pas rendu : ses intertitres n'y sont pas.
    expect(main().queryByRole('heading', { level: 2, name: 'Indicateurs' })).toBeNull();
  });

  it('Décisions tenues : les 12 semaines d’abord, puis la période, ses Décisions par sens, ses Renoncements et l’Attente humaine', async () => {
    api(agentChainFixture({ projects: ONE_PROJECT }));
    await loaded('/p/bdesk/metrics');

    const held = within(panel()).getByRole('region', { name: 'Décisions tenues' });
    const weekly = within(held).getByRole('region', { name: 'Décisions tenues par semaine' });
    // Sur 12 semaines : 3, 4 et 1 Feux verts et Refus (la Relance n'en est pas un), dont 3, 3 et 1 tenus.
    expect(within(weekly).getByRole('img', { name: 'Feux verts et Refus par semaine : 8 Feux verts et Refus sur 12 semaines.' })).toBeTruthy();
    expect(within(weekly).getByRole('img', { name: 'Décisions tenues par semaine : 7 tenus sur 12 semaines.' })).toBeTruthy();
    const titles = within(held)
      .getAllByRole('article')
      .map((article) => document.getElementById(article.getAttribute('aria-labelledby') ?? '')?.textContent);
    expect(titles).toEqual(['Décisions tenues', 'Décisions par sens', 'Renoncements', 'Attente humaine']);
    expect(weekly.compareDocumentPosition(tile('Décisions tenues')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // 5 Feux verts tenus sur 6, 2 Refus tenus sur 2 : 7 sur 8 ; la période court, c'est provisoire.
    const heldTile = tile('Décisions tenues');
    expect(plain(heldTile.querySelector('[data-value]')?.textContent)).toBe('7');
    expect(plain(heldTile.textContent)).toContain('sur 8 Feux verts et Refus, 87,5 %');
    expect(plain(heldTile.textContent)).toContain('Feux verts : 5 tenus sur 6');
    expect(plain(heldTile.textContent)).toContain('Refus : 2 tenus sur 2');
    expect(heldTile.querySelector('[data-provisional]')?.textContent).toBe(
      'Provisoire : la période court, et ses Décisions n’ont pas toutes eu le temps d’être démenties.',
    );
    const senses = tile('Décisions par sens');
    expect(plain(senses.querySelector('[data-value]')?.textContent)).toBe('9');
    expect(within(senses).getByRole('list', { name: 'Décisions de la période selon leur sens' })).toBeTruthy();
    expect(plain(tile('Attente humaine').textContent)).toContain('6 Livraisons ont attendu');
  });

  it('Livraisons prouvées : la part, la preuve qui manque le plus, et les Livraisons sans Feu vert en liste de tickets', async () => {
    api(agentChainFixture({ projects: ONE_PROJECT }));
    await loaded('/p/bdesk/metrics');

    const evidenced = tile('Livraisons prouvées');
    expect(plain(evidenced.querySelector('[data-value]')?.textContent)).toBe('66,7 %');
    expect(plain(evidenced.textContent)).toContain('4 sur 6 prouvées');
    expect(evidenced.querySelector('[data-most-missing]')?.textContent).toBe('Le plus souvent, il manque : Intention écrite.');
    const missing = within(evidenced).getByRole('list', { name: 'Livraisons auxquelles manque chaque preuve' });
    expect(within(missing).getAllByRole('listitem')).toHaveLength(4);

    const list = within(panel()).getByRole('list', { name: 'Livraisons sans Feu vert de la période' });
    const link = within(list).getByRole('link');
    expect(link.getAttribute('href')).toBe('/p/bdesk/t/bdesk-b7q');
    expect(plain(within(list).getByRole('listitem').textContent)).toContain('Livrée le 28 oct.');
  });

  it('Coût d’attention, et Intention : avec et sans Intention écrite, sous le seuil de 10 Livraisons relues', async () => {
    api(agentChainFixture({ projects: ONE_PROJECT }));
    await loaded('/p/bdesk/metrics');

    expect(plain(tile('Coût d’attention').querySelector('[data-value]')?.textContent)).toBe('1,5');
    expect(plain(tile('Coût d’attention').textContent)).toContain('9 Décisions pour 6 Livraisons');
    expect(within(panel()).getByRole('region', { name: 'Coût d’attention par semaine' })).toBeTruthy();

    const withIntent = tile('Avec Intention écrite');
    const withoutIntent = tile('Sans Intention écrite');
    // 7 sur 8, et 2 sur 4 : ni l'une ni l'autre n'atteint 10 Livraisons relues.
    expect(withIntent.hasAttribute('data-indicative')).toBe(true);
    expect(plain(withIntent.textContent)).toContain('8 Livraisons relues');
    expect(plain(withIntent.textContent)).toContain('87,5 %');
    expect(withoutIntent.hasAttribute('data-indicative')).toBe(true);
    expect(plain(withoutIntent.textContent)).toContain('4 Livraisons relues');
    // La part des Epics qui ont un Outcome visé n'est pas là (bdesk-3e9.9).
    expect(plain(panel().textContent)).not.toMatch(/Outcome/);
  });

  it('les deux horloges : la Carte d’activité et la Carte des Décisions, côte à côte', async () => {
    api(agentChainFixture({ projects: ONE_PROJECT }));
    await loaded('/p/bdesk/metrics');

    const clocks = within(panel()).getByRole('region', { name: 'Les deux horloges' });
    expect(within(clocks).getByRole('region', { name: 'Carte d’activité' })).toBeTruthy();
    expect(within(clocks).getByRole('region', { name: 'Carte des Décisions' })).toBeTruthy();
  });

  it('donne à chaque mesure de l’onglet son aide', async () => {
    api(agentChainFixture({ projects: ONE_PROJECT }));
    await loaded('/p/bdesk/metrics');

    for (const name of [
      'Décisions tenues par semaine',
      'Décisions tenues',
      'Décisions par sens',
      'Renoncements',
      'Attente humaine',
      'Livraisons prouvées',
      'Livraisons sans Feu vert',
      'Coût d’attention',
      'Coût d’attention par semaine',
      'Avec Intention écrite',
      'Sans Intention écrite',
      'Carte des Décisions',
    ]) {
      expect(within(panel()).getByRole('button', { name: `À propos de ${name}` })).toBeTruthy();
    }
  });

  it('le Flux est tout le reste de la page, Chaîne d’agents comprise, sans l’Attente humaine', async () => {
    api(agentChainFixture({ projects: ONE_PROJECT }));
    const { user, router } = await loaded('/p/bdesk/metrics');

    await user.click(tab('Flux'));
    await waitFor(() => expect(pathname(router)).toBe('/p/bdesk/metrics?tab=flow'));
    expect(router.state.historyAction).toBe('REPLACE');
    expect(tab('Flux').getAttribute('aria-selected')).toBe('true');
    expect(sections()).toEqual(['Le parcours d’un ticket', 'Indicateurs', 'Graphiques', 'Santé du flux', 'Chaîne d’agents', 'Analyse du flux', 'Découpage par type']);
    expect(within(panel()).getByRole('article', { name: 'Débit sain' })).toBeTruthy();
    expect(within(panel()).queryByRole('article', { name: 'Attente humaine' })).toBeNull();

    // Revenir sur Décisions efface l'onglet de l'adresse : c'est celui par défaut.
    await user.click(tab('Décisions'));
    await waitFor(() => expect(pathname(router)).toBe('/p/bdesk/metrics'));
    expect(sections()).toEqual(['Le parcours d’un ticket', ...DECISIONS_SECTIONS]);
  });

  it('un lien partage l’onglet : l’adresse ?tab=flow ouvre sur le Flux', async () => {
    api(agentChainFixture({ projects: ONE_PROJECT }));
    await loaded('/p/bdesk/metrics?range=7d&tab=flow');

    expect(tab('Flux').getAttribute('aria-selected')).toBe('true');
    expect(main().getByRole('heading', { level: 2, name: 'Indicateurs' })).toBeTruthy();
    expect(main().queryByRole('heading', { level: 2, name: 'Décisions tenues' })).toBeNull();
  });

  it('changer de période garde l’onglet', async () => {
    api(agentChainFixture({ projects: ONE_PROJECT }));
    const { user, router } = await loaded('/p/bdesk/metrics?tab=flow');

    await user.click(within(screen.getByRole('group', { name: 'Période' })).getByRole('radio', { name: '7 jours' }));
    await waitFor(() => expect(pathname(router)).toBe('/p/bdesk/metrics?tab=flow&range=7d'));
    expect(tab('Flux').getAttribute('aria-selected')).toBe('true');

    await user.click(tab('Décisions'));
    await waitFor(() => expect(pathname(router)).toBe('/p/bdesk/metrics?range=7d'));
    await user.click(within(screen.getByRole('group', { name: 'Période' })).getByRole('radio', { name: '90 jours' }));
    await waitFor(() => expect(pathname(router)).toBe('/p/bdesk/metrics?range=90d'));
    expect(tab('Décisions').getAttribute('aria-selected')).toBe('true');
  });

  it('un onglet inconnu dans l’adresse ouvre l’onglet par défaut et le dit', async () => {
    api(agentChainFixture({ projects: ONE_PROJECT }));
    await loaded('/p/bdesk/metrics?tab=chaine');

    expect(screen.getByText(/L’onglet « chaine » n’existe pas/)).toBeTruthy();
    expect(tab('Décisions').getAttribute('aria-selected')).toBe('true');
  });

  it('la Vue globale a aussi ses onglets quand un de ses Projets a les Statuts de relais', async () => {
    api(agentChainFixture());
    await loaded('/overview');

    expect(tab('Décisions').getAttribute('aria-selected')).toBe('true');
    // Sous les métriques, la Vue globale liste ses Projets : hors des onglets.
    expect(sections()).toEqual(['Le parcours d’un ticket', ...DECISIONS_SECTIONS, 'Projets suivis']);
  });
});

describe('les onglets au clavier et pour les lecteurs d’écran (motif « onglets » de l’APG)', () => {
  it('chaque onglet désigne son panneau, que l’onglet choisi nomme ; seul l’onglet choisi est dans l’ordre de tabulation', async () => {
    api(agentChainFixture({ projects: ONE_PROJECT }));
    await loaded('/p/bdesk/metrics');

    expect(tab('Décisions').getAttribute('aria-controls')).toBe(panel().id);
    expect(tab('Flux').hasAttribute('aria-controls')).toBe(false);
    expect(screen.getByRole('tabpanel', { name: 'Décisions' })).toBe(panel());
    expect(tab('Décisions').tabIndex).toBe(0);
    expect(tab('Flux').tabIndex).toBe(-1);
    expect(panel().tabIndex).toBe(0);
  });

  it('les flèches passent à l’onglet voisin et le choisissent, de bout en bout ; Origine et Fin vont au premier et au dernier', async () => {
    api(agentChainFixture({ projects: ONE_PROJECT }));
    const { user, router } = await loaded('/p/bdesk/metrics');

    act(() => tab('Décisions').focus());
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(pathname(router)).toBe('/p/bdesk/metrics?tab=flow'));
    expect(document.activeElement).toBe(tab('Flux'));
    expect(screen.getByRole('tabpanel', { name: 'Flux' })).toBeTruthy();
    expect(tab('Flux').tabIndex).toBe(0);
    expect(tab('Décisions').tabIndex).toBe(-1);

    // Au bout, la flèche droite revient au premier.
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(pathname(router)).toBe('/p/bdesk/metrics'));
    expect(document.activeElement).toBe(tab('Décisions'));

    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(pathname(router)).toBe('/p/bdesk/metrics?tab=flow'));
    expect(document.activeElement).toBe(tab('Flux'));

    await user.keyboard('{Home}');
    await waitFor(() => expect(pathname(router)).toBe('/p/bdesk/metrics'));
    expect(document.activeElement).toBe(tab('Décisions'));

    await user.keyboard('{End}');
    await waitFor(() => expect(pathname(router)).toBe('/p/bdesk/metrics?tab=flow'));
    expect(document.activeElement).toBe(tab('Flux'));

    // Tabulation : de l'onglet choisi au panneau, sans passer par l'autre onglet.
    await user.tab();
    expect(document.activeElement).toBe(panel());
  });
});

describe('en anglais', () => {
  it('les onglets et les sections prennent les termes anglais de CONTEXT.md', async () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    api(agentChainFixture({ projects: ONE_PROJECT }));
    await loaded('/p/bdesk/metrics', { languageSwitch: true });

    const tabs = screen.getByRole('tablist', { name: 'Metrics views' });
    expect(within(tabs).getAllByRole('tab').map((element) => element.textContent)).toEqual(['Decisions', 'Flow']);
    const headings = main()
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings.slice(1)).toEqual(['Held decisions', 'Evidenced deliveries', 'Attention cost', 'Intent', 'The two clocks']);
    for (const name of ['Held decisions', 'Decisions by direction', 'Declines', 'Human wait', 'Evidenced deliveries', 'Attention cost', 'With Written intent', 'Without Written intent']) {
      expect(within(panel()).getByRole('article', { name })).toBeTruthy();
    }
    expect(within(panel()).getByRole('region', { name: 'Deliveries without green light' })).toBeTruthy();
    expect(within(panel()).getByRole('region', { name: 'Decision map' })).toBeTruthy();
  });
});
