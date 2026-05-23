import { fireEvent, render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useKeyboardShortcut } from './KeyboardShortcuts';

function Harness({
  shortcut,
  onTrigger,
}: {
  shortcut: { key: string; options?: Parameters<typeof useKeyboardShortcut>[2] };
  onTrigger: () => void;
}) {
  useKeyboardShortcut(shortcut.key, onTrigger, shortcut.options);
  return <input data-testid="input" />;
}

describe('useKeyboardShortcut (S2.10.12b)', () => {
  it('dispara handler quando tecla é pressionada (não em input)', () => {
    const handler = vi.fn();
    render(<Harness shortcut={{ key: 'n' }} onTrigger={handler} />);
    fireEvent.keyDown(window, { key: 'n' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('NÃO dispara quando focus está em <input> (default)', () => {
    const handler = vi.fn();
    const { getByTestId } = render(<Harness shortcut={{ key: 'n' }} onTrigger={handler} />);
    getByTestId('input').focus();
    fireEvent.keyDown(window, { key: 'n' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('dispara em input quando allowInInput=true (ex.: Esc)', () => {
    const handler = vi.fn();
    const { getByTestId } = render(
      <Harness shortcut={{ key: 'Escape', options: { allowInInput: true } }} onTrigger={handler} />,
    );
    getByTestId('input').focus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('requer Ctrl quando options.ctrl=true', () => {
    const handler = vi.fn();
    render(<Harness shortcut={{ key: 'k', options: { ctrl: true } }} onTrigger={handler} />);
    fireEvent.keyDown(window, { key: 'k' });
    expect(handler).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('disabled=true ignora completamente', () => {
    const handler = vi.fn();
    render(<Harness shortcut={{ key: 'n', options: { disabled: true } }} onTrigger={handler} />);
    fireEvent.keyDown(window, { key: 'n' });
    expect(handler).not.toHaveBeenCalled();
  });
});
