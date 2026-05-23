import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { suggestedMode, UIModeProvider, UI_MODE_STORAGE_KEY, useUIMode } from './ui-mode';

function wrapper({ children }: { children: React.ReactNode }) {
  return <UIModeProvider>{children}</UIModeProvider>;
}

describe('useUIMode (S2.10.12)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('mode é undefined na 1ª visita (não escolhido)', () => {
    const { result } = renderHook(() => useUIMode(), { wrapper });
    expect(result.current.mode).toBeUndefined();
    expect(result.current.hasChosen).toBe(false);
    expect(result.current.isWeb).toBe(false);
    expect(result.current.isMobile).toBe(false);
  });

  it('setMode persiste em localStorage e atualiza flags', () => {
    const { result } = renderHook(() => useUIMode(), { wrapper });

    act(() => result.current.setMode('web'));
    expect(result.current.mode).toBe('web');
    expect(result.current.isWeb).toBe(true);
    expect(result.current.isMobile).toBe(false);
    expect(result.current.hasChosen).toBe(true);
    expect(window.localStorage.getItem(UI_MODE_STORAGE_KEY)).toBe('web');

    act(() => result.current.setMode('mobile'));
    expect(result.current.mode).toBe('mobile');
    expect(result.current.isMobile).toBe(true);
    expect(window.localStorage.getItem(UI_MODE_STORAGE_KEY)).toBe('mobile');
  });

  it('clearMode remove a escolha', () => {
    const { result } = renderHook(() => useUIMode(), { wrapper });
    act(() => result.current.setMode('web'));
    act(() => result.current.clearMode());
    expect(result.current.mode).toBeUndefined();
    expect(result.current.hasChosen).toBe(false);
    expect(window.localStorage.getItem(UI_MODE_STORAGE_KEY)).toBeNull();
  });

  it('lê valor pré-existente do localStorage no mount', () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, 'web');
    const { result } = renderHook(() => useUIMode(), { wrapper });
    expect(result.current.mode).toBe('web');
    expect(result.current.hasChosen).toBe(true);
  });

  it('ignora valor inválido em localStorage', () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, 'gibberish');
    const { result } = renderHook(() => useUIMode(), { wrapper });
    expect(result.current.mode).toBeUndefined();
  });
});

describe('suggestedMode (S2.10.12)', () => {
  it('retorna "mobile" quando viewport < 1024', () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
    expect(suggestedMode()).toBe('mobile');
  });

  it('retorna "web" quando viewport >= 1024', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    expect(suggestedMode()).toBe('web');
  });

  it('retorna "web" exatamente em 1024 (limite incluso)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    expect(suggestedMode()).toBe('web');
  });
});
