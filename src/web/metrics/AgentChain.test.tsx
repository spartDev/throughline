import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MetricsResponse } from '../../shared/api';
import { LanguageProvider } from '../i18n';
import { LANGUAGE_STORAGE_KEY } from '../i18n/language';
import { TooltipProvider } from '../ui/Tip';
import { AGENT_CHAIN_GRID, AGENT_CHAIN_SPANS, AgentChainSection } from './AgentChain';
import { describeComparison } from './comparison';
import { acceptanceTrendOf, agentChainFixture, ENOUGH_COVERAGE, plain, shownText, spokenText } from './testing';

/**
 * La Chaîne d'agents (bdesk-pz0.8). Fixture (`agentChainFixture`) : 18 Livraisons, 14 passées par la chaîne, 12 relues dont 9 sans Retour (75 %, contre 60 %
 * la période précédente) ; Tours : 9 à 1, 2 à 2, 1 à 4 ou plus ; Retours : 4 de relecture, 1 d'intégration, 1 de validation ; Taux d'échec non significatif
 * (Couverture de 19 %) ; 31 j de Cycle Time cumulé, dont 4 j d'Attente humaine ; 6 Livraisons ont attendu, médiane 8 h, P85 30 h.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;

function renderSection(data: MetricsResponse = agentChainFixture(), language: 'fr' | 'en' = 'fr') {
  const section = (
    <TooltipProvider>
      <AgentChainSection review={data.review} breakdown={data.cycleTimeBreakdown} comparison={describeComparison(data, language)} />
    </TooltipProvider>
  );
  if (language === 'fr') return render(section);
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
  return render(<LanguageProvider switchEnabled>{section}</LanguageProvider>);
}

/** `agentChainFixture` dont la relecture est modifiée par `review`. */
const withReview = (review: Partial<MetricsResponse['review']>) => {
  const data = agentChainFixture();
  return agentChainFixture({ review: { ...data.review, ...review } });
};

const withHumanWaits = (humanWaits: Partial<MetricsResponse['cycleTimeBreakdown']['humanWaits']>) => {
  const data = agentChainFixture();
  return agentChainFixture({ cycleTimeBreakdown: { ...data.cycleTimeBreakdown, humanWaits: { ...data.cycleTimeBreakdown.humanWaits, ...humanWaits } } });
};

const tile = (name: string) => screen.getByRole('article', { name });
const titles = () => screen.getAllByRole('article').map((article) => document.getElementById(article.getAttribute('aria-labelledby')!)?.textContent);
/** Ce que l'œil lit, et ce que l'oreille entend. */
const shown = (element: Element) => plain(shownText(element));
const heard = (element: Element) => plain(spokenText(element));
const trends = (element: HTMLElement) => [...element.querySelectorAll('[data-trend]')].map((trend) => [trend.getAttribute('data-trend'), trend.getAttribute('data-tone')]);

