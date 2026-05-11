import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  PageOrientation,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import {
  formatDataBr,
  type ParteDiaria,
  type ParteDiariaEscalaOperacionalEntry,
  type ParteDiariaFaxina,
  type ParteDiariaLinhaHorario,
  type ParteDiariaMilitarRef,
  type ParteDiariaOcorrencia,
} from '@argus/shared-types';

/**
 * S11 — Builder do `.docx` da Parte Diária.
 *
 * Recebe o shape canônico `ParteDiaria` (do S10) e produz um Buffer do
 * arquivo Word com layout fiel ao PDF institucional de referência
 * (`data/Fase1/2026.05.04_-_1ªCIA_1BBM.pdf`):
 *
 *  - Cabeçalho centralizado: Estado · CBMES · 1ª Cia/1º BBM.
 *  - Título principal "Parte Diária da Equipe X — Y, do dia DD/MM/AAAA
 *    para o dia DD/MM/AAAA".
 *  - 19 seções na mesma ordem do PDF. Cada título em UPPERCASE com borda
 *    inferior simulando o `<h3>` do HTML.
 *  - Escalas Operacionais: tabela com rowspan agrupando militares por
 *    viatura (mesmo padrão da tela `/parte-diaria`).
 *  - Rodapé: 2 colunas de assinatura (Fiscal que passa | que assume).
 */
export async function buildParteDiariaDocx(pd: ParteDiaria): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    ...cabecalho(pd),
    ...secao('ASSUNÇÃO DE SERVIÇO', paragrafosDeTexto(pd.textoAssuncao)),
    ...secao('ESCALAS DE SERVIÇO OPERACIONAL', [tabelaEscalasOperacionais(pd.escalasOperacionais)]),
    ...secao('TROCAS DE SERVIÇO', paragrafosDeTexto(pd.textoTrocas)),
    ...secao('ESCALAS — ESPECIAL | EXTRAORDINÁRIA | ISEO', [
      subTitulo('ESPECIAL:'),
      ...paragrafosDeTexto(pd.textoEscalaEspecial),
      subTitulo('EXTRAORDINÁRIA:'),
      ...paragrafosDeTexto(pd.textoEscalaExtraordinaria),
      subTitulo('ISEO:'),
      ...paragrafosDeTexto(pd.textoIseo),
    ]),
    ...secao(
      'ESCALA DE GUARDA',
      tabelaHorarioOuVazio(pd.escalaGuarda, ['Horário', 'Militar', 'Setor ou Área Responsável']),
    ),
    ...secao('ESCALA DE FAXINA', tabelaFaxinaOuVazio(pd.escalaFaxina)),
    ...secao(
      'RONDA NOTURNA',
      tabelaHorarioOuVazio(pd.rondaNoturna, ['Horário', 'Militar', 'Área']),
    ),
    ...secao(
      'PASSAGEM DE SERVIÇO (MANHÃ)',
      tabelaHorarioOuVazio(pd.passagemServicoManha, ['Horário', 'Militar', 'Área']),
    ),
    ...secao('ATIVIDADE DE INSTRUÇÃO', paragrafosDeTexto(pd.textoInstrucao)),
    ...secao(
      'INSPEÇÃO DIÁRIA DE EQUIPAMENTOS OPERACIONAIS (IDEO)',
      paragrafosDeTexto(pd.textoIdeoFiscal),
    ),
    ...secao(
      'CUMPRIMENTO DE OS / NS / NI / PALESTRA / ORDEM VERBAL',
      paragrafosDeTexto(pd.textoCumprimentoNs),
    ),
    ...secao('ALTERAÇÃO DE ALMOXARIFADO', paragrafosDeTexto(pd.textoAlteracaoAlmoxarifado)),
    ...secao('ALTERAÇÃO DE VIATURAS', paragrafosDeTexto(pd.textoAlteracaoViaturas)),
    ...secao('ALTERAÇÕES DIVERSAS', paragrafosDeTexto(pd.textoAlteracoesDiversas)),
    ...secao('OCORRÊNCIAS CONFECCIONADAS', tabelaOcorrenciasOuVazio(pd.ocorrenciasConfeccionadas)),
    ...secao('PASSAGEM DE SERVIÇO', [
      ...paragrafosDeTexto(pd.textoPassagemServico),
      paragrafo(formatDataBr(pd.proximoDia) + '.', { alignment: AlignmentType.CENTER }),
      paragrafo(''),
      rodapeAssinaturas(pd.fiscalQueAssume, pd.fiscalSubstituto),
    ]),
  ];

  const doc = new Document({
    creator: 'ARGUS CBMES',
    title: `Parte Diária ${pd.data}`,
    description: '1ª Cia/1º BBM — Parte Diária',
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 20 }, // 10pt
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
            size: { orientation: PageOrientation.PORTRAIT },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cabecalho(pd: ParteDiaria): Paragraph[] {
  const equipeNome = pd.equipeNome ?? '?';
  const equipeLetra = pd.equipe ?? '?';
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'ESTADO DO ESPÍRITO SANTO',
          bold: true,
          allCaps: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'CORPO DE BOMBEIROS MILITAR DO ESTADO DO ESPÍRITO SANTO',
          bold: true,
          allCaps: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'PRIMEIRA COMPANHIA · 1ª Cia/1º BBM',
          bold: true,
        }),
      ],
    }),
    new Paragraph({ children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_2,
      children: [
        new TextRun({
          text: `Parte Diária da Equipe ${equipeNome} - ${equipeLetra}, do dia ${formatDataBr(pd.data)} para o dia ${formatDataBr(pd.proximoDia)}.`,
          bold: true,
        }),
      ],
    }),
    new Paragraph({ children: [] }),
  ];
}

