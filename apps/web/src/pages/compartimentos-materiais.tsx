import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CompartimentoMaterial } from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';

/**
 * S2.10.6 — CRUD admin de Compartimentos para Conferência de Materiais.
 *
 * Cada compartimento pertence a um contexto (viatura:<prefixo> ou
 * local:<slug>) e lista os materiais esperados ali. O Tech Lead/admin
 * define a lista; o militar escalado confere em `/conferencia-materiais`.
 */
export function CompartimentosMateriaisPage() {
  const [rows, setRows] = useState<CompartimentoMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const list = await api.compartimentosMateriaisList();
      setRows(list);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const grouped = rows.reduce<Record<string, CompartimentoMaterial[]>>((acc, c) => {
    (acc[c.contexto] ??= []).push(c);
    return acc;
  }, {});

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-blue px-4 py-4 text-white">
        <Link to="/" className="text-sm opacity-90 hover:opacity-100">
          ← Home
        </Link>
        <h1 className="mt-1 text-lg font-bold">📦 Compartimentos de Materiais (admin)</h1>
        <p className="text-xs opacity-90">
          Cadastro dos compartimentos verificados em `/conferencia-materiais`
        </p>
      </header>

      <section className="mx-auto max-w-3xl space-y-3 p-4">
        {error && (
          <div
            role="alert"
            className="rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error"
          >
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-button bg-cbmes-blue px-4 py-2 text-sm font-semibold text-white"
          >
            + Novo compartimento
          </button>
        </div>

        {showCreate && (
          <CompartimentoForm
            modo="create"
            onCancel={() => setShowCreate(false)}
            onSaved={async () => {
              setShowCreate(false);
              await reload();
            }}
          />
        )}

        {loading && <p className="text-sm text-slate-500">Carregando…</p>}

        {!loading &&
          Object.entries(grouped).map(([contexto, items]) => (
            <div key={contexto} className="rounded border border-slate-200 bg-white">
              <header className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold uppercase text-slate-600">
                {items[0]?.contextoLabel}{' '}
                <span className="ml-1 font-mono text-slate-400">{contexto}</span>
              </header>
              <ul className="divide-y divide-slate-100">
                {items
                  .sort((a, b) => a.ordem - b.ordem)
                  .map((c) => (
                    <li key={c.id} className="p-3">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <strong className="text-sm text-slate-900">{c.compartimento}</strong>
                        <span className="text-xs text-slate-500">({c.materiais.length} itens)</span>
                        {!c.ativo && (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            INATIVO
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{c.materiais.join(' · ')}</p>
                      <div className="mt-2 flex gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setEditingId(c.id)}
                          className="rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-100"
                        >
                          ✏️ Editar
                        </button>
                        {c.ativo && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm(`Desativar "${c.compartimento}"?`)) return;
                              try {
                                await api.compartimentoMaterialDelete(c.id);
                                await reload();
                              } catch (e) {
                                setError(e instanceof ApiError ? e.message : 'Erro ao desativar');
                              }
                            }}
                            className="rounded border border-feedback-error/40 px-2 py-1 text-feedback-error hover:bg-feedback-error/10"
                          >
                            🗑️ Desativar
                          </button>
                        )}
                      </div>
                      {editingId === c.id && (
                        <CompartimentoForm
                          modo="edit"
                          compartimento={c}
                          onCancel={() => setEditingId(null)}
                          onSaved={async () => {
                            setEditingId(null);
                            await reload();
                          }}
                        />
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ))}

        {!loading && rows.length === 0 && (
          <p className="rounded border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
            Nenhum compartimento cadastrado. Crie o primeiro via "Novo compartimento".
          </p>
        )}
      </section>
    </main>
  );
}

function CompartimentoForm({
  modo,
  compartimento,
  onCancel,
  onSaved,
}: {
  modo: 'create' | 'edit';
  compartimento?: CompartimentoMaterial;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [contexto, setContexto] = useState(compartimento?.contexto ?? 'viatura:');
  const [contextoLabel, setContextoLabel] = useState(compartimento?.contextoLabel ?? '');
  const [nomeCompartimento, setNomeCompartimento] = useState(compartimento?.compartimento ?? '');
  const [materiaisTexto, setMateriaisTexto] = useState((compartimento?.materiais ?? []).join('\n'));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const materiais = materiaisTexto
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (materiais.length === 0) throw new Error('Pelo menos 1 material');
      if (modo === 'create') {
        await api.compartimentoMaterialCreate({
          contexto,
          contextoLabel,
          compartimento: nomeCompartimento,
          materiais,
        });
      } else if (compartimento) {
        await api.compartimentoMaterialUpdate(compartimento.id, {
          contexto,
          contextoLabel,
          compartimento: nomeCompartimento,
          materiais,
        });
      }
      await onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded border-2 border-cbmes-blue/40 bg-cbmes-blue/5 p-3 text-sm"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label>
          <span className="text-xs font-medium text-slate-700">
            Contexto <span className="text-slate-400">(viatura:ABTS_011 ou local:SALA_FISCAL)</span>
          </span>
          <input
            type="text"
            value={contexto}
            onChange={(e) => setContexto(e.target.value.trim())}
            required
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-xs"
          />
        </label>
        <label>
          <span className="text-xs font-medium text-slate-700">Label (exibido na UI)</span>
          <input
            type="text"
            value={contextoLabel}
            onChange={(e) => setContextoLabel(e.target.value)}
            required
            placeholder="Ex.: ABTS 011 ou Sala do Fiscal"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="sm:col-span-2">
          <span className="text-xs font-medium text-slate-700">Nome do compartimento</span>
          <input
            type="text"
            value={nomeCompartimento}
            onChange={(e) => setNomeCompartimento(e.target.value)}
            required
            placeholder="Ex.: Box principal, Armário lateral"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="sm:col-span-2">
          <span className="text-xs font-medium text-slate-700">Materiais (1 por linha)</span>
          <textarea
            rows={6}
            value={materiaisTexto}
            onChange={(e) => setMateriaisTexto(e.target.value)}
            required
            placeholder="Mangueira de 38mm&#10;Esguicho regulável&#10;Chave Storz"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-xs"
          />
        </label>
      </div>

      {formError && (
        <div className="mt-2 rounded border border-feedback-error/30 bg-feedback-error/10 p-2 text-xs text-feedback-error">
          {formError}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-button bg-cbmes-blue py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting ? 'Salvando…' : modo === 'create' ? 'Criar' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 rounded-button border border-slate-300 bg-white py-2 text-sm text-slate-700"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
