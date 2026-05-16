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
  type ParteDiariaGuardaEntry,
  type ParteDiariaMilitarRef,
  type ParteDiariaOcorrencia,
  type ParteDiariaRondaEntry,
} from '@argus/shared-types';

/**
 * S11 / S0.x — Builder do `.docx` da Parte Diária seguindo o modelo
 * institucional fielmente
 * (`data/Parte Diarias - 5 MAIO/2026.01.25 - 1ªCIA 1ºBBM - PARTE DIÁRIA.docx`).
 *
 * Estrutura: cabeçalho 3 linhas + título + 17 seções na ordem do modelo.
 * Tabela operacional tem 1ª coluna unificada (RECURSO + VTR + KM); seções
 * "OCORRÊNCIAS NÃO CONFECCIONADAS" e "ALTERAÇÃO DE VIATURAS" foram
 * adicionadas. Rodapé mostra o Fiscal de hoje (passa) e o Fiscal do
 * próximo dia (assume).
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
    ...secao('ESCALA DE GUARDA, RONDA E MANUTENÇÃO DO QUARTEL', [
      subTitulo('ESCALA DE GUARDA'),
      ...tabelaGuardaOuVazio(pd.escalaGuarda),
      subTitulo('RONDA NOTURNA'),
      ...tabelaRondaOuVazio(pd.rondaNoturna),
      subTitulo('ESCALA DE FAXINA'),
      ...tabelaFaxinaOuVazio(pd.escalaFaxina),
    ]),
    ...secao('ATIVIDADE DE INSTRUÇÃO / PREPARAÇÃO', paragrafosDeTexto(pd.textoInstrucao)),
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
    ...secao(
      'OCORRÊNCIAS NÃO CONFECCIONADAS',
      tabelaOcorrenciasOuVazio(pd.ocorrenciasNaoConfeccionadas),
    ),
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

// ── Cabeçalho ───────────────────────────────────────────────────────────────

function cabecalho(pd: ParteDiaria): Paragraph[] {
  const equipeNome = pd.equipeNome ?? '?';
  const equipeLetra = pd.equipe ?? '?';
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'ESTADO DO ESPÍRITO SANTO', bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'CORPO DE BOMBEIROS MILITAR DO ESTADO DO ESPÍRITO SANTO',
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'PRIMEIRA COMPANHIA 1º CIA', bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: '1ª Cia 1º BBM', bold: true })],
    }),
    new Paragraph({ children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_2,
      children: [
        new TextRun({
          text: `Parte Diária da Equipe ${equipeNome} - ${equipeLetra}, dia ${formatDataBr(pd.data)} para o dia ${formatDataBr(pd.proximoDia)}.`,
          bold: true,
        }),
      ],
    }),
    new Paragraph({ children: [] }),
  ];
}

// ── Section helpers ─────────────────────────────────────────────────────────

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
    children: [new TextRun({ text: texto, bold: true, size: 20 })],
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

function paragrafosDeTexto(texto: string): Paragraph[] {
  if (!texto) return [paragrafo('')];
  return texto.split('\n').map((linha) => paragrafo(linha));
}

// ── Tabela: Escalas Operacionais (1ª coluna unificada) ──────────────────────

/**
 * 1ª coluna agrupa RECURSO + VTR + KM em uma única célula multilinha,
 * com rowSpan = número de militares. Demais colunas: FUNÇÃO | MILITAR |
 * OBSERVAÇÃO. Formato fiel ao modelo institucional.
 */
