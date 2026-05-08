import { describe, it, expect } from 'vitest';
import { LoginRateLimiter } from './login-rate-limiter';

describe('LoginRateLimiter', () => {
  it('não bloqueia inicialmente', () => {
    const rl = new LoginRateLimiter();
    expect(rl.isBlocked('123')).toBe(false);
  });

  it('bloqueia após 5 falhas', () => {
    const rl = new LoginRateLimiter();
    const t0 = 1_000_000;
    let nowBlocked = false;
    for (let i = 0; i < 5; i++) {
      nowBlocked = rl.registerFailure('123', t0 + i * 100);
    }
    expect(nowBlocked).toBe(true);
    expect(rl.isBlocked('123', t0 + 500)).toBe(true);
  });

  it('libera após janela de 15 min', () => {
    const rl = new LoginRateLimiter();
    const t0 = 1_000_000;
    // 5 falhas todas em t0 (sem espalhar) — bloqueio em t0
    for (let i = 0; i < 5; i++) rl.registerFailure('123', t0);

    // ainda bloqueado em 14min59s
    expect(rl.isBlocked('123', t0 + 14 * 60 * 1000 + 59_000)).toBe(true);

    // liberado após 15min + 1ms a partir do momento da 5ª falha
    expect(rl.isBlocked('123', t0 + 15 * 60 * 1000 + 1)).toBe(false);
  });

  it('reset zera o contador', () => {
    const rl = new LoginRateLimiter();
    for (let i = 0; i < 4; i++) rl.registerFailure('123');
    rl.reset('123');
    expect(rl.isBlocked('123')).toBe(false);
    // após reset, mais 4 falhas não bloqueia
    for (let i = 0; i < 4; i++) {
      expect(rl.registerFailure('123')).toBe(false);
    }
  });

  it('janela de 5 min: falhas antigas não somam', () => {
    const rl = new LoginRateLimiter();
    const t0 = 1_000_000;
    rl.registerFailure('123', t0); // 1ª falha em t0
    // 4 falhas após 6 min — janela resetou
    let blocked = false;
    for (let i = 0; i < 4; i++) {
      blocked = rl.registerFailure('123', t0 + 6 * 60 * 1000 + i * 100);
    }
    expect(blocked).toBe(false);
    expect(rl.isBlocked('123', t0 + 7 * 60 * 1000)).toBe(false);
  });
});