function secaoTitulo(texto: string): Paragraph {
  return new Paragraph({
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 8, color: '333333' },
    },
    spacing: { before: 200, after: 100 },
    children: [
      new TextRun({
        text: texto,
        bold: true,
        allCaps: true,
        size: 22, // 11pt
      }),
    ],
  });
}

function subTitulo(texto: string): Paragraph {
  return new Paragraph({
    spacing: { before: 100, after: 50 },
    children: [
      new TextRun({
        text: texto,
        bold: true,
        size: 20,
      }),
    ],
  });
}

function secao(titulo: string, conteudo: (Paragraph | Table)[]): (Paragraph | Table)[] {
  return [secaoTitulo(titulo), ...conteudo];
}

function paragrafo(
  texto: string,
  opts?: { alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]; bold?: boolean },
): Paragraph {
  return new Paragraph({
    alignment: opts?.alignment,
    children: [new TextRun({ text: texto, bold: opts?.bold })],
  });
}

/** Quebra texto em parágrafos preservando `\n` (usado em textos pré-gerados). */
function paragrafosDeTexto(texto: string): Paragraph[] {
  if (!texto) return [paragrafo('')];
  return texto.split('\n').map((linha) => paragrafo(linha));
}

// ---------------------------------------------------------------------------
// Tabela: Escalas Operacionais (com rowspan por viatura)
// ---------------------------------------------------------------------------

function tabelaEscalasOperacionais(entries: readonly ParteDiariaEscalaOperacionalEntry[]): Table {
  if (entries.length === 0) {
    return tabelaSimples([['Nenhum recurso operacional no dia.']]);
  }

  const headerRow = new TableRow({
    tableHeader: true,
    children: ['Viatura', 'KM Inicial', 'Função', 'Militar', 'Observação'].map((h) =>
      cellHeader(h),
    ),
  });

  const bodyRows: TableRow[] = [];
  for (const e of entries) {
    const baixada = e.vtrStatus === 'BAIXADA';
    const militares = e.militares;
    const rowspan = Math.max(1, militares.length);
    const kmTexto = e.kmInicial !== null ? String(e.kmInicial) : '-';

    if (militares.length === 0) {
      bodyRows.push(
        new TableRow({
          children: [
            cell(e.recurso, { bold: true }),
            cell(kmTexto),
            cell('-'),
            cell('-'),
            cell(baixada ? 'VTR BAIXADA' : '-'),
          ],
        }),
      );
      continue;
    }

    for (let i = 0; i < militares.length; i += 1) {
      const m = militares[i]!;
      const row = new TableRow({
        children: [
          ...(i === 0
            ? [
                cell(e.recurso, { bold: true, rowSpan: rowspan }),
                cell(kmTexto, { rowSpan: rowspan }),
              ]
            : []),
          cell(m.funcao),
          cell(m.militarRaw),
          cell(m.observacao || '-'),
        ],
      });
      bodyRows.push(row);
    }
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  });
}

