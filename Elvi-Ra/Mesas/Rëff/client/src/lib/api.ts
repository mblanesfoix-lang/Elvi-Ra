const API_URL = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'reff_token';
const USER_KEY = 'reff_user';

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// Cierra también la sesión de Elvi-Ra (mismo localStorage, mismo origen) para que
// el logout desde Rëff cierre sesión en toda la plataforma.
export function clearElviraSession(): void {
  localStorage.removeItem('elvira_token');
  localStorage.removeItem('elvira_user');
  localStorage.removeItem('elvira_active_sheet');
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body != null) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) clearSession();
    throw new Error((data as any).error || `Error HTTP ${res.status}`);
  }
  return data as T;
}

/* ---------- sheets ---------- */

export interface Sheet {
  id: number;
  name: string;
  position: number;
  companyCount: number;
}

export async function fetchSheets() {
  return request<{ sheets: Sheet[] }>('/api/crm/sheets');
}

export async function createSheet(name: string) {
  return request<{ sheet: Sheet }>('/api/crm/sheets', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function renameSheet(id: number, name: string) {
  return request<{ sheet: Sheet }>(`/api/crm/sheets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function deleteSheet(id: number) {
  return request<{ ok: true }>(`/api/crm/sheets/${id}`, { method: 'DELETE' });
}

/* ---------- companies ---------- */

export type CompanyStatus = 'estrategico' | 'operativo' | 'pendiente' | 'no_candidato';

export interface CompanyTask {
  id: number;
  title: string;
  done: boolean;
  dueDate: string | null;
  createdAt: string;
}

export interface Company {
  id: number;
  sheetId: number;
  name: string;
  country: string;
  city: string;
  lat: number;
  lng: number;
  status: CompanyStatus;
  sector: string | null;
  tonnageYear: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  tasks: CompanyTask[];
}

export interface CompanyInput {
  name: string;
  country: string;
  city: string;
  lat: number;
  lng: number;
  status?: CompanyStatus;
  sector?: string | null;
  tonnageYear?: number | null;
  notes?: string | null;
}

export async function fetchCompanies(sheetId: number) {
  return request<{ companies: Company[] }>(`/api/crm/sheets/${sheetId}/companies`);
}

export async function createCompany(sheetId: number, input: CompanyInput) {
  return request<{ company: Company }>(`/api/crm/sheets/${sheetId}/companies`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateCompany(id: number, input: Partial<CompanyInput> & { sheetId?: number }) {
  return request<{ company: Company }>(`/api/crm/companies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteCompany(id: number) {
  return request<{ ok: true }>(`/api/crm/companies/${id}`, { method: 'DELETE' });
}

export async function addCompanyTask(companyId: number, title: string, dueDate?: string | null) {
  return request<{ task: CompanyTask }>(`/api/crm/companies/${companyId}/tasks`, {
    method: 'POST',
    body: JSON.stringify({ title, dueDate }),
  });
}

export async function updateCompanyTask(taskId: number, input: Partial<Pick<CompanyTask, 'title' | 'done' | 'dueDate'>>) {
  return request<{ task: CompanyTask }>(`/api/crm/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteCompanyTask(taskId: number) {
  return request<{ ok: true }>(`/api/crm/tasks/${taskId}`, { method: 'DELETE' });
}

/* ---------- geo ---------- */

export interface CityOption {
  city: string;
  lat: number;
  lng: number;
}

export async function fetchCountries() {
  return request<{ countries: string[] }>('/api/geo/countries');
}

export async function fetchCities(country: string) {
  return request<{ cities: CityOption[] }>(`/api/geo/cities?country=${encodeURIComponent(country)}`);
}

export interface GlobeCity {
  city: string;
  country: string;
  lat: number;
  lng: number;
  companies: { id: number; name: string; status: CompanyStatus; sheetId: number }[];
}

export async function fetchGlobeCities() {
  return request<{ cities: GlobeCity[] }>('/api/geo/globe');
}

/* ---------- Herzog ---------- */

export interface HerzogResult {
  scores: { W: number; I: number; S: number; M: number; E: number; R: number };
  overall: number;
  classification: 'ESTRATEGICO' | 'OPERATIVO' | 'NO_CANDIDATO';
  summary: string;
  highlights: string[];
  risks: string[];
}

export async function runHerzogAudit(companyName: string, text: string) {
  return request<{ result: HerzogResult }>('/api/herzog/audit', {
    method: 'POST',
    body: JSON.stringify({ companyName, text }),
  });
}

export interface HerzogAudit {
  id: number;
  companyName: string;
  inputText: string;
  result: HerzogResult;
  createdAt: string;
}

export async function fetchHerzogHistory() {
  return request<{ audits: HerzogAudit[] }>('/api/herzog/history');
}
