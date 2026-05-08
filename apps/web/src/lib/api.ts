import type {
  ChangePasswordInput,
  CreateViaturaInput,
  EfetivoListResponse,
  EfetivoQuery,
  LoginInput,
  LoginResponse,
  Militar,
  UpdateViaturaInput,
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
};
