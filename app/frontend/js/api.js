// Elvi-Ra API client
const TOKEN_KEY = 'elvira_token';
const USER_KEY  = 'elvira_user';
const ACTIVE_SHEET_KEY = 'elvira_active_sheet';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function getUser()  { return localStorage.getItem(USER_KEY); }
export function getActiveSheet() { return localStorage.getItem(ACTIVE_SHEET_KEY); }
export function setActiveSheet(id) { localStorage.setItem(ACTIVE_SHEET_KEY, id); }

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, user);
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ACTIVE_SHEET_KEY);
}

async function req(method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  const r = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) {
    clearSession();
    if (!location.pathname.endsWith('/login.html')) location.href = '/pages/login.html';
    throw new Error('unauthorized');
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

export const api = {
  login:  (username, password) => req('POST', '/api/login', { username, password }),
  logout: () => req('POST', '/api/logout'),
  me:     () => req('GET',  '/api/me'),

  listSheets:    () => req('GET',    '/api/sheets'),
  createSheet:   (name) => req('POST', '/api/sheets', { name }),
  deleteSheet:   (sid) => req('DELETE', `/api/sheets/${sid}`),

  listCompanies:  (sid) => req('GET',   `/api/sheets/${sid}/companies`),
  createCompany:  (sid, c) => req('POST', `/api/sheets/${sid}/companies`, c),
  updateCompany:  (sid, cid, c) => req('PUT', `/api/sheets/${sid}/companies/${cid}`, c),
  deleteCompany:  (sid, cid) => req('DELETE', `/api/sheets/${sid}/companies/${cid}`),
  moveCompany:    (cid, fromSheetId, toSheetId) => req('POST', `/api/companies/${cid}/move`, { fromSheetId, toSheetId }),

  overview: () => req('GET', '/api/overview'),

  searchCompanies: (filters) => req('POST', '/api/search', filters),
  searchHistory:   () => req('GET', '/api/search/history'),
  deleteHistory:   (hid) => req('DELETE', `/api/search/history/${hid}`),
  addFromSearch:   (sid, result) => req('POST', `/api/sheets/${sid}/companies/from-search`, result),

  allCompanies:   () => req('GET', '/api/companies/all'),
  linkedinFind:   (companyId) => req('POST', '/api/linkedin', { companyId }),
  emailGenerate:  (payload) => req('POST', '/api/email', payload),

  // Elvi-Ra · orquestador
  elviraOverview:    () => req('GET',  '/api/elvira/overview'),
  elviraSystems:     () => req('GET',  '/api/elvira/systems'),
  elviraSystemSet:   (key, patch) => req('PUT', `/api/elvira/systems/${key}`, patch),
  elviraSystemPing:  (key) => req('POST', `/api/elvira/systems/${key}/ping`),
  elviraOphs:        () => req('GET',  '/api/elvira/ophs'),
  elviraOphsConfig:  (cfg) => req('PUT', '/api/elvira/ophs/config', cfg),
  elviraOphsScore:   (payload) => req('POST', '/api/elvira/ophs/score', payload),
  sentinelEvents:    () => req('GET',  '/api/elvira/sentinel/events'),
  sentinelEmit:      (ev) => req('POST', '/api/elvira/sentinel/events', ev),
  herzogAudits:      () => req('GET',  '/api/elvira/herzog/audits'),
  herzogAudit:       (a) => req('POST', '/api/elvira/herzog/audits', a),
  tcontroler:        () => req('GET',  '/api/elvira/tcontroler'),
  tcontrolerReset:   () => req('DELETE', '/api/elvira/tcontroler/reset'),
};

export function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

export function requireAuth() {
  if (!getToken()) location.href = '/pages/login.html';
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
