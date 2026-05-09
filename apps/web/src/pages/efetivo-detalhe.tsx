import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatDisplayName, SUB_SECAO_LABEL, type Militar } from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';

export function EfetivoDetalhePage() {
  const { nf } = useParams<{ nf: string }>();
  const [militar, setMilitar] = useState<Militar | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!nf) return;
    let cancelled = false;
    setLoading(true);
    api
      .efetivoFindByNf(nf)
      .then((m) => {
        if (!cancelled) setMilitar(m);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Erro ao carregar militar');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nf]);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-red px-4 py-4 text-white">
        <Link to="/cadastros/efetivo" className="text-sm opacity-90 hover:opacity-100">
          ← Voltar para o Efetivo
        </Link>
        <h1 className="mt-1 text-lg font-bold">
          {militar ? formatDisplayName(militar) : 'Detalhe do Militar'}
        </h1>
        {militar && (
          <p className="text-xs opacity-90">
            NF {militar.nf} · ANT {militar.ant}
            {militar.lotacao ? ` · ${militar.lotacao}` : ''}
          </p>
        )}
      </header>

      <section className="mx-auto max-w-3xl p-4">
        {loading && <p className="text-sm text-slate-500">Carregando…</p>}
        {error && (
          <div
            role="alert"
            className="rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error"
          >
            {error}
          </div>
        )}
        {militar && (
          <div className="space-y-4">
            <Card titulo="Identificação">
              <Linha rotulo="Nome completo" valor={militar.nome} />
              <Linha rotulo="Nome de guerra" valor={militar.nomeGuerra} />
              <Linha rotulo="NF" valor={militar.nf} />
              <Linha rotulo="ANT" valor={String(militar.ant)} />
              <Linha rotulo="Posto / graduação" valor={militar.posto} />
              <Linha rotulo="Posto previsto" valor={militar.postoPrevisto} />
            </Card>

            <Card titulo="Lotação">
              <Linha rotulo="Lotação (LOCAL)" valor={militar.lotacao} />
              <Linha rotulo="Unidade" valor={militar.unidade} />
              <Linha
                rotulo="Sub-seção"
                valor={militar.subSecao ? SUB_SECAO_LABEL[militar.subSecao] : undefined}
              />
              <Linha rotulo="Função" valor={militar.funcao} />
              <Linha rotulo="Classe" valor={militar.classe} />
            </Card>

            <Card titulo="Funcional">
              <Linha rotulo="Situação" valor={militar.situacao} />
              <Linha rotulo="Conceito disciplinar" valor={militar.conceitoDisciplinar} />
              <Linha
                rotulo="Pontos"
                valor={militar.pontos !== undefined ? String(militar.pontos) : undefined}
              />
              <Linha rotulo="Plano de férias" valor={militar.planoFerias} />
              <Linha rotulo="Incorporação" valor={militar.incorporacao} />
            </Card>

            <Card titulo="Habilitação e cursos">
              <Linha
                rotulo="CNH"
                valor={
                  militar.cnh
                    ? militar.cnhValidade
                      ? `${militar.cnh} (val. ${militar.cnhValidade})`
                      : militar.cnh
                    : undefined
                }
              />
              <Linha rotulo="Mergulho" valor={militar.mergulho} />
              <Linha rotulo="FTBA" valor={militar.ftba} />
              <Linha rotulo="ETSP" valor={militar.etsp} />
              <Linha
                rotulo="CCVE"
                valor={
                  militar.ccve
                    ? militar.ccveValidade
                      ? `${militar.ccve} (val. ${militar.ccveValidade})`
                      : militar.ccve
                    : undefined
                }
              />
              <Linha rotulo="Censo" valor={militar.censo} />
            </Card>

            <Card titulo="Pessoal (EFETIVO - DADOS GERAIS)">
              <Linha rotulo="Município" valor={militar.municipio} />
              <Linha
                rotulo="Idade"
                valor={militar.idade !== undefined ? `${militar.idade} anos` : undefined}
              />
              <Linha
                rotulo="Tempo de serviço"
                valor={militar.servico !== undefined ? `${militar.servico} anos` : undefined}
              />
            </Card>

            {militar.origensFonte && militar.origensFonte.length > 0 && (
              <div className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-600">
                <p className="font-medium text-slate-700">Origem dos dados:</p>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {militar.origensFonte.map((o) => (
                    <li key={o} className="rounded-full bg-cbmes-blue/10 px-3 py-1 text-cbmes-blue">
                      {o}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] italic">
                  DADOS = QDI/aba DADOS · 1ª1º = QDI/aba operacional · EFETIVO = planilha de Efetivo
                </p>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function Card({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cbmes-blue">
        {titulo}
      </h2>
      <dl className="grid grid-cols-1 gap-1 text-sm md:grid-cols-2">{children}</dl>
    </section>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor?: string }) {
  if (!valor) return null;
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 py-1 last:border-0">
      <dt className="text-xs text-slate-500">{rotulo}</dt>
      <dd className="text-right text-sm font-medium text-slate-800">{valor}</dd>
    </div>
  );
}
