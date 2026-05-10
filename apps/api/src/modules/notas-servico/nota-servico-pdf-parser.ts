/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * S6m — Parser de PDF de Nota de Serviço (CBMES institucional).
 *
 * Os PDFs em `data/Nota de Serviço/NS*.pdf` seguem layout padronizado:
 *
 *   GOVERNO DO ESTADO DO ESPÍRITO SANTO
 *   CORPO DE BOMBEIROS MILITAR
 *   ...
 *   NOTA DE SERVIÇO Nº NNN/AAAA
 *
 *   1 FINALIDADE
 *   <descrição>
 *
 *   3 EXECUÇÃO
 *   3.1 Data: DD/MM, DD/MM e DD/MM     (ou DD/MM/AAAA)
 *   3.2 Horário: HHhMMmin às HHhMMmin
 *   3.5 Viatura: <prefixo>             (às vezes "Vide Anexo" ou "Conforme anexo I")
 *
 *   ANEXO[ I]
 *   <tabela com militares: GRAD NOME NF [DATA] [CARGA HORÁRIA]>
 *
 * O parser **não tenta extrair tudo perfeitamente**: o layout varia entre
 * NS001 (3 grupos por data) e NS002 (lista linear). Em vez disso, extrai
 * com confiança o que dá pra extrair (código, descrição, NFs) e devolve
 * sugestões editáveis para o user no preview.
 *
 * Os campos `dataSugerida`/`horaSugerida`/`viaturaSugerida` são
 * best-effort: se não bater no regex, ficam vazios e o user preenche.
 */

type PDFParseCtor = new (opts: { data: Buffer }) => {
  getText: () => Promise<{ text: string; numpages: number }>;
};
const { PDFParse } = require('pdf-parse') as { PDFParse: PDFParseCtor };

export interface ParseNotaServicoPdfResult {
  /** Sugestão de código (ex.: "NS001") extraído de "NOTA DE SERVIÇO Nº 001/2026". */
  codigoSugerido: string | null;
  /** Sugestão de descrição (primeira frase da Finalidade). */
  descricaoSugerida: string | null;
  /** NFs únicas encontradas no Anexo (extraído por regex `\b\d{7}\b`). */
  militaresNfs: string[];
  /** Sugestão de data ISO `YYYY-MM-DD`. Vazio se múltiplas datas (Anexo). */
  dataSugerida: string | null;
  /** Sugestão de hora início (HH:MM). Vazio se variável por militar. */
  horaInicioSugerida: string | null;
  /** Sugestão de hora fim (HH:MM). */
  horaFimSugerida: string | null;
  /** Sugestão de prefixo de viatura. Pode vir como "AU-302", "AR 031", etc. */
  viaturaSugerida: string | null;
  /** Texto completo extraído do PDF (debug/inspeção). */
  textoBruto: string;
  avisos: string[];
}

/** Regex para NF: 7 dígitos consecutivos. NFs do CBMES têm 6-8 dígitos no
 *  cadastro mas no Anexo da NS aparecem com 7 dígitos consistentemente. */
const RE_NF = /\b\d{7}\b/g;

/** "NOTA DE SERVIÇO Nº 001/2026" → "NS001" */
const RE_CODIGO = /NOTA\s+DE\s+SERVI[ÇC]O\s+N[º°]\s*(\d{1,4})\s*\/\s*(\d{4})/i;

/** "3.1 Data: 08/01, 15/01, 22/01 e 29/01."  ou  "09, 10 e 11/01/2026."  ou  "08/01/2026." */
const RE_DATA_LINHA = /3\.1\s*Data\s*:\s*([^\n]+)/i;

/** "3.2 Horário: 07h00min às 13h00min." */
const RE_HORARIO_LINHA = /3\.2\s*Hor[áa]rio\s*:\s*([^\n]+)/i;
const RE_HORA = /(\d{1,2})h\s*(\d{0,2})/g;

/** "3.5 Viatura: AU-302." ou "Resgate AR 031" */
const RE_VIATURA_LINHA = /3\.5\s*Viatura\s*:\s*([^\n]+)/i;

/** Finalidade: tudo entre "1 FINALIDADE" e "2 REFERÊNCIA" (ou similar). */
const RE_FINALIDADE = /1\s+FINALIDADE\s*\n([\s\S]+?)\n\s*2\s+REFER/i;

