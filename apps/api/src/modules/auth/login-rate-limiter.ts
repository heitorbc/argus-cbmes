import { Injectable } from '@nestjs/common';

/**
 * Rate limiter por NF para tentativas de login.
 * In-memory (Fase 1) — migra para Redis na Fase 2.
 *
 * Política (alinhada ao DoD do S1):
 *  - 5 falhas em até 5 min → bloqueio de 15 min.
 *  - Login bem-sucedido reseta o contador.
 */
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 min
const BLOCK_MS = 15 * 60 * 1000; // 15 min

interface Attempt {
  count: number;
  firstFailureAt: number;
  blockedUntil: number;
}

@Injectable()
export class LoginRateLimiter {
  private readonly attempts = new Map<string, Attempt>();

  /** Retorna timestamp em ms até o qual o NF está bloqueado, ou 0 se não bloqueado. */
  blockedUntil(nf: string, now: number = Date.now()): number {
    const a = this.attempts.get(nf);
    if (!a) return 0;
    if (a.blockedUntil > now) return a.blockedUntil;
    return 0;
  }

  isBlocked(nf: string, now: number = Date.now()): boolean {
    return this.blockedUntil(nf, now) > 0;
  }

  /** Registra uma tentativa malsucedida. Retorna true se passou a estar bloqueado agora. */
  registerFailure(nf: string, now: number = Date.now()): boolean {
    const a = this.attempts.get(nf);

    if (!a || now - a.firstFailureAt > WINDOW_MS) {
      this.attempts.set(nf, {
        count: 1,
        firstFailureAt: now,
        blockedUntil: 0,
      });
      return false;
    }

    a.count += 1;
    if (a.count >= MAX_ATTEMPTS) {
      a.blockedUntil = now + BLOCK_MS;
      return true;
    }
    return false;
  }

  /** Limpa contador para o NF (uso após login bem-sucedido). */
  reset(nf: string): void {
    this.attempts.delete(nf);
  }
}
