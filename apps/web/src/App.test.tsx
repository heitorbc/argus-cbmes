import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from './App';

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'ok' }),
        } as Response),
      ),
    );
  });

  it('renderiza título institucional', () => {
    render(<App />);
    expect(screen.getByText('ARGUS CBMES')).toBeInTheDocument();
    expect(screen.getByText('1ª Cia / 1º BBM')).toBeInTheDocument();
  });

  it('exibe rótulo "Em construção"', () => {
    render(<App />);
    expect(screen.getByText('Em construção')).toBeInTheDocument();
  });
});