describe('AgentChainSection : la Chaîne d’agents', () => {
  it('montre, sous « Chaîne d’agents », les mesures dans l’ordre du ticket : l’Acceptation au premier passage en tête, l’Attente humaine en dernier', () => {
    renderSection();

    const section = screen.getByRole('region', { name: 'Chaîne d’agents' });
    expect(within(section).getByRole('heading', { level: 2, name: 'Chaîne d’agents' })).toBeTruthy();
    expect(titles()).toEqual([
      'Acceptation au premier passage',
      'Couverture de relecture',
      'Tours par Livraison',
      'Retours par origine',
      'Taux d’échec après relecture',
      'Attente humaine',
    ]);
    const breakdown = within(section).getByRole('region', { name: 'Décomposition du Cycle Time' });
    // La Décomposition du Cycle Time entre le Taux d'échec après relecture et l'Attente humaine.
    expect(tile('Taux d’échec après relecture').compareDocumentPosition(breakdown) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(breakdown.compareDocumentPosition(tile('Attente humaine')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('donne à chaque mesure son aide, Décomposition du Cycle Time comprise', () => {
    renderSection();
    for (const name of [
      'Acceptation au premier passage',
      'Couverture de relecture',
      'Tours par Livraison',
      'Retours par origine',
      'Taux d’échec après relecture',
      'Décomposition du Cycle Time',
      'Attente humaine',
    ]) {
      expect(screen.getByRole('button', { name: `À propos de ${name}` })).toBeTruthy();
    }
  });

  describe('Acceptation au premier passage', () => {
    it('donne la part des Livraisons relues sans Retour, leur nombre, et une bonne tendance quand elle monte', () => {
      renderSection();

      const acceptance = tile('Acceptation au premier passage');
      expect(acceptance.hasAttribute('data-indicative')).toBe(false);
      expect(shown(acceptance)).toContain('12 Livraisons relues');
      expect(shown(acceptance)).toContain('75 %9 sur 12 sans Retour');
      expect(trends(acceptance)).toEqual([['up', 'good']]);
      expect(shown(acceptance.querySelector('[data-trend]')!)).toBe('+15 ptsavant 60 %');
      expect(heard(acceptance.querySelector('[data-trend]')!)).toBe('En hausse de 15 points : 75 % contre 60 % sur la période précédente.');
    });

    it('une baisse est une mauvaise tendance', () => {
      renderSection(withReview({ firstPassAcceptance: { ...agentChainFixture().review.firstPassAcceptance, trend: acceptanceTrendOf(0.75, 0.9) } }));
      expect(trends(tile('Acceptation au premier passage'))).toEqual([['down', 'bad']]);
    });

    it('face à une période précédente sous 10 Livraisons relues : pas de tendance, et la tuile dit pourquoi', () => {
      // La période précédente n'a qu'une Livraison relue, acceptée : 100 % sur 1 contre 75 % sur 12 ne fait pas une baisse de 25 points.
      renderSection(withReview({ firstPassAcceptance: { ...agentChainFixture().review.firstPassAcceptance, trend: acceptanceTrendOf(0.75, 1, false) } }));

      const acceptance = tile('Acceptation au premier passage');
      expect(acceptance.querySelector('[data-trend]')).toBeNull();
      expect(shown(acceptance)).toContain('Période précédente non significative : moins de 10 Livraisons relues.');
      expect(heard(acceptance)).not.toMatch(/baisse|100 %/);
    });

    it('sous 10 Livraisons relues : non significative, avec le motif et le taux observé en retrait, sans tendance', () => {
      renderSection(withReview({ reviewed: 3, firstPassAcceptance: { accepted: 2, reviewed: 3, rate: 2 / 3, significant: false, minReviewed: 10, trend: acceptanceTrendOf(2 / 3, 0.5) } }));

      const acceptance = tile('Acceptation au premier passage');
      expect(acceptance.hasAttribute('data-indicative')).toBe(true);
      expect(shown(acceptance)).toContain('Non significatif');
      expect(shown(acceptance)).toContain('Trop peu de Livraisons relues pour conclure : 3 (minimum 10).');
      expect(shown(acceptance)).toContain('Observé : 66,7 % (2 sur 3)');
      expect(acceptance.querySelector('[data-trend]')).toBeNull();
      expect(acceptance.querySelector('[data-value]')).toBeNull();
    });

    it('passée par la chaîne sans relecture : aucune Livraison relue, et rien d’observé', () => {
      renderSection(
        withReview({
          reviewed: 0,
          coverage: 0,
          firstPassAcceptance: { accepted: 0, reviewed: 0, rate: null, significant: false, minReviewed: 10, trend: acceptanceTrendOf(null, 0.5) },
          roundsPerDelivery: { one: 0, two: 0, three: 0, fourOrMore: 0 },
        }),
      );

      expect(shown(tile('Acceptation au premier passage'))).toContain('Aucune Livraison relue sur la période.');
      expect(shown(tile('Tours par Livraison'))).toContain('Aucune Livraison relue sur la période.');
      expect(shown(tile('Couverture de relecture'))).toContain('0 %0 sur 18 relue');
    });
  });

  it('Couverture de relecture : la part des Livraisons relues, sur les Livraisons de la période', () => {
    renderSection();
    const coverage = tile('Couverture de relecture');
    expect(shown(coverage)).toContain('18 Livraisons');
    expect(shown(coverage)).toContain('66,7 %12 sur 18 relues');
  });

  it('Tours par Livraison : chaque nombre de Tours avec ses Livraisons et leur part ; l’oreille entend ce que compte le nombre', () => {
    renderSection();

    const rounds = within(tile('Tours par Livraison')).getByRole('list', { name: 'Livraisons relues selon leur nombre de Tours de relecture' });
    const rows = within(rounds).getAllByRole('listitem');
    expect(rows.map(shown)).toEqual(['1 Tour975 %', '2 Tours216,7 %', '3 Tours00 %', '4 Tours ou plus18,3 %']);
    expect(heard(rows[0]!)).toBe('1 Tour9 Livraisons75 %');
    expect(heard(rows[3]!)).toBe('4 Tours ou plus1 Livraison8,3 %');
  });

  it('Tours par Livraison : une part s’écrit comme l’Acceptation au premier passage, à une décimale', () => {
    // 11 Livraisons relues : 10 acceptées en un Tour, une renvoyée en deux Tours. Les 10 sur 11 sont la même part dans les deux tuiles.
    renderSection(
      withReview({
        reviewed: 11,
        firstPassAcceptance: { ...agentChainFixture().review.firstPassAcceptance, accepted: 10, reviewed: 11, rate: 10 / 11 },
        roundsPerDelivery: { one: 10, two: 1, three: 0, fourOrMore: 0 },
      }),
    );

    expect(shown(tile('Acceptation au premier passage').querySelector('[data-value]')!)).toBe('90,9 %');
    expect(within(tile('Tours par Livraison')).getAllByRole('listitem').map(shown)).toEqual(['1 Tour1090,9 %', '2 Tours19,1 %', '3 Tours00 %', '4 Tours ou plus00 %']);
  });

  it('Retours par origine : leur nombre, puis chaque Statut de relais quitté, zéros compris', () => {
    renderSection(withReview({ sendBacks: { review: 4, integration: 0, validation: 1 } }));

    const sendBacks = tile('Retours par origine');
    expect(shown(sendBacks)).toContain('5Retours des Livraisons de la période');
    const rows = within(within(sendBacks).getByRole('list', { name: 'Retours selon le Statut de relais qu’ils quittent' })).getAllByRole('listitem');
    expect(rows.map(shown)).toEqual(['Relecture4', 'Intégration0', 'Validation1']);
    expect(rows.map(heard)).toEqual(['Relecture4 Retours', 'Intégration0 Retour', 'Validation1 Retour']);
  });

  describe('Taux d’échec après relecture', () => {
    it('non significatif comme le Taux d’échec : le même motif, et les deux taux observés en retrait', () => {
      renderSection();

      const failure = tile('Taux d’échec après relecture');
      expect(failure.hasAttribute('data-indicative')).toBe(true);
      expect(shown(failure)).toContain('Non significatif');
      expect(shown(failure)).toContain('Couverture insuffisante : 19 % des bugs ont une origine renseignée (minimum 50 %).');
      expect(shown(failure)).toContain('Observé, Livraisons relues : 0 % (0 sur 12)');
      expect(shown(failure)).toContain('Observé, Livraisons non relues : 0 % (0 sur 6)');
    });

    it('significatif : le taux des Livraisons relues en grand, celui des autres à côté', () => {
      renderSection(
        withReview({
          failureRate: { ...ENOUGH_COVERAGE, reviewed: { deliveries: 12, failed: 1, rate: 1 / 12 }, unreviewed: { deliveries: 6, failed: 2, rate: 2 / 6 } },
        }),
      );

      const failure = tile('Taux d’échec après relecture');
      expect(failure.hasAttribute('data-indicative')).toBe(false);
      expect(shown(failure)).toContain('8,3 %Livraisons relues : 1 sur 12 en échec');
      expect(shown(failure)).toContain('Livraisons non relues : 33,3 % (2 sur 6 en échec)');
    });
  });

  describe('Décomposition du Cycle Time', () => {
    it('répartit le Cycle Time cumulé en six parts, dans l’ordre de la barre, avec leur durée et leur part', () => {
      renderSection();

      const card = screen.getByRole('region', { name: 'Décomposition du Cycle Time' });
      expect(shown(card)).toContain('Le Cycle Time cumulé de 18 Livraisons (31 j), réparti en six parts qui s’additionnent.');
      expect(plain(within(card).getByRole('img').getAttribute('aria-label'))).toBe(
        'Décomposition du Cycle Time : Développement 45,2 %, Correction 9,7 %, Relecture 16,1 %, Intégration 8,1 %, Attente humaine 12,9 %, Blocage 8,1 %.',
      );
      const parts = within(within(card).getByRole('list', { name: 'Parts du Cycle Time' })).getAllByRole('listitem');
      expect(parts.map((part) => shown(part).split('%')[0])).toEqual([
        'Développement14 j45,2 ',
        'Correction3 j9,7 ',
        'Relecture5 j16,1 ',
        'Intégration2,5 j8,1 ',
        'Attente humaine4 j12,9 ',
        'Blocage2,5 j8,1 ',
      ]);
      // Une couleur par part : celle de sa colonne, la Correction hachurée de celle d'En cours.
      expect([...card.querySelectorAll('[data-part]')].map((part) => part.getAttribute('data-part'))).toEqual([
        'development',
        'correction',
        'review',
        'integration',
        'humanWait',
        'blocked',
      ]);
    });

    it('une part nulle n’a pas de segment, et s’écrit « Aucune »', () => {
      const data = agentChainFixture();
      renderSection(agentChainFixture({ cycleTimeBreakdown: { ...data.cycleTimeBreakdown, correction: 0, development: 17 * DAY } }));

      const card = screen.getByRole('region', { name: 'Décomposition du Cycle Time' });
      expect(card.querySelector('[data-part="correction"]')).toBeNull();
      expect(shown(within(card).getByRole('list', { name: 'Parts du Cycle Time' }))).toContain('CorrectionAucune0 %');
    });

    it('sans Cycle Time à répartir, la carte le dit', () => {
      const data = agentChainFixture();
      renderSection(
        agentChainFixture({
          cycleTimeBreakdown: { ...data.cycleTimeBreakdown, total: 0, development: 0, correction: 0, review: 0, integration: 0, humanWait: 0, blocked: 0 },
        }),
      );
      expect(shown(screen.getByRole('region', { name: 'Décomposition du Cycle Time' }))).toContain(
        'Aucun Cycle Time à décomposer : les Livraisons de la période n’ont jamais été démarrées.',
      );
    });
  });

  describe('Attente humaine', () => {
    it('donne la médiane, le P85 et la part du Cycle Time des Livraisons qui ont attendu', () => {
      renderSection();

      const wait = tile('Attente humaine');
      expect(wait.hasAttribute('data-indicative')).toBe(false);
      expect(shown(wait)).toContain('6 Livraisons ont attendu');
      expect(shown(wait.querySelector('[data-value]')!)).toBe('8 h');
      expect(shown(wait.querySelector('[data-p85]')!)).toBe('1,3 j');
      expect(shown(wait.querySelector('[data-share]')!)).toBe('12,9 % du Cycle Time des Livraisons de la période');
    });

    it('sous 4 Livraisons qui ont attendu, les centiles sont donnés, en pointillé, avec la réserve', () => {
      renderSection(withHumanWaits({ waited: 2, stats: { median: 3 * HOUR, p85: 5 * HOUR, n: 2 }, reliable: false }));

      const wait = tile('Attente humaine');
      expect(wait.hasAttribute('data-indicative')).toBe(true);
      expect(shown(wait)).toContain('2 Livraisons ont attendu');
      expect(shown(wait)).toContain('Moins de 4 Livraisons ont attendu : les centiles ne disent pas grand-chose.');
    });

    it('sans Livraison qui a attendu, la tuile le dit', () => {
      renderSection(withHumanWaits({ waited: 0, stats: { median: null, p85: null, n: 0 }, reliable: false, share: 0 }));

      const wait = tile('Attente humaine');
      expect(wait.hasAttribute('data-indicative')).toBe(false);
      expect(shown(wait)).toContain('Aucune Livraison de la période n’a attendu votre validation (À valider).');
      expect(wait.querySelector('[data-p85]')).toBeNull();
    });
  });

  it('en anglais : les termes anglais de CONTEXT.md', () => {
    renderSection(agentChainFixture(), 'en');

    expect(screen.getByRole('heading', { level: 2, name: 'Agent chain' })).toBeTruthy();
    expect(titles()).toEqual([
      'First-pass acceptance',
      'Review coverage',
      'Review rounds per delivery',
      'Send-backs by origin',
      'Change failure rate after review',
      'Human wait',
    ]);
    expect(screen.getByRole('region', { name: 'Cycle Time breakdown' })).toBeTruthy();
    const acceptance = tile('First-pass acceptance');
    expect(shown(acceptance)).toContain('12 Reviewed deliveries');
    expect(shown(acceptance)).toContain('75%9 of 12 with no Send-back');
    expect(heard(acceptance.querySelector('[data-trend]')!)).toMatch(/^Up by 15 points/);
    expect(shown(tile('Send-backs by origin'))).toContain('6Send-backs of the period’s Deliveries');
    expect(shown(tile('Human wait'))).toContain('6 Deliveries waited');
  });
});

describe('la grille des tuiles de la Chaîne d’agents', () => {
  /** La portée en colonnes à chacune des largeurs (étroite, dès 36rem, dès 48rem) : la classe du plus large préfixe qui s'applique. */
  const PREFIXES = ['', '@min-[36rem]:', '@min-[48rem]:'] as const;
  const at = (classes: string, name: string, tier: number) => {
    for (let index = tier; index >= 0; index--) {
      const found = classes.split(' ').find((value) => value.startsWith(`${PREFIXES[index]}${name}`) && /^\d+$/.test(value.slice(`${PREFIXES[index]}${name}`.length)));
      if (found) return Number(found.slice(`${PREFIXES[index]}${name}`.length));
    }
    return undefined;
  };

  it.each([
    [0, [[0], [1], [2], [3], [4]]],
    [1, [[0, 1], [2, 3], [4]]],
    [2, [[0, 1], [2, 3, 4]]],
  ])('largeur %i : chaque rangée est pleine, l’Acceptation au premier passage en tête', (tier, expected) => {
    const columns = at(AGENT_CHAIN_GRID, 'grid-cols-', tier) ?? 1;
    const spans = AGENT_CHAIN_SPANS.map((classes) => at(classes, 'col-span-', tier) ?? 1);
    const rows: number[][] = [];
    let filled = columns;
    spans.forEach((span, index) => {
      if (filled + span > columns) {
        rows.push([]);
        filled = 0;
      }
      rows.at(-1)?.push(index);
      filled += span;
    });

    expect(rows).toEqual(expected);
    expect(rows.map((row) => row.reduce((sum, index) => sum + (spans[index] ?? 0), 0))).toEqual(rows.map(() => columns));
  });
});
