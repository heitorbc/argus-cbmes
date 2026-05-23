import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DataTable, type ColumnDef } from './DataTable';

interface Row {
  id: string;
  nome: string;
  idade: number;
}

const ROWS: Row[] = [
  { id: '1', nome: 'BARCELLOS', idade: 35 },
  { id: '2', nome: 'AYRTON', idade: 28 },
  { id: '3', nome: 'MARTINELLI', idade: 22 },
];

const COLS: ColumnDef<Row>[] = [
  { key: 'nome', label: 'Nome', render: (r) => r.nome, sortValue: (r) => r.nome },
  {
    key: 'idade',
    label: 'Idade',
    render: (r) => r.idade,
    sortValue: (r) => r.idade,
    align: 'right',
  },
];

describe('DataTable (S2.10.12b)', () => {
  it('renderiza header + rows', () => {
    render(<DataTable columns={COLS} data={ROWS} rowKey={(r) => r.id} />);
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.getByText('Idade')).toBeInTheDocument();
    expect(screen.getByText('BARCELLOS')).toBeInTheDocument();
    expect(screen.getByText('AYRTON')).toBeInTheDocument();
  });

  it('mostra empty state quando data está vazia', () => {
    render(
      <DataTable columns={COLS} data={[]} rowKey={(r) => r.id} emptyState="Nada encontrado" />,
    );
    expect(screen.getByText('Nada encontrado')).toBeInTheDocument();
  });

  it('click no header ordena por essa coluna (asc → desc → off)', () => {
    render(<DataTable columns={COLS} data={ROWS} rowKey={(r) => r.id} />);
    const header = screen.getByText('Nome').closest('th')!;
    // 1º click: asc — AYRTON aparece primeiro
    fireEvent.click(header);
    const rows1 = screen.getAllByRole('row').slice(1); // pula header
    expect(rows1[0]).toHaveTextContent('AYRTON');
    // 2º click: desc — MARTINELLI primeiro
    fireEvent.click(header);
    const rows2 = screen.getAllByRole('row').slice(1);
    expect(rows2[0]).toHaveTextContent('MARTINELLI');
  });

  it('onRowClick dispara com a row clicada', () => {
    const handler = vi.fn();
    render(<DataTable columns={COLS} data={ROWS} rowKey={(r) => r.id} onRowClick={handler} />);
    fireEvent.click(screen.getByText('BARCELLOS').closest('tr')!);
    expect(handler).toHaveBeenCalledWith(ROWS[0]);
  });

  it('selectable=true mostra checkboxes e marca selecionados', () => {
    render(<DataTable columns={COLS} data={ROWS} rowKey={(r) => r.id} selectable />);
    // header + 3 rows = 4 checkboxes
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(4);
    fireEvent.click(checkboxes[1]); // primeira row
    // texto quebrado entre <strong>1</strong> e " selecionado"
    expect(
      screen.getByText((_content, el) => el?.textContent === '1 selecionado'),
    ).toBeInTheDocument();
  });

  it('highlightRow aplica classe destacada', () => {
    const { container } = render(
      <DataTable
        columns={COLS}
        data={ROWS}
        rowKey={(r) => r.id}
        highlightRow={(r) => r.id === '2'}
      />,
    );
    const rows = container.querySelectorAll('tbody tr');
    expect(rows[1].className).toContain('cbmes-blue/10');
    expect(rows[0].className).not.toContain('cbmes-blue/10');
  });

  it('loading=true mostra skeleton', () => {
    const { container } = render(
      <DataTable columns={COLS} data={[]} rowKey={(r) => r.id} loading />,
    );
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});
