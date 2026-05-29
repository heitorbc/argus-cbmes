import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  CategoriaRecurso,
  FuncaoEquipeMinima,
  Recurso,
  TipoComposicaoRecurso,
  Unidade,
} from '@argus/shared-types';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const CATEGORIAS: CategoriaRecurso[] = ['OPERACIONAL', 'STAFF', 'AQUATICA', 'GUARDA'];
const TIPOS_COMPOSICAO: TipoComposicaoRecurso[] = [
  'viatura_only',
  'equipe_only',
  'viatura_e_equipe',
];

const TIPO_LABEL: Record<TipoComposicaoRecurso, string> = {
  viatura_only: 'Apenas viatura',
  equipe_only: 'Apenas equipe',
  viatura_e_equipe: 'Viatura + equipe',
};

interface FormState {
  nome: string;
  categoria: CategoriaRecurso;
  ativo: boolean;
  tipoComposicao: TipoComposicaoRecurso;
  equipeMinimaJson: string; // JSON serializado (editor leve em v1)
  viaturaPrefixoFixo: string;
  ordem: number;
}

const EMPTY_FORM: FormState = {
  nome: '',
  categoria: 'OPERACIONAL',
  ativo: true,
  tipoComposicao: 'viatura_e_equipe',
  equipeMinimaJson: '',
  viaturaPrefixoFixo: '',
  ordem: 0,
};

/**
 * S2.13d — Gestão de Recursos pelo Oficial de Operações.
 *
 * Master-detail: lista de recursos da unidade selecionada à esquerda;
 * formulário do recurso selecionado/novo à direita. Edição do
 * `equipeMinima` em v1 é via textarea JSON com validação (next iteration
 * fará editor visual com adicionar/remover/ordem).
 *
 * Filtro de unidades:
 * - Admin (ou usuário sem unidadeId): vê dropdown com TODAS as unidades
 * - Demais usuários (oficial_operacoes): unidade fixa = `user.unidadeId`
 */
