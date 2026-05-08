import type {
  ChangePasswordInput,
  LoginInput,
  LoginResponse,
  UserSession,
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
};
