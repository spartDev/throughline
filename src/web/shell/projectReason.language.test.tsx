import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MetricsUnreadableProject } from '../../shared/api';
import type { ProjectReasonDetail } from '../../shared/errors';
import type { ProjectsResponse } from '../data/types';
import { LanguageProvider } from '../i18n';
import { UnreadableProjects } from '../metrics/Notices';
import { withAsyncTimeout } from '../test/asyncTimeout';
import { setBrowserLanguages } from '../test/languages';
import { renderApp, stubApi } from '../test/render';

/**
 * bdesk-ewr.8 : la raison d'un Projet illisible, ou d'un dossier ignoré, s'écrit dans la langue affichée d'après sa cause codée (`reasonDetail`), partout où
 * elle s'affiche : la barre latérale, la Vue globale (Projets et dossiers ignorés), la page d'un Projet illisible, la palette et l'avis des métriques. Une
 * cause que l'interface ne connaît pas (un serveur plus récent) s'affiche par la raison française du serveur, telle quelle.
 */

withAsyncTimeout(5_000);

const LOCKED = 'La base est tenue par un autre processus dolt : réessayez dans un instant.';
const LOCKED_EN = 'The database is held by another dolt process: try again in a moment.';
/** La raison d'une cause qu'un serveur plus récent aurait codée : l'interface ne la connaît pas. */
const NEWER = 'Raison d’un serveur plus récent.';
const NEWER_DETAIL = { code: 'cause-a-venir', params: {} } as unknown as ProjectReasonDetail;
const POSTGRES = 'Workspace « postgres » : seuls les Projets Dolt sont suivis.';

const RESPONSE: ProjectsResponse = {
  projects: [
    { id: 'atelier', name: 'atelier', path: '/dev/atelier', prefix: 'at', mode: 'embedded', status: 'unreadable', reason: LOCKED, reasonDetail: { code: 'dolt-locked', params: {} } },
    { id: 'ardoise', name: 'ardoise', path: '/dev/ardoise', prefix: 'ar', mode: 'embedded', status: 'unreadable', reason: NEWER, reasonDetail: NEWER_DETAIL },
    { id: 'carnet', name: 'carnet', path: '/dev/carnet', prefix: 'ca', mode: 'embedded', status: 'ok' },
  ],
  ignored: [{ path: '/dev/notes', reason: POSTGRES, reasonDetail: { code: 'other-workspace', params: { backend: 'postgres' } } }],
};

const NBSP = ' ';
const text = (element: Element) => element.textContent?.replaceAll(NBSP, ' ') ?? '';

beforeEach(() => {
  setBrowserLanguages(['en-US', 'en']);
});

describe('the reason of an unreadable Project, in English', () => {
  it('the sidebar and the Overview: the coded reason in English, an unknown one as the server wrote it, and the ignored folder', async () => {
    stubApi({ projects: RESPONSE, issues: { carnet: [] } });
    renderApp('/', { languageSwitch: true });

    const navigation = await screen.findByRole('navigation', { name: 'Main navigation' });
    await waitFor(() => expect(text(navigation)).toContain(`Unreadable: ${LOCKED_EN}`));
    expect(text(navigation)).toContain(`Unreadable: ${NEWER}`);
    expect(text(navigation)).not.toContain(LOCKED);

    const main = screen.getByRole('main');
    await waitFor(() => expect(text(main)).toContain(`Unreadable: ${LOCKED_EN}`));
    expect(text(main)).toContain(`Unreadable: ${NEWER}`);
    expect(text(main)).toContain('“postgres” workspace: only Dolt Projects are tracked.');
    expect(text(main)).not.toContain(POSTGRES);
  });

  it('the page of an unreadable Project', async () => {
    stubApi({ projects: RESPONSE, issues: { carnet: [] } });
    renderApp('/p/atelier', { languageSwitch: true });

    const main = await screen.findByRole('main');
    await waitFor(() => expect(text(main)).toContain(LOCKED_EN));
    expect(text(main)).not.toContain(LOCKED);
  });

  it('the command palette', async () => {
    stubApi({ projects: RESPONSE, issues: { carnet: [] } });
    const { user } = renderApp('/', { languageSwitch: true });
    await screen.findByRole('navigation', { name: 'Main navigation' });

    await user.keyboard('{Control>}k{/Control}');
    const palette = await screen.findByRole('dialog', { name: 'Command palette' });

    await waitFor(() => expect(text(palette)).toContain(`Unreadable: ${LOCKED_EN}`));
    expect(text(palette)).toContain(`Unreadable: ${NEWER}`);
  });

  it('the notice of the metrics', () => {
    const projects: MetricsUnreadableProject[] = [
      { id: 'atelier', name: 'atelier', reason: LOCKED, reasonDetail: { code: 'dolt-locked', params: {} } },
      { id: 'ardoise', name: 'ardoise', reason: NEWER, reasonDetail: NEWER_DETAIL },
    ];
    render(
      <LanguageProvider switchEnabled>
        <UnreadableProjects projects={projects} />
      </LanguageProvider>,
    );

    const notice = screen.getByRole('status');
    const items = within(notice).getAllByRole('listitem').map(text);
    expect(items).toEqual([`atelier: ${LOCKED_EN}`, `ardoise: ${NEWER}`]);
  });
});