export function OperacoesRecursosPage() {
  const { user } = useAuth();
  const isAdmin = user?.papeis.includes('admin') ?? false;
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [selectedUnidadeId, setSelectedUnidadeId] = useState<string | null>(null);
  const [recursos, setRecursos] = useState<Recurso[]>([]);
  const [loadingUnidades, setLoadingUnidades] = useState(true);
  const [loadingRecursos, setLoadingRecursos] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Carrega unidades visíveis ao usuário; admin vê todas, demais veem só
  // a própria (e dependentes — a API atual lista todas, frontend filtra).
  // Usa `setSelectedUnidadeId(prev => prev ?? first)` para evitar dep no
  // estado atual (não re-roda quando seleção muda).
  useEffect(() => {
    async function loadUnidades() {
      try {
        const all = await api.unidadesList();
        // Filtro: admin vê todas; demais veem apenas a própria unidade.
        // (Filtro de descendentes ficará para S2.14 quando a API expor
        // `visiveisParaUsuario`. Por enquanto oficial_operacoes só vê a
        // própria unidade — útil para validar gate no MVP.)
        const filtered = isAdmin
          ? all
          : user?.unidadeId
            ? all.filter((u) => u.id === user.unidadeId)
            : [];
        setUnidades(filtered);
        if (filtered.length > 0) {
          setSelectedUnidadeId((prev) => prev ?? filtered[0]!.id);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Erro ao carregar unidades');
      } finally {
        setLoadingUnidades(false);
      }
    }
    loadUnidades();
  }, [isAdmin, user?.unidadeId]);

  // Carrega recursos da unidade selecionada.
  useEffect(() => {
    if (!selectedUnidadeId) return;
    async function loadRecursos() {
      setLoadingRecursos(true);
      try {
        const list = await api.recursosList({ unidadeId: selectedUnidadeId! });
        setRecursos(list);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Erro ao carregar recursos');
      } finally {
        setLoadingRecursos(false);
      }
    }
    loadRecursos();
  }, [selectedUnidadeId]);

  const handleNew = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, ordem: recursos.length + 1 });
    setFormError(null);
    setShowForm(true);
  };

  const handleEdit = (r: Recurso) => {
    setEditingId(r.id);
    setForm({
      nome: r.nome,
      categoria: r.categoria,
      ativo: r.ativo,
      tipoComposicao: r.tipoComposicao,
      equipeMinimaJson: r.equipeMinima ? JSON.stringify(r.equipeMinima, null, 2) : '',
      viaturaPrefixoFixo: r.viaturaPrefixoFixo ?? '',
      ordem: r.ordem,
    });
    setFormError(null);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnidadeId) return;
    setSaving(true);
    setFormError(null);

    let equipeMinima: FuncaoEquipeMinima[] | null = null;
    if (form.equipeMinimaJson.trim()) {
      try {
        const parsed = JSON.parse(form.equipeMinimaJson);
        if (!Array.isArray(parsed)) {
          throw new Error('Equipe mínima deve ser um array JSON');
        }
        equipeMinima = parsed;
      } catch (err) {
        setFormError(`JSON inválido em equipe mínima: ${(err as Error).message}`);
        setSaving(false);
        return;
      }
    }

    try {
      if (editingId) {
        await api.recursosUpdate(editingId, {
          nome: form.nome,
          categoria: form.categoria,
          ativo: form.ativo,
          tipoComposicao: form.tipoComposicao,
          equipeMinima,
          viaturaPrefixoFixo: form.viaturaPrefixoFixo.trim() || null,
          ordem: form.ordem,
        });
      } else {
        // comportaViatura/comportaEfetivo derivados do tipoComposicao
        // (back-compat com schema atual).
        const comportaViatura =
          form.tipoComposicao === 'viatura_only' || form.tipoComposicao === 'viatura_e_equipe';
        const comportaEfetivo =
          form.tipoComposicao === 'equipe_only' || form.tipoComposicao === 'viatura_e_equipe';
        await api.recursosCreate({
          unidadeId: selectedUnidadeId,
          nome: form.nome,
          categoria: form.categoria,
          ativo: form.ativo,
          comportaViatura,
          comportaEfetivo,
          tipoComposicao: form.tipoComposicao,
          equipeMinima,
          viaturaPrefixoFixo: form.viaturaPrefixoFixo.trim() || null,
          ordem: form.ordem,
        });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      // Recarrega lista.
      const list = await api.recursosList({ unidadeId: selectedUnidadeId });
      setRecursos(list);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Erro ao salvar recurso');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAtivo = async (r: Recurso) => {
    try {
      if (r.ativo) {
        await api.recursosSoftDelete(r.id);
      } else {
        await api.recursosUpdate(r.id, { ativo: true });
      }
      const list = await api.recursosList({ unidadeId: selectedUnidadeId! });
      setRecursos(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao atualizar status');
    }
  };

  const sortedRecursos = useMemo(() => [...recursos].sort((a, b) => a.ordem - b.ordem), [recursos]);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-red px-4 py-4 text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Gestão de Recursos</h1>
            <p className="text-xs opacity-90">Operações · Argus CBMES</p>
          </div>
          <Link to="/" className="text-xs text-white/90 hover:underline">
            ← Voltar
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl space-y-4 p-4">
        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Seletor de unidade */}
        <div className="rounded border border-slate-200 bg-white p-4 shadow-sm">
          <label
            htmlFor="unidade-select"
            className="block text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            Unidade
          </label>
          {loadingUnidades ? (
            <p className="mt-2 text-sm text-slate-500">Carregando unidades…</p>
          ) : unidades.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              Você não tem acesso a nenhuma unidade. Contate o administrador.
            </p>
          ) : (
            <select
              id="unidade-select"
              value={selectedUnidadeId ?? ''}
              onChange={(e) => setSelectedUnidadeId(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-cbmes-blue focus:outline-none"
            >
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome} ({u.codigo}) · {u.tipo}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Lista de recursos */}
        {selectedUnidadeId && (
          <div className="rounded border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-700">
                Recursos da unidade ({sortedRecursos.length})
              </h2>
              <button
                type="button"
                onClick={handleNew}
                className="rounded bg-cbmes-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-cbmes-blue/90"
              >
                + Novo recurso
              </button>
            </div>
            {loadingRecursos ? (
              <p className="p-4 text-sm text-slate-500">Carregando recursos…</p>
            ) : sortedRecursos.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">
                Sem recursos cadastrados nesta unidade. Use "+ Novo recurso" para criar.
              </p>
            ) : (
              <ul className="divide-y divide-slate-200">
                {sortedRecursos.map((r) => (
                  <li
                    key={r.id}
                    className={`flex items-center justify-between p-3 ${r.ativo ? '' : 'opacity-60'}`}
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        #{r.ordem} · {r.nome}
                      </p>
                      <p className="text-xs text-slate-500">
                        {r.categoria} · {TIPO_LABEL[r.tipoComposicao]}
                        {r.viaturaPrefixoFixo ? ` · viatura: ${r.viaturaPrefixoFixo}` : ''}
                        {r.equipeMinima && r.equipeMinima.length > 0
                          ? ` · ${r.equipeMinima.length} funções na equipe mínima`
                          : ''}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleAtivo(r)}
                        className={`rounded px-2 py-1 text-xs font-medium ${
                          r.ativo
                            ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                            : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                        }`}
                      >
                        {r.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(r)}
                        className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                      >
                        Editar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Formulário */}
        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="space-y-3 rounded border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h2 className="text-sm font-semibold text-slate-700">
              {editingId ? 'Editar recurso' : 'Novo recurso'}
            </h2>
            {formError && (
              <p className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                {formError}
              </p>
            )}
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                Nome
              </label>
              <input
                type="text"
                required
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder='Ex.: "ABTS_01", "MERGULHO 01", "DRO / TELEFONISTA"'
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Categoria
                </label>
                <select
                  value={form.categoria}
                  onChange={(e) =>
                    setForm({ ...form, categoria: e.target.value as CategoriaRecurso })
                  }
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                >
                  {CATEGORIAS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Ordem
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.ordem}
                  onChange={(e) =>
                    setForm({ ...form, ordem: Number.parseInt(e.target.value, 10) || 0 })
                  }
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                Tipo de composição
              </label>
              <div className="mt-1 flex flex-col gap-1">
                {TIPOS_COMPOSICAO.map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="tipoComposicao"
                      checked={form.tipoComposicao === t}
                      onChange={() => setForm({ ...form, tipoComposicao: t })}
                    />
                    {TIPO_LABEL[t]}
                  </label>
                ))}
              </div>
            </div>
            {form.tipoComposicao !== 'viatura_only' && (
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Equipe mínima (JSON)
                </label>
                <p className="mb-1 text-xs italic text-slate-500">
                  Array de funções. Cada função:{' '}
                  <code>{`{ "funcao": "chefe", "obrigatorio": true, "podeAcumularCom": ["motorista"] }`}</code>
                </p>
                <textarea
                  rows={6}
                  value={form.equipeMinimaJson}
                  onChange={(e) => setForm({ ...form, equipeMinimaJson: e.target.value })}
                  placeholder='[{"funcao":"chefe","obrigatorio":true},{"funcao":"motorista","obrigatorio":true},{"funcao":"operador","obrigatorio":true}]'
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                Viatura fixa (prefixo, opcional)
              </label>
              <input
                type="text"
                value={form.viaturaPrefixoFixo}
                onChange={(e) => setForm({ ...form, viaturaPrefixoFixo: e.target.value })}
                placeholder='Ex.: "ATB-13456" — vazio = qualquer viatura do tipo'
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                />
                Ativo (visível no Mapa Força)
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded bg-cbmes-blue px-4 py-2 text-sm font-medium text-white hover:bg-cbmes-blue/90 disabled:opacity-60"
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
