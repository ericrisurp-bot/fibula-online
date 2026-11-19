import type { ProficiencyKey } from './engine';

export type ProficiencySyncErrorKind =
  | 'transient'
  | 'unknown_key'
  | 'fk_profile'
  | 'invalid_batch'
  | 'auth';

export type ProficiencySyncErrorClassification = {
  kind: ProficiencySyncErrorKind;
  keys?: string[];
};

type ErrorShape = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
  cause?: unknown;
};

function readErrorShape(error: unknown): ErrorShape {
  if (error && typeof error === 'object') return error as ErrorShape;
  return { message: typeof error === 'string' ? error : '' };
}

export function classifyProficiencySyncError(error: unknown): ProficiencySyncErrorClassification {
  const { code, message, status } = readErrorShape(error);
  const text = typeof message === 'string' ? message : String(message ?? '');
  const normalized = text.toLocaleLowerCase('pt-BR');
  const statusCode = typeof status === 'number' ? status : Number(status);

  if (code === '23503') return { kind: 'fk_profile' };
  if (normalized.includes('sessão não autorizada')) return { kind: 'auth' };

  const unknownKeyPattern = /Proficiência desconhecida ou inativa:\s*([^\.]+)\./gi;
  const keys = Array.from(text.matchAll(unknownKeyPattern), match => match[1].trim())
    .filter(Boolean);
  if (keys.length) return { kind: 'unknown_key', keys: Array.from(new Set(keys)) };

  if (
    normalized.includes('quantidade inválida para a proficiência')
    || normalized.includes('lote de proficiências inválido')
    || normalized.includes('identificador de lote reutilizado com conteúdo diferente')
  ) {
    return { kind: 'invalid_batch' };
  }

  if (
    (Number.isInteger(statusCode) && (statusCode === 429 || statusCode >= 500))
    || /network|fetch|timeout|timed out|connection|temporar|gateway|unavailable/i.test(text)
    || (typeof code === 'string' && /^(08|53|57|58)/.test(code))
  ) {
    return { kind: 'transient' };
  }

  return { kind: 'transient' };
}

/** Backoff exponencial de 30 s até 10 min, com jitter determinístico de ±10%. */
export function nextProficiencyBackoffMs(consecutiveFailures: number): number {
  const failures = Number.isFinite(consecutiveFailures)
    ? Math.max(1, Math.floor(consecutiveFailures))
    : 1;
  const base = Math.min(10 * 60 * 1000, 30 * 1000 * (2 ** Math.min(failures - 1, 20)));
  const seed = Math.sin(failures * 12.9898) * 43758.5453;
  const unit = seed - Math.floor(seed);
  const jitter = (unit * 0.2) - 0.1;
  return Math.round(base * (1 + jitter));
}
