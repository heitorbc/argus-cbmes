import type {
  AddAlteracaoDiversaInput,
  AlteracaoDiversa,
  ChangePasswordInput,
  ComposicaoEntry,
  ConferenciaEquipeEntry,
  ConferenciaViaturaEntry,
  CreateDispensaInput,
  CreateFiscalInput,
  CreateRecursoInput,
  CreateUnidadeInput,
  CreateViaturaInput,
  Dispensa,
  DispensaSaldoMilitar,
  EfetivoListResponse,
  EfetivoQuery,
  EscalaEspecialMensal,
  EscalaMensal,
  FiscalCadastrado,
  IdeoEntry,
  IdeoMatrix,
  IdeoStatusDoDia,
  LetraEquipe,
  LetraEquipeRotativa,
  LoginInput,
  LoginResponse,
  MapaForcaSnapshot,
  Militar,
  MilitarRef,
  PreviaDoDia,
  PreviewEscalaEspecialResponse,
  PreviewEscalaResponse,
  Recurso,
  RecursoMapaForca,
  ServicoEstado,
  Unidade,
  UpdateDispensaInput,
  UpdateRecursoInput,
  UpdateUnidadeInput,
  TipoIdeo,
  TrocaEscalaEspecial,
  UpdateViaturaInput,
  UpsertConferenciaEquipeInput,
  UpsertConferenciaViaturaInput,
  UpsertIdeoEntryInput,
  UpsertIdeoStatusInput,
  UserSession,
  Viatura,
} from '@argus/shared-types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const message = extractMessage(json) ?? `Erro ${res.status}`;
    throw new ApiError(res.status, message);
  }

  return json as T;
}

function extractMessage(json: unknown): string | undefined {
  if (typeof json === 'object' && json !== null && 'message' in json) {
    const m = (json as { message: unknown }).message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m)) return m.filter((x) => typeof x === 'string').join('; ');
  }
  return undefined;
}

