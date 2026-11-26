import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useT } from '../i18n';
import { cx } from '../lib/cx';
import { TABS, type MetricsTab } from './params';

/**
 * Les onglets Décisions et Flux de la page Métriques (bdesk-3e9.7), au motif « onglets » de l'APG (WAI-ARIA Authoring Practices) : une liste d'onglets
 * (`tablist`) nommée, un seul onglet dans l'ordre de tabulation, celui qui est choisi ; les flèches gauche et droite passent à l'onglet voisin (de bout en
 * bout), Origine et Fin au premier et au dernier, et le choisissent aussitôt (activation automatique : le panneau suivant est déjà là, sans requête). Le
 * panneau (`tabpanel`) est nommé par son onglet et entre dans l'ordre de tabulation : il commence par un intertitre, qu'on n'atteindrait pas sinon. Seul le
 * panneau de l'onglet choisi est rendu : l'onglet qui n'est pas choisi ne désigne pas de panneau (`aria-controls`).
 *
 * L'onglet choisi vit dans l'adresse (`?tab=`, `withTab`) : la page le lit, et c'est elle qui le change (`onChange`).
 */
export function MetricsTabs({ tab, onChange, children }: { tab: MetricsTab; onChange: (tab: MetricsTab) => void; children: ReactNode }) {
  const texts = useT().metrics.metricsTabs;
  const base = useId();
  const tabs = useRef<Partial<Record<MetricsTab, HTMLButtonElement | null>>>({});
  const tabId = (name: MetricsTab) => `${base}-tab-${name}`;
  const panelId = `${base}-panel`;

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.indexOf(tab);
    const last = TABS.length - 1;
    const target = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[event.key];
    const next = target === undefined ? undefined : TABS[target];
    if (next === undefined) return;
    event.preventDefault();
    tabs.current[next]?.focus();
    if (next !== tab) onChange(next);
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div role="tablist" aria-label={texts.label} onKeyDown={move} className="flex min-w-0 gap-1 border-b border-line">
        {TABS.map((name) => {
          const selected = name === tab;
          return (
            <button
              key={name}
              ref={(element) => {
                tabs.current[name] = element;
              }}
              type="button"
              role="tab"
              id={tabId(name)}
              aria-selected={selected}
              aria-controls={selected ? panelId : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                if (!selected) onChange(name);
              }}
              className={cx(
                '-mb-px inline-flex min-h-10 items-center rounded-t-md border-b-2 px-3 text-base font-semibold transition-colors',
                selected ? 'border-ink text-ink' : 'border-transparent text-ink-2 hover:border-line-strong hover:text-ink',
              )}
            >
              {texts[name]}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId(tab)} tabIndex={0} className="flex min-w-0 flex-col gap-6 rounded-sm">
        {children}
      </div>
    </div>
  );
}