// ---------------------------------------------------------------------------
// Tabelas livres (Guarda, Faxina, Ronda, Passagem manhã, Ocorrências)
// ---------------------------------------------------------------------------

function tabelaHorarioOuVazio(
  linhas: readonly ParteDiariaLinhaHorario[],
  colunas: [string, string, string],
): (Paragraph | Table)[] {
  if (linhas.length === 0) {
    return [paragrafo('Não houve.')];
  }
  const header = new TableRow({
    tableHeader: true,
    children: colunas.map((c) => cellHeader(c)),
  });
  const body = linhas.map(
    (l) =>
      new TableRow({
        children: [cell(l.horario), cell(l.militar), cell(l.setorOuArea || '-')],
      }),
  );
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [header, ...body],
    }),
  ];
}

function tabelaFaxinaOuVazio(linhas: readonly ParteDiariaFaxina[]): (Paragraph | Table)[] {
  if (linhas.length === 0) {
    return [paragrafo('Não houve.')];
  }
  const header = new TableRow({
    tableHeader: true,
    children: ['Militar', 'Local'].map((c) => cellHeader(c)),
  });
  const body = linhas.map(
    (l) =>
      new TableRow({
        children: [cell(l.militar), cell(l.local)],
      }),
  );
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [header, ...body],
    }),
  ];
}

function tabelaOcorrenciasOuVazio(linhas: readonly ParteDiariaOcorrencia[]): (Paragraph | Table)[] {
  if (linhas.length === 0) {
    return [paragrafo('Não houve.')];
  }
  const header = new TableRow({
    tableHeader: true,
    children: ['VTR', 'Nº BAON', 'Código da Ocorrência'].map((c) => cellHeader(c)),
  });
  const body = linhas.map(
    (l) =>
      new TableRow({
        children: [cell(l.vtr), cell(l.numeroBaon), cell(l.codigo)],
      }),
  );
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [header, ...body],
    }),
  ];
}

function tabelaSimples(matriz: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: matriz.map((linha) => new TableRow({ children: linha.map((c) => cell(c)) })),
  });
}

// ---------------------------------------------------------------------------
// Rodapé com 2 colunas de assinatura
// ---------------------------------------------------------------------------

function rodapeAssinaturas(
  fiscalQuePassa: ParteDiariaMilitarRef | null,
  fiscalSubstituto: ParteDiariaMilitarRef | null,
): Table {
  const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const semBordas = {
    top: NO_BORDER,
    bottom: NO_BORDER,
    left: NO_BORDER,
    right: NO_BORDER,
    insideHorizontal: NO_BORDER,
    insideVertical: NO_BORDER,
  };
  function coluna(titulo: string, militar: ParteDiariaMilitarRef | null): TableCell {
    const linhaAssinatura = '_____________________________';
    return new TableCell({
      borders: semBordas,
      verticalAlign: VerticalAlign.CENTER,
      width: { size: 50, type: WidthType.PERCENTAGE },
      children: [
        paragrafo(linhaAssinatura, { alignment: AlignmentType.CENTER }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: titulo, bold: true })],
        }),
        paragrafo(formatMilitar(militar), { alignment: AlignmentType.CENTER }),
      ],
    });
  }
  return new Table({
    borders: semBordas,
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          coluna('Fiscal que passa o serviço', fiscalQuePassa),
          coluna('Fiscal que assume o serviço', fiscalSubstituto),
        ],
      }),
    ],
  });
}

function formatMilitar(m: ParteDiariaMilitarRef | null): string {
  if (!m) return '';
  return `${m.posto} ${m.nome}`.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Cell helpers
// ---------------------------------------------------------------------------

function cell(texto: string, opts?: { bold?: boolean; rowSpan?: number }): TableCell {
  return new TableCell({
    rowSpan: opts?.rowSpan,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        children: [new TextRun({ text: texto, bold: opts?.bold })],
      }),
    ],
  });
}

function cellHeader(texto: string): TableCell {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    shading: { fill: 'EEEEEE' },
    children: [
      new Paragraph({
        children: [new TextRun({ text: texto, bold: true, size: 20 })],
      }),
    ],
  });
}