export async function parseNotaServicoPdf(buffer: Buffer): Promise<ParseNotaServicoPdfResult> {
  const parser = new PDFParse({ data: buffer });
  const r = await parser.getText();
  const texto = r.text;
  const avisos: string[] = [];

  // Código
  let codigoSugerido: string | null = null;
  const mCodigo = texto.match(RE_CODIGO);
  if (mCodigo) {
    const numero = mCodigo[1]!.padStart(3, '0');
    codigoSugerido = `NS${numero}`;
  } else {
    avisos.push('Código (NOTA DE SERVIÇO Nº ...) não encontrado');
  }

  // Descrição
  let descricaoSugerida: string | null = null;
  const mFinal = texto.match(RE_FINALIDADE);
  if (mFinal) {
    const limpo = mFinal[1]!
      .trim()
      .replace(/\n+/g, ' ')
      .replace(/\s{2,}/g, ' ');
    // Tenta extrair "evento '<x>'" ou trecho até o primeiro ponto
    const mEvento = limpo.match(/evento\s+["“]([^"”]+)["”]/i);
    if (mEvento) {
      descricaoSugerida = mEvento[1]!.trim();
    } else {
      const ate = limpo.split('.')[0]!.trim();
      descricaoSugerida = ate.length > 4 ? ate : limpo.slice(0, 120);
    }
  } else {
    avisos.push('Finalidade não encontrada');
  }

  // Militares NFs (únicos, ordem de aparição)
  const nfsBrutas = texto.match(RE_NF) ?? [];
  const militaresNfs = Array.from(new Set(nfsBrutas));
  if (militaresNfs.length === 0) avisos.push('Nenhum NF de 7 dígitos encontrado');

  // Data
  let dataSugerida: string | null = null;
  const mData = texto.match(RE_DATA_LINHA);
  if (mData) {
    const linha = mData[1]!.trim();
    // Tenta DD/MM/AAAA simples primeiro
    const mIso = linha.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mIso) {
      const [, d, m, y] = mIso;
      dataSugerida = `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
    } else {
      // DD/MM (sem ano) — tenta inferir ano do código (NS NNN/AAAA)
      const mDdMm = linha.match(/(\d{1,2})\/(\d{1,2})/);
      const mAnoCodigo = texto.match(RE_CODIGO);
      if (mDdMm && mAnoCodigo) {
        const [, d, m] = mDdMm;
        const ano = mAnoCodigo[2];
        dataSugerida = `${ano}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
        if (linha.includes(',') || linha.includes(' e ')) {
          avisos.push(
            `Múltiplas datas detectadas em "${linha}" — sugerindo a primeira (${dataSugerida})`,
          );
        }
      }
    }
  }

  // Horário
  let horaInicioSugerida: string | null = null;
  let horaFimSugerida: string | null = null;
  const mHorario = texto.match(RE_HORARIO_LINHA);
  if (mHorario) {
    const linha = mHorario[1]!.trim();
    const horas = Array.from(linha.matchAll(RE_HORA))
      .slice(0, 2)
      .map(([, h, m]) => `${h!.padStart(2, '0')}:${(m || '00').padStart(2, '0')}`);
    if (horas.length >= 1) horaInicioSugerida = horas[0]!;
    if (horas.length >= 2) horaFimSugerida = horas[1]!;
  }

  // Viatura
  let viaturaSugerida: string | null = null;
  const mViatura = texto.match(RE_VIATURA_LINHA);
  if (mViatura) {
    const linha = mViatura[1]!.trim().replace(/\.+$/, '');
    if (!/anexo/i.test(linha)) {
      // Limpa palavras descritivas comuns ("Resgate", "Auto-bomba") e devolve só o prefixo
      const mPref = linha.match(/([A-Z]{2,4}[-\s]?\d{2,4})/);
      viaturaSugerida = mPref ? mPref[1]!.replace(/\s+/g, '_').replace('-', '_') : linha;
    }
  }

  return {
    codigoSugerido,
    descricaoSugerida,
    militaresNfs,
    dataSugerida,
    horaInicioSugerida,
    horaFimSugerida,
    viaturaSugerida,
    textoBruto: texto,
    avisos,
  };
}
