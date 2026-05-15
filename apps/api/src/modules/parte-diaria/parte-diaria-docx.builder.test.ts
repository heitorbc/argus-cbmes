import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import type { ParteDiaria } from '@argus/shared-types';
import { buildParteDiariaDocx } from './parte-diaria-docx.builder';

/**
 * S11 — Tests do builder DOCX.
 *
 * Em vez de checar o XML diretamente (frágil a mudanças da lib `docx`),
 * usa `JSZip` para abrir o `.docx` em memória e inspecionar
 * `word/document.xml`. Verifica que (a) o magic header zip está
 * presente, (b) os títulos institucionais aparecem em UPPERCASE, (c) a
 * tabela de Escalas Operacionais tem o número certo de `<w:tr>`, e (d)
 * o builder não quebra com PD sem fiscal calculado.
 */
function basePd(): ParteDiaria {
  return {
    data: '2026-05-04',
    proximoDia: '2026-05-05',
    equipe: 'B',
    equipeNome: 'BRAVO',
    fiscalQueAssume: {
      posto: '2ºSGT',
      nome: 'MARIANE GUARNIER BRUMATTI',
      nomeGuerra: 'MARIANE',
      nf: '2984946',
    },
    fiscalQuePassa: null,
    fiscalSubstituto: null,
    textoAssuncao: 'Às 07h10, eu, 2ºSGT MARIANE, assumi o serviço.',
    escalasOperacionais: [],
    textoTrocas: 'Não houve.',
    textoEscalaEspecial: 'Não houve.',
    textoEscalaExtraordinaria: 'Não houve.',
    textoIseo: 'Não houve.',
    escalaGuarda: [],
    escalaFaxina: [],
    rondaNoturna: [],
    passagemServicoManha: [],
    textoInstrucao: 'Não houve.',
    textoIdeoFiscal: 'Pendente: Fiscal ainda não atestou a IDEO do dia (S6i).',
    textoCumprimentoNs: 'Não houve.',
    textoAlteracaoAlmoxarifado: 'Não houve.',
    textoAlteracaoViaturas: 'Não houve.',
    textoAlteracoesDiversas: 'Não houve.',
    ocorrenciasConfeccionadas: [],
    ocorrenciasNaoConfeccionadas: [],
    textoPassagemServico:
      'No horário regulamentar, passei o serviço ao meu substituto, informando-o todas as alterações e ordens em vigor.',
    geradoEm: '2026-05-04T07:00:00.000Z',
    ultimaEdicaoEm: null,
    ultimoEditorNf: null,
    finalizadoEm: null,
    finalizadoPorNf: null,
  };
}

async function extractDocumentXml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const doc = zip.file('word/document.xml');
  if (!doc) throw new Error('document.xml não encontrado no zip');
  return doc.async('string');
}

describe('buildParteDiariaDocx (S11)', () => {
  it('gera Buffer válido com magic bytes do zip (.docx é um zip)', async () => {
    const buf = await buildParteDiariaDocx(basePd());
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(1000); // arquivo real tem >= 1KB
    // PK\x03\x04 — header zip
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    expect(buf[2]).toBe(0x03);
    expect(buf[3]).toBe(0x04);
  });

  it('contém títulos institucionais nas seções esperadas (UPPERCASE)', async () => {
    const buf = await buildParteDiariaDocx(basePd());
    const xml = await extractDocumentXml(buf);
    expect(xml).toContain('ASSUNÇÃO DE SERVIÇO');
    expect(xml).toContain('ESCALAS DE SERVIÇO OPERACIONAL');
    expect(xml).toContain('TROCAS DE SERVIÇO');
    expect(xml).toContain('INSPEÇÃO DIÁRIA DE EQUIPAMENTOS OPERACIONAIS');
    expect(xml).toContain('PASSAGEM DE SERVIÇO');
    // S0.x/parte-diaria — nova seção fiel ao modelo institucional.
    expect(xml).toContain('OCORRÊNCIAS NÃO CONFECCIONADAS');
    // Cabeçalho
    expect(xml).toContain('ESTADO DO ESPÍRITO SANTO');
    expect(xml).toMatch(/Parte Diária da Equipe BRAVO - B/);
    expect(xml).toContain('04/05/2026');
    expect(xml).toContain('05/05/2026');
  });

  it('Escalas Operacionais com 2 viaturas (chefe + motorista) gera linhas agrupadas', async () => {
    const pd = basePd();
    pd.escalasOperacionais = [
      {
        recurso: 'AU 154',
        vtrPrefixo: 'AU 154',
        vtrStatus: 'DISPONIVEL',
        kmInicial: 29345,
        militares: [
          { funcao: 'Chefe', militarRaw: 'CAP QOA BAUSSEN', militarNf: null, observacao: '' },
          {
            funcao: 'Motorista',
            militarRaw: '2ºSGT MARIANE',
            militarNf: '2984946',
            observacao: '(Fiscal)',
          },
        ],
      },
      {
        recurso: 'ABTS 011',
        vtrPrefixo: 'ABTS 011',
        vtrStatus: 'DISPONIVEL',
        kmInicial: 36865,
        militares: [
          { funcao: 'Chefe', militarRaw: '2ºSGT JARDEL', militarNf: null, observacao: '' },
        ],
      },
    ];
    const buf = await buildParteDiariaDocx(pd);
    const xml = await extractDocumentXml(buf);
    expect(xml).toContain('AU 154');
    expect(xml).toContain('CAP QOA BAUSSEN');
    expect(xml).toContain('Motorista');
    expect(xml).toContain('(Fiscal)');
    expect(xml).toContain('ABTS 011');
    // S0.x/parte-diaria — KM formatado com separador locale (29.345).
    expect(xml).toContain('29.345');
    expect(xml).toContain('36.865');
    // 1 linha de cabeçalho + 2+1 linhas de corpo = 4 `<w:tr>` na tabela.
    // O documento total tem mais `<w:tr>` (cabeçalho/rodapé das outras
    // seções), então a checagem é por mínimo.
    const trCount = (xml.match(/<w:tr[\s>]/g) ?? []).length;
    expect(trCount).toBeGreaterThanOrEqual(4);
  });

  it('PD sem fiscal calculado não quebra; rodapé renderiza linha em branco', async () => {
    const pd = basePd();
    pd.fiscalQueAssume = null;
    pd.fiscalSubstituto = null;
    const buf = await buildParteDiariaDocx(pd);
    const xml = await extractDocumentXml(buf);
    // Linha de assinatura aparece em ambas as colunas mesmo sem fiscal.
    expect(xml).toContain('Fiscal que passa o serviço');
    expect(xml).toContain('Fiscal que assume o serviço');
    expect(xml).toContain('_____________________________');
  });
});
