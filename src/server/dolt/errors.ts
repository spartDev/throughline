/**
 * Les erreurs du lecteur Dolt. Elles vivent à part pour que `read-only.ts` puisse en dériver (`ReadOnlyViolation`)
 * sans import circulaire, `client.ts` important `read-only.ts` : les autres modules les importent de `client.ts`,
 * qui les ré-exporte.
 *
 * Une erreur que le client écrit lui-même porte sa cause codée (`reasonDetail`, bdesk-ewr.8) : son message est la raison française de cette cause
 * (`projectReason`), et l'une et l'autre deviennent la raison d'un Projet illisible. Le texte de Dolt (`DoltTextError`) n'en a pas.
 */
import type { ProjectReasonDetail } from '../../shared/errors';
import { projectReasonFr } from '../../shared/project-reasons';

/** Le message d'une erreur : la raison française de sa cause, ou un texte que le client ne code pas. */
const messageOf = (message: string | ProjectReasonDetail) => (typeof message === 'string' ? message : projectReasonFr(message));
const detailOf = (message: string | ProjectReasonDetail) => (typeof message === 'string' ? undefined : message);

/** Le binaire `dolt` n'est pas installé (ou pas dans le PATH). */
export class DoltNotFoundError extends Error {
  readonly reasonDetail: ProjectReasonDetail;

  constructor(binary: string) {
    const detail: ProjectReasonDetail = { code: 'dolt-not-found', params: { binary } };
    super(projectReasonFr(detail));
    this.name = 'DoltNotFoundError';
    this.reasonDetail = detail;
  }
}

/** Échec d'une requête : base illisible, schéma inattendu, verrou persistant, délai dépassé, requête refusée… */
export class DoltQueryError extends Error {
  /**
   * Les lignes de chaque instruction d'un groupe qui a abouti avant celle qui a échoué (`dolt sql` s'arrête à la première erreur), dans l'ordre : de quoi savoir ce que
   * l'état de la base disait, dans la même transaction, quand l'instruction a échoué (bdesk-38k.74). Absentes quand on ne sait pas lesquelles ont abouti. Ce sont des lignes de
   * la base : la propriété n'est pas énumérable, ni le journal des erreurs ni une sérialisation ne les emportent, et le message ne les reprend jamais.
   */
  declare readonly completed?: readonly (readonly Record<string, unknown>[])[];
  /** La cause codée, quand le message est celui d'une cause que le client écrit lui-même ; absente (pas même `undefined`) d'un message qu'il ne code pas. */
  declare readonly reasonDetail?: ProjectReasonDetail;

  constructor(
    /** La cause codée (le message en est la raison française), ou un message que le client ne code pas. */
    message: string | ProjectReasonDetail,
    /** Dossier de la base, quand l'erreur en vient. */
    readonly dir = '',
    readonly locked = false,
    /** L'erreur d'origine, pour qui débogue : l'API n'en expose que le message. */
    cause?: unknown,
    completed?: readonly (readonly Record<string, unknown>[])[],
  ) {
    super(messageOf(message), cause === undefined ? undefined : { cause });
    this.name = 'DoltQueryError';
    const detail = detailOf(message);
    if (detail !== undefined) Object.assign(this, { reasonDetail: detail });
    if (completed !== undefined) Object.defineProperty(this, 'completed', { value: completed, enumerable: false });
  }
}

/**
 * Une erreur dont le message est du **texte de Dolt** (bdesk-38k.74, relecture finale, round 4, m4) : ce qu'il a écrit sur sa sortie d'erreur (`stderr`), ou le fragment de sa sortie que
 * l'analyse n'a pas su lire (`output`). Un tel texte peut citer ce que la base lui a fait lire (`from_base64` : « illegal base64 data at input byte N », où N est un octet d'un fichier) :
 * le client vérifié (`stored-sql.ts`) ne le rend à personne, il le remplace par un message fixe par classe de cause. Les erreurs que le client écrit lui-même (délai, taille de la sortie,
 * binaire absent, code de sortie sans message) ne sont pas de cette classe : leur texte n'est pas celui de Dolt. Pour qui ne passe pas par le client vérifié, c'est une `DoltQueryError` comme
 * une autre (même nom, même message).
 */
export class DoltTextError extends DoltQueryError {
  constructor(
    message: string,
    readonly kind: 'stderr' | 'output',
    dir = '',
    locked = false,
    completed?: readonly (readonly Record<string, unknown>[])[],
  ) {
    super(message, dir, locked, undefined, completed);
  }
}
