import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModeToggleButton } from './ModeToggleButton';
import { UIModeProvider, UI_MODE_STORAGE_KEY } from '@/lib/ui-mode';

function wrap(node: React.ReactNode) {
  return <UIModeProvider>{node}</UIModeProvider>;
}

describe('ModeToggleButton (S2.10.12)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    // jsdom não implementa window.location.reload — stub que não faz nada.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: vi.fn() },
    });
  });

  it('não renderiza nada antes do mode ser escolhido', () => {
    const { container } = render(wrap(<ModeToggleButton />));
    expect(container.firstChild).toBeNull();
  });

  it('em modo MOBILE, oferece troca para WEB', () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, 'mobile');
    render(wrap(<ModeToggleButton variant="full" />));
    expect(screen.getByText(/Modo WEB/i)).toBeInTheDocument();
  });

  it('em modo WEB, oferece troca para MOBILE', () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, 'web');
    render(wrap(<ModeToggleButton variant="full" />));
    expect(screen.getByText(/Modo MOBILE/i)).toBeInTheDocument();
  });

  it('click confirma e atualiza localStorage', () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, 'mobile');
    render(wrap(<ModeToggleButton variant="full" />));
    fireEvent.click(screen.getByRole('button'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Modo WEB'));
    expect(window.localStorage.getItem(UI_MODE_STORAGE_KEY)).toBe('web');
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('click sem confirmação não muda o modo', () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, 'web');
    render(wrap(<ModeToggleButton variant="full" />));
    fireEvent.click(screen.getByRole('button'));
    expect(window.localStorage.getItem(UI_MODE_STORAGE_KEY)).toBe('web');
    expect(window.location.reload).not.toHaveBeenCalled();
  });
});
