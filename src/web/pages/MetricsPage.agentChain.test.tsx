import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MetricsResponse } from '../../shared/api';
import { agentChainFixture, metricsFixture, stubChartWidth, stubMetricsApi, warmUpMetricsPages } from '../metrics/testing';
import { bdeskIssues, mpmIssues, projectsResponse } from '../test/fixtures';
import { renderApp } from '../test/render';
import { withTimeZone } from '../test/timeZone';

/**
 * La Chaîne d'agents sur la page Métriques (bdesk-pz0.8), montée dans l'application entière devant un faux serveur : elle n'apparaît que si une Livraison de
 * la période est passée par un Statut de relais, pour un Projet comme pour la Vue globale ; sans elle, la page est celle d'avant. Une telle Livraison a porté
 * un Statut de relais : la page a alors ses onglets (bdesk-3e9.7), et la Chaîne d'agents est dans l'onglet Flux (`?tab=flow`).
 */

const api = (data: MetricsResponse) => stubMetricsApi({ projects: projectsResponse, issues: { bdesk: bdeskIssues, mpm: mpmIssues } }, () => data);

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
});

async function loaded(path: string) {
  renderApp(path);
  await screen.findByRole('heading', { level: 2, name: 'Indicateurs' });
  return within(screen.getByRole('main'));
}

const sections = (page: ReturnType<typeof within>) => page.getAllByRole('heading', { level: 2 }).map((heading: HTMLElement) => heading.textContent);

/** Les intertitres de la page d'un Projet sans Statut de relais, tels qu'ils étaient avant la Chaîne d'agents. */
const WITHOUT_CHAIN = ['Le parcours d’un ticket', 'Indicateurs', 'Graphiques', 'Santé du flux', 'Analyse du flux', 'Découpage par type'];

describe('la Chaîne d’agents sur la page Métriques', () => {
  it('sans Livraison passée par un Statut de relais, la page reste celle d’avant : pas de section', async () => {
    const data = metricsFixture({ projects: [{ id: 'bdesk', name: 'beads-desktop' }] });
    expect(data.review.handedOff).toBe(0);
    api(data);
    const page = await loaded('/p/bdesk/metrics');

    expect(sections(page)).toEqual(WITHOUT_CHAIN);
    expect(page.queryByRole('heading', { level: 2, name: 'Chaîne d’agents' })).toBeNull();
    expect(page.queryByRole('article', { name: 'Acceptation au premier passage' })).toBeNull();
    expect(page.queryByRole('region', { name: 'Décomposition du Cycle Time' })).toBeNull();
    expect(page.queryByRole('article', { name: 'Attente humaine' })).toBeNull();
  });

  it('avec une Livraison passée par la chaîne, un Projet la montre dans l’onglet Flux, entre la santé du flux et son analyse', async () => {
    api(agentChainFixture({ projects: [{ id: 'bdesk', name: 'beads-desktop' }] }));
    const page = await loaded('/p/bdesk/metrics?tab=flow');

    const names = sections(page);
    expect(names.indexOf('Chaîne d’agents')).toBe(names.indexOf('Santé du flux') + 1);
    expect(names.indexOf('Analyse du flux')).toBe(names.indexOf('Chaîne d’agents') + 1);
    const section = page.getByRole('region', { name: 'Chaîne d’agents' });
    expect(within(section).getByRole('article', { name: 'Acceptation au premier passage' }).textContent).toContain('75');
    expect(within(section).getByRole('region', { name: 'Décomposition du Cycle Time' })).toBeTruthy();
    // L'Attente humaine est dans l'onglet Décisions : le Flux ne l'a plus.
    expect(page.queryByRole('article', { name: 'Attente humaine' })).toBeNull();
  });

  it('la Vue globale la montre aussi', async () => {
    api(agentChainFixture());
    const page = await loaded('/overview?tab=flow');

    expect(page.getByRole('heading', { level: 2, name: 'Chaîne d’agents' })).toBeTruthy();
    expect(page.getByRole('article', { name: 'Acceptation au premier passage' })).toBeTruthy();
  });
});
