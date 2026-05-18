import type {
  AddAlteracaoDiversaInput,
  AlteracaoDiversa,
  ChangePasswordInput,
  ChangePasswordResponse,
  CreateUsuarioInput,
  UpdateUsuarioInput,
  UsuarioAdmin,
  ComposicaoEntry,
  CompartimentoMaterial,
  ConferenciaCov,
  ConferenciaEquipeEntry,
  ConferenciaMateriaisDoDia,
  ConferenciaMaterialV2,
  CreateCompartimentoMaterialInput,
  CreateFeriasInput,
  Ferias,
  TrocaAutorizada,
  UpdateFeriasInput,
  ConferenciaViaturaEntry,
  ContatoLogistico,
  ViaturaCbmes,
  ViaturaDetalhe,
  ViaturaEnriquecida,
  ViaturaQdvBaseLista,
  Atestado,
  CreateAtestadoInput,
  CreateDispensaInput,
  CreateFiscalInput,
  CreateNotaServicoInput,
  CreateRecursoInput,
  RegistrarConferenciaCovInput,
  RegistrarConferenciaMaterialInput,
  RegistrarConferenciaMateriaisInput,
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
  AgendaResponse,
  HealthStatus,
  IncidenteBaon,
  IntegracaoStatus,
  IseoHospitalEntry,
  IseoHospitalSyncStatus,
  LocalFaxina,
  LetraEquipe,
  LetraEquipeRotativa,
  LoginInput,
  LoginResponse,
  MapaForcaSnapshot,
  Militar,
  MilitarRef,
  NotaServico,
  ParteDiaria,
  UpsertParteDiariaInput,
  MapaForcaDoDia,
  PreviewEscalaEspecialResponse,
  PreviewEscalaResponse,
  Recurso,
  RecursoMapaForca,
  ServicoEstado,
  Unidade,
  UpdateAtestadoInput,
  UpdateDispensaInput,
  UpdateNotaServicoInput,
  UpdateCompartimentoMaterialInput,
  UpdateRecursoInput,
  UpdateUnidadeInput,
  TipoIdeo,
  TrocaEscalaEspecial,
  EscalaEspecialEmpenho,
  StatusAprovacao,
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

/**
 * S2.4 — Bearer token storage (fallback ao cookie httpOnly).
 *
 * Por que: em produção (Vercel ↔ Render), browsers cada vez mais bloqueam
 * cookies 3rd-party em contexto cross-site, mesmo com sameSite=none e
 * secure=true. O bug "Sessão ausente" no /auth/change-password vinha daí.
 *
 * Estratégia: backend continua setando o cookie (defesa em profundidade)
 * E retorna o token no body do login/change-password. Frontend persiste
 * o token em sessionStorage (limpo ao fechar a aba — mais seguro que
 * localStorage) e envia em todo request via `Authorization: Bearer`.
 *
 * Uso de sessionStorage (em vez de localStorage):
 * - Limita exposição se a aba for compartilhada
 * - JWT TTL de 8h cobre uma jornada típica do usuário
 * - Logout limpa explicitamente
 */
const TOKEN_STORAGE_KEY = 'argus.session.token';

export function setSessionToken(token: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  if (token) sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  else sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function getSessionToken(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSessionToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers ?? {}) as Record<string, string>),
  };
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers,
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

  // S2.6 — Status agregado dos serviços (StatusBar na home).
  healthStatus: () => request<HealthStatus>('/health/status'),

  // S2.7 — Admin CRUD de usuários (`/configuracoes/usuarios`).
  usuariosList: () => request<UsuarioAdmin[]>('/auth/usuarios'),
  usuarioCreate: (input: CreateUsuarioInput) =>
    request<UsuarioAdmin>('/auth/usuarios', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  usuarioUpdate: (nf: string, input: UpdateUsuarioInput) =>
    request<UsuarioAdmin>(`/auth/usuarios/${nf}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  usuarioRemove: (nf: string) => request<void>(`/auth/usuarios/${nf}`, { method: 'DELETE' }),

  changePassword: (input: ChangePasswordInput) =>
    request<ChangePasswordResponse>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // S2.10.4 — Recuperação de senha por email
  forgotPassword: (nf: string) =>
    request<void>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ nf }),
    }),

  resetPassword: (accessToken: string, novaSenha: string) =>
    request<LoginResponse>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ accessToken, novaSenha }),
    }),

  // Persona Picker (homologação, env-gated)
  listPersonas: () => request<PersonaSummary[]>('/auth/dev/personas'),

  personaLogin: (nf: string) =>
    request<LoginResponse>('/auth/dev/persona-login', {
      method: 'POST',
      body: JSON.stringify({ nf }),
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

  // S0.5/3.1 — abas adicionais da QDV (read-only)
  viaturasQdvBaseLista: () => request<ViaturaQdvBaseLista[]>('/viaturas/qdv/base-lista'),
  viaturasQdvCbmes: () => request<ViaturaCbmes[]>('/viaturas/qdv/cbmes'),
  viaturasQdvContatos: () => request<ContatoLogistico[]>('/viaturas/qdv/contatos'),

  // S0.x — Visão consolidada (1BBM_1CIA QDV + BASE_LISTA + MF + Contatos)
  viaturasEnriquecidas: () =>
    request<{ items: ViaturaEnriquecida[]; contatoResponsavel: ContatoLogistico | null }>(
      '/viaturas/enriquecidas',
    ),

  viaturasEnriquecidasDetalhe: (prefixo: string) =>
    request<ViaturaDetalhe>(`/viaturas/enriquecidas/${encodeURIComponent(prefixo)}`),

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

  viaturasUpsertByPrefixo: (prefixo: string, input: UpdateViaturaInput) =>
    request<Viatura>(`/viaturas/by-prefixo/${encodeURIComponent(prefixo)}`, {
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

  /**
   * S2.8.2 — accept opcional `diasDescartados` (datas que admin escolheu
   * manter na versão atual em vez de aceitar a nova).
   */
  escalasConfirm: (escala: EscalaMensal, diasDescartados: string[] = []) =>
    request<EscalaMensal>('/escalas/confirm', {
      method: 'POST',
      body: JSON.stringify({ escala, diasDescartados }),
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
    quinzena: 1 | 2,
    entry: { equipe: LetraEquipe; viatura: string; funcao: string; militar: MilitarRef | null },
  ) =>
    request<EscalaMensal>(`/escalas/${ano}/${mes}/composicao`, {
      method: 'PUT',
      body: JSON.stringify({ quinzena, ...entry }),
    }),

  // Mapa Força do dia (S4 + S0.x/rename-mapa-forca)
  mapaForcaDoDia: (data: string) => request<MapaForcaDoDia>(`/mapa-forca?data=${data}`),

  /** Retorna apenas o Fiscal escalado do dia, sem carregar o payload completo. */
  mapaForcaFiscalDoDia: (data: string) =>
    request<{ fiscal: import('@argus/shared-types').FiscalDoDia | null }>(
      `/mapa-forca/${data}/fiscal`,
    ),

  /** S0.x/rename-mapa-forca — Lista dias do mês com escala XLSX importada. */
  escalasDiasDisponiveis: (ano: number, mes: number) =>
    request<{
      ano: number;
      mes: number;
      dias: string[];
      equipePorDia: Record<string, string>;
    }>(`/escalas/${ano}/${mes}/dias-disponiveis`),

  // Trocas de Escala Especial (S6a-fix item 4)
  mapaForcaAddTrocaEscalaEspecial: (
    data: string,
    input: {
      atoOriginal: { data: string; militarRaw: string; horario: string; funcao: string };
      substituidoRaw: string;
      substituidoNf?: string;
      substitutoRaw: string;
      substitutoNf?: string;
    },
  ) =>
    request<TrocaEscalaEspecial>(`/mapa-forca/${data}/ajustes/escala-especial/trocas`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  mapaForcaRemoveTrocaEscalaEspecial: (data: string, atoKey: string) =>
    request<void>(
      `/mapa-forca/${data}/ajustes/escala-especial/trocas/${encodeURIComponent(atoKey)}`,
      { method: 'DELETE' },
    ),

  /** S2.10.7b/Parte F — Registra empenho de Escala Especial em recurso ativo. */
  mapaForcaAddEmpenhoEscalaEspecial: (
    data: string,
    input: {
      atoOriginal: { data: string; militarRaw: string; horario: string; funcao: string };
      recursoAlvo: string;
      funcaoAlvo: string;
      periodoInicio: string;
      periodoFim: string;
      substituidoNf?: string;
      substituidoRaw?: string;
      destinoSubstituido?: string;
    },
  ) =>
    request<EscalaEspecialEmpenho>(`/mapa-forca/${data}/ajustes/escala-especial/empenhos`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /** S2.10.7b/Parte F — Remove empenho de Escala Especial. */
  mapaForcaRemoveEmpenhoEscalaEspecial: (data: string, empenhoKey: string) =>
    request<void>(
      `/mapa-forca/${data}/ajustes/escala-especial/empenhos/${encodeURIComponent(empenhoKey)}`,
      { method: 'DELETE' },
    ),

  /**
   * S2.10.7b/Partes C+G — Aprovação individual de item da Prévia
   * (troca, dispensa ou atestado). Decisão: 'aprovar' | 'rejeitar'.
   */
  mapaForcaAprovarItem: (
    data: string,
    tipo: 'troca' | 'dispensa' | 'atestado',
    id: string,
    decisao: 'aprovar' | 'rejeitar',
  ) =>
    request<{ statusAprovacao: StatusAprovacao }>(
      `/mapa-forca/${data}/aprovacoes/${tipo}/${encodeURIComponent(id)}`,
      {
        method: 'POST',
        body: JSON.stringify({ decisao }),
      },
    ),

  // Servico — estado do dia (S6b/F1 + S0.x/rename-mapa-forca)
  servicoGet: (data: string) => request<ServicoEstado>(`/servico/${data}`),

  /** S0.x/rename-mapa-forca — Fiscal escalado/admin abre Prévia para edição. */
  servicoIniciarPrevia: (data: string) =>
    request<ServicoEstado>(`/servico/${data}/iniciar-previa`, { method: 'POST' }),

  /** S0.x/rename-mapa-forca — Cancela a Prévia em edição. */
  servicoCancelarPrevia: (data: string) =>
    request<ServicoEstado>(`/servico/${data}/cancelar-previa`, { method: 'POST' }),

  servicoIniciar: (data: string) =>
    request<ServicoEstado>(`/servico/${data}/iniciar`, { method: 'POST' }),

  /**
   * S0.x — Encerramento manual (admin only). O fluxo institucional normal é a
   * auto-finalização ao iniciar serviço do dia seguinte (passagem de serviço).
   */
  servicoEncerrar: (data: string) =>
    request<ServicoEstado>(`/servico/${data}/encerrar`, { method: 'POST' }),

  // S6h/2.1 — mock do Preencher Mapa Força CIODES
  servicoPreencherMf: (data: string) =>
    request<{ estado: ServicoEstado; mensagem: string }>(`/servico/${data}/preencher-mf`, {
      method: 'POST',
    }),

  // S0.x — mock do Atualizar Mapa Força CIODES (após dirty)
  servicoAtualizarMf: (data: string) =>
    request<{ estado: ServicoEstado; mensagem: string }>(`/servico/${data}/atualizar-mf`, {
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

  // S2.10.6 — Conferência do COV (termo + checklist 25 itens)
  conferenciaCovGet: (data: string, vtrPrefixo: string) =>
    request<ConferenciaCov | null>(`/conferencia/cov/${data}/${encodeURIComponent(vtrPrefixo)}`),

  conferenciaCovRegistrar: (
    data: string,
    vtrPrefixo: string,
    input: RegistrarConferenciaCovInput,
  ) =>
    request<ConferenciaCov>(`/conferencia/cov/${data}/${encodeURIComponent(vtrPrefixo)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  // S2.10.6 — Compartimentos de Materiais (CRUD admin)
  compartimentosMateriaisList: (contexto?: string) =>
    request<CompartimentoMaterial[]>(
      `/compartimentos-materiais${contexto ? `?contexto=${encodeURIComponent(contexto)}` : ''}`,
    ),

  compartimentoMaterialCreate: (input: CreateCompartimentoMaterialInput) =>
    request<CompartimentoMaterial>('/compartimentos-materiais', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  compartimentoMaterialUpdate: (id: string, input: UpdateCompartimentoMaterialInput) =>
    request<CompartimentoMaterial>(`/compartimentos-materiais/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  compartimentoMaterialDelete: (id: string) =>
    request<CompartimentoMaterial>(`/compartimentos-materiais/${id}`, { method: 'DELETE' }),

  // S2.10.6 — Conferência de Materiais (qualquer militar escalado)
  conferenciaMaterialV2Get: (data: string, contexto: string) =>
    request<ConferenciaMaterialV2 | null>(
      `/conferencia-materiais/${data}/${encodeURIComponent(contexto)}`,
    ),

  conferenciaMaterialV2Registrar: (input: RegistrarConferenciaMaterialInput) =>
    request<ConferenciaMaterialV2>('/conferencia-materiais', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

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

  // Trocas Autorizadas (item 1 + S0.5/PR1)
  trocasAutorizadasList: (filter: { data?: string } = {}) => {
    const params = new URLSearchParams();
    if (filter.data) params.set('data', filter.data);
    const qs = params.toString();
    return request<TrocaAutorizada[]>(`/trocas-autorizadas${qs ? `?${qs}` : ''}`);
  },

  // Integrações Google Sheets (S0.5/PR2)
  integracoesList: () => request<IntegracaoStatus[]>('/integracoes'),

  // S0.5/PR3 — força resync (admin)
  integracoesSync: (id: string) =>
    request<IntegracaoStatus>(`/integracoes/${encodeURIComponent(id)}/sync`, {
      method: 'POST',
    }),

  // Férias (item 4)
  feriasList: (filter: { militarNf?: string; ano?: number } = {}) => {
    const params = new URLSearchParams();
    if (filter.militarNf) params.set('militarNf', filter.militarNf);
    if (filter.ano) params.set('ano', String(filter.ano));
    const qs = params.toString();
    return request<Ferias[]>(`/ferias${qs ? `?${qs}` : ''}`);
  },

  feriasCreate: (input: CreateFeriasInput) =>
    request<Ferias>('/ferias', { method: 'POST', body: JSON.stringify(input) }),

  feriasUpdate: (id: string, input: UpdateFeriasInput) =>
    request<Ferias>(`/ferias/${id}`, { method: 'PUT', body: JSON.stringify(input) }),

  feriasRemove: (id: string) => request<void>(`/ferias/${id}`, { method: 'DELETE' }),

  // Atestados (S6k)
  atestadosList: (filter: { militarNf?: string; ano?: number } = {}) => {
    const params = new URLSearchParams();
    if (filter.militarNf) params.set('militarNf', filter.militarNf);
    if (filter.ano !== undefined) params.set('ano', String(filter.ano));
    const qs = params.toString();
    return request<Atestado[]>(`/atestados${qs ? `?${qs}` : ''}`);
  },

  atestadosCreate: (input: CreateAtestadoInput) =>
    request<Atestado>('/atestados', { method: 'POST', body: JSON.stringify(input) }),

  atestadosUpdate: (id: string, input: UpdateAtestadoInput) =>
    request<Atestado>(`/atestados/${id}`, { method: 'PUT', body: JSON.stringify(input) }),

  atestadosRemove: (id: string) => request<void>(`/atestados/${id}`, { method: 'DELETE' }),

  // Chefes de Operações (S0.x/fixes-3)
  /** Lista militares habilitados como ChOp (planilha externa) com posto/nome enriquecido. */
  chefesOperacoesHabilitados: () =>
    request<ChefeOperacoesHabilitado[]>('/chefes-operacoes/habilitados'),

  // Notas de Serviço (S6l)
  notasServicoList: (filter: { data?: string; militarNf?: string } = {}) => {
    const params = new URLSearchParams();
    if (filter.data) params.set('data', filter.data);
    if (filter.militarNf) params.set('militarNf', filter.militarNf);
    const qs = params.toString();
    return request<NotaServico[]>(`/notas-servico${qs ? `?${qs}` : ''}`);
  },

  notasServicoCreate: (input: CreateNotaServicoInput) =>
    request<NotaServico>('/notas-servico', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  notasServicoUpdate: (id: string, input: UpdateNotaServicoInput) =>
    request<NotaServico>(`/notas-servico/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  notasServicoRemove: (id: string) => request<void>(`/notas-servico/${id}`, { method: 'DELETE' }),

  // S6m — Preview de PDF de NS (não persiste, retorna sugestões editáveis)
  notasServicoPreviewPdf: async (file: File): Promise<NotaServicoPreviewPdfResponse> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API_URL}/notas-servico/preview-pdf`, {
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
    return json as NotaServicoPreviewPdfResponse;
  },

  // Parte Diária (S10)
  parteDiariaGet: (data: string) => request<ParteDiaria>(`/parte-diaria/${data}`),

  parteDiariaUpsert: (data: string, input: UpsertParteDiariaInput) =>
    request<ParteDiaria>(`/parte-diaria/${data}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  parteDiariaFinalizar: (data: string) =>
    request<ParteDiaria>(`/parte-diaria/${data}/finalizar`, { method: 'POST' }),

  parteDiariaReabrir: (data: string) =>
    request<ParteDiaria>(`/parte-diaria/${data}/reabrir`, { method: 'POST' }),

  // S0.x/parte-diaria — BAON (autocomplete códigos de ocorrência)
  // Agenda — agregação das próximas escalas do militar logado.
  agendaProxima: (dias = 30) => request<AgendaResponse>(`/agenda?dias=${dias}`),

  agendaRange: (inicio: string, fim: string) =>
    request<AgendaResponse>(`/agenda/range?inicio=${inicio}&fim=${fim}`),

  // ISEO Hospitais — escala HPM + HIMABA (Google Sheets pública).
  iseoHospitaisList: (unidade?: 'HPM' | 'HIMABA') => {
    const p = new URLSearchParams();
    if (unidade) p.set('unidade', unidade);
    const qs = p.toString();
    return request<IseoHospitalEntry[]>(`/iseo-hospitais${qs ? `?${qs}` : ''}`);
  },

  iseoHospitaisDia: (dataIso: string) =>
    request<IseoHospitalEntry[]>(`/iseo-hospitais/dia/${dataIso}`),

  iseoHospitaisMilitar: (nf: string) =>
    request<IseoHospitalEntry[]>(`/iseo-hospitais/militar/${nf}`),

  iseoHospitaisSyncStatus: () => request<IseoHospitalSyncStatus[]>('/iseo-hospitais/sync-status'),

  incidentesBaonSearch: (q?: string, limit = 20) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    p.set('limit', String(limit));
    return request<IncidenteBaon[]>(`/incidentes-baon?${p.toString()}`);
  },

  // S0.x/parte-diaria — Locais de Faxina (CRUD admin)
  locaisFaxinaList: (ativosOnly = false) =>
    request<LocalFaxina[]>(`/locais-faxina${ativosOnly ? '?ativosOnly=true' : ''}`),

  locaisFaxinaCreate: (input: { nome: string; ordem?: number }) =>
    request<LocalFaxina>('/locais-faxina', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  locaisFaxinaUpdate: (id: string, input: { nome?: string; ordem?: number; ativo?: boolean }) =>
    request<LocalFaxina>(`/locais-faxina/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  locaisFaxinaDelete: (id: string) =>
    request<LocalFaxina>(`/locais-faxina/${id}`, { method: 'DELETE' }),

  // Conferência de Materiais (S8)
  materiaisChecklistPadrao: (vtrPrefixo: string) =>
    request<string[]>(`/materiais/checklist-padrao/${encodeURIComponent(vtrPrefixo)}`),

  materiaisGet: (data: string, vtrPrefixo: string) => {
    const params = new URLSearchParams({ data, vtr: vtrPrefixo });
    return request<ConferenciaMateriaisDoDia | ConferenciaMateriaisDoDia[]>(
      `/materiais?${params.toString()}`,
    );
  },

  materiaisRegistrar: (input: RegistrarConferenciaMateriaisInput) =>
    request<ConferenciaMateriaisDoDia>('/materiais', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /**
   * S11 — Baixa o `.docx` da Parte Diária. Faz fetch direto (não passa pelo
   * helper `request` JSON) porque a resposta é binary. Trigga o download
   * via anchor `<a download>` + `URL.createObjectURL`.
   */
  parteDiariaDownloadDocx: async (data: string): Promise<void> => {
    const res = await fetch(`${API_URL}/parte-diaria/${data}/docx`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!res.ok) {
      const text = await res.text();
      let message = `Erro ${res.status}`;
      try {
        const json: unknown = JSON.parse(text);
        message = extractMessage(json) ?? message;
      } catch {
        // body não é JSON — usa fallback
      }
      throw new ApiError(res.status, message);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parte-diaria-${data}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

/** Shape devolvido por GET /chefes-operacoes/habilitados (S0.x/fixes-3). */
export interface ChefeOperacoesHabilitado {
  nf: string;
  posto: string;
  nomeGuerra: string;
  nome: string;
  telefone?: string;
}

/** Shape devolvido por GET /auth/dev/personas (persona picker, env-gated). */
export interface PersonaSummary {
  nf: string;
  nome: string;
  posto: string;
  papeis: UserSession['papeis'];
}

/** Shape devolvido por POST /notas-servico/preview-pdf (S6m). */
export interface NotaServicoPreviewPdfResponse {
  codigoSugerido: string | null;
  descricaoSugerida: string | null;
  militaresNfs: string[];
  dataSugerida: string | null;
  horaInicioSugerida: string | null;
  horaFimSugerida: string | null;
  viaturaSugerida: string | null;
  textoBruto: string;
  avisos: string[];
}