export const api = {
  login: (input: LoginInput) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  logout: () =>
    request<void>('/auth/logout', {
      method: 'POST',
    }),

  me: () => request<UserSession>('/auth/me'),

  changePassword: (input: ChangePasswordInput) =>
    request<{ user: UserSession }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // Efetivo (S2)
  efetivoList: (query: Partial<EfetivoQuery>) => {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.page) params.set('page', String(query.page));
    if (query.pageSize) params.set('pageSize', String(query.pageSize));
    if (query.somente1aCia) params.set('somente1aCia', 'true');
    return request<EfetivoListResponse>(`/efetivo?${params.toString()}`);
  },

  efetivoFindByNf: (nf: string) => request<Militar>(`/efetivo/${nf}`),

  efetivoForceSync: () =>
    request<EfetivoListResponse>('/efetivo/sync', {
      method: 'POST',
    }),

  // Viaturas (S2)
  viaturasList: () => request<Viatura[]>('/viaturas'),

  viaturasFindById: (id: string) => request<Viatura>(`/viaturas/${id}`),

  viaturasCreate: (input: CreateViaturaInput) =>
    request<Viatura>('/viaturas', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  viaturasUpdate: (id: string, input: UpdateViaturaInput) =>
    request<Viatura>(`/viaturas/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  viaturasSoftDelete: (id: string) =>
    request<Viatura>(`/viaturas/${id}`, {
      method: 'DELETE',
    }),

  // Fiscais (S3a)
  fiscaisList: () => request<FiscalCadastrado[]>('/fiscais'),

  fiscaisCreate: (input: CreateFiscalInput) =>
    request<FiscalCadastrado>('/fiscais', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  fiscaisDelete: (id: string) =>
    request<void>(`/fiscais/${id}`, {
      method: 'DELETE',
    }),

  fiscaisCadastradoVigente: (equipe: 'A' | 'B' | 'C' | 'D', data: string) =>
    request<{ cadastrado: FiscalCadastrado | null }>(
      `/fiscais/cadastrado-vigente?equipe=${equipe}&data=${data}`,
    ),

  // IDEO (S3a)
  ideoList: () => request<IdeoMatrix>('/ideo'),

  ideoGet: (dia: number, tipo: TipoIdeo) =>
    request<{ entry: IdeoEntry | null }>(`/ideo/${dia}/${tipo}`),

  ideoUpsert: (input: UpsertIdeoEntryInput) =>
    request<IdeoEntry>('/ideo', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  ideoDelete: (dia: number, tipo: TipoIdeo) =>
    request<void>(`/ideo/${dia}/${tipo}`, {
      method: 'DELETE',
    }),

  // S6i — IDEO Status (realizada/não-realizada por dia/tipo)
  ideoStatusGet: (data: string) => request<IdeoStatusDoDia[]>(`/ideo-status/${data}`),

  ideoStatusUpsert: (data: string, input: UpsertIdeoStatusInput) =>
    request<IdeoStatusDoDia>(`/ideo-status/${data}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  // Escalas (S3b)
  escalasList: () =>
    request<{
      escalas: { ano: number; mes: number; origemArquivo: string; importadoEm: string }[];
    }>(`/escalas`),

  escalasGet: (ano: number, mes: number) =>
    request<{ escala: EscalaMensal | null }>(`/escalas?ano=${ano}&mes=${mes}`),

  escalasPreview: async (file: File): Promise<PreviewEscalaResponse> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API_URL}/escalas/preview`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
    });
    const text = await res.text();
    const json: unknown = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      const message = extractMessage(json) ?? `Erro ${res.status}`;
      throw new ApiError(res.status, message);
    }
    return json as PreviewEscalaResponse;
  },

  escalasConfirm: (escala: EscalaMensal) =>
    request<EscalaMensal>('/escalas/confirm', {
      method: 'POST',
      body: JSON.stringify(escala),
    }),

  escalasDelete: (ano: number, mes: number) =>
    request<void>(`/escalas/${ano}/${mes}`, {
      method: 'DELETE',
    }),

  escalasEscaladosDoDia: (ano: number, mes: number, data: string) =>
    request<{ equipe: LetraEquipe | null; entries: ComposicaoEntry[] }>(
      `/escalas/escalados-do-dia?ano=${ano}&mes=${String(mes).padStart(2, '0')}&data=${data}`,
    ),

  // F4 (S5) — Edição da escala importada
  escalasUpdateDiaEquipe: (
    ano: number,
    mes: number,
    data: string,
    equipe: LetraEquipeRotativa | null,
  ) =>
    request<EscalaMensal>(`/escalas/${ano}/${mes}/dia-equipe`, {
      method: 'PUT',
      body: JSON.stringify({ data, equipe }),
    }),

  escalasUpsertComposicao: (
    ano: number,
    mes: number,
    entry: { equipe: LetraEquipe; viatura: string; funcao: string; militar: MilitarRef | null },
  ) =>
    request<EscalaMensal>(`/escalas/${ano}/${mes}/composicao`, {
      method: 'PUT',
      body: JSON.stringify(entry),
    }),

  // Prévia do Mapa Força (S4)
  previaDoDia: (data: string) => request<PreviaDoDia>(`/previa?data=${data}`),

  // Trocas de Escala Especial (S6a-fix item 4)
  previaAddTrocaEscalaEspecial: (
    data: string,
    input: {
      atoOriginal: { data: string; militarRaw: string; horario: string; funcao: string };
      substituidoRaw: string;
      substituidoNf?: string;
      substitutoRaw: string;
      substitutoNf?: string;
    },
  ) =>
    request<TrocaEscalaEspecial>(`/previa/${data}/ajustes/escala-especial/trocas`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  previaRemoveTrocaEscalaEspecial: (data: string, atoKey: string) =>
    request<void>(`/previa/${data}/ajustes/escala-especial/trocas/${encodeURIComponent(atoKey)}`, {
      method: 'DELETE',
    }),

  // Servico — estado do dia (S6b/F1)
  servicoGet: (data: string) => request<ServicoEstado>(`/servico/${data}`),

  servicoIniciar: (data: string) =>
    request<ServicoEstado>(`/servico/${data}/iniciar`, { method: 'POST' }),

  servicoEncerrar: (data: string, force?: boolean) =>
    request<ServicoEstado>(`/servico/${data}/encerrar${force ? '?force=true' : ''}`, {
      method: 'POST',
    }),

  // S6h/2.1 — mock do Preencher Mapa Força
  servicoPreencherMf: (data: string) =>
    request<{ estado: ServicoEstado; mensagem: string }>(`/servico/${data}/preencher-mf`, {
      method: 'POST',
    }),

  // Alterações Diversas (S6b/F6)
  alteracoesDiversasList: (data: string) =>
    request<AlteracaoDiversa[]>(`/servico/${data}/alteracoes`),

  alteracoesDiversasAdd: (data: string, input: AddAlteracaoDiversaInput) =>
    request<AlteracaoDiversa>(`/servico/${data}/alteracoes`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // Conferência da Equipe (S6b/F3)
  conferenciaEquipeGet: (data: string) =>
    request<ConferenciaEquipeEntry[]>(`/conferencia/equipe/${data}`),

  conferenciaEquipeUpsert: (data: string, input: UpsertConferenciaEquipeInput) =>
    request<ConferenciaEquipeEntry[]>(`/conferencia/equipe/${data}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  // Conferência da Viatura (S6b/F4)
  conferenciaViaturaGet: (data: string) =>
    request<ConferenciaViaturaEntry[]>(`/conferencia/viatura/${data}`),

  conferenciaViaturaRegistrar: (
    data: string,
    vtrPrefixo: string,
    input: UpsertConferenciaViaturaInput,
  ) =>
    request<ConferenciaViaturaEntry>(
      `/conferencia/viatura/${data}/${encodeURIComponent(vtrPrefixo)}`,
      { method: 'PUT', body: JSON.stringify(input) },
    ),

  // Mapa Força (S5)
  mapaForcaSnapshot: () => request<MapaForcaSnapshot>(`/mapa-forca/snapshot`),
  mapaForcaRecursos: () => request<RecursoMapaForca[]>(`/mapa-forca/recursos`),

  // Escalas Especiais (S6a)
  escalasEspeciaisList: () =>
    request<{
      escalas: {
        ano: number;
        mes: number;
        origemArquivo: string;
        importadoEm: string;
        totalAtos: number;
      }[];
    }>(`/escalas-especiais`),

  escalasEspeciaisGet: (ano: number, mes: number) =>
    request<{ escala: EscalaEspecialMensal | null }>(`/escalas-especiais?ano=${ano}&mes=${mes}`),

  escalasEspeciaisPreview: async (file: File): Promise<PreviewEscalaEspecialResponse> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API_URL}/escalas-especiais/preview`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
    });
    const text = await res.text();
    const json: unknown = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      const message = extractMessage(json) ?? `Erro ${res.status}`;
      throw new ApiError(res.status, message);
    }
    return json as PreviewEscalaEspecialResponse;
  },

  escalasEspeciaisConfirm: (escala: EscalaEspecialMensal) =>
    request<EscalaEspecialMensal>(`/escalas-especiais/confirm`, {
      method: 'POST',
      body: JSON.stringify(escala),
    }),

  escalasEspeciaisDelete: (ano: number, mes: number) =>
    request<void>(`/escalas-especiais/${ano}/${mes}`, {
      method: 'DELETE',
    }),

  // Unidades (S6d/S6e)
  unidadesList: () => request<Unidade[]>('/unidades'),

  unidadesFindById: (id: string) => request<Unidade>(`/unidades/${id}`),

  unidadesCreate: (input: CreateUnidadeInput) =>
    request<Unidade>('/unidades', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  unidadesUpdate: (id: string, input: UpdateUnidadeInput) =>
    request<Unidade>(`/unidades/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  unidadesSoftDelete: (id: string) =>
    request<Unidade>(`/unidades/${id}`, {
      method: 'DELETE',
    }),

  // Recursos (S6d/S6e)
  recursosList: (filter: { unidadeId?: string; ativoSomente?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (filter.unidadeId) params.set('unidadeId', filter.unidadeId);
    if (filter.ativoSomente) params.set('ativoSomente', 'true');
    const qs = params.toString();
    return request<Recurso[]>(`/recursos${qs ? `?${qs}` : ''}`);
  },

  recursosFindById: (id: string) => request<Recurso>(`/recursos/${id}`),

  recursosCreate: (input: CreateRecursoInput) =>
    request<Recurso>('/recursos', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  recursosUpdate: (id: string, input: UpdateRecursoInput) =>
    request<Recurso>(`/recursos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  recursosSoftDelete: (id: string) =>
    request<Recurso>(`/recursos/${id}`, {
      method: 'DELETE',
    }),

  // Dispensas (S6j)
  dispensasList: (filter: { militarNf?: string; ano?: number } = {}) => {
    const params = new URLSearchParams();
    if (filter.militarNf) params.set('militarNf', filter.militarNf);
    if (filter.ano !== undefined) params.set('ano', String(filter.ano));
    const qs = params.toString();
    return request<Dispensa[]>(`/dispensas${qs ? `?${qs}` : ''}`);
  },

  dispensasCreate: (input: CreateDispensaInput) =>
    request<Dispensa>('/dispensas', { method: 'POST', body: JSON.stringify(input) }),

  dispensasUpdate: (id: string, input: UpdateDispensaInput) =>
    request<Dispensa>(`/dispensas/${id}`, { method: 'PUT', body: JSON.stringify(input) }),

  dispensasRemove: (id: string) => request<void>(`/dispensas/${id}`, { method: 'DELETE' }),

  dispensasSaldoMilitar: (militarNf: string, ano: number) =>
    request<DispensaSaldoMilitar>(`/dispensas/saldo/${militarNf}/${ano}`),
};
