import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MilitarSelect } from './militar-select';
import type { Militar } from '@argus/shared-types';

function makeMilitar(opts: Partial<Militar> & Pick<Militar, 'nf'>): Militar {
  return {
    nf: opts.nf,
    ant: opts.ant ?? 100,
    posto: opts.posto ?? '2ºSGT',
    nome: opts.nome ?? 'JOSÉ DA SILVA',
    nomeGuerra: opts.nomeGuerra ?? 'SILVA',
    subSecao: opts.subSecao,
  } as Militar;
}

describe('MilitarSelect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renderiza input vazio quando sem value', () => {
    render(<MilitarSelect onChange={() => undefined} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('busca após debounce 300ms e mostra opções', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              items: [makeMilitar({ nf: '3037509', nomeGuerra: 'BARCELLOS', posto: '2ºSGT' })],
              total: 1,
              page: 1,
              pageSize: 10,
              totalPages: 1,
              syncedAt: new Date().toISOString(),
              stale: false,
            }),
          ),
      } as Response),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<MilitarSelect onChange={() => undefined} />);
    const input = screen.getByRole('combobox');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'BARCEL' } });
    });

    expect(fetchMock).not.toHaveBeenCalled(); // antes do debounce

    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    await waitFor(() => expect(screen.getByText(/BARCELLOS/)).toBeInTheDocument());
  });

  it('chama onChange ao clicar em uma opção e mostra chip', async () => {
    const onChange = vi.fn();
    const militar = makeMilitar({ nf: '3037509', nomeGuerra: 'BARCELLOS', posto: '2ºSGT' });

    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        callCount++;
        // Primeira chamada: efetivoFindByNf após pick
        // Outra chamada: efetivoList?
        if (url.includes('/efetivo/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(militar)),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                items: [militar],
                total: 1,
                page: 1,
                pageSize: 10,
                totalPages: 1,
                syncedAt: new Date().toISOString(),
                stale: false,
              }),
            ),
        } as Response);
      }),
    );

    render(<MilitarSelect onChange={onChange} />);
    const input = screen.getByRole('combobox');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'BARCEL' } });
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => expect(screen.getByText(/BARCELLOS/)).toBeInTheDocument());
    const opt = screen.getByText(/BARCELLOS/);
    fireEvent.mouseDown(opt);

    expect(onChange).toHaveBeenCalledWith('3037509', militar);
    expect(callCount).toBeGreaterThan(0);
  });

  it('respeita disabled', () => {
    render(<MilitarSelect onChange={() => undefined} disabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('exclui NFs presentes em excluirNfs', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              items: [
                makeMilitar({ nf: '3037509', nomeGuerra: 'BARCELLOS' }),
                makeMilitar({ nf: '8888888', nomeGuerra: 'OUTRO' }),
              ],
              total: 2,
              page: 1,
              pageSize: 10,
              totalPages: 1,
              syncedAt: new Date().toISOString(),
              stale: false,
            }),
          ),
      } as Response),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<MilitarSelect onChange={() => undefined} excluirNfs={['3037509']} />);
    const input = screen.getByRole('combobox');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'TESTE' } });
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => expect(screen.getByText(/OUTRO/)).toBeInTheDocument());
    expect(screen.queryByText(/BARCELLOS/)).not.toBeInTheDocument();
  });
});
