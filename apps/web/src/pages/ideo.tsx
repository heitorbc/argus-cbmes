import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TIPO_IDEO, type IdeoEntry, type TipoIdeo } from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const DIAS = Array.from({ length: 31 }, (_, i) => i + 1);

export function IdeoPage() {
  const { user } = useAuth();
  const isAdmin = user?.papeis.includes('admin') ?? false;

  const [entriesByKey, setEntriesByKey] = useState<Map<string, IdeoEntry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ dia: number; tipo: TipoIdeo } | null>(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const r = await api.ideoList();
      const map = new Map<string, IdeoEntry>();
      for (const e of r.entries) {
        map.set(`${e.dia}:${e.tipo}`, e);
      }
      setEntriesByKey(map);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao carregar IDEO');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const startEdit = (dia: number, tipo: TipoIdeo) => {
    const e = entriesByKey.get(`${dia}:${tipo}`);
    setEditing({ dia, tipo });
    setEditText(e?.itens.join('\n') ?? '');
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditText('');
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const itens = editText
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (itens.length === 0) {
        await api.ideoDelete(editing.dia, editing.tipo);
      } else {
        await api.ideoUpsert({ dia: editing.dia, tipo: editing.tipo, itens });
      }
      await reload();
      cancelEdit();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-red px-4 py-4 text-white">
        <Link to="/" className="text-sm opacity-90 hover:opacity-100">
          ← Início
        </Link>
        <h1 className="mt-1 text-lg font-bold">Tabela IDEO</h1>
        <p className="text-xs opacity-90">
          Cadastros Mestre · Itens Diários de Entrega Operacional
        </p>
      </header>

      <section className="mx-auto max-w-3xl p-4">
        <div className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-700">
          Para cada dia (1-31), liste os itens IDEO de cada tipo de viatura. Toque em uma célula
          para editar (apenas Admin).
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error"
          >
            {error}
          </div>
        )}

        {loading && entriesByKey.size === 0 && (
          <p className="mt-6 text-center text-sm text-slate-500">Carregando IDEO…</p>
        )}

        <div className="mt-4 overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-12 px-2 py-2 text-left font-medium text-slate-600">Dia</th>
                {TIPO_IDEO.map((t) => (
                  <th key={t} className="px-2 py-2 text-left font-medium text-cbmes-blue">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {DIAS.map((dia) => (
                <tr key={dia} className="hover:bg-slate-50">
                  <td className="px-2 py-2 font-medium text-slate-700">{dia}</td>
                  {TIPO_IDEO.map((t) => {
                    const entry = entriesByKey.get(`${dia}:${t}`);
                    const isEditingThis = editing?.dia === dia && editing.tipo === t;
                    return (
                      <td key={t} className="px-2 py-2 align-top">
                        {isEditingThis ? (
                          <div className="space-y-2">
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              rows={3}
                              placeholder="Um item por linha"
                              className="w-full rounded border border-cbmes-blue px-2 py-1 text-xs"
                            />
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={saveEdit}
                                disabled={saving}
                                className="rounded-button bg-cbmes-red px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                              >
                                Salvar
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={saving}
                                className="rounded-button border border-slate-300 px-2 py-1 text-xs"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={!isAdmin}
                            onClick={() => isAdmin && startEdit(dia, t)}
                            className="block w-full rounded border border-transparent px-2 py-1 text-left text-xs text-slate-700 hover:border-slate-200 hover:bg-slate-100 disabled:cursor-not-allowed"
                          >
                            {entry ? (
                              <ul className="list-inside list-disc space-y-0.5">
                                {entry.itens.map((it, i) => (
                                  <li key={i}>{it}</li>
                                ))}
                              </ul>
                            ) : (
                              <span className="italic text-slate-400">— vazio —</span>
                            )}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
