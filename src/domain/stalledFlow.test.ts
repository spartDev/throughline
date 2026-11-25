import { describe, expect, it } from 'vitest';
import { computeHealth } from './health';
import { analyzeProject, type MetricsTicket } from './metrics';
import { stalledFlowAt, stalledTimeIn } from './stalledFlow';
import { NO_DECLARED_STATUSES } from './statuses';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Origine des tests : vendredi 23 octobre 2026, 00:00Z. */
const T = new Date('2026-10-23T00:00:00Z').getTime();
const h = (hours: number) => T + hours * HOUR;

function ticket(id: string, statuses: [string, number][]): MetricsTicket {
  return {
    id,
    title: `Titre de ${id}`,
    type: 'task',
    priority: 2,
    statusSnapshots: statuses.map(([status, at]) => ({ status, at: new Date(at) })),
    dependencies: [],
  };
}

/** Un Prêt créé à `at`, jamais démarré. */
const ready = (id: string, at: number) => ticket(id, [['open', at]]);
/** Un ticket créé avant tout le reste, qui fait une Transition à chacun des instants donnés, entre en cours et en relecture : jamais Prêt ensuite. */
const mover = (id: string, ...moves: number[]) =>
  ticket(id, [['open', h(-100)], ...moves.map((at, i): [string, number] => [i % 2 === 0 ? 'in_progress' : 'in_review', at])]);
const threeReady = () => [ready('r1', h(-50)), ready('r2', h(-50)), ready('r3', h(-50))];
const analysis = (tickets: MetricsTicket[]) => analyzeProject(tickets, NO_DECLARED_STATUSES);

describe('Heures à l’arrêt', () => {
  it('entre deux Transitions à 20 heures d’écart, avec 3 Prêts : les 8 heures qui suivent les 12 premières', () => {
    const stalled = stalledTimeIn(analysis([...threeReady(), mover('m', h(0), h(20))]), h(-10), h(30));

    expect(stalled).toEqual({ duration: 8 * HOUR, readyTime: 3 * 8 * HOUR });
  });

  it('12 heures d’écart ou moins ne comptent rien', () => {
    expect(stalledTimeIn(analysis([...threeReady(), mover('m', h(0), h(12))]), h(-10), h(24)).duration).toBe(0);
  });

  it('ne compte que lorsque le Projet a au moins 3 Prêts : un troisième Prêt créé en route ouvre l’arrêt', () => {
    const tickets = [ready('r1', h(-50)), ready('r2', h(-50)), ready('r3', h(15)), mover('m', h(0), h(20))];

    expect(stalledTimeIn(analysis(tickets), h(-10), h(30))).toEqual({ duration: 5 * HOUR, readyTime: 3 * 5 * HOUR });
  });

  it('se borne à la fenêtre', () => {
    const tickets = [...threeReady(), mover('m', h(0), h(30))];

    expect(stalledTimeIn(analysis(tickets), h(14), h(20)).duration).toBe(6 * HOUR);
  });

  it('après la dernière Transition, court jusqu’à la fin de la fenêtre ; s’arrête au bout de 7 jours, quand le Projet s’endort', () => {
    const tickets = [...threeReady(), mover('m', h(0))];

    expect(stalledTimeIn(analysis(tickets), h(-10), h(30)).duration).toBe(18 * HOUR);
    expect(stalledTimeIn(analysis(tickets), h(-10), h(30 * 24)).duration).toBe(7 * DAY - 12 * HOUR);
  });

  it('rien avant la première Transition : le Projet n’a jamais été en marche', () => {
    expect(stalledTimeIn(analysis([...threeReady(), mover('m', h(100))]), h(-10), h(90)).duration).toBe(0);
  });

  it('se somme sur les Projets dans la santé du flux, avec les Prêts en moyenne pesée par le temps', () => {
    const three = { id: 'a', name: 'A', analysis: analysis([...threeReady(), mover('m', h(0), h(20))]) };
    const five = {
      id: 'b',
      name: 'B',
      analysis: analysis([...threeReady(), ready('r4', h(-50)), ready('r5', h(-50)), mover('m', h(0), h(14))]),
    };

    const { stalled } = computeHealth([three, five], { period: { range: '7d' }, now: new Date(h(30)), timeZone: 'UTC' }).activity;

    // A : 8 h à 3 Prêts (de h12 à h20). B : 2 h à 5 Prêts (de h12 à h14), puis 4 h à 5 Prêts depuis h26 (12 h après sa dernière Transition).
    expect(stalled).toEqual({ duration: 14 * HOUR, ready: (3 * 8 + 5 * 6) / 14 });
  });

  it('sans Heures à l’arrêt, pas de moyenne', () => {
    const quiet = { id: 'a', name: 'A', analysis: analysis([mover('m', h(0), h(20))]) };

    expect(computeHealth([quiet], { period: { range: '7d' }, now: new Date(h(40)), timeZone: 'UTC' }).activity.stalled).toEqual({ duration: 0, ready: null });
  });

  it('ne compte pas les Transitions des Epics, comme la Carte d’activité : une Epic qui bouge ne remet pas le compte à zéro', () => {
    const epic: MetricsTicket = { ...ticket('e', [['open', h(-100)], ['in_progress', h(16)]]), type: 'epic' };
    const tickets = [...threeReady(), mover('m', h(0), h(20)), epic];

    expect(stalledTimeIn(analysis(tickets), h(-10), h(30)).duration).toBe(8 * HOUR);
  });

  it('dit la même chose que le Signal : à chaque instant, le Flux est à l’arrêt exactement quand le Signal le dit', () => {
    // Des historiques tirés d'un générateur fixe : créations, démarrages, retours, clôtures et Blocages par dépendance, à toute heure sur 20 jours.
    let seed = 7;
    const random = () => (seed = (seed * 16_807) % 2_147_483_647) / 2_147_483_647;
    const STATUSES = ['open', 'in_progress', 'blocked', 'closed', 'deferred'];
    for (let run = 0; run < 40; run++) {
      const tickets = Array.from({ length: 4 + Math.floor(random() * 6) }, (_, i): MetricsTicket => {
        let at = h(random() * 200);
        const steps: [string, number][] = [['open', at]];
        for (let k = Math.floor(random() * 4); k > 0; k--) {
          at += random() * 60 * HOUR;
          const status = STATUSES[Math.floor(random() * STATUSES.length)] as string;
          if (status !== steps.at(-1)?.[0]) steps.push([status, at]);
        }
        const base = ticket(`t${i}`, steps);
        return i > 0 && random() < 0.3 ? { ...base, dependencies: [{ type: 'blocks', target: `t${i - 1}`, addedAt: new Date(steps[0]![1]) }] } : base;
      });
      const project = analysis(tickets);
      for (let at = h(0); at < h(20 * 24); at += HOUR / 2) {
        const slice = stalledTimeIn(project, at, at + 1).duration;
        expect(slice, `historique ${run}, ${new Date(at).toISOString()}`).toBe(stalledFlowAt(project, at) === null ? 0 : 1);
      }
    }
  });
});
