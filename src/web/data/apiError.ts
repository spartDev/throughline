import { type ApiErrorDetail, type ProjectReasonDetail, readProjectReasonDetail } from '../../shared/errors';
import { CATALOGS } from '../i18n/catalog';
import { FORMATS_BY_LANGUAGE } from '../i18n/format';
import type { Language } from '../i18n/language';

/** Erreur d'appel à l'API. `status` vaut 0 quand le serveur est injoignable. */
export class ApiError extends Error {
  readonly status: number;
  /** Pourquoi un Projet est illisible (503) ; absente des autres erreurs. Phrase française du serveur : l'interface l'écrit par `unreadableReason`. */
  readonly reason?: string;
  /** Le code et les paramètres que le serveur a envoyés, quand ils ont la forme attendue : de quoi écrire l'erreur dans la langue affichée. */
  readonly detail?: ApiErrorDetail;
  /** La réponse ne disait rien d'autre que son code HTTP : le message est un repli, que l'interface écrit dans sa langue (`errorText`). */
  readonly bare?: true;

  constructor(
    message: string,
    status: number,
    options?: ErrorOptions & { reason?: string; detail?: ApiErrorDetail; bare?: true },
  ) {
    super(message, options);
    this.name = 'ApiError';
    this.status = status;
    this.reason = options?.reason;
    this.detail = options?.detail;
    if (options?.bare) this.bare = true;
  }
}

/**
 * Le texte d'une erreur, dans la langue affichée (bdesk-ewr.6) : le seul chemin par lequel l'interface écrit le message d'une erreur d'API.
 * - Une erreur que l'API prévoit (son code est connu, ses paramètres ont la forme attendue) : la phrase du catalogue `errors`, ses nombres formatés
 *   dans la langue, la raison d'un Projet illisible écrite par `projectReasonText` ; les autres paramètres (identifiants, valeurs reçues) tels quels.
 * - Le serveur injoignable, ou une réponse d'erreur sans corps lisible (`bare`) : les phrases de `shell.loadErrors`.
 * - Tout autre `Error` (un code que l'interface ne connaît pas, un message que le serveur n'a pas codé) : son `message`, tel quel.
 * - Ce qui n'est pas une `Error` : `undefined`.
 */
export function errorText(error: unknown, language: Language): string | undefined {
  if (!(error instanceof Error)) return undefined;
  if (error instanceof ApiError) {
    const { errors, shell } = CATALOGS[language];
    if (error.status === 0) return shell.loadErrors.unreachable;
    if (error.detail) return apiSentence(error.detail, errors.api, language);
    if (error.bare) return shell.loadErrors.http(error.status);
  }
  return error.message;
}

type Sentences = (typeof CATALOGS)['fr']['errors']['api'];

function apiSentence(detail: ApiErrorDetail, api: Sentences, language: Language): string {
  const { formatCount } = FORMATS_BY_LANGUAGE[language];
  // Les nombres passent par le formateur de la langue (« 1 000 », « 1,000 ») ; le reste part tel quel.
  const params = Object.fromEntries(
    Object.entries(detail.params).map(([name, value]) => [name, typeof value === 'number' ? formatCount(value) : value]),
  );
  // La raison d'un Projet illisible s'écrit dans la langue d'après sa cause codée, qui ne part pas au catalogue (`Texts`, `catalog/errors.ts`).
  if (detail.code === 'project-unreadable') {
    params.reason = projectReasonText(detail.params, language);
    delete params.reasonDetail;
  }
  // Le code et la forme des paramètres ont été vérifiés à la lecture (`readApiErrorDetail`) : la phrase de ce code reçoit ses paramètres.
  const sentence = api[detail.code] as (params: Record<string, unknown>) => string;
  return sentence(params);
}

/**
 * Ce que l'API dit d'un Projet illisible ou d'un dossier ignoré : la raison française du serveur (absente d'un Projet lisible), et sa cause codée quand il
 * l'a codée. `reasonDetail` n'est pas cru sur parole : c'est un `unknown`, relu à chaque écriture.
 */
export interface ProjectReason {
  reason?: string;
  reasonDetail?: unknown;
}

/**
 * La raison d'un Projet illisible ou d'un dossier ignoré, dans la langue affichée (bdesk-ewr.8) : le seul chemin par lequel l'interface l'écrit, que la
 * raison vienne d'une réponse 200 (`Project`, `IgnoredFolder`, `MetricsUnreadableProject`) ou d'un 503 (`project-unreadable`, par `errorText`).
 * - Une cause que l'interface connaît, de la forme attendue : la phrase du catalogue `errors.reasons`, ses comptes formatés dans la langue.
 * - Sans cause, ou une cause que l'interface ne connaît pas, ou mal formée (un serveur d'une autre version) : `reason`, telle quelle (`undefined` sans
 *   raison : à l'appelant de dire « Projet illisible »).
 * La cause est relue (`readProjectReasonDetail`) : une réponse 200 n'est pas vérifiée à son arrivée, et ce serait sinon le compilateur qui croirait le serveur.
 */
export function projectReasonText({ reason, reasonDetail }: ProjectReason, language: Language): string | undefined {
  const detail = readProjectReasonDetail(reasonDetail);
  if (!detail) return reason;
  const { formatCount } = FORMATS_BY_LANGUAGE[language];
  // Le code et la forme des paramètres viennent d'être vérifiés : la phrase de ce code reçoit ses paramètres.
  const sentence = CATALOGS[language].errors.reasons[detail.code] as (params: ProjectReasonDetail['params'], count: (n: number) => string) => string;
  return sentence(detail.params, formatCount);
}

/** La raison d'un Projet illisible (503), dans la langue affichée ; `undefined` pour une autre erreur, ou un 503 sans raison. */
export function unreadableReason(error: ApiError, language: Language): string | undefined {
  if (error.status !== 503 || !error.reason) return undefined;
  const reasonDetail = error.detail?.code === 'project-unreadable' ? error.detail.params.reasonDetail : undefined;
  return projectReasonText({ reason: error.reason, reasonDetail }, language);
}