function tabelaEscalasOperacionais(entries: readonly ParteDiariaEscalaOperacionalEntry[]): Table {
  if (entries.length === 0) {
    return tabelaSimples([['Nenhum recurso operacional no dia.']]);
  }

  const headerRow = new TableRow({
    tableHeader: true,
    children: ['Recurso · VTR · KM Inicial', 'Função', 'Militar', 'Observação'].map((h) =>
      cellHeader(h),
    ),
  });

  const bodyRows: TableRow[] = [];
  for (const e of entries) {
    const baixada = e.vtrStatus === 'BAIXADA';
    const militares = e.militares;
    const rowspan = Math.max(1, militares.length);
    const blocoRecurso = cellRecursoBloco(
      e.recurso,
      e.vtrPrefixo,
      e.kmInicial,
      e.vtrStatus,
      rowspan,
    );

    if (militares.length === 0) {
      bodyRows.push(
        new TableRow({
          children: [blocoRecurso, cell('-'), cell('-'), cell(baixada ? 'VTR BAIXADA' : '-')],
        }),
      );
      continue;
    }

    for (let i = 0; i < militares.length; i += 1) {
      const m = militares[i]!;
      const row = new TableRow({
        children: [
          ...(i === 0 ? [blocoRecurso] : []),
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

function cellRecursoBloco(
  recurso: string,
  vtrPrefixo: string | null,
  kmInicial: number | null,
  vtrStatus: ParteDiariaEscalaOperacionalEntry['vtrStatus'],
  rowSpan: number,
): TableCell {
  const linhas = [
    { texto: recurso, bold: true },
    { texto: vtrPrefixo ? `VTR ${vtrPrefixo}` : '— sem VTR —' },
    {
      texto:
        kmInicial !== null ? `KM inicial: ${kmInicial.toLocaleString('pt-BR')}` : 'KM inicial: —',
    },
    ...(vtrStatus && vtrStatus !== 'DISPONIVEL'
      ? [{ texto: `Status: ${vtrStatus}`, bold: true }]
      : []),
  ];
  return new TableCell({
    rowSpan,
    verticalAlign: VerticalAlign.CENTER,
    children: linhas.map(
      (l) =>
        new Paragraph({
          children: [new TextRun({ text: l.texto, bold: l.bold })],
        }),
    ),
  });
}

// ── Tabela: Guarda (1 col por slot, com rodízio Sent. 1/2/3) ────────────────

function tabelaGuardaOuVazio(linhas: readonly ParteDiariaGuardaEntry[]): (Paragraph | Table)[] {
  if (linhas.length === 0) {
    return [paragrafo('Não houve.')];
  }
  const header = new TableRow({
    tableHeader: true,
    children: ['Horário', 'Militar', 'Setor ou Área Responsável'].map((c) => cellHeader(c)),
  });
  const body = linhas.map(
    (l) =>
      new TableRow({
        children: [
          cell(`${l.horarioInicio} – ${l.horarioFim}`),
          cell(l.militarRaw + (l.sentinelaSlot ? ` (Sent. ${l.sentinelaSlot})` : '') || '—'),
          cell(l.setor || '-'),
        ],
      }),
  );
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [header, ...body],
    }),
  ];
}

// ── Tabela: Ronda Noturna ───────────────────────────────────────────────────

function tabelaRondaOuVazio(linhas: readonly ParteDiariaRondaEntry[]): (Paragraph | Table)[] {
  if (linhas.length === 0) {
    return [paragrafo('Não houve.')];
  }
  const header = new TableRow({
    tableHeader: true,
    children: ['Horário', 'Militar', 'Área Responsável'].map((c) => cellHeader(c)),
  });
  const body = linhas.map(
    (l) =>
      new TableRow({
        children: [
          cell(`${l.horarioInicio} – ${l.horarioFim}`),
          cell(l.militarRaw || '—'),
          cell(l.area || '-'),
        ],
      }),
  );
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [header, ...body],
    }),
  ];
}

// ── Tabela: Faxina (agrupa por militar; locais separados por " / ") ─────────

function tabelaFaxinaOuVazio(linhas: readonly ParteDiariaFaxina[]): (Paragraph | Table)[] {
  if (linhas.length === 0) {
    return [paragrafo('Não houve.')];
  }
  const header = new TableRow({
    tableHeader: true,
    children: ['Militar', 'Local'].map((c) => cellHeader(c)),
  });
  const body = linhas.map((l) => {
    const local = l.local || (l.locaisIds.length > 0 ? l.locaisIds.join(' / ') : '-');
    return new TableRow({
      children: [cell(l.militar), cell(local)],
    });
  });
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [header, ...body],
    }),
  ];
}

// ── Tabela: Ocorrências (Confeccionadas | Não Confeccionadas) ───────────────

function tabelaOcorrenciasOuVazio(linhas: readonly ParteDiariaOcorrencia[]): (Paragraph | Table)[] {
  if (linhas.length === 0) {
    return [paragrafo('Não houve.')];
  }
  const header = new TableRow({
    tableHeader: true,
    children: ['VTR', 'Nº BAON', 'Código da Ocorrência'].map((c) => cellHeader(c)),
  });
  const body = linhas.map((l) => {
    const codigo = l.descricao ? `${l.codigo} — ${l.descricao}` : l.codigo;
    return new TableRow({
      children: [cell(l.vtr), cell(l.numeroBaon), cell(codigo)],
    });
  });
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

// ── Rodapé com 2 colunas de assinatura ──────────────────────────────────────

function rodapeAssinaturas(
  fiscalQuePassaHoje: ParteDiariaMilitarRef | null,
  fiscalQueAssumeAmanha: ParteDiariaMilitarRef | null,
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
        paragrafo(formatMilitarFooter(militar), { alignment: AlignmentType.CENTER }),
        paragrafo('1º Batalhão de Bombeiros — CBMES', { alignment: AlignmentType.CENTER }),
      ],
    });
  }
  return new Table({
    borders: semBordas,
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          coluna('Fiscal que passa o serviço', fiscalQuePassaHoje),
          coluna('Fiscal que assume o serviço', fiscalQueAssumeAmanha),
        ],
      }),
    ],
  });
}

function formatMilitarFooter(m: ParteDiariaMilitarRef | null): string {
  if (!m) return '—';
  const linha1 = `${m.posto} ${m.nome}`.replace(/\s+/g, ' ').trim();
  const nf = m.nf ? ` · NF ${m.nf}` : '';
  return `${linha1}${nf}`;
}

// ── Cell helpers ────────────────────────────────────────────────────────────

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
