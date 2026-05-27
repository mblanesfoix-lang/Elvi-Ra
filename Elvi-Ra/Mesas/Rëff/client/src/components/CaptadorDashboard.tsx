import { useState, useRef, useCallback, useEffect, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { streamChat, type Agent } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type Classification = 'PRIORIDAD ALTA' | 'CANDIDATO VÁLIDO' | 'SEGUIMIENTO' | 'DESCARTAR';
type CrmStatus = 'Nuevo' | 'Contactado' | 'En negociación' | 'Cerrado' | 'Descartado';
type TaskStatus = 'Pendiente' | 'En curso' | 'Completada';
type Priority = 'Alta' | 'Media' | 'Baja';
type NavSection = 'panel' | 'buscador' | 'li-contacts' | 'crm' | 'analizador' | 'analytics' | 'emails';

interface Company {
  id: string;
  name: string;
  sector: string;
  location: string;
  description: string;
  contact: string;
  reason: string;
  classification: Classification;
  score: number;
  volumen: string;
  tipoResiduo: string;
  empleados: string;
  facturacion: string;
  gastoResiduos: string;
  esg: string;
  cluster: string;
  plantas: string;
  fuente: string;
  createdAt: string;
}

interface Lead {
  id: string;
  companyId: string;
  company: string;
  sector: string;
  location: string;
  classification: Classification;
  crmStatus: CrmStatus;
  contact: string;
  notes: string;
  score: number;
  volumen: string;
  tipoResiduo: string;
  empleados: string;
  facturacion: string;
  gastoResiduos: string;
  esg: string;
  cluster: string;
  plantas: string;
  createdAt: string;
}

interface Task {
  id: string;
  leadId: string;
  title: string;
  priority: Priority;
  status: TaskStatus;
  dueDate: string;
}

interface CrmSheet {
  id: string;
  name: string;
  leads: Lead[];
  createdAt: string;
  color?: string;
}

// ─── LI Contacts types ───────────────────────────────────────────────────────

type LiProfileType = 'VC' | 'Capital Markets' | 'Directivo' | 'Inversor' | 'M&A' | 'CVC' | 'CSO' | 'Otro';

interface LiContact {
  id: string;
  name: string;
  title: string;
  company: string;
  linkedin: string;
  email: string;
  method: string;
  relevance: string;
  profileType: LiProfileType;
}

interface FinderResult {
  id: string;
  name: string;
  title: string;
  company: string;
  emailMain: string;
  emailConfidence: string;
  emailSource: string;
  emailsAlt: string;
  phone: string;
  phoneType: string;
  phoneSource: string;
  linkedin: string;
  otherChannels: string;
  confidence: string;
  notes: string;
}

// ─── Investigation types ──────────────────────────────────────────────────────

type InvDimId = 'W' | 'I' | 'S' | 'M' | 'E' | 'R';
type InvStatus = 'pendiente' | 'analizando' | 'completada';

interface InvDimension {
  id: InvDimId;
  label: string;
  desc: string;
  status: InvStatus;
  result: string;
}

interface Investigation {
  id: string;
  leadId: string;
  company: string;
  sector: string;
  location: string;
  dimensions: InvDimension[];
  contactReady: boolean;
  createdAt: string;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const LS_LI_CONTACTS = 'captador.licontacts.v1';
const LS_LI_SEARCHES = 'captador.licontacts.searches.v1';
function loadLiContacts(): LiContact[] {
  try { return JSON.parse(localStorage.getItem(LS_LI_CONTACTS) || '[]'); } catch { return []; }
}
function saveLiContacts(c: LiContact[]) { localStorage.setItem(LS_LI_CONTACTS, JSON.stringify(c)); }

interface LiSearchRecord {
  id: string;
  label: string;
  profileFilter: 'Todos' | LiProfileType;
  contacts: LiContact[];
  createdAt: string;
}

function loadLiSearches(): LiSearchRecord[] {
  try { return JSON.parse(localStorage.getItem(LS_LI_SEARCHES) || '[]'); } catch { return []; }
}
function saveLiSearches(s: LiSearchRecord[]) { localStorage.setItem(LS_LI_SEARCHES, JSON.stringify(s)); }

const LS_FINDER = 'captador.finder.v1';
function loadFinder(): FinderResult[] {
  try { return JSON.parse(localStorage.getItem(LS_FINDER) || '[]'); } catch { return []; }
}
function saveFinder(f: FinderResult[]) { localStorage.setItem(LS_FINDER, JSON.stringify(f)); }

const LS_LEADS = 'captador.leads.v3';
const LS_TASKS = 'captador.tasks.v3';
const LS_INVS = 'captador.investigations.v1';
const LS_SEARCHES = 'captador.searches.v1';

interface SearchRecord {
  id: string;
  label: string;
  companies: Company[];
  createdAt: string;
}

function loadLeads(): Lead[] {
  try { return JSON.parse(localStorage.getItem(LS_LEADS) || '[]'); } catch { return []; }
}
function saveLeads(l: Lead[]) { localStorage.setItem(LS_LEADS, JSON.stringify(l)); }

const LS_SHEETS = 'captador.sheets.v1';
function loadSheets(): CrmSheet[] {
  try {
    const stored = localStorage.getItem(LS_SHEETS);
    if (stored) return JSON.parse(stored);
    const oldLeads = loadLeads();
    const sheets: CrmSheet[] = [{ id: 'sheet-default', name: 'Hoja 1', leads: oldLeads, createdAt: new Date().toISOString() }];
    localStorage.setItem(LS_SHEETS, JSON.stringify(sheets));
    return sheets;
  } catch {
    return [{ id: 'sheet-default', name: 'Hoja 1', leads: [], createdAt: new Date().toISOString() }];
  }
}
function saveSheets(s: CrmSheet[]) { localStorage.setItem(LS_SHEETS, JSON.stringify(s)); }
function loadTasks(): Task[] {
  try { return JSON.parse(localStorage.getItem(LS_TASKS) || '[]'); } catch { return []; }
}
function saveTasks(t: Task[]) { localStorage.setItem(LS_TASKS, JSON.stringify(t)); }
function loadSearches(): SearchRecord[] {
  try { return JSON.parse(localStorage.getItem(LS_SEARCHES) || '[]'); } catch { return []; }
}
function saveSearches(s: SearchRecord[]) { localStorage.setItem(LS_SEARCHES, JSON.stringify(s)); }
function loadInvs(): Investigation[] {
  try { return JSON.parse(localStorage.getItem(LS_INVS) || '[]'); } catch { return []; }
}
function saveInvs(i: Investigation[]) { localStorage.setItem(LS_INVS, JSON.stringify(i)); }

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD = '#00a878';
const CRM_STATUSES: CrmStatus[] = ['Nuevo', 'Contactado', 'En negociación', 'Cerrado', 'Descartado'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function classColor(c: Classification): string {
  if (c === 'PRIORIDAD ALTA') return '#34d399';
  if (c === 'CANDIDATO VÁLIDO') return '#60a5fa';
  if (c === 'SEGUIMIENTO') return '#fbbf24';
  return '#f87171';
}

function scoreBar(score: number) {
  const pct = Math.min(100, Math.round((score / 130) * 100));
  const color = score >= 85 ? '#34d399' : score >= 65 ? '#60a5fa' : score >= 40 ? '#fbbf24' : '#f87171';
  return { pct, color };
}

function statusColor(s: string): string {
  if (s === 'Nuevo') return '#94a3b8';
  if (s === 'Contactado') return '#60a5fa';
  if (s === 'En negociación') return '#fbbf24';
  if (s === 'Cerrado') return '#34d399';
  return '#f87171';
}

function priorityColor(p: Priority): string {
  if (p === 'Alta') return '#f87171';
  if (p === 'Media') return '#fbbf24';
  return '#94a3b8';
}

function uid() { return Math.random().toString(36).slice(2, 10); }

function profileTypeColor(t: LiProfileType): string {
  if (t === 'VC') return '#a855f7';
  if (t === 'Capital Markets') return '#3b82f6';
  if (t === 'Directivo') return '#f97316';
  if (t === 'Inversor') return '#10b981';
  if (t === 'M&A') return '#ec4899';
  if (t === 'CVC') return '#06b6d4';
  if (t === 'CSO') return '#84cc16';
  return '#94a3b8';
}

function parseLiContacts(text: string): LiContact[] {
  const cleaned = text.replace(/\*\*/g, '').replace(/\*/g, '');
  const blocks = cleaned.split(/\n?---+\n?/).filter(b => b.trim());
  return blocks.map(b => {
    const get = (...keys: string[]) => {
      for (const key of keys) {
        const m = b.match(new RegExp(key + ':[ \\t]*(.+)', 'i'));
        if (m) return m[1].trim();
      }
      return '';
    };
    const name = get('NOMBRE');
    if (!name || name.startsWith('[')) return null;
    const rawProfile = get('PERFIL').toUpperCase();
    const profileType: LiProfileType =
      rawProfile.includes('CAPITAL MARKETS') ? 'Capital Markets' :
      rawProfile.includes('CVC') || rawProfile.includes('CORPORATE VENTURE') ? 'CVC' :
      rawProfile.includes('VC') || rawProfile.includes('VENTURE') ? 'VC' :
      rawProfile.includes('M&A') || rawProfile.includes('MERGERS') ? 'M&A' :
      rawProfile.includes('CSO') || rawProfile.includes('CHIEF STRATEGY') ? 'CSO' :
      rawProfile.includes('DIRECTIVO') ? 'Directivo' :
      rawProfile.includes('INVERSOR') ? 'Inversor' : 'Otro';
    return {
      id: uid(),
      name,
      title: get('CARGO'),
      company: get('EMPRESA'),
      linkedin: get('LINKEDIN'),
      email: get('EMAIL'),
      method: get('METODO', 'MÉTODO'),
      relevance: get('RELEVANCIA'),
      profileType,
    };
  }).filter(Boolean) as LiContact[];
}

function confidenceColor(c: string): string {
  if (c === 'ALTA') return '#34d399';
  if (c === 'MEDIA') return '#fbbf24';
  if (c === 'BAJA') return '#f87171';
  return '#94a3b8';
}

function emailConfColor(c: string): string {
  if (c === 'CONFIRMADO') return '#34d399';
  if (c === 'INFERIDO') return '#fbbf24';
  if (c === 'PROBABLE') return '#fb923c';
  return '#94a3b8';
}

function parseFinder(text: string): FinderResult[] {
  const cleaned = text.replace(/\*\*/g, '').replace(/\*/g, '');
  const blocks = cleaned.split(/\n?---+\n?/).filter(b => b.trim());
  return blocks.map(b => {
    const get = (...keys: string[]) => {
      for (const key of keys) {
        const m = b.match(new RegExp(key + ':[ \t]*(.+)', 'i'));
        if (m) return m[1].trim();
      }
      return '';
    };
    const name = get('PERSONA');
    if (!name) return null;
    const emailRaw = get('EMAIL PRINCIPAL');
    const emailDash = emailRaw.indexOf('—');
    const emailMain = emailDash > -1 ? emailRaw.slice(0, emailDash).trim() : emailRaw;
    const emailConfidence = emailDash > -1 ? emailRaw.slice(emailDash + 1).trim() : '';
    const phoneRaw = get('TELÉFONO', 'TELEFONO');
    const phoneDash = phoneRaw.indexOf('—');
    const phone = phoneDash > -1 ? phoneRaw.slice(0, phoneDash).trim() : phoneRaw;
    const phoneType = phoneDash > -1 ? phoneRaw.slice(phoneDash + 1).trim() : '';
    return {
      id: uid(),
      name,
      title: get('CARGO'),
      company: get('EMPRESA'),
      emailMain,
      emailConfidence,
      emailSource: get('FUENTE EMAIL'),
      emailsAlt: get('EMAILS ALTERNATIVOS'),
      phone,
      phoneType,
      phoneSource: get('FUENTE TELÉFONO', 'FUENTE TELEFONO'),
      linkedin: get('LINKEDIN'),
      otherChannels: get('OTROS CANALES'),
      confidence: get('CONFIANZA GLOBAL'),
      notes: get('NOTAS'),
    };
  }).filter(Boolean) as FinderResult[];
}

function parseCompanies(text: string): Company[] {
  // strip markdown markers the model sometimes adds despite instructions
  const cleaned = text.replace(/\*\*/g, '').replace(/\*/g, '');
  const blocks = cleaned.split(/\n?---+\n?/).filter(b => b.trim());
  return blocks.map(b => {
    // accept multiple spelling variants (accented / non-accented)
    const get = (...keys: string[]) => {
      for (const key of keys) {
        const m = b.match(new RegExp(key + ':[ \\t]*(.+)', 'i'));
        if (m) return m[1].trim();
      }
      return '';
    };
    const name = get('EMPRESA');
    if (!name || name.startsWith('[')) return null;
    const rawClass = get('CLASIFICACI[ÓO]N', 'CLASIFICACION').toUpperCase();
    const cls: Classification =
      rawClass.includes('PRIORIDAD ALTA') ? 'PRIORIDAD ALTA' :
      rawClass.includes('CANDIDATO') ? 'CANDIDATO VÁLIDO' :
      rawClass.includes('SEGUIMIENTO') ? 'SEGUIMIENTO' : 'DESCARTAR';
    const rawScore = parseInt(get('SCORE'), 10);
    return {
      id: uid(),
      name,
      sector: get('SECTOR'),
      location: get('UBICACI[ÓO]N', 'UBICACION'),
      description: get('DESCRIPCI[ÓO]N', 'RAZ[ÓO]N'),
      contact: get('CONTACTO'),
      reason: get('RAZ[ÓO]N', 'RAZON'),
      classification: cls,
      score: isNaN(rawScore) ? 0 : rawScore,
      volumen: get('VOLUMEN RESIDUO', 'VOLUMEN'),
      tipoResiduo: get('TIPO RESIDUO', 'TIPO'),
      empleados: get('EMPLEADOS'),
      facturacion: get('FACTURACI[ÓO]N', 'FACTURACION'),
      gastoResiduos: get('GASTO GESTI[ÓO]N RESIDUOS', 'GASTO RESIDUOS'),
      esg: get('CERTIFICACIONES ESG', 'ESG'),
      cluster: get('CLUSTER'),
      plantas: get('PLANTAS'),
      fuente: get('FUENTE'),
      createdAt: new Date().toISOString(),
    } as Company;
  }).filter(Boolean) as Company[];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldPill({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      padding: '6px 10px', borderRadius: 0,
      background: highlight ? 'rgba(52,211,153,0.08)' : 'rgba(0,0,0,0.04)',
      border: `1px solid ${highlight ? 'rgba(52,211,153,0.2)' : 'rgba(0,0,0,0.07)'}`,
    }}>
      <div style={{ fontSize: 9, color: 'rgba(0,0,0,0.3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11, color: highlight ? '#34d399' : 'rgba(0,0,0,0.7)', fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 0,
      fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
      color, background: color + '18',
      border: `1px solid ${color}30`,
    }}>
      {label}
    </span>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.04)',
      border: '1px solid rgba(0,0,0,0.08)',
      borderRadius: 0,
      backdropFilter: 'blur(12px)',
      ...style,
    }}>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card style={{ padding: '20px 24px' }}>
      <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)', marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}

// ─── DarkSelect — custom dropdown, no browser chrome ─────────────────────────

function DarkSelect({
  value, onChange, options, placeholder, style,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || dropRef.current?.contains(target)) return;
      setOpen(false);
    };
    const reposition = () => {
      if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  const selected = options.find(o => o.value === value);

  const handleOpen = () => {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(o => !o);
  };

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '9px 12px', borderRadius: 0, fontSize: 12, cursor: 'pointer',
          background: 'rgba(0,0,0,0.06)', border: `1px solid rgba(0,0,0,${open ? '0.2' : '0.1'})`,
          color: selected ? '#fff' : 'rgba(0,0,0,0.35)', outline: 'none',
          transition: 'border-color 0.15s',
        }}
      >
        <span>{selected ? selected.label : (placeholder || 'Seleccionar')}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: 0.4, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && rect && createPortal(
        <div ref={dropRef} style={{
          position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 99999,
          background: 'var(--surface-1)', border: '1px solid rgba(0,0,0,0.12)',
          borderRadius: 0, overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)',
        }}>
          {placeholder && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              style={{
                width: '100%', padding: '9px 14px', textAlign: 'left', fontSize: 12, cursor: 'pointer',
                background: value === '' ? 'rgba(0,0,0,0.06)' : 'transparent',
                border: 'none', color: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(0,0,0,0.06)',
              }}
            >{placeholder}</button>
          )}
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              style={{
                width: '100%', padding: '9px 14px', textAlign: 'left', fontSize: 12, cursor: 'pointer',
                background: value === o.value ? `rgba(0,168,120,0.15)` : 'transparent',
                border: 'none',
                color: value === o.value ? GOLD : 'rgba(0,0,0,0.8)',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (value !== o.value) e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
              onMouseLeave={e => { if (value !== o.value) e.currentTarget.style.background = 'transparent'; }}
            >{o.label}</button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── DarkSelectInline — compact pill variant for CRM status ──────────────────

function DarkSelectInline({
  value, onChange, options, colorFn, onClick,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  colorFn: (v: string) => string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const color = colorFn(value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }} onClick={onClick}>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          padding: '4px 12px', borderRadius: 0, fontSize: 11, fontWeight: 600, cursor: 'pointer',
          background: color + '18', border: `1px solid ${color}40`, color,
          display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
        }}
      >
        {value}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 9999, minWidth: 140,
          background: 'var(--surface-1)', border: '1px solid rgba(0,0,0,0.12)',
          borderRadius: 0, overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}>
          {options.map(o => {
            const c = colorFn(o);
            return (
              <button
                key={o}
                type="button"
                onClick={e => { e.stopPropagation(); onChange(o); setOpen(false); }}
                style={{
                  width: '100%', padding: '9px 14px', textAlign: 'left', fontSize: 12, cursor: 'pointer',
                  background: value === o ? c + '18' : 'transparent',
                  border: 'none', color: value === o ? c : 'rgba(0,0,0,0.7)',
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (value !== o) e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
                onMouseLeave={e => { if (value !== o) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 999, background: c, flexShrink: 0 }} />
                {o}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Task Progress Bar ────────────────────────────────────────────────────────

function TaskPanel({ leadId, tasks, setTasks }: { leadId: string; tasks: Task[]; setTasks: (t: Task[]) => void }) {
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('Media');
  const [newDue, setNewDue] = useState('');
  const myTasks = tasks.filter(t => t.leadId === leadId);
  const done = myTasks.filter(t => t.status === 'Completada').length;
  const pct = myTasks.length === 0 ? 0 : Math.round((done / myTasks.length) * 100);

  const addTask = () => {
    if (!newTitle.trim()) return;
    const updated = [...tasks, { id: uid(), leadId, title: newTitle.trim(), priority: newPriority, status: 'Pendiente' as TaskStatus, dueDate: newDue }];
    setTasks(updated);
    saveTasks(updated);
    setNewTitle('');
    setNewDue('');
  };

  const cycleStatus = (id: string) => {
    const order: TaskStatus[] = ['Pendiente', 'En curso', 'Completada'];
    const updated = tasks.map(t => {
      if (t.id !== id) return t;
      const idx = order.indexOf(t.status);
      return { ...t, status: order[(idx + 1) % 3] };
    });
    setTasks(updated);
    saveTasks(updated);
  };

  const removeTask = (id: string) => {
    const updated = tasks.filter(t => t.id !== id);
    setTasks(updated);
    saveTasks(updated);
  };

  return (
    <div style={{ marginTop: 16 }}>
      {/* Progress header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Tareas · {done}/{myTasks.length}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: pct === 100 ? '#34d399' : GOLD }}>{pct}%</span>
      </div>

      {/* Bar */}
      <div style={{ height: 4, background: 'rgba(0,0,0,0.08)', borderRadius: 99, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: pct === 100
            ? 'linear-gradient(90deg, #34d399, #10b981)'
            : `linear-gradient(90deg, ${GOLD}, ${GOLD}bb)`,
          borderRadius: 99,
          transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>

      {/* Task list */}
      {myTasks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {myTasks.map(task => (
            <div key={task.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 0,
              background: 'rgba(0,0,0,0.03)',
              border: '1px solid rgba(0,0,0,0.06)',
              opacity: task.status === 'Completada' ? 0.5 : 1,
              transition: 'opacity 0.2s',
            }}>
              {/* Status circle */}
              <button
                onClick={() => cycleStatus(task.id)}
                title="Cambiar estado"
                style={{
                  width: 18, height: 18, borderRadius: 999, flexShrink: 0, cursor: 'pointer',
                  border: `2px solid ${task.status === 'Completada' ? '#34d399' : task.status === 'En curso' ? GOLD : 'rgba(0,0,0,0.25)'}`,
                  background: task.status === 'Completada' ? '#34d399' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s',
                }}
              >
                {task.status === 'Completada' && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2.5 2.5L8 3" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {task.status === 'En curso' && (
                  <div style={{ width: 6, height: 6, borderRadius: 999, background: GOLD }} />
                )}
              </button>

              {/* Title */}
              <span style={{
                flex: 1, fontSize: 12, color: 'rgba(0,0,0,0.85)',
                textDecoration: task.status === 'Completada' ? 'line-through' : 'none',
              }}>{task.title}</span>

              {/* Priority */}
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                color: priorityColor(task.priority),
                textTransform: 'uppercase',
              }}>{task.priority}</span>

              {/* Due date */}
              {task.dueDate && (
                <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.3)' }}>{task.dueDate}</span>
              )}

              {/* Delete */}
              <button onClick={() => removeTask(task.id)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(0,0,0,0.2)', fontSize: 14, lineHeight: 1,
                padding: '0 2px', transition: 'color 0.2s',
              }}
                onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(0,0,0,0.2)')}
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* Add task row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTask()}
          placeholder="Nueva tarea..."
          style={{
            flex: 1, padding: '7px 12px', borderRadius: 0, fontSize: 12,
            background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.1)',
            color: 'var(--text-primary)', outline: 'none',
          }}
        />
        <DarkSelect
          value={newPriority}
          onChange={v => setNewPriority((v || 'Media') as Priority)}
          options={[{ label: 'Alta', value: 'Alta' }, { label: 'Media', value: 'Media' }, { label: 'Baja', value: 'Baja' }]}
          style={{ width: 90 }}
        />
        <input
          type="date"
          value={newDue}
          onChange={e => setNewDue(e.target.value)}
          style={{
            padding: '7px 10px', borderRadius: 0, fontSize: 11,
            background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.1)',
            color: 'rgba(0,0,0,0.6)', outline: 'none', colorScheme: 'light',
          }}
        />
        <button
          onClick={addTask}
          disabled={!newTitle.trim()}
          style={{
            padding: '7px 16px', borderRadius: 0, fontSize: 12, fontWeight: 600,
            background: newTitle.trim() ? GOLD : 'rgba(0,0,0,0.06)',
            color: newTitle.trim() ? '#000' : 'rgba(0,0,0,0.2)',
            border: 'none', cursor: newTitle.trim() ? 'pointer' : 'default',
            transition: 'all 0.2s',
          }}
        >+ Añadir</button>
      </div>
    </div>
  );
}

// ─── CRM Lead Card ────────────────────────────────────────────────────────────

function LeadCard({
  lead, tasks, setTasks, onStatusChange, onDelete, expanded, onToggle,
}: {
  lead: Lead;
  tasks: Task[];
  setTasks: (t: Task[]) => void;
  onStatusChange: (id: string, s: CrmStatus) => void;
  onDelete: (id: string) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const myTasks = tasks.filter(t => t.leadId === lead.id);
  const done = myTasks.filter(t => t.status === 'Completada').length;
  const pct = myTasks.length === 0 ? 0 : Math.round((done / myTasks.length) * 100);

  return (
    <Card style={{ overflow: 'hidden', transition: 'box-shadow 0.2s' }}>
      {/* Header row */}
      <div
        onClick={onToggle}
        style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
      >
        {/* Classification dot */}
        <div style={{
          width: 10, height: 10, borderRadius: 999, flexShrink: 0,
          background: classColor(lead.classification),
          boxShadow: `0 0 8px ${classColor(lead.classification)}88`,
        }} />

        {/* Name + sector */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{lead.company}</div>
          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)' }}>{lead.sector} · {lead.location}</div>
        </div>

        {/* Progress mini-bar */}
        {myTasks.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
            <div style={{ width: 64, height: 3, background: 'rgba(0,0,0,0.08)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct}%`,
                background: pct === 100 ? '#34d399' : GOLD,
                borderRadius: 99, transition: 'width 0.4s ease',
              }} />
            </div>
            <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.4)', minWidth: 28, textAlign: 'right' }}>{pct}%</span>
          </div>
        )}

        {/* CRM status */}
        <DarkSelectInline
          value={lead.crmStatus}
          onChange={v => onStatusChange(lead.id, v as CrmStatus)}
          options={CRM_STATUSES}
          colorFn={statusColor}
          onClick={e => e.stopPropagation()}
        />

        {/* Badge */}
        <Badge label={lead.classification} color={classColor(lead.classification)} />

        {/* Chevron */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s', color: 'rgba(0,0,0,0.3)', flexShrink: 0,
        }}>
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '0 20px 20px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>

          {/* Score bar */}
          {lead.score > 0 && (() => { const sb = scoreBar(lead.score); return (
            <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Score Deep Research</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: sb.color }}>{lead.score}/130</span>
              </div>
              <div style={{ height: 5, background: 'rgba(0,0,0,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${sb.pct}%`, background: sb.color, borderRadius: 99, transition: 'width 0.6s ease' }} />
              </div>
            </div>
          ); })()}

          {/* Fields grid */}
          {(lead.volumen || lead.tipoResiduo || lead.empleados || lead.facturacion || lead.gastoResiduos || lead.esg || lead.cluster || lead.plantas) && (
            <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
              <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 10 }}>Datos de scoring</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                {lead.volumen && <FieldPill label="Volumen residuo" value={lead.volumen} />}
                {lead.tipoResiduo && <FieldPill label="Tipo residuo" value={lead.tipoResiduo} />}
                {lead.empleados && <FieldPill label="Empleados" value={lead.empleados} />}
                {lead.facturacion && <FieldPill label="Facturación" value={lead.facturacion} />}
                {lead.gastoResiduos && <FieldPill label="Paga gestión residuos" value={lead.gastoResiduos} />}
                {lead.esg && <FieldPill label="ESG" value={lead.esg} highlight={lead.esg !== 'No'} />}
                {lead.cluster && <FieldPill label="Cluster" value={lead.cluster} highlight={lead.cluster !== 'No'} />}
                {lead.plantas && <FieldPill label="Plantas" value={lead.plantas} />}
              </div>
            </div>
          )}

          {/* Contact */}
          {lead.contact && (
            <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
              <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Contacto</span>
              <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.7)', marginTop: 4 }}>{lead.contact}</div>
            </div>
          )}

          {/* Notes */}
          <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Notas</span>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)', marginTop: 4, whiteSpace: 'pre-wrap' }}>
              {lead.notes || <span style={{ color: 'rgba(0,0,0,0.2)', fontStyle: 'italic' }}>Sin notas</span>}
            </div>
          </div>

          {/* Tasks */}
          <TaskPanel leadId={lead.id} tasks={tasks} setTasks={setTasks} />

          {/* Delete */}
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => onDelete(lead.id)}
              style={{
                padding: '6px 14px', borderRadius: 0, fontSize: 11, cursor: 'pointer',
                background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)',
                color: '#f87171', transition: 'all 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.1)')}
            >Eliminar lead</button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Sheet Tabs ───────────────────────────────────────────────────────────────

function SheetTabs({
  sheets, activeId, onSelect, onAdd, onRename, onDelete, onColorChange,
}: {
  sheets: CrmSheet[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onColorChange: (id: string, color: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const colorInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const startEdit = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditName(currentName);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitEdit = () => {
    if (editingId && editName.trim()) onRename(editingId, editName.trim());
    setEditingId(null);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 0, borderBottom: '1px solid rgba(0,0,0,0.08)', marginBottom: 16, overflowX: 'auto' }}>
      {sheets.map(sheet => {
        const isActive = sheet.id === activeId;
        const tabColor = sheet.color ?? GOLD;
        return (
          <div
            key={sheet.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px 9px',
              borderBottom: isActive ? `2px solid ${tabColor}` : '2px solid transparent',
              background: isActive ? `${tabColor}18` : 'transparent',
              cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
              borderRadius: 0,
            }}
            onClick={() => onSelect(sheet.id)}
            onDoubleClick={e => startEdit(sheet.id, sheet.name, e)}
            title="Doble clic para renombrar"
          >
            {/* color swatch — hidden native color picker */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div
                onClick={e => { e.stopPropagation(); colorInputRefs.current[sheet.id]?.click(); }}
                title="Cambiar color"
                style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: tabColor,
                  border: '1px solid rgba(255,255,255,0.15)',
                  cursor: 'pointer', flexShrink: 0,
                }}
              />
              <input
                ref={el => { colorInputRefs.current[sheet.id] = el; }}
                type="color"
                value={tabColor}
                onChange={e => { e.stopPropagation(); onColorChange(sheet.id, e.target.value); }}
                onClick={e => e.stopPropagation()}
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                tabIndex={-1}
              />
            </div>
            {editingId === sheet.id ? (
              <input
                ref={inputRef}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null); }}
                onClick={e => e.stopPropagation()}
                style={{
                  background: 'rgba(0,0,0,0.08)', border: `1px solid ${tabColor}80`,
                  borderRadius: 0, padding: '2px 6px', fontSize: 12, color: 'var(--text-primary)',
                  width: Math.max(60, editName.length * 9), outline: 'none',
                }}
              />
            ) : (
              <span style={{ fontSize: 12, fontWeight: isActive ? 600 : 400, color: isActive ? tabColor : 'rgba(0,0,0,0.45)', whiteSpace: 'nowrap' }}>
                {sheet.name}
                <span style={{ marginLeft: 5, fontSize: 10, opacity: 0.55 }}>({sheet.leads.length})</span>
              </span>
            )}
            {sheets.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); onDelete(sheet.id); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'rgba(0,0,0,0.2)', fontSize: 13, lineHeight: 1, display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(0,0,0,0.2)'; }}
                title="Eliminar hoja"
              >×</button>
            )}
          </div>
        );
      })}
      <button
        onClick={onAdd}
        style={{ padding: '8px 14px 10px', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,0,0,0.25)', fontSize: 18, lineHeight: 1, flexShrink: 0, transition: 'color 0.15s' }}
        onMouseEnter={e => { e.currentTarget.style.color = GOLD; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(0,0,0,0.25)'; }}
        title="Nueva hoja"
      >+</button>
    </div>
  );
}

// ─── Spreadsheet Notes Editor ─────────────────────────────────────────────────

function SpreadsheetNotesEditor({ leadId, notes, onChange }: {
  leadId: string; notes: string; onChange: (id: string, notes: string) => void;
}) {
  const [value, setValue] = useState(notes);
  const [editing, setEditing] = useState(false);
  useEffect(() => { setValue(notes); }, [notes]);

  return editing ? (
    <textarea
      autoFocus
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={() => { onChange(leadId, value); setEditing(false); }}
      style={{
        width: '100%', minHeight: 80, padding: '8px 10px',
        background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,168,120,0.35)',
        borderRadius: 0, color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.6,
        resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
      }}
    />
  ) : (
    <div
      onClick={() => setEditing(true)}
      style={{
        minHeight: 40, padding: '8px 10px',
        background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: 0, cursor: 'text', fontSize: 12, color: 'rgba(0,0,0,0.6)',
        lineHeight: 1.6, whiteSpace: 'pre-wrap', transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,168,120,0.3)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; }}
    >
      {value || <span style={{ color: 'rgba(0,0,0,0.2)', fontStyle: 'italic' }}>Haz clic para añadir notas…</span>}
    </div>
  );
}

// ─── CRM Spreadsheet ──────────────────────────────────────────────────────────

type SortColCrm = 'company' | 'sector' | 'location' | 'score' | 'classification' | 'crmStatus';

function CrmSpreadsheet({
  leads, tasks, setTasks, onStatusChange, onDelete, onNotesChange, expandedId, onToggle,
  sheets, activeSheetId, onMove,
}: {
  leads: Lead[];
  tasks: Task[];
  setTasks: (t: Task[]) => void;
  onStatusChange: (id: string, s: CrmStatus) => void;
  onDelete: (id: string) => void;
  onNotesChange: (id: string, notes: string) => void;
  expandedId: string | null;
  onToggle: (id: string) => void;
  sheets: CrmSheet[];
  activeSheetId: string;
  onMove: (leadId: string, targetSheetId: string) => void;
}) {
  const [sortCol, setSortCol] = useState<SortColCrm>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [moveMenuOpen, setMoveMenuOpen] = useState<string | null>(null);
  const [crmFilter, setCrmFilter] = useState<CrmStatus | 'Todos'>('Todos');

  const handleSort = (col: SortColCrm) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const filtered = crmFilter === 'Todos' ? leads : leads.filter(l => l.crmStatus === crmFilter);
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortCol === 'company') cmp = a.company.localeCompare(b.company);
    else if (sortCol === 'sector') cmp = a.sector.localeCompare(b.sector);
    else if (sortCol === 'location') cmp = a.location.localeCompare(b.location);
    else if (sortCol === 'score') cmp = a.score - b.score;
    else if (sortCol === 'classification') cmp = a.classification.localeCompare(b.classification);
    else if (sortCol === 'crmStatus') cmp = a.crmStatus.localeCompare(b.crmStatus);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  if (leads.length === 0) {
    return (
      <Card style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.25)' }}>
          Aún no hay leads en esta hoja. Usa el Buscador para añadir empresas.
        </div>
      </Card>
    );
  }

  const ColHeader = ({ label, col }: { label: string; col: SortColCrm }) => (
    <th
      onClick={() => handleSort(col)}
      style={{
        padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.1em',
        color: sortCol === col ? GOLD : 'rgba(0,0,0,0.35)',
        cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none', transition: 'color 0.15s',
        background: 'rgba(0,0,0,0.03)', borderBottom: '1px solid rgba(0,0,0,0.08)',
      }}
    >
      {label}
      <span style={{ marginLeft: 4, opacity: sortCol === col ? 1 : 0.2, fontSize: 9 }}>
        {sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : '▲'}
      </span>
    </th>
  );

  const StaticTh = ({ label, center }: { label: string; center?: boolean }) => (
    <th style={{
      padding: '10px 12px', textAlign: center ? 'center' : 'left', fontSize: 10, fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(0,0,0,0.35)',
      whiteSpace: 'nowrap', background: 'rgba(0,0,0,0.03)', borderBottom: '1px solid rgba(0,0,0,0.08)',
    }}>
      {label}
    </th>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        {(['Todos', ...CRM_STATUSES] as (CrmStatus | 'Todos')[]).map(s => (
          <button
            key={s}
            onClick={() => setCrmFilter(s)}
            style={{
              padding: '5px 14px', borderRadius: 0, fontSize: 11, fontWeight: 500, cursor: 'pointer',
              background: crmFilter === s ? (s === 'Todos' ? GOLD : statusColor(s as CrmStatus)) + '20' : 'rgba(0,0,0,0.04)',
              border: `1px solid ${crmFilter === s ? (s === 'Todos' ? GOLD : statusColor(s as CrmStatus)) + '50' : 'rgba(0,0,0,0.08)'}`,
              color: crmFilter === s ? (s === 'Todos' ? GOLD : statusColor(s as CrmStatus)) : 'rgba(0,0,0,0.4)',
              transition: 'all 0.15s',
            }}
          >
            {s}{s !== 'Todos' && ` · ${leads.filter(l => l.crmStatus === s).length}`}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(0,0,0,0.2)' }}>
          {sorted.length} empresa{sorted.length !== 1 ? 's' : ''}
        </span>
      </div>

      {sorted.length === 0 ? (
        <Card style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.25)' }}>Sin leads con este filtro.</div>
        </Card>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 0, border: '1px solid rgba(0,0,0,0.08)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto', minWidth: 920 }}>
            <thead>
              <tr>
                <th style={{ width: 4, padding: 0, background: 'rgba(0,0,0,0.03)', borderBottom: '1px solid rgba(0,0,0,0.08)' }} />
                <th style={{ width: 36, padding: '10px 8px', textAlign: 'center', fontSize: 10, color: 'rgba(0,0,0,0.2)', background: 'rgba(0,0,0,0.03)', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>#</th>
                <ColHeader label="Empresa" col="company" />
                <ColHeader label="Sector" col="sector" />
                <ColHeader label="Ubicación" col="location" />
                <StaticTh label="Volumen" />
                <ColHeader label="Score" col="score" />
                <ColHeader label="Clasificación" col="classification" />
                <ColHeader label="Estado" col="crmStatus" />
                <StaticTh label="Tareas" center />
                <StaticTh label="Notas" />
                <th style={{ width: 44, background: 'rgba(0,0,0,0.03)', borderBottom: '1px solid rgba(0,0,0,0.08)' }} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((lead, idx) => {
                const isExpanded = expandedId === lead.id;
                const myTasks = tasks.filter(t => t.leadId === lead.id);
                const doneTasks = myTasks.filter(t => t.status === 'Completada').length;
                const clr = classColor(lead.classification);
                const sb = scoreBar(lead.score);
                const rowBorder = isExpanded ? 'none' : '1px solid rgba(0,0,0,0.05)';
                return (
                  <Fragment key={lead.id}>
                    <tr
                      onClick={() => onToggle(lead.id)}
                      style={{ cursor: 'pointer', background: isExpanded ? `${GOLD}08` : 'transparent', transition: 'background 0.15s' }}
                      onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(0,0,0,0.025)'; }}
                      onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ width: 4, padding: 0, background: clr, borderBottom: rowBorder }} />
                      <td style={{ padding: '11px 8px', textAlign: 'center', fontSize: 11, color: 'rgba(0,0,0,0.2)', borderBottom: rowBorder }}>{idx + 1}</td>
                      <td style={{ padding: '11px 12px', borderBottom: rowBorder, minWidth: 160 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{lead.company}</div>
                      </td>
                      <td style={{ padding: '11px 12px', fontSize: 12, color: 'rgba(0,0,0,0.5)', borderBottom: rowBorder, whiteSpace: 'nowrap' }}>{lead.sector || '—'}</td>
                      <td style={{ padding: '11px 12px', fontSize: 12, color: 'rgba(0,0,0,0.5)', borderBottom: rowBorder, whiteSpace: 'nowrap' }}>{lead.location || '—'}</td>
                      <td style={{ padding: '11px 12px', fontSize: 12, color: 'rgba(0,0,0,0.5)', borderBottom: rowBorder, whiteSpace: 'nowrap' }}>{lead.volumen || '—'}</td>
                      <td style={{ padding: '11px 12px', borderBottom: rowBorder, whiteSpace: 'nowrap' }}>
                        {lead.score > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 54, height: 4, background: 'rgba(0,0,0,0.08)', borderRadius: 99, overflow: 'hidden', flexShrink: 0 }}>
                              <div style={{ height: '100%', width: `${sb.pct}%`, background: sb.color, borderRadius: 99 }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: sb.color, minWidth: 26 }}>{lead.score}</span>
                          </div>
                        ) : <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.15)' }}>—</span>}
                      </td>
                      <td style={{ padding: '11px 12px', borderBottom: rowBorder, whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 0,
                          fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', color: clr,
                          background: clr + '18', border: `1px solid ${clr}30`,
                        }}>
                          {lead.classification === 'PRIORIDAD ALTA' ? '🔥 PRIORIDAD'
                            : lead.classification === 'CANDIDATO VÁLIDO' ? '✅ CANDIDATO'
                            : lead.classification === 'SEGUIMIENTO' ? '🔄 SEGUIMIENTO'
                            : '❌ DESCARTAR'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 12px', borderBottom: rowBorder }} onClick={e => e.stopPropagation()}>
                        <DarkSelectInline
                          value={lead.crmStatus}
                          onChange={v => onStatusChange(lead.id, v as CrmStatus)}
                          options={CRM_STATUSES}
                          colorFn={statusColor}
                        />
                      </td>
                      <td style={{ padding: '11px 12px', textAlign: 'center', borderBottom: rowBorder }}>
                        {myTasks.length > 0
                          ? <span style={{ fontSize: 11, color: doneTasks === myTasks.length ? '#34d399' : 'rgba(0,0,0,0.4)' }}>{doneTasks}/{myTasks.length}</span>
                          : <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.15)' }}>—</span>}
                      </td>
                      <td style={{ padding: '11px 12px', borderBottom: rowBorder, maxWidth: 200 }}>
                        <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                          {lead.notes || <span style={{ fontStyle: 'italic', color: 'rgba(0,0,0,0.15)' }}>—</span>}
                        </div>
                      </td>
                      <td style={{ padding: '11px 10px', textAlign: 'center', borderBottom: rowBorder }}>
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'rgba(0,0,0,0.25)', display: 'block', margin: '0 auto' }}>
                          <path d="M2.5 4.5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={12} style={{ padding: 0, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                          <div style={{ padding: '20px 24px 24px', background: `${clr}06`, borderLeft: `3px solid ${clr}` }}>
                            {lead.score > 0 && (
                              <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                  <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Score Deep Research</span>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: sb.color }}>{lead.score}/130</span>
                                </div>
                                <div style={{ height: 5, background: 'rgba(0,0,0,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${sb.pct}%`, background: sb.color, borderRadius: 99, transition: 'width 0.6s ease' }} />
                                </div>
                              </div>
                            )}
                            {(lead.volumen || lead.tipoResiduo || lead.empleados || lead.facturacion || lead.gastoResiduos || lead.esg || lead.cluster || lead.plantas) && (
                              <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>Datos de scoring</span>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                                  {lead.volumen && <FieldPill label="Volumen residuo" value={lead.volumen} />}
                                  {lead.tipoResiduo && <FieldPill label="Tipo residuo" value={lead.tipoResiduo} />}
                                  {lead.empleados && <FieldPill label="Empleados" value={lead.empleados} />}
                                  {lead.facturacion && <FieldPill label="Facturación" value={lead.facturacion} />}
                                  {lead.gastoResiduos && <FieldPill label="Paga gestión residuos" value={lead.gastoResiduos} />}
                                  {lead.esg && <FieldPill label="ESG" value={lead.esg} highlight={lead.esg !== 'No'} />}
                                  {lead.cluster && <FieldPill label="Cluster" value={lead.cluster} highlight={lead.cluster !== 'No'} />}
                                  {lead.plantas && <FieldPill label="Plantas" value={lead.plantas} />}
                                </div>
                              </div>
                            )}
                            {lead.contact && (
                              <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 4 }}>Contacto</span>
                                <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.7)' }}>{lead.contact}</div>
                              </div>
                            )}
                            <div style={{ marginBottom: 16 }}>
                              <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Notas</span>
                              <SpreadsheetNotesEditor leadId={lead.id} notes={lead.notes} onChange={onNotesChange} />
                            </div>
                            <TaskPanel leadId={lead.id} tasks={tasks} setTasks={setTasks} />
                            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
                              {sheets.length > 1 && (
                                <div style={{ position: 'relative' }}>
                                  <button
                                    onClick={e => { e.stopPropagation(); setMoveMenuOpen(moveMenuOpen === lead.id ? null : lead.id); }}
                                    style={{ padding: '6px 14px', borderRadius: 0, fontSize: 11, cursor: 'pointer', background: 'rgba(0,168,120,0.1)', border: '1px solid rgba(0,168,120,0.25)', color: '#00a878', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 5 }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,168,120,0.2)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,168,120,0.1)')}
                                  >
                                    <svg width="11" height="11" viewBox="0 0 15 15" fill="none"><path d="M1 7.5h13M8.5 2l5.5 5.5-5.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    Mover a hoja
                                  </button>
                                  {moveMenuOpen === lead.id && (
                                    <div
                                      onClick={e => e.stopPropagation()}
                                      style={{ position: 'absolute', bottom: '110%', right: 0, background: '#1a1a1a', border: '1px solid rgba(0,168,120,0.25)', borderRadius: 0, padding: '4px 0', minWidth: 160, zIndex: 100, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}
                                    >
                                      {sheets.filter(s => s.id !== activeSheetId).map(s => (
                                        <button
                                          key={s.id}
                                          onClick={e => { e.stopPropagation(); onMove(lead.id, s.id); setMoveMenuOpen(null); }}
                                          style={{ width: '100%', padding: '7px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.75)', textAlign: 'left', transition: 'background 0.15s' }}
                                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,168,120,0.12)')}
                                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                                        >{s.name}</button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                              <button
                                onClick={e => { e.stopPropagation(); onDelete(lead.id); }}
                                style={{ padding: '6px 14px', borderRadius: 0, fontSize: 11, cursor: 'pointer', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', transition: 'all 0.2s' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.2)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.1)')}
                              >Eliminar lead</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Buscador data ────────────────────────────────────────────────────────────

const CONTINENT_DATA = [
  { id: 'europa',         label: 'Europa',          flag: '🇪🇺', color: '#3b82f6', countries: ['España','Portugal','Francia','Italia','Alemania','Bélgica','Países Bajos','Polonia','Suecia','Dinamarca','Austria','Irlanda','Finlandia','Suiza','Noruega','Rumanía','Hungría'] },
  { id: 'america-latina', label: 'América Latina',  flag: '🇧🇷', color: '#10b981', countries: ['México','Colombia','Chile','Argentina','Brasil','Perú','Ecuador','Uruguay','Costa Rica','Paraguay','Bolivia'] },
  { id: 'america-norte',  label: 'Norteamérica',    flag: '🇺🇸', color: '#6366f1', countries: ['Estados Unidos','Canadá'] },
  { id: 'asia',           label: 'Asia',             flag: '🇯🇵', color: '#f59e0b', countries: ['China','India','Japón','Corea del Sur','Singapur','Tailandia','Vietnam','Indonesia','Malasia','Filipinas'] },
  { id: 'africa',         label: 'África',           flag: '🇿🇦', color: '#ef4444', countries: ['Marruecos','Sudáfrica','Nigeria','Egipto','Kenia','Ghana','Senegal'] },
  { id: 'oriente-medio',  label: 'Oriente Medio',   flag: '🇦🇪', color: '#8b5cf6', countries: ['Emiratos Árabes','Arabia Saudí','Israel','Turquía','Qatar','Kuwait','Omán'] },
] as const;

const SECTOR_DATA = [
  { id: 'Agroalimentario',        label: 'Agroalimentario',     pts: 20 },
  { id: 'Ganadero',               label: 'Ganadero',            pts: 20 },
  { id: 'Bodega / Oleícola',      label: 'Bodega / Oleícola',   pts: 20 },
  { id: 'Residuos urbanos',       label: 'Residuos urbanos',    pts: 15 },
  { id: 'Energético',             label: 'Energético',          pts: 15 },
  { id: 'Venture Capital',        label: 'Venture Capital',     pts: 15 },
  { id: 'Hostelería industrial',  label: 'Hostelería industrial',pts: 10 },
  { id: 'Industria alimentaria',  label: 'Industria alimentaria',pts: 10 },
  { id: 'Logística',              label: 'Logística',           pts: 5  },
  { id: 'Otros orgánicos',        label: 'Otros orgánicos',     pts: 5  },
];

// ─── Buscador ─────────────────────────────────────────────────────────────────

function Buscador({ onAddTocrm }: { onAddTocrm: (c: Company) => void }) {
  const [continent, setContinent] = useState('');
  const [country, setCountry] = useState('');
  const [sector, setSector] = useState('');
  const [zone, setZone] = useState('');
  const [results, setResults] = useState<Company[]>([]);
  const [streamText, setStreamText] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<SearchRecord[]>(() => loadSearches());
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selectedContinent = CONTINENT_DATA.find(c => c.id === continent);
  const canSearch = !!(continent || country || sector || zone.trim());

  const handleContinentClick = (id: string) => {
    if (continent === id) { setContinent(''); setCountry(''); }
    else { setContinent(id); setCountry(''); }
  };

  const buildPrompt = () => {
    if (sector === 'Venture Capital') {
      const vcLines: string[] = [
        `Eres el motor Deep Research del S-NFI CRM. Busca fondos de Venture Capital e inversores institucionales para invertir en S-NFI y adquirir hasta un 5% del capital (valoración mínima S-NFI: 70M€).`,
        ``,
        `CRITERIO CENTRAL: fondos con historial demostrable en tecnología (cleantech, deep-tech, infraestructura industrial, energía, sostenibilidad). Residuo orgánico NO es requisito; capacidad inversora y alineación tecnológica SÍ.`,
        ``,
        `FILTROS DUROS (excluir si no cumple):`,
        `- Portfolio activo en tecnología (cleantech / deep-tech / industria / energía / sostenibilidad)`,
        `- Capacidad ticket mínimo ≥ 70M€`,
        `- Capacidad de inversión ≥ 500M€/año (AUM o deployment anual demostrable)`,
        `- Inversión B2B / industrial (excluir consumer, gaming, media puros)`,
        ``,
      ];
      if (country) vcLines.push(`País objetivo: ${country}.`);
      else if (selectedContinent) vcLines.push(`Continente objetivo: ${selectedContinent.label}.`);
      if (zone) vcLines.push(`Zona específica: ${zone}.`);
      vcLines.push(
        ``,
        `SCORE por fondo (0-100 base + 30 bonificadores):`,
        `- Foco tecnológico (30pts): Cleantech/deep-tech/industrial puro=30 | Mixto con tech relevante=20 | Tech generalista=10`,
        `- Capacidad ticket / AUM (25pts): >1.000M€/año=25 | 500-1.000M€/año=20 | exactamente 500M€/año=10`,
        `- ESG / sostenibilidad (20pts): Mandato ESG explícito o fondo verde certificado=20 | Menciones ESG=10 | Sin señales=0`,
        `- Alineación geográfica (15pts): España/Portugal=15 | Europa=10 | Global con presencia UE=5`,
        `- Etapa inversión (10pts): Growth/Series B+=10 | Series A=5 | Seed puro=0`,
        `- Bonificadores: +10 bioenergía/biometanización en portfolio | +10 LP industriales (utilities/oil&gas/agroalimentario) | +5 fondo impacto o Taxonomía Verde | +5 socio con presencia en España`,
        ``,
        `Clasificacion: 85-130=PRIORIDAD ALTA | 65-84=CANDIDATO VALIDO | 40-64=SEGUIMIENTO | 0-39=DESCARTAR`,
        ``,
        `Formato exacto por fondo (sin markdown):`,
        `---`,
        `EMPRESA: nombre oficial del fondo`,
        `SECTOR: Venture Capital`,
        `UBICACION: ciudad sede, país`,
        `VOLUMEN RESIDUO: N/A`,
        `TIPO RESIDUO: N/A`,
        `EMPLEADOS: profesionales del fondo`,
        `FACTURACION: AUM estimados`,
        `GASTO GESTION RESIDUOS: N/A`,
        `CERTIFICACIONES ESG: Si (cuales) / No`,
        `CLUSTER: Si (ASCRI, Invest Europe, etc.) / No`,
        `PLANTAS: N/A`,
        `FUENTE: web / LinkedIn / Crunchbase / PitchBook`,
        `SCORE: numero entero`,
        `CLASIFICACION: PRIORIDAD ALTA o CANDIDATO VALIDO o SEGUIMIENTO o DESCARTAR`,
        `CONTACTO: socio o director de inversiones, cargo, email o LinkedIn si disponible`,
        `RAZON: por qué este fondo encaja con S-NFI y puede participar en el 5%`,
        `---`,
        ``,
        `Devuelve 5-8 fondos reales verificables. Campos sin datos públicos: No disponible`,
      );
      return vcLines.join('\n');
    }

    const lines: string[] = [
      `Eres el motor Deep Research del S-NFI CRM de South Navarre Fresh Innovations. Busca empresas candidatas para integrar tecnología de biometanización modular in-situ.`,
      ``,
      `FILTROS DUROS (si no cumple alguno, no incluir):`,
      `- Volumen residuo orgánico ≥ 8 T/año`,
      `- Residuo 100% orgánico (excluir plástico, metal, químico, mixto)`,
      `- Modelo B2B`,
      ``,
    ];
    if (country) lines.push(`País objetivo: ${country}.`);
    else if (selectedContinent) lines.push(`Continente objetivo: ${selectedContinent.label}. Busca en todos sus países.`);
    if (sector) lines.push(`Sector objetivo: ${sector}.`);
    if (zone) lines.push(`Zona/región específica: ${zone}.`);
    lines.push(
      ``,
      `Para cada empresa, calcula el SCORE (0-100 puntos base + hasta 30 bonificadores):`,
      `- Sector (20pts): Agroalimentario/ganadero/bodega/oleícola=20 | Residuos urbanos/municipal=15 | Energético (utilities, oil&gas, biomasa: Repsol, Iberdrola, Endesa...)=15 | Venture Capital (fondos cleantech/deep-tech/infraestructura industrial alineados con S-NFI, capaces de adquirir 5% con valor mínimo 70M€)=15 | Hostelería industrial=10 | Otros=5`,
      `- Volumen residuo (20pts): +500T=20 | 100-500T=15 | 30-100T=10 | 8-30T=5`,
      `- Gasto gestión residuos (15pts): Pagan retirada=15 | Gestión interna=8 | Desconocido=0`,
      `- Perfil ESG (15pts): Certificaciones publicadas=15 | Menciones web=8 | Sin señales=0`,
      `- Ubicación (15pts): Navarra/PV/Aragón=15 | Cataluña/LaRioja/CyL=10 | Resto España=5 | Resto UE=3 | Fuera UE=1`,
      `- Tamaño (15pts): +50 empleados o >5M€=15 | 20-50 emp=10 | 10-20 emp=5 | <10 emp=0`,
      `- Bonificadores: +10 si cluster/asociación | +10 si fondos públicos IDAE/NextGen | +5 si >1 planta | +5 si experiencia cleantech`,
      ``,
      `Clasificacion segun score: 85-130=PRIORIDAD ALTA | 65-84=CANDIDATO VALIDO | 40-64=SEGUIMIENTO | 0-39=DESCARTAR`,
      ``,
      `Para cada empresa devuelve EXACTAMENTE este formato plano (sin markdown, sin asteriscos, sin negritas):`,
      `---`,
      `EMPRESA: nombre oficial`,
      `SECTOR: sector especifico`,
      `UBICACION: ciudad, provincia, pais`,
      `VOLUMEN RESIDUO: T/año estimadas`,
      `TIPO RESIDUO: descripcion concreta`,
      `EMPLEADOS: numero estimado`,
      `FACTURACION: estimada en euros`,
      `GASTO GESTION RESIDUOS: Si / No / Desconocido`,
      `CERTIFICACIONES ESG: Si (cuales) / No`,
      `CLUSTER: Si (cual) / No`,
      `PLANTAS: numero de instalaciones`,
      `FUENTE: web / LinkedIn / registro mercantil`,
      `SCORE: numero entero`,
      `CLASIFICACION: PRIORIDAD ALTA o CANDIDATO VALIDO o SEGUIMIENTO o DESCARTAR`,
      `CONTACTO: nombre, cargo, email si disponible`,
      `RAZON: una frase explicando compatibilidad con S-NFI`,
      `---`,
      ``,
      `Devuelve entre 5 y 8 empresas reales. Si no hay datos publicos de un campo, escribe: No disponible`,
    );
    return lines.join('\n');
  };

  const handleSearch = () => {
    if (!canSearch || loading) return;
    setLoading(true);
    setStreamText('');
    setResults([]);
    setSearchError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    let full = '';
    const searchLabel = [selectedContinent?.label, country, sector, zone].filter(Boolean).join(' · ');
    streamChat('captador', [{ role: 'user', content: buildPrompt() }], controller.signal, {
      onChunk: t => { full += t; setStreamText(full); },
      onDone: () => {
        const companies = parseCompanies(full);
        setResults(companies);
        setLoading(false);
        if (companies.length === 0 && full.trim()) {
          setSearchError('El modelo respondió pero no se pudieron extraer empresas. Prueba de nuevo.');
        }
        if (companies.length > 0) {
          const record: SearchRecord = {
            id: uid(),
            label: searchLabel,
            companies,
            createdAt: new Date().toISOString(),
          };
          setSearchHistory(prev => {
            const updated = [record, ...prev].slice(0, 20);
            saveSearches(updated);
            return updated;
          });
        }
      },
      onError: (msg) => { setLoading(false); setSearchError(msg || 'Error al conectar con el agente.'); },
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Step 1: Continente ── */}
      <Card style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{
            width: 18, height: 18, borderRadius: 0, background: continent ? GOLD : 'rgba(0,0,0,0.08)',
            border: `1px solid ${continent ? GOLD + '60' : 'rgba(0,0,0,0.15)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800, color: continent ? '#fff' : 'rgba(0,0,0,0.4)',
            flexShrink: 0, transition: 'all 0.2s',
          }}>1</div>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Continente</span>
          {selectedContinent && (
            <span style={{ fontSize: 11, color: selectedContinent.color, marginLeft: 4 }}>
              {selectedContinent.flag} {selectedContinent.label}
            </span>
          )}
          {continent && (
            <button onClick={() => { setContinent(''); setCountry(''); }}
              style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(0,0,0,0.3)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Limpiar
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {CONTINENT_DATA.map(c => {
            const active = continent === c.id;
            return (
              <button
                key={c.id}
                onClick={() => handleContinentClick(c.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 12px', borderRadius: 0, cursor: 'pointer', textAlign: 'left',
                  background: active ? c.color + '20' : 'rgba(0,0,0,0.03)',
                  border: `1px solid ${active ? c.color + '60' : 'rgba(0,0,0,0.07)'}`,
                  transition: 'all 0.18s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; }}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>{c.flag}</span>
                <span style={{ fontSize: 11, fontWeight: active ? 700 : 400, color: active ? c.color : 'rgba(0,0,0,0.65)', letterSpacing: '-0.01em' }}>{c.label}</span>
                {active && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    <path d="M3.5 6l2 2 3-3" stroke={c.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* ── Step 2: País ── */}
      {selectedContinent && (
        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{
              width: 18, height: 18, borderRadius: 0, background: country ? GOLD : 'rgba(0,0,0,0.08)',
              border: `1px solid ${country ? GOLD + '60' : 'rgba(0,0,0,0.15)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 800, color: country ? '#fff' : 'rgba(0,0,0,0.4)',
              flexShrink: 0, transition: 'all 0.2s',
            }}>2</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>País</span>
            <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.3)' }}>— {selectedContinent.label}</span>
            {country && (
              <button onClick={() => setCountry('')}
                style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(0,0,0,0.3)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Limpiar
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(selectedContinent.countries as readonly string[]).map(c => {
              const active = country === c;
              return (
                <button
                  key={c}
                  onClick={() => setCountry(active ? '' : c)}
                  style={{
                    padding: '5px 12px', borderRadius: 0, fontSize: 11, cursor: 'pointer',
                    background: active ? selectedContinent.color + '25' : 'rgba(0,0,0,0.04)',
                    border: `1px solid ${active ? selectedContinent.color + '70' : 'rgba(0,0,0,0.09)'}`,
                    color: active ? selectedContinent.color : 'rgba(0,0,0,0.65)',
                    fontWeight: active ? 700 : 400,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(0,0,0,0.08)'; e.currentTarget.style.color = '#fff'; } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = 'rgba(0,0,0,0.65)'; } }}
                >{c}</button>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Step 3: Sector ── */}
      <Card style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{
            width: 18, height: 18, borderRadius: 0, background: sector ? GOLD : 'rgba(0,0,0,0.08)',
            border: `1px solid ${sector ? GOLD + '60' : 'rgba(0,0,0,0.15)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800, color: sector ? '#fff' : 'rgba(0,0,0,0.4)',
            flexShrink: 0, transition: 'all 0.2s',
          }}>{selectedContinent ? '3' : '2'}</div>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Sector</span>
          {sector && (
            <button onClick={() => setSector('')}
              style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(0,0,0,0.3)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Limpiar
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
          {SECTOR_DATA.map(s => {
            const active = sector === s.id;
            const ptsColor = s.pts === 20 ? '#34d399' : s.pts === 15 ? '#60a5fa' : s.pts === 10 ? '#fbbf24' : '#94a3b8';
            return (
              <button
                key={s.id}
                onClick={() => setSector(active ? '' : s.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 10px', borderRadius: 0, cursor: 'pointer', textAlign: 'left',
                  background: active ? GOLD + '18' : 'rgba(0,0,0,0.03)',
                  border: `1px solid ${active ? GOLD + '55' : 'rgba(0,0,0,0.07)'}`,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; }}
              >
                <span style={{ fontSize: 12, color: active ? GOLD : 'rgba(0,0,0,0.7)', fontWeight: active ? 700 : 400 }}>{s.label}</span>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
                  padding: '2px 7px', borderRadius: 0,
                  background: ptsColor + '18', color: ptsColor,
                  border: `1px solid ${ptsColor}30`, flexShrink: 0, marginLeft: 8,
                }}>{s.pts}pts</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* ── Zona libre + Buscar ── */}
      <Card style={{ padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.35)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Zona / región libre (opcional)
            </div>
            <input
              value={zone}
              onChange={e => setZone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Ej: Navarra, Cataluña, Valle del Ebro..."
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 0, fontSize: 12,
                background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.1)',
                color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Summary chips */}
          {(continent || sector) && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', flex: 1, minWidth: 160 }}>
              {selectedContinent && (
                <span style={{ padding: '4px 10px', borderRadius: 0, fontSize: 11, fontWeight: 600, background: selectedContinent.color + '20', color: selectedContinent.color, border: `1px solid ${selectedContinent.color}35` }}>
                  {selectedContinent.flag} {country || selectedContinent.label}
                </span>
              )}
              {sector && (
                <span style={{ padding: '4px 10px', borderRadius: 0, fontSize: 11, fontWeight: 600, background: GOLD + '18', color: GOLD, border: `1px solid ${GOLD}35` }}>
                  {sector}
                </span>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSearch}
              disabled={!canSearch || loading}
              style={{
                padding: '8px 22px', borderRadius: 0, fontSize: 12, fontWeight: 600,
                cursor: canSearch && !loading ? 'pointer' : 'default',
                background: canSearch && !loading ? GOLD : 'rgba(0,0,0,0.06)',
                color: canSearch && !loading ? '#000' : 'rgba(0,0,0,0.2)',
                border: 'none', transition: 'all 0.2s', whiteSpace: 'nowrap',
              }}
            >{loading ? 'Buscando...' : 'Buscar empresas'}</button>
            {loading && (
              <button
                onClick={() => { abortRef.current?.abort(); setLoading(false); }}
                style={{
                  padding: '8px 16px', borderRadius: 0, fontSize: 12, cursor: 'pointer',
                  background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.2)',
                  color: '#f87171', whiteSpace: 'nowrap',
                }}
              >Detener</button>
            )}
          </div>
        </div>
      </Card>

      {/* Stream preview */}
      {loading && streamText && (
        <Card style={{ padding: 20 }}>
          <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Procesando resultados...</div>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'rgba(0,0,0,0.5)',
            whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'hidden',
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 60%, transparent)',
          }}>{streamText}</div>
        </Card>
      )}

      {/* Error */}
      {searchError && (
        <div style={{
          padding: '10px 14px', borderRadius: 0, fontSize: 12,
          background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
          color: '#f87171', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ flexShrink: 0 }}>⚠</span>
          <span>{searchError}</span>
          <button onClick={() => setSearchError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {results.length} empresa{results.length !== 1 ? 's' : ''} encontrada{results.length !== 1 ? 's' : ''} — búsqueda actual
          </div>
          {results.map(c => {
            const sb = scoreBar(c.score);
            return (
            <Card key={c.id} style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{c.name}</span>
                    <Badge label={c.classification} color={classColor(c.classification)} />
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', marginBottom: 10 }}>{c.sector} · {c.location}</div>

                  {/* Score bar */}
                  {c.score > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Score</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: sb.color }}>{c.score}/130</span>
                      </div>
                      <div style={{ height: 4, background: 'rgba(0,0,0,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${sb.pct}%`, background: sb.color, borderRadius: 99, transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                  )}

                  {/* Key fields grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 10 }}>
                    {c.volumen && <FieldPill label="Volumen residuo" value={c.volumen} />}
                    {c.tipoResiduo && <FieldPill label="Tipo residuo" value={c.tipoResiduo} />}
                    {c.empleados && <FieldPill label="Empleados" value={c.empleados} />}
                    {c.facturacion && <FieldPill label="Facturación" value={c.facturacion} />}
                    {c.gastoResiduos && <FieldPill label="Paga gestión" value={c.gastoResiduos} />}
                    {c.esg && c.esg !== 'No' && <FieldPill label="ESG" value={c.esg} highlight />}
                    {c.cluster && c.cluster !== 'No' && <FieldPill label="Cluster" value={c.cluster} highlight />}
                    {c.plantas && <FieldPill label="Plantas" value={c.plantas} />}
                  </div>

                  {c.reason && <div style={{ fontSize: 11, color: GOLD + 'cc', fontStyle: 'italic', marginBottom: 6 }}>{c.reason}</div>}
                  {c.contact && <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)' }}>Contacto: {c.contact}</div>}
                </div>
                <button
                  onClick={() => onAddTocrm(c)}
                  style={{
                    padding: '8px 16px', borderRadius: 0, fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                    background: 'rgba(0,168,120,0.12)', border: `1px solid ${GOLD}40`, color: GOLD,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,168,120,0.22)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,168,120,0.12)')}
                >+ CRM</button>
              </div>
            </Card>
            );
          })}
        </div>
      )}

      {/* Search history */}
      {searchHistory.filter(r => results.length === 0 || r.id !== searchHistory[0]?.id).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.25)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Búsquedas anteriores · {searchHistory.length}
            </div>
            <button
              onClick={() => { saveSearches([]); setSearchHistory([]); }}
              style={{ fontSize: 9, color: 'rgba(248,113,113,0.5)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, letterSpacing: '0.06em' }}
            >limpiar historial</button>
          </div>
          {searchHistory.map(record => (
            <Card key={record.id} style={{ overflow: 'hidden' }}>
              <button
                onClick={() => setExpandedHistory(expandedHistory === record.id ? null : record.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', flex: 1 }}>{record.label}</span>
                <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.25)' }}>
                  {record.companies.length} empresa{record.companies.length !== 1 ? 's' : ''} · {new Date(record.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} {new Date(record.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: 0.3, transform: expandedHistory === record.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {expandedHistory === record.id && (
                <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {record.companies.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid rgba(0,0,0,0.03)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</span>
                          <Badge label={c.classification} color={classColor(c.classification)} />
                        </div>
                        <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.35)' }}>{c.sector} · {c.location}</div>
                      </div>
                      <button
                        onClick={() => onAddTocrm(c)}
                        style={{
                          padding: '6px 12px', borderRadius: 0, fontSize: 10, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                          background: 'rgba(0,168,120,0.1)', border: `1px solid ${GOLD}30`, color: GOLD,
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,168,120,0.2)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,168,120,0.1)')}
                      >+ CRM</button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Panel Overview ───────────────────────────────────────────────────────────

// ─── LI Contacts ─────────────────────────────────────────────────────────────

function LiContacts() {
  const [query, setQuery] = useState('');
  const [profileFilter, setProfileFilter] = useState<'Todos' | LiProfileType>('Todos');
  const [results, setResults] = useState<LiContact[]>([]);
  const [savedContacts, setSavedContacts] = useState<LiContact[]>(() => loadLiContacts());
  const [streamText, setStreamText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [liSearchHistory, setLiSearchHistory] = useState<LiSearchRecord[]>(() => loadLiSearches());
  const [expandedLiHistory, setExpandedLiHistory] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [subTab, setSubTab] = useState<'li' | 'finder'>('li');
  const [finderName, setFinderName] = useState('');
  const [finderHint, setFinderHint] = useState('');
  const [finderResults, setFinderResults] = useState<FinderResult[]>([]);
  const [savedFinder, setSavedFinder] = useState<FinderResult[]>(() => loadFinder());
  const [finderStream, setFinderStream] = useState('');
  const [finderLoading, setFinderLoading] = useState(false);
  const [finderError, setFinderError] = useState<string | null>(null);
  const [finderCopiedId, setFinderCopiedId] = useState<string | null>(null);
  const [finderLiExpanded, setFinderLiExpanded] = useState(true);
  const finderAbortRef = useRef<AbortController | null>(null);

  const canSearch = query.trim().length >= 2 && !loading;

  const buildPrompt = () => {
    const lines: string[] = [
      `Eres el investigador de contactos de LinkedIn del S-NFI CRM de South Navarre Fresh Innovations.`,
      `Tu misión: identificar los perfiles más relevantes para una primera toma de contacto de S-NFI.`,
      ``,
      `S-NFI Corp. es una empresa deep-tech española de infraestructura modular de biometanización (OEM industrial). Busca contactar con:`,
      `- Socios de Venture Capital y family offices con foco en deep-tech, cleantech o infraestructura industrial`,
      `- Profesionales de Capital Markets, banca de inversión y financiación de proyectos`,
      `- Directivos con poder de decisión: CEO, CFO, CTO, Director de Sostenibilidad, COO`,
      `- Head of M&A en sectores de semiconductores o automoción (estrategia de adquisición de activos deep-tech)`,
      `- Corporate Venture Capital (CVC) Manager de grandes industriales: ASML, Infineon, Bosch, Airbus, Siemens u otras`,
      `- Chief Strategy Officer (CSO) de medianas empresas industriales alemanas o del norte de Europa (Mittelstand)`,
      `- Responsables de innovación, transformación o compras en grandes industriales`,
      ``,
      `Empresa a investigar: ${query.trim()}`,
    ];
    if (profileFilter !== 'Todos') {
      lines.push(`Prioriza perfiles de tipo: ${profileFilter}`);
    }
    lines.push(
      ``,
      `Devuelve entre 5 y 8 perfiles reales o altamente probables. Formato EXACTO sin markdown ni asteriscos:`,
      `---`,
      `NOMBRE: Nombre Apellido`,
      `CARGO: título exacto en LinkedIn`,
      `EMPRESA: empresa actual`,
      `LINKEDIN: linkedin.com/in/slug-probable`,
      `EMAIL: email o patrón probable (ej: nombre@empresa.com), o No disponible`,
      `METODO: LinkedIn / Email / Ambos`,
      `RELEVANCIA: por qué es clave para S-NFI en una frase`,
      `PERFIL: VC / Capital Markets / Directivo / Inversor / M&A / CVC / CSO / Otro`,
      `---`,
      ``,
      `Si la empresa no es conocida o no tienes datos fiables, indícalo brevemente antes del primer bloque.`,
    );
    return lines.join('\n');
  };

  const handleSearch = () => {
    if (!canSearch) return;
    setLoading(true);
    setStreamText('');
    setResults([]);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    let full = '';
    streamChat('captador', [{ role: 'user', content: buildPrompt() }], controller.signal, {
      onChunk: t => { full += t; setStreamText(full); },
      onDone: () => {
        const contacts = parseLiContacts(full);
        setResults(contacts);
        setLoading(false);
        if (contacts.length > 0) {
          const record: LiSearchRecord = {
            id: uid(),
            label: query.trim(),
            profileFilter,
            contacts,
            createdAt: new Date().toISOString(),
          };
          setLiSearchHistory(prev => {
            const updated = [record, ...prev].slice(0, 20);
            saveLiSearches(updated);
            return updated;
          });
        }
        if (contacts.length === 0 && full.trim()) {
          setError('No se extrajeron contactos estructurados. Prueba con un nombre de empresa más específico.');
        }
      },
      onError: msg => { setLoading(false); setError(msg || 'Error al conectar con el agente.'); },
    });
  };

  const clearLiSearchHistory = () => {
    setLiSearchHistory([]);
    setExpandedLiHistory(null);
    saveLiSearches([]);
  };

  const removeLiSearchRecord = (id: string) => {
    setLiSearchHistory(prev => {
      const updated = prev.filter(record => record.id !== id);
      saveLiSearches(updated);
      return updated;
    });
    setExpandedLiHistory(prev => prev === id ? null : prev);
  };

  const [finderSelectedLiId, setFinderSelectedLiId] = useState<string>('');

  const finderLiContacts = [...results, ...savedContacts].filter((contact, index, all) => {
    const key = `${contact.name}|${contact.company}`.toLowerCase();
    return all.findIndex(item => `${item.name}|${item.company}`.toLowerCase() === key) === index;
  });

  const handleFinderLiSelect = (id: string) => {
    setFinderSelectedLiId(id);
    if (!id) return;
    const contact = finderLiContacts.find(c => c.id === id);
    if (!contact) return;
    setFinderName(contact.name);
    setFinderHint(contact.company || contact.title || '');
  };

  const handleFinderLiQuickSearch = (contact: LiContact) => {
    setFinderSelectedLiId(contact.id);
    setFinderName(contact.name);
    setFinderHint(contact.company || contact.title || '');
    setFinderLoading(true);
    setFinderStream('');
    setFinderResults([]);
    setFinderError(null);
    const controller = new AbortController();
    finderAbortRef.current = controller;
    const hint = contact.company || contact.title || '';
    const prompt = [
      `FINDER ${contact.name}`,
      hint ? `Empresa o sector conocido: ${hint}` : '',
      contact.linkedin ? `LinkedIn conocido: ${contact.linkedin}` : '',
      ``,
      `Ejecuta el protocolo FINDER completo para esta persona: identificaciÃ³n, email (patrones corporativos + fuentes pÃºblicas), telÃ©fono, canales alternativos, verificaciÃ³n cruzada.`,
      `Formato de salida EXACTO sin markdown ni asteriscos:`,
      `---`,
      `PERSONA: Nombre Apellido`,
      `CARGO: tÃ­tulo actual`,
      `EMPRESA: empresa actual`,
      `EMAIL PRINCIPAL: email o patrÃ³n â€” CONFIRMADO / INFERIDO / PROBABLE`,
      `FUENTE EMAIL: dÃ³nde se encontrÃ³ o dedujo`,
      `EMAILS ALTERNATIVOS: otros o No hay`,
      `TELÃ‰FONO: nÃºmero â€” MÃ“VIL DIRECTO / FIJO CORPORATIVO / CENTRALITA / EXTENSIÃ“N / No encontrado`,
      `FUENTE TELÃ‰FONO: dÃ³nde se encontrÃ³`,
      `LINKEDIN: linkedin.com/in/slug`,
      `OTROS CANALES: Twitter, formulario, asistente, evento, etc.`,
      `CONFIANZA GLOBAL: ALTA / MEDIA / BAJA`,
      `NOTAS: advertencias, datos desactualizados, pasos siguientes`,
      `---`,
    ].filter(Boolean).join('\n');
    let full = '';
    streamChat('captador', [{ role: 'user', content: prompt }], controller.signal, {
      onChunk: t => { full += t; setFinderStream(full); },
      onDone: () => {
        const found = parseFinder(full);
        setFinderResults(found);
        setFinderLoading(false);
        if (found.length === 0 && full.trim()) {
          setFinderError('No se extrajeron resultados estructurados. Prueba con nombre mÃ¡s completo o aÃ±ade empresa/sector.');
        }
      },
      onError: msg => { setFinderLoading(false); setFinderError(msg || 'Error al conectar con el agente.'); },
    });
  };

  const canFinderSearch = finderName.trim().length >= 2 && !finderLoading;

  const buildFinderPrompt = () => [
    `FINDER ${finderName.trim()}`,
    finderHint.trim() ? `Empresa o sector conocido: ${finderHint.trim()}` : '',
    ``,
    `Ejecuta el protocolo FINDER completo para esta persona: identificación, email (patrones corporativos + fuentes públicas), teléfono, canales alternativos, verificación cruzada.`,
    `Formato de salida EXACTO sin markdown ni asteriscos:`,
    `---`,
    `PERSONA: Nombre Apellido`,
    `CARGO: título actual`,
    `EMPRESA: empresa actual`,
    `EMAIL PRINCIPAL: email o patrón — CONFIRMADO / INFERIDO / PROBABLE`,
    `FUENTE EMAIL: dónde se encontró o dedujo`,
    `EMAILS ALTERNATIVOS: otros o No hay`,
    `TELÉFONO: número — MÓVIL DIRECTO / FIJO CORPORATIVO / CENTRALITA / EXTENSIÓN / No encontrado`,
    `FUENTE TELÉFONO: dónde se encontró`,
    `LINKEDIN: linkedin.com/in/slug`,
    `OTROS CANALES: Twitter, formulario, asistente, evento, etc.`,
    `CONFIANZA GLOBAL: ALTA / MEDIA / BAJA`,
    `NOTAS: advertencias, datos desactualizados, pasos siguientes`,
    `---`,
  ].filter(Boolean).join('\n');

  const handleFinderSearch = () => {
    if (!canFinderSearch) return;
    setFinderLoading(true);
    setFinderStream('');
    setFinderResults([]);
    setFinderError(null);
    const controller = new AbortController();
    finderAbortRef.current = controller;
    let full = '';
    streamChat('captador', [{ role: 'user', content: buildFinderPrompt() }], controller.signal, {
      onChunk: t => { full += t; setFinderStream(full); },
      onDone: () => {
        const found = parseFinder(full);
        setFinderResults(found);
        setFinderLoading(false);
        if (found.length === 0 && full.trim()) {
          setFinderError('No se extrajeron resultados estructurados. Prueba con nombre más completo o añade empresa/sector.');
        }
      },
      onError: msg => { setFinderLoading(false); setFinderError(msg || 'Error al conectar con el agente.'); },
    });
  };

  const saveFinderResult = (f: FinderResult) => {
    setSavedFinder(prev => {
      if (prev.find(x => x.id === f.id)) return prev;
      const updated = [f, ...prev];
      saveFinder(updated);
      return updated;
    });
  };

  const removeFinderResult = (id: string) => {
    setSavedFinder(prev => {
      const updated = prev.filter(x => x.id !== id);
      saveFinder(updated);
      return updated;
    });
  };

  const isFinderSaved = (id: string) => savedFinder.some(x => x.id === id);

  const copyFinderText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setFinderCopiedId(key);
    setTimeout(() => setFinderCopiedId(null), 1500);
  };

  const FinderCard = ({ result, showSave }: { result: FinderResult; showSave: boolean }) => (
    <div style={{
      background: 'var(--surface-1, rgba(0,0,0,0.02))',
      border: `1px solid ${confidenceColor(result.confidence)}25`,
      borderRadius: 0,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 999, flexShrink: 0,
          background: confidenceColor(result.confidence) + '18',
          border: `1.5px solid ${confidenceColor(result.confidence)}35`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: confidenceColor(result.confidence),
        }}>
          {result.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>{result.name}</div>
          {result.title && <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', marginTop: 1 }}>{result.title}</div>}
          {result.company && <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)', marginTop: 1 }}>{result.company}</div>}
        </div>
        {result.confidence && (
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
            color: confidenceColor(result.confidence),
            background: confidenceColor(result.confidence) + '12',
            border: `1px solid ${confidenceColor(result.confidence)}28`,
            borderRadius: 0, padding: '3px 7px', flexShrink: 0,
          }}>{result.confidence}</span>
        )}
      </div>

      {result.emailMain && result.emailMain !== 'No disponible' && result.emailMain !== 'No encontrado' && (
        <div style={{ background: 'rgba(0,0,0,0.03)', borderRadius: 0, padding: '10px 12px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.3)', letterSpacing: '0.07em', marginBottom: 6, textTransform: 'uppercase' }}>Email</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => copyFinderText(result.emailMain, result.id + '-email')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0,
                fontSize: 12, color: 'var(--text-primary)', cursor: 'pointer',
                background: 'transparent', border: 'none', padding: 0, textAlign: 'left',
                fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
              title="Copiar email"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/>
              </svg>
              {finderCopiedId === result.id + '-email' ? '¡Copiado!' : result.emailMain}
            </button>
            {result.emailConfidence && (
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: emailConfColor(result.emailConfidence),
                background: emailConfColor(result.emailConfidence) + '15',
                border: `1px solid ${emailConfColor(result.emailConfidence)}30`,
                borderRadius: 0, padding: '2px 6px', flexShrink: 0,
              }}>{result.emailConfidence}</span>
            )}
          </div>
          {result.emailSource && <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.35)', marginTop: 4 }}>Fuente: {result.emailSource}</div>}
          {result.emailsAlt && result.emailsAlt !== 'No hay' && result.emailsAlt !== 'No disponible' && (
            <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.4)', marginTop: 3 }}>Alt: {result.emailsAlt}</div>
          )}
        </div>
      )}

      {result.phone && result.phone !== 'No encontrado' && result.phone !== 'No disponible' && (
        <div style={{ background: 'rgba(0,0,0,0.03)', borderRadius: 0, padding: '10px 12px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.3)', letterSpacing: '0.07em', marginBottom: 6, textTransform: 'uppercase' }}>Teléfono</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => copyFinderText(result.phone, result.id + '-phone')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, flex: 1,
                fontSize: 12, color: 'var(--text-primary)', cursor: 'pointer',
                background: 'transparent', border: 'none', padding: 0, textAlign: 'left',
                fontFamily: 'JetBrains Mono, monospace',
              }}
              title="Copiar teléfono"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 012 2.18 2 2 0 014 .18H7a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16z"/>
              </svg>
              {finderCopiedId === result.id + '-phone' ? '¡Copiado!' : result.phone}
            </button>
            {result.phoneType && (
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: '#60a5fa', background: '#60a5fa15', border: '1px solid #60a5fa30',
                borderRadius: 0, padding: '2px 6px', flexShrink: 0,
              }}>{result.phoneType}</span>
            )}
          </div>
          {result.phoneSource && <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.35)', marginTop: 4 }}>Fuente: {result.phoneSource}</div>}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {result.linkedin && result.linkedin !== 'No disponible' && (
          <a
            href={result.linkedin.startsWith('http') ? result.linkedin : `https://${result.linkedin}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, color: '#0077b5', textDecoration: 'none',
              background: '#0077b50e', border: '1px solid #0077b525',
              borderRadius: 0, padding: '4px 9px',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="#0077b5">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            LinkedIn
          </a>
        )}
        {result.otherChannels && result.otherChannels !== 'No disponible' && result.otherChannels !== 'No hay' && (
          <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 0, padding: '4px 9px' }}>
            {result.otherChannels}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {showSave && !isFinderSaved(result.id) && (
          <button
            onClick={() => saveFinderResult(result)}
            style={{
              fontSize: 11, color: GOLD, cursor: 'pointer', fontWeight: 600,
              background: GOLD + '0f', border: `1px solid ${GOLD}30`,
              borderRadius: 0, padding: '4px 11px',
            }}
          >Guardar</button>
        )}
        {isFinderSaved(result.id) && (
          <span style={{ fontSize: 10, color: '#34d399', letterSpacing: '0.04em', fontWeight: 600 }}>Guardado</span>
        )}
      </div>

      {result.notes && result.notes !== 'No hay' && result.notes !== 'No disponible' && (
        <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', lineHeight: 1.5, borderLeft: '2px solid rgba(0,0,0,0.1)', paddingLeft: 8 }}>
          {result.notes}
        </div>
      )}
    </div>
  );

  const saveContact = (c: LiContact) => {
    setSavedContacts(prev => {
      if (prev.find(x => x.id === c.id)) return prev;
      const updated = [c, ...prev];
      saveLiContacts(updated);
      return updated;
    });
  };

  const removeContact = (id: string) => {
    setSavedContacts(prev => {
      const updated = prev.filter(x => x.id !== id);
      saveLiContacts(updated);
      return updated;
    });
  };

  const isSaved = (id: string) => savedContacts.some(x => x.id === id);

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const ContactCard = ({ contact, showSave }: { contact: LiContact; showSave: boolean }) => (
    <div style={{
      background: 'var(--surface-1, rgba(0,0,0,0.02))',
      border: '1px solid rgba(0,0,0,0.07)',
      borderRadius: 0,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 999, flexShrink: 0,
          background: profileTypeColor(contact.profileType) + '18',
          border: `1.5px solid ${profileTypeColor(contact.profileType)}35`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: profileTypeColor(contact.profileType),
          letterSpacing: '-0.01em',
        }}>
          {contact.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>{contact.name}</div>
          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contact.title}</div>
          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)', marginTop: 1 }}>{contact.company}</div>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
          color: profileTypeColor(contact.profileType),
          background: profileTypeColor(contact.profileType) + '12',
          border: `1px solid ${profileTypeColor(contact.profileType)}28`,
          borderRadius: 0, padding: '3px 7px', flexShrink: 0, whiteSpace: 'nowrap',
        }}>{contact.profileType}</span>
      </div>

      {contact.relevance && (
        <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', lineHeight: 1.5, borderLeft: `2px solid ${profileTypeColor(contact.profileType)}40`, paddingLeft: 8 }}>
          {contact.relevance}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
        {contact.linkedin && contact.linkedin !== 'No disponible' && (
          <a
            href={contact.linkedin.startsWith('http') ? contact.linkedin : `https://${contact.linkedin}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, color: '#0077b5', textDecoration: 'none',
              background: '#0077b50e', border: '1px solid #0077b525',
              borderRadius: 0, padding: '4px 9px',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="#0077b5">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            LinkedIn
          </a>
        )}
        {contact.email && contact.email !== 'No disponible' && (
          <button
            onClick={() => copyText(contact.email, contact.id + '-email')}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, color: 'rgba(0,0,0,0.5)', cursor: 'pointer',
              background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.09)',
              borderRadius: 0, padding: '4px 9px', maxWidth: 200,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
            title={contact.email}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/>
            </svg>
            {copiedId === contact.id + '-email' ? '¡Copiado!' : contact.email}
          </button>
        )}
        <div style={{ flex: 1 }} />
        {showSave && !isSaved(contact.id) && (
          <button
            onClick={() => saveContact(contact)}
            style={{
              fontSize: 11, color: GOLD, cursor: 'pointer', fontWeight: 600,
              background: GOLD + '0f', border: `1px solid ${GOLD}30`,
              borderRadius: 0, padding: '4px 11px',
            }}
          >
            Guardar
          </button>
        )}
        {isSaved(contact.id) && (
          <span style={{ fontSize: 10, color: '#34d399', letterSpacing: '0.04em', fontWeight: 600 }}>Guardado</span>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Sub-tab switcher */}
      <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.05)', borderRadius: 0, padding: 3 }}>
        {([['li', 'LI Contacts'], ['finder', 'Finder — Email & Tel.']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            style={{
              flex: 1, padding: '7px 14px', borderRadius: 0, fontSize: 12,
              fontWeight: subTab === id ? 700 : 500,
              background: subTab === id ? (id === 'finder' ? GOLD : 'white') : 'transparent',
              color: subTab === id ? (id === 'finder' ? '#000' : 'var(--text-primary)') : 'rgba(0,0,0,0.45)',
              border: 'none', cursor: 'pointer', transition: 'all 0.15s',
              boxShadow: subTab === id ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
            }}
          >{label}</button>
        ))}
      </div>

      {subTab === 'li' && (<>
      {/* Search */}
      <Card style={{ padding: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(0,0,0,0.35)', marginBottom: 14, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          Empresa a investigar
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Ej: Sofina, Tikehau Capital, Iberdrola, MCH Private Equity..."
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 0, fontSize: 13,
              background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)',
              color: 'var(--text-primary)', outline: 'none',
            }}
          />
          <button
            onClick={handleSearch}
            disabled={!canSearch}
            style={{
              padding: '10px 22px', borderRadius: 0, fontSize: 13, fontWeight: 600,
              background: canSearch ? GOLD : 'rgba(0,0,0,0.07)',
              color: canSearch ? '#000' : 'rgba(0,0,0,0.25)',
              border: 'none', cursor: canSearch ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s', flexShrink: 0,
            }}
          >
            {loading ? 'Buscando...' : 'Buscar contactos'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['Todos', 'VC', 'Capital Markets', 'Directivo', 'Inversor', 'M&A', 'CVC', 'CSO'] as const).map(f => (
            <button
              key={f}
              onClick={() => setProfileFilter(f)}
              style={{
                padding: '5px 12px', borderRadius: 0, fontSize: 11, cursor: 'pointer',
                fontWeight: profileFilter === f ? 700 : 400,
                background: profileFilter === f
                  ? (f === 'Todos' ? GOLD + '18' : profileTypeColor(f as LiProfileType) + '14')
                  : 'rgba(0,0,0,0.04)',
                color: profileFilter === f
                  ? (f === 'Todos' ? GOLD : profileTypeColor(f as LiProfileType))
                  : 'rgba(0,0,0,0.4)',
                border: `1px solid ${profileFilter === f
                  ? (f === 'Todos' ? GOLD + '45' : profileTypeColor(f as LiProfileType) + '38')
                  : 'rgba(0,0,0,0.08)'}`,
              }}
            >{f}</button>
          ))}
        </div>
      </Card>

      {/* Stream preview */}
      {loading && streamText && (
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.3)', marginBottom: 8, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Investigando perfiles...</div>
          <pre style={{
            fontSize: 11, color: 'rgba(0,0,0,0.45)', whiteSpace: 'pre-wrap',
            wordBreak: 'break-word', margin: 0, fontFamily: 'JetBrains Mono, monospace',
            maxHeight: 160, overflow: 'hidden',
          }}>
            {streamText.slice(-600)}
          </pre>
        </Card>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 0, background: '#fef2f2', border: '1px solid #fca5a5', fontSize: 12, color: '#dc2626' }}>
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)', marginBottom: 12 }}>
            {results.length} contacto{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''} · <strong style={{ color: 'var(--text-primary)' }}>{query}</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
            {results.map(c => <ContactCard key={c.id} contact={c} showSave />)}
          </div>
        </div>
      )}

      {/* Search history */}
      {liSearchHistory.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: results.length > 0 ? 12 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.25)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Busquedas anteriores LI - {liSearchHistory.length}
            </div>
            <button
              onClick={clearLiSearchHistory}
              style={{ fontSize: 9, color: 'rgba(248,113,113,0.5)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, letterSpacing: '0.06em' }}
            >limpiar historial</button>
          </div>
          {liSearchHistory.map(record => (
            <Card key={record.id} style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'stretch' }}>
                <button
                  onClick={() => setExpandedLiHistory(expandedLiHistory === record.id ? null : record.id)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', minWidth: 0,
                  }}
                >
                  <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.label}</span>
                  {record.profileFilter !== 'Todos' && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                      color: profileTypeColor(record.profileFilter), background: profileTypeColor(record.profileFilter) + '12',
                      border: `1px solid ${profileTypeColor(record.profileFilter)}28`, borderRadius: 0, padding: '3px 7px', flexShrink: 0,
                    }}>{record.profileFilter}</span>
                  )}
                  <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.25)', flexShrink: 0 }}>
                    {record.contacts.length} contacto{record.contacts.length !== 1 ? 's' : ''} - {new Date(record.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} {new Date(record.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: 0.3, transform: expandedLiHistory === record.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  onClick={() => removeLiSearchRecord(record.id)}
                  title="Eliminar busqueda"
                  style={{
                    width: 40, border: 'none', borderLeft: '1px solid rgba(0,0,0,0.05)',
                    background: 'transparent', color: 'rgba(248,113,113,0.55)', cursor: 'pointer',
                    fontSize: 15, fontWeight: 700,
                  }}
                >x</button>
              </div>
              {expandedLiHistory === record.id && (
                <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10, padding: 12 }}>
                  {record.contacts.map(contact => <ContactCard key={contact.id} contact={contact} showSave />)}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Saved */}
      {savedContacts.length > 0 && (
        <div style={{ marginTop: results.length > 0 ? 12 : 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>
            Contactos guardados · {savedContacts.length}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
            {savedContacts.map(c => (
              <div key={c.id} style={{ position: 'relative' }}>
                <ContactCard contact={c} showSave={false} />
                <button
                  onClick={() => removeContact(c.id)}
                  title="Eliminar contacto"
                  style={{
                    position: 'absolute', top: 10, right: 10,
                    background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.1)',
                    borderRadius: 0, cursor: 'pointer', color: 'rgba(0,0,0,0.35)',
                    fontSize: 14, lineHeight: 1, padding: '2px 6px', fontWeight: 700,
                  }}
                >×</button>
              </div>
            ))}
          </div>
        </div>
      )}
      </>)}

      {subTab === 'finder' && (<>
        <Card style={{ padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(0,0,0,0.35)', marginBottom: 14, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            Buscar datos de contacto de una persona
          </div>
          {finderLiContacts.length > 0 && (
            <div style={{ marginBottom: 14, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 0, overflow: 'hidden', background: 'rgba(0,0,0,0.025)' }}>
              <button
                type="button"
                onClick={() => setFinderLiExpanded(v => !v)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  background: finderLiExpanded ? 'rgba(0,168,120,0.08)' : 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{
                  width: 24, height: 24, borderRadius: 0, flexShrink: 0,
                  background: '#0077b512', border: '1px solid #0077b52a',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#0077b5">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    LI Contacts encontrados
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.38)', marginTop: 1 }}>
                    {finderLiContacts.length} contacto{finderLiContacts.length !== 1 ? 's' : ''} disponible{finderLiContacts.length !== 1 ? 's' : ''} para Finder
                  </div>
                </div>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: 0.4, transform: finderLiExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {finderLiExpanded && (
                <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', padding: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
                  {finderLiContacts.map(contact => {
                    const selected = finderSelectedLiId === contact.id;
                    return (
                      <div
                        key={contact.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleFinderLiSelect(contact.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleFinderLiSelect(contact.id);
                          }
                        }}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 9, padding: 10,
                          borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                          background: selected ? GOLD + '12' : 'rgba(255,255,255,0.72)',
                          border: `1px solid ${selected ? GOLD + '55' : 'rgba(0,0,0,0.08)'}`,
                          boxShadow: selected ? '0 1px 4px rgba(0,168,120,0.15)' : 'none',
                        }}
                      >
                        <span style={{
                          width: 30, height: 30, borderRadius: 999, flexShrink: 0,
                          background: profileTypeColor(contact.profileType) + '15',
                          border: `1px solid ${profileTypeColor(contact.profileType)}35`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700, color: profileTypeColor(contact.profileType),
                        }}>
                          {contact.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.name}</span>
                          <span style={{ display: 'block', fontSize: 10, color: 'rgba(0,0,0,0.48)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.title || contact.company}</span>
                          {contact.company && <span style={{ display: 'block', fontSize: 10, color: 'rgba(0,0,0,0.32)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.company}</span>}
                          <span style={{ display: 'inline-flex', marginTop: 6, fontSize: 9, fontWeight: 700, color: profileTypeColor(contact.profileType), background: profileTypeColor(contact.profileType) + '12', border: `1px solid ${profileTypeColor(contact.profileType)}25`, borderRadius: 0, padding: '2px 6px' }}>
                            {contact.profileType}
                          </span>
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={e => { e.stopPropagation(); handleFinderLiQuickSearch(contact); }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              handleFinderLiQuickSearch(contact);
                            }
                          }}
                          title="Buscar en Finder"
                          style={{
                            padding: '4px 8px', borderRadius: 0, flexShrink: 0,
                            fontSize: 10, fontWeight: 700, color: GOLD,
                            background: GOLD + '12', border: `1px solid ${GOLD}35`,
                          }}
                        >
                          Finder
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {false && savedContacts.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)', marginBottom: 6 }}>
                Importar desde LI Contacts guardados
              </div>
              <select
                value={finderSelectedLiId}
                onChange={e => handleFinderLiSelect(e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 9, fontSize: 12,
                  background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.12)',
                  color: finderSelectedLiId ? 'var(--text-primary)' : 'rgba(0,0,0,0.35)',
                  outline: 'none', cursor: 'pointer', appearance: 'none',
                  WebkitAppearance: 'none', boxSizing: 'border-box',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23999' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
                  paddingRight: 30,
                }}
              >
                <option value="">-- Seleccionar contacto de LI Contacts --</option>
                {savedContacts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.title ? ` · ${c.title}` : ''}{c.company ? ` @ ${c.company}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <input
              type="text"
              value={finderName}
              onChange={e => { setFinderName(e.target.value); setFinderSelectedLiId(''); }}
              onKeyDown={e => e.key === 'Enter' && handleFinderSearch()}
              placeholder="Nombre completo de la persona..."
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 0, fontSize: 13,
                background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)',
                color: 'var(--text-primary)', outline: 'none',
              }}
            />
            <button
              onClick={handleFinderSearch}
              disabled={!canFinderSearch}
              style={{
                padding: '10px 22px', borderRadius: 0, fontSize: 13, fontWeight: 600,
                background: canFinderSearch ? GOLD : 'rgba(0,0,0,0.07)',
                color: canFinderSearch ? '#000' : 'rgba(0,0,0,0.25)',
                border: 'none', cursor: canFinderSearch ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s', flexShrink: 0,
              }}
            >{finderLoading ? 'Buscando...' : 'Buscar contacto'}</button>
          </div>
          <input
            type="text"
            value={finderHint}
            onChange={e => { setFinderHint(e.target.value); setFinderSelectedLiId(''); }}
            placeholder="Empresa o sector (opcional — mejora la búsqueda)..."
            style={{
              width: '100%', padding: '8px 14px', borderRadius: 0, fontSize: 12,
              background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)',
              color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.3)', marginTop: 10, lineHeight: 1.5 }}>
            Motor 5 fases: identificación · email (patrones corporativos + fuentes públicas) · teléfono · canales alternativos · verificación cruzada. Nivel de confianza por dato.
          </div>
        </Card>

        {finderLoading && finderStream && (
          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.3)', marginBottom: 8, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Investigando contacto...</div>
            <pre style={{
              fontSize: 11, color: 'rgba(0,0,0,0.45)', whiteSpace: 'pre-wrap',
              wordBreak: 'break-word', margin: 0, fontFamily: 'JetBrains Mono, monospace',
              maxHeight: 160, overflow: 'hidden',
            }}>{finderStream.slice(-600)}</pre>
          </Card>
        )}

        {finderError && (
          <div style={{ padding: '12px 16px', borderRadius: 0, background: '#fef2f2', border: '1px solid #fca5a5', fontSize: 12, color: '#dc2626' }}>
            {finderError}
          </div>
        )}

        {finderResults.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)', marginBottom: 12 }}>
              {finderResults.length} resultado{finderResults.length !== 1 ? 's' : ''} · <strong style={{ color: 'var(--text-primary)' }}>{finderName}</strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {finderResults.map(r => <FinderCard key={r.id} result={r} showSave />)}
            </div>
          </div>
        )}

        {savedFinder.length > 0 && (
          <div style={{ marginTop: finderResults.length > 0 ? 12 : 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>
              Contactos guardados · {savedFinder.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[...savedFinder].sort((a, b) => (a.company || '').localeCompare(b.company || '', 'es', { sensitivity: 'base' })).map(r => (
                <div key={r.id} style={{ position: 'relative' }}>
                  <FinderCard result={r} showSave={false} />
                  <button
                    onClick={() => removeFinderResult(r.id)}
                    title="Eliminar"
                    style={{
                      position: 'absolute', top: 10, right: 10,
                      background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.1)',
                      borderRadius: 0, cursor: 'pointer', color: 'rgba(0,0,0,0.35)',
                      fontSize: 14, lineHeight: 1, padding: '2px 6px', fontWeight: 700,
                    }}
                  >×</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </>)}
    </div>
  );
}

// ─── Panel Overview ───────────────────────────────────────────────────────────

function PanelOverview({ leads, tasks }: { leads: Lead[]; tasks: Task[] }) {
  const total = leads.length;
  const estrategicos = leads.filter(l => l.classification === 'PRIORIDAD ALTA').length;
  const enNego = leads.filter(l => l.crmStatus === 'En negociación').length;
  const cerrados = leads.filter(l => l.crmStatus === 'Cerrado').length;
  const pendingTasks = tasks.filter(t => t.status !== 'Completada').length;

  const recentLeads = [...leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  const byStatus = CRM_STATUSES.map(s => ({ label: s, count: leads.filter(l => l.crmStatus === s).length, color: statusColor(s) }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        <StatCard label="Total leads" value={total} />
        <StatCard label="Prioridad Alta" value={estrategicos} />
        <StatCard label="En negociación" value={enNego} />
        <StatCard label="Cerrados" value={cerrados} />
        <StatCard label="Tareas pendientes" value={pendingTasks} />
      </div>

      {/* Pipeline */}
      <Card style={{ padding: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Pipeline CRM</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {byStatus.map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', minWidth: 120 }}>{s.label}</span>
              <div style={{ flex: 1, height: 6, background: 'rgba(0,0,0,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: total > 0 ? `${(s.count / total) * 100}%` : '0%',
                  background: s.color,
                  borderRadius: 99,
                  transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
                }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: s.color, minWidth: 24, textAlign: 'right' }}>{s.count}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent leads */}
      {recentLeads.length > 0 && (
        <Card style={{ padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Últimos leads añadidos</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentLeads.map(l => {
              const lt = tasks.filter(t => t.leadId === l.id);
              const ld = lt.filter(t => t.status === 'Completada').length;
              const lp = lt.length > 0 ? Math.round((ld / lt.length) * 100) : 0;
              return (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 999, background: classColor(l.classification), flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: 'rgba(0,0,0,0.8)' }}>{l.company}</span>
                  <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.3)' }}>{l.sector}</span>
                  {lt.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 48, height: 3, background: 'rgba(0,0,0,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${lp}%`, background: lp === 100 ? '#34d399' : GOLD, borderRadius: 99 }} />
                      </div>
                      <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.3)' }}>{lp}%</span>
                    </div>
                  )}
                  <Badge label={l.crmStatus} color={statusColor(l.crmStatus)} />
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Analytics ────────────────────────────────────────────────────────────────

function Analytics({ leads, tasks }: { leads: Lead[]; tasks: Task[] }) {
  const total = leads.length || 1;
  const bySector = SECTOR_DATA.map(s => ({ label: s.label, count: leads.filter(l => l.sector === s.id || l.sector === s.label).length })).filter(s => s.count > 0);
  const byClass: { label: Classification; color: string }[] = [
    { label: 'PRIORIDAD ALTA', color: '#34d399' },
    { label: 'CANDIDATO VÁLIDO', color: '#60a5fa' },
    { label: 'SEGUIMIENTO', color: '#fbbf24' },
    { label: 'DESCARTAR', color: '#f87171' },
  ];
  const allTasks = tasks.length || 1;
  const completadas = tasks.filter(t => t.status === 'Completada').length;
  const enCurso = tasks.filter(t => t.status === 'En curso').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* By classification */}
        <Card style={{ padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Por clasificación</div>
          {byClass.map(b => {
            const count = leads.filter(l => l.classification === b.label).length;
            return (
              <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 10, color: b.color, minWidth: 100, fontWeight: 600 }}>{b.label}</span>
                <div style={{ flex: 1, height: 5, background: 'rgba(0,0,0,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(count / total) * 100}%`, background: b.color, borderRadius: 99, transition: 'width 0.6s ease' }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: b.color, minWidth: 20, textAlign: 'right' }}>{count}</span>
              </div>
            );
          })}
        </Card>

        {/* Task health */}
        <Card style={{ padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Salud de tareas</div>
          {[
            { label: 'Completadas', count: completadas, color: '#34d399' },
            { label: 'En curso', count: enCurso, color: GOLD },
            { label: 'Pendientes', count: tasks.filter(t => t.status === 'Pendiente').length, color: '#94a3b8' },
          ].map(b => (
            <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', minWidth: 90 }}>{b.label}</span>
              <div style={{ flex: 1, height: 5, background: 'rgba(0,0,0,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(b.count / allTasks) * 100}%`, background: b.color, borderRadius: 99, transition: 'width 0.6s ease' }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: b.color, minWidth: 20, textAlign: 'right' }}>{b.count}</span>
            </div>
          ))}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.3)' }}>Tasa de finalización</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#34d399' }}>
              {tasks.length === 0 ? '—' : `${Math.round((completadas / tasks.length) * 100)}%`}
            </span>
          </div>
        </Card>
      </div>

      {/* By sector */}
      {bySector.length > 0 && (
        <Card style={{ padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Leads por sector</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bySector.sort((a, b) => b.count - a.count).map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', minWidth: 160 }}>{s.label}</span>
                <div style={{ flex: 1, height: 5, background: 'rgba(0,0,0,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(s.count / total) * 100}%`, background: GOLD, borderRadius: 99, transition: 'width 0.6s ease' }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: GOLD, minWidth: 20, textAlign: 'right' }}>{s.count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Analizador ───────────────────────────────────────────────────────────────

const DIM_DEFS: { id: InvDimId; label: string; desc: string }[] = [
  { id: 'W', label: 'Generación de residuo', desc: 'Volumen, tipo y regularidad del residuo orgánico generado' },
  { id: 'I', label: 'Infraestructura', desc: 'Instalaciones, espacio disponible, acceso logístico' },
  { id: 'S', label: 'Sostenibilidad', desc: 'Objetivos ESG, compromisos medioambientales, certificaciones' },
  { id: 'M', label: 'Mercado y escala', desc: 'Tamaño de empresa, facturación, presencia geográfica' },
  { id: 'E', label: 'Entorno regulatorio', desc: 'Marco normativo aplicable, licencias, riesgo CNMC' },
  { id: 'R', label: 'Relación estratégica', desc: 'Potencial de partnership, decisores identificados, timing' },
];

function buildDimPrompt(company: string, sector: string, location: string, dim: { id: InvDimId; label: string; desc: string }): string {
  return [
    `Eres el agente de inteligencia comercial de S-NFI Corp., empresa especializada en infraestructura de biometanización modular industrial.`,
    ``,
    `Analiza la empresa "${company}" (sector: ${sector}, ubicación: ${location}) en la dimensión: **${dim.label}** — ${dim.desc}.`,
    ``,
    `Instrucciones:`,
    `- Sé conciso: máximo 4-5 líneas.`,
    `- Usa datos públicos reales si los conoces.`,
    `- Evalúa si esta dimensión es favorable, neutral o desfavorable para S-NFI.`,
    `- Termina con una línea: VALORACIÓN: [FAVORABLE / NEUTRAL / DESFAVORABLE]`,
    ``,
    `No inventes datos. Si no tienes información suficiente, indícalo brevemente y da una valoración provisional.`,
  ].join('\n');
}

function InvCard({
  inv, onAnalyzeDim, onDelete, onGoToCrm,
}: {
  inv: Investigation;
  onAnalyzeDim: (invId: string, dimId: InvDimId) => void;
  onDelete: (invId: string) => void;
  onGoToCrm: (leadId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const done = inv.dimensions.filter(d => d.status === 'completada').length;
  const pct = Math.round((done / inv.dimensions.length) * 100);
  const analyzing = inv.dimensions.some(d => d.status === 'analizando');

  const dimValColor = (result: string) => {
    if (result.includes('FAVORABLE')) return '#34d399';
    if (result.includes('DESFAVORABLE')) return '#f87171';
    if (result.includes('NEUTRAL')) return '#fbbf24';
    return 'rgba(0,0,0,0.4)';
  };

  return (
    <Card style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div onClick={() => setExpanded(e => !e)} style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Animated ring */}
        <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
          <svg width="36" height="36" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="14" fill="none"
              stroke={pct === 100 ? '#34d399' : GOLD}
              strokeWidth="3"
              strokeDasharray={`${2 * Math.PI * 14}`}
              strokeDashoffset={`${2 * Math.PI * 14 * (1 - pct / 100)}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)' }}
            />
          </svg>
          <span style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 700, color: pct === 100 ? '#34d399' : GOLD,
          }}>{pct}%</span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{inv.company}</div>
          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)' }}>{inv.sector} · {inv.location}</div>
        </div>

        {/* Dim pills */}
        <div style={{ display: 'flex', gap: 4 }}>
          {inv.dimensions.map(d => (
            <div key={d.id} style={{
              width: 22, height: 22, borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700,
              background: d.status === 'completada' ? dimValColor(d.result) + '22' : 'rgba(0,0,0,0.04)',
              border: `1px solid ${d.status === 'completada' ? dimValColor(d.result) + '60' : 'rgba(0,0,0,0.08)'}`,
              color: d.status === 'completada' ? dimValColor(d.result) : d.status === 'analizando' ? GOLD : 'rgba(0,0,0,0.25)',
            }}>
              {d.status === 'analizando' ? '·' : d.id}
            </div>
          ))}
        </div>

        {pct === 100 && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: '#34d399',
            background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)',
            padding: '3px 10px', borderRadius: 0, letterSpacing: '0.06em',
          }}>LISTA</span>
        )}

        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s',
          color: 'rgba(0,0,0,0.3)', flexShrink: 0,
        }}>
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', padding: '16px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {inv.dimensions.map(d => (
              <div key={d.id} style={{
                borderRadius: 0,
                background: d.status === 'completada' ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.015)',
                border: `1px solid ${d.status === 'completada' ? dimValColor(d.result) + '25' : 'rgba(0,0,0,0.06)'}`,
                overflow: 'hidden',
              }}>
                {/* Dim header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 800,
                    background: d.status === 'completada' ? dimValColor(d.result) + '22' : 'rgba(0,0,0,0.06)',
                    color: d.status === 'completada' ? dimValColor(d.result) : 'rgba(0,0,0,0.4)',
                    flexShrink: 0,
                  }}>{d.id}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{d.label}</div>
                    <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.35)', marginTop: 1 }}>{d.desc}</div>
                  </div>
                  {d.status === 'pendiente' && (
                    <button
                      onClick={() => onAnalyzeDim(inv.id, d.id)}
                      disabled={analyzing}
                      style={{
                        padding: '5px 14px', borderRadius: 0, fontSize: 11, fontWeight: 600, cursor: analyzing ? 'default' : 'pointer',
                        background: analyzing ? 'rgba(0,0,0,0.04)' : `${GOLD}18`,
                        border: `1px solid ${analyzing ? 'rgba(0,0,0,0.08)' : GOLD + '40'}`,
                        color: analyzing ? 'rgba(0,0,0,0.2)' : GOLD,
                        transition: 'all 0.15s',
                      }}
                    >Analizar</button>
                  )}
                  {d.status === 'analizando' && (
                    <span style={{ fontSize: 11, color: GOLD, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: GOLD, display: 'inline-block', animation: 'pulse 1s infinite' }} />
                      Analizando...
                    </span>
                  )}
                  {d.status === 'completada' && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 0,
                      background: dimValColor(d.result) + '18',
                      border: `1px solid ${dimValColor(d.result)}40`,
                      color: dimValColor(d.result),
                    }}>
                      {d.result.includes('FAVORABLE') ? 'FAVORABLE' : d.result.includes('DESFAVORABLE') ? 'DESFAVORABLE' : 'NEUTRAL'}
                    </span>
                  )}
                </div>

                {/* Result text */}
                {d.status === 'completada' && d.result && (
                  <div style={{
                    padding: '0 14px 12px 48px',
                    fontSize: 12, color: 'rgba(0,0,0,0.6)', lineHeight: 1.65,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {d.result.replace(/VALORACIÓN:.*$/m, '').trim()}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <button
              onClick={() => onDelete(inv.id)}
              style={{
                padding: '6px 14px', borderRadius: 0, fontSize: 11, cursor: 'pointer',
                background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
                color: '#f87171',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.18)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.08)')}
            >Eliminar</button>

            {pct === 100 && inv.leadId && (
              <button
                onClick={() => onGoToCrm(inv.leadId)}
                style={{
                  padding: '8px 20px', borderRadius: 0, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: 'linear-gradient(135deg, #34d399, #10b981)',
                  border: 'none', color: '#000',
                  boxShadow: '0 4px 16px rgba(52,211,153,0.3)',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-1px)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
              >Iniciar primera toma de contacto →</button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function Analizador({
  leads,
  onGoToCrm,
}: {
  leads: Lead[];
  onGoToCrm: (leadId: string) => void;
}) {
  const [invs, setInvs] = useState<Investigation[]>(loadInvs);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const abortRefs = useRef<Record<string, AbortController>>({});

  const createInv = () => {
    const lead = leads.find(l => l.id === selectedLeadId);
    if (!lead) return;
    const already = invs.some(i => i.leadId === lead.id);
    if (already) return;
    const inv: Investigation = {
      id: uid(),
      leadId: lead.id,
      company: lead.company,
      sector: lead.sector,
      location: lead.location,
      dimensions: DIM_DEFS.map(d => ({ ...d, status: 'pendiente', result: '' })),
      contactReady: false,
      createdAt: new Date().toISOString(),
    };
    const updated = [inv, ...invs];
    setInvs(updated);
    saveInvs(updated);
    setSelectedLeadId('');
  };

  const analyzeDim = (invId: string, dimId: InvDimId) => {
    const inv = invs.find(i => i.id === invId);
    if (!inv) return;
    const dim = DIM_DEFS.find(d => d.id === dimId)!;

    // mark analizando
    const mark = (status: InvStatus, result?: string) => {
      setInvs(prev => {
        const updated = prev.map(i => i.id !== invId ? i : {
          ...i,
          dimensions: i.dimensions.map(d => d.id !== dimId ? d : { ...d, status, result: result ?? d.result }),
          contactReady: status === 'completada'
            ? i.dimensions.filter(d => d.id !== dimId).every(d => d.status === 'completada')
            : i.contactReady,
        });
        saveInvs(updated);
        return updated;
      });
    };

    mark('analizando');

    const controller = new AbortController();
    abortRefs.current[`${invId}-${dimId}`] = controller;
    let full = '';

    streamChat('captador', [{ role: 'user', content: buildDimPrompt(inv.company, inv.sector, inv.location, dim) }], controller.signal, {
      onChunk: t => { full += t; },
      onDone: () => mark('completada', full.trim()),
      onError: () => mark('pendiente', ''),
    });
  };

  const deleteInv = (invId: string) => {
    const updated = invs.filter(i => i.id !== invId);
    setInvs(updated);
    saveInvs(updated);
  };

  const unanalyzed = leads.filter(l => !invs.some(i => i.leadId === l.id));
  const ready = invs.filter(i => i.dimensions.every(d => d.status === 'completada')).length;
  const inProgress = invs.filter(i => i.dimensions.some(d => d.status === 'completada') && !i.dimensions.every(d => d.status === 'completada')).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <StatCard label="Investigaciones totales" value={invs.length} />
        <StatCard label="En progreso" value={inProgress} />
        <StatCard label="Listas para contactar" value={ready} />
      </div>

      {/* New investigation */}
      <Card style={{ padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 14 }}>Nueva investigación</div>
        {leads.length === 0 ? (
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.3)', fontStyle: 'italic' }}>
            Añade empresas al CRM desde el Buscador para poder analizarlas.
          </div>
        ) : unanalyzed.length === 0 ? (
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.3)', fontStyle: 'italic' }}>
            Todos los leads del CRM ya tienen investigación.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.35)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Empresa del CRM
              </div>
              <DarkSelect
                value={selectedLeadId}
                onChange={setSelectedLeadId}
                options={unanalyzed.map(l => ({ label: `${l.company} · ${l.sector}`, value: l.id }))}
                placeholder="Seleccionar empresa..."
              />
            </div>
            <button
              onClick={createInv}
              disabled={!selectedLeadId}
              style={{
                padding: '9px 22px', borderRadius: 0, fontSize: 13, fontWeight: 600,
                cursor: selectedLeadId ? 'pointer' : 'default',
                background: selectedLeadId ? GOLD : 'rgba(0,0,0,0.06)',
                color: selectedLeadId ? '#000' : 'rgba(0,0,0,0.2)',
                border: 'none', transition: 'all 0.2s', whiteSpace: 'nowrap',
              }}
            >Crear investigación</button>
          </div>
        )}
      </Card>

      {/* How it works */}
      {invs.length === 0 && (
        <Card style={{ padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Cómo funciona</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {DIM_DEFS.map((d, i) => (
              <div key={d.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, flexShrink: 0,
                  background: `${GOLD}18`, border: `1px solid ${GOLD}30`, color: GOLD,
                }}>{d.id}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{d.label}</div>
                  <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.35)', marginTop: 2, lineHeight: 1.5 }}>{d.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 0, background: 'rgba(0,168,120,0.06)', border: `1px solid ${GOLD}20` }}>
            <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', lineHeight: 1.6 }}>
              Analiza cada dimensión por separado. Conforme completas las 6, el anillo de progreso llega al 100% y se desbloquea el botón de primera toma de contacto.
            </div>
          </div>
        </Card>
      )}

      {/* Investigation list */}
      {invs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {invs.length} investigación{invs.length !== 1 ? 'es' : ''}
          </div>
          {invs.map(inv => (
            <InvCard
              key={inv.id}
              inv={inv}
              onAnalyzeDim={analyzeDim}
              onDelete={deleteInv}
              onGoToCrm={onGoToCrm}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Emails ───────────────────────────────────────────────────────────────────

function Emails({ leads }: { leads: Lead[] }) {
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [emailType, setEmailType] = useState('primera-toma');
  const [customContext, setCustomContext] = useState('');
  const [emailText, setEmailText] = useState('');
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const EMAIL_TYPES = [
    { value: 'primera-toma', label: 'Primera toma de contacto' },
    { value: 'seguimiento', label: 'Seguimiento (sin respuesta)' },
    { value: 'propuesta', label: 'Envío de propuesta' },
    { value: 'reunion', label: 'Solicitud de reunión' },
  ];

  const selectedLead = leads.find(l => l.id === selectedLeadId);

  const buildEmailPrompt = () => {
    if (!selectedLead) return '';
    return [
      `Genera un correo electrónico profesional para una primera toma de contacto comercial de S-NFI Corp. (South Navarre Fresh Innovations), empresa especializada en infraestructura de biometanización modular in-situ.`,
      ``,
      `DATOS DE LA EMPRESA OBJETIVO:`,
      `- Empresa: ${selectedLead.company}`,
      `- Sector: ${selectedLead.sector}`,
      `- Ubicación: ${selectedLead.location}`,
      selectedLead.volumen ? `- Volumen residuo: ${selectedLead.volumen}` : '',
      selectedLead.tipoResiduo ? `- Tipo residuo: ${selectedLead.tipoResiduo}` : '',
      selectedLead.contact ? `- Contacto identificado: ${selectedLead.contact}` : '',
      selectedLead.esg && selectedLead.esg !== 'No' ? `- Certificaciones ESG: ${selectedLead.esg}` : '',
      `- Clasificación S-NFI: ${selectedLead.classification}`,
      selectedLead.score > 0 ? `- Score Deep Research: ${selectedLead.score}/130` : '',
      ``,
      `TIPO DE CORREO: ${EMAIL_TYPES.find(e => e.value === emailType)?.label}`,
      customContext ? `CONTEXTO ADICIONAL: ${customContext}` : '',
      ``,
      `INSTRUCCIONES:`,
      `- Tono: profesional, directo, sin artificios comerciales baratos`,
      `- Asunto: potente y específico (no genérico)`,
      `- Cuerpo: máximo 180 palabras`,
      `- Propuesta de valor: específica para ESTA empresa (usa sus datos concretos de sector y residuo)`,
      `- Si el contacto tiene nombre, úsalo; si no, usa tratamiento formal`,
      `- CTA concreto: llamada de 20 minutos o reunión`,
      `- Firma: [Nombre] | S-NFI Corp. — South Navarre Fresh Innovations`,
      ``,
      `Formato de salida:`,
      `ASUNTO: [texto del asunto]`,
      ``,
      `[cuerpo del correo]`,
    ].filter(Boolean).join('\n');
  };

  const generateEmail = () => {
    if (!selectedLead || loading) return;
    setLoading(true);
    setEmailText('');
    const controller = new AbortController();
    abortRef.current = controller;
    let full = '';
    streamChat('captador', [{ role: 'user', content: buildEmailPrompt() }], controller.signal, {
      onChunk: t => { full += t; setEmailText(full); },
      onDone: () => setLoading(false),
      onError: () => setLoading(false),
    });
  };

  const copyEmail = () => {
    navigator.clipboard.writeText(emailText).catch(() => {});
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Config card */}
      <Card style={{ padding: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 20 }}>Configurar correo</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.35)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Empresa del CRM</div>
            <DarkSelect
              value={selectedLeadId}
              onChange={setSelectedLeadId}
              options={leads.map(l => ({ label: `${l.company} · ${l.sector}`, value: l.id }))}
              placeholder="Seleccionar empresa..."
            />
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.35)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tipo de correo</div>
            <DarkSelect
              value={emailType}
              onChange={setEmailType}
              options={EMAIL_TYPES.map(e => ({ label: e.label, value: e.value }))}
            />
          </div>
        </div>

        {/* Lead preview */}
        {selectedLead && (
          <div style={{
            padding: '12px 16px', borderRadius: 0, marginBottom: 16,
            background: 'rgba(0,168,120,0.06)', border: `1px solid ${GOLD}20`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: 999, background: classColor(selectedLead.classification), flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{selectedLead.company}</span>
              <Badge label={selectedLead.classification} color={classColor(selectedLead.classification)} />
              {selectedLead.score > 0 && <span style={{ fontSize: 11, color: GOLD, marginLeft: 'auto' }}>Score {selectedLead.score}/130</span>}
            </div>
            {selectedLead.contact && (
              <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', marginTop: 6 }}>Contacto: {selectedLead.contact}</div>
            )}
          </div>
        )}

        {/* Additional context */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.35)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Contexto adicional (opcional)</div>
          <textarea
            value={customContext}
            onChange={e => setCustomContext(e.target.value)}
            placeholder="Ej: Vimos en LinkedIn que acaban de abrir una nueva planta en Zaragoza..."
            rows={2}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 0, fontSize: 12,
              background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.1)',
              color: 'var(--text-primary)', outline: 'none', resize: 'none', boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={generateEmail}
            disabled={!selectedLeadId || loading}
            style={{
              padding: '10px 28px', borderRadius: 0, fontSize: 13, fontWeight: 600,
              cursor: selectedLeadId && !loading ? 'pointer' : 'default',
              background: selectedLeadId && !loading ? GOLD : 'rgba(0,0,0,0.06)',
              color: selectedLeadId && !loading ? '#000' : 'rgba(0,0,0,0.2)',
              border: 'none', transition: 'all 0.2s',
            }}
          >{loading ? 'Generando...' : 'Generar correo'}</button>
          {loading && (
            <button
              onClick={() => { abortRef.current?.abort(); setLoading(false); }}
              style={{
                padding: '10px 20px', borderRadius: 0, fontSize: 13, cursor: 'pointer',
                background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.2)',
                color: '#f87171',
              }}
            >Detener</button>
          )}
        </div>
      </Card>

      {/* Email result */}
      {emailText && (
        <Card style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Correo generado</div>
            <button
              onClick={copyEmail}
              style={{
                padding: '6px 16px', borderRadius: 0, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: 'rgba(0,168,120,0.12)', border: `1px solid ${GOLD}40`, color: GOLD,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,168,120,0.22)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,168,120,0.12)')}
            >Copiar</button>
          </div>
          <div style={{
            padding: '16px 20px', borderRadius: 0,
            background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)',
            fontSize: 13, color: 'rgba(0,0,0,0.85)', lineHeight: 1.7,
            whiteSpace: 'pre-wrap', fontFamily: 'inherit',
          }}>
            {emailText}
            {loading && <span style={{ display: 'inline-block', width: 8, height: 14, background: GOLD, marginLeft: 2, animation: 'pulse 1s infinite', verticalAlign: 'text-bottom' }} />}
          </div>
        </Card>
      )}

      {leads.length === 0 && (
        <Card style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.25)' }}>
            Añade empresas al CRM desde el Buscador para generar correos personalizados.
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

interface Props {
  agent: Agent;
  onBack: () => void;
}

export function CaptadorDashboard({ agent, onBack }: Props) {
  const [nav, setNav] = useState<NavSection>('panel');
  const [sheets, setSheets] = useState<CrmSheet[]>(() => loadSheets());
  const [activeSheetId, setActiveSheetId] = useState<string>(() => loadSheets()[0]?.id ?? 'sheet-default');
  const [tasks, setTasks] = useState<Task[]>(loadTasks);
  const [expandedLead, setExpandedLead] = useState<string | null>(null);

  const leads = sheets.find(s => s.id === activeSheetId)?.leads ?? [];

  const addSheet = () => {
    const name = `Hoja ${sheets.length + 1}`;
    const newSheet: CrmSheet = { id: uid(), name, leads: [], createdAt: new Date().toISOString() };
    const updated = [...sheets, newSheet];
    setSheets(updated);
    saveSheets(updated);
    setActiveSheetId(newSheet.id);
  };

  const renameSheet = (id: string, name: string) => {
    const updated = sheets.map(s => s.id === id ? { ...s, name } : s);
    setSheets(updated);
    saveSheets(updated);
  };

  const recolorSheet = (id: string, color: string) => {
    const updated = sheets.map(s => s.id === id ? { ...s, color } : s);
    setSheets(updated);
    saveSheets(updated);
  };

  const deleteSheet = (id: string) => {
    if (sheets.length <= 1) return;
    const sheetLeads = sheets.find(s => s.id === id)?.leads ?? [];
    const leadIds = new Set(sheetLeads.map(l => l.id));
    const updatedTasks = tasks.filter(t => !leadIds.has(t.leadId));
    const updated = sheets.filter(s => s.id !== id);
    setSheets(updated);
    saveSheets(updated);
    setTasks(updatedTasks);
    saveTasks(updatedTasks);
    if (activeSheetId === id) setActiveSheetId(updated[0]?.id ?? '');
  };

  const addTocrm = useCallback((c: Company) => {
    const exists = leads.some(l => l.company.toLowerCase() === c.name.toLowerCase());
    if (exists) { setNav('crm'); return; }
    const lead: Lead = {
      id: uid(),
      companyId: c.id,
      company: c.name,
      sector: c.sector,
      location: c.location,
      classification: c.classification,
      crmStatus: 'Nuevo',
      contact: c.contact,
      notes: c.reason,
      score: c.score,
      volumen: c.volumen,
      tipoResiduo: c.tipoResiduo,
      empleados: c.empleados,
      facturacion: c.facturacion,
      gastoResiduos: c.gastoResiduos,
      esg: c.esg,
      cluster: c.cluster,
      plantas: c.plantas,
      createdAt: new Date().toISOString(),
    };
    const newLeads = [lead, ...leads];
    const updated = sheets.map(s => s.id === activeSheetId ? { ...s, leads: newLeads } : s);
    setSheets(updated);
    saveSheets(updated);
    setNav('crm');
    setExpandedLead(lead.id);
  }, [leads, sheets, activeSheetId]);

  const updateStatus = (id: string, s: CrmStatus) => {
    const newLeads = leads.map(l => l.id === id ? { ...l, crmStatus: s } : l);
    const updated = sheets.map(sh => sh.id === activeSheetId ? { ...sh, leads: newLeads } : sh);
    setSheets(updated);
    saveSheets(updated);
  };

  const updateNotes = (id: string, notes: string) => {
    const newLeads = leads.map(l => l.id === id ? { ...l, notes } : l);
    const updated = sheets.map(sh => sh.id === activeSheetId ? { ...sh, leads: newLeads } : sh);
    setSheets(updated);
    saveSheets(updated);
  };

  const deleteLead = (id: string) => {
    const newLeads = leads.filter(l => l.id !== id);
    const updatedTasks = tasks.filter(t => t.leadId !== id);
    const updated = sheets.map(sh => sh.id === activeSheetId ? { ...sh, leads: newLeads } : sh);
    setSheets(updated);
    saveSheets(updated);
    setTasks(updatedTasks);
    saveTasks(updatedTasks);
    if (expandedLead === id) setExpandedLead(null);
  };

  const moveLeadToSheet = (leadId: string, targetSheetId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    const updated = sheets.map(sh => {
      if (sh.id === activeSheetId) return { ...sh, leads: sh.leads.filter(l => l.id !== leadId) };
      if (sh.id === targetSheetId) return { ...sh, leads: [...sh.leads, lead] };
      return sh;
    });
    setSheets(updated);
    saveSheets(updated);
    if (expandedLead === leadId) setExpandedLead(null);
  };

  const NAV: { id: NavSection; label: string; icon: React.ReactNode }[] = [
    { id: 'panel', label: 'Panel', icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1" y="1" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><rect x="8.5" y="1" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><rect x="1" y="8.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/></svg> },
    { id: 'buscador', label: 'Deep Research', icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.2"/><path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg> },
    { id: 'li-contacts', label: 'LI Contacts', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg> },
    { id: 'crm', label: `CRM · ${leads.length}`, icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M2 4h11M2 7.5h11M2 11h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg> },
    { id: 'analizador', label: 'Analizador', icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.2"/><path d="M7.5 4v3.5l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg> },
    { id: 'emails', label: 'Correos', icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1" y="3" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1 5l6.5 4L14 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg> },
    { id: 'analytics', label: 'Analytics', icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M2 12l3-4 3 2 3-6 2 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  ];

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--surface-0)', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif" }}>
      {/* Sidebar */}
      <div style={{
        width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: 'rgba(0,0,0,0.025)',
        borderRight: '1px solid rgba(0,0,0,0.06)',
        padding: '24px 12px',
      }}>
        {/* Logo area */}
        <div style={{ padding: '0 8px 24px', borderBottom: '1px solid rgba(0,0,0,0.06)', marginBottom: 12 }}>
          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8l4-4" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontFamily: "'Syne', 'Inter', system-ui, sans-serif", fontSize: 14, fontWeight: 700, color: '#0e1116', letterSpacing: '-0.01em' }}>Elvi-Ra</div>
            <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 9, color: GOLD, letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 3, fontWeight: 600 }}>MESA · RËFF</div>
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1 }}>
          {NAV.map(n => (
            <button
              key={n.id}
              onClick={() => setNav(n.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 0, marginBottom: 2,
                background: nav === n.id ? `${GOLD}15` : 'transparent',
                border: 'none', cursor: 'pointer',
                color: nav === n.id ? GOLD : 'rgba(0,0,0,0.45)',
                fontSize: 13, fontWeight: nav === n.id ? 600 : 400,
                transition: 'all 0.15s', textAlign: 'left',
              }}
              onMouseEnter={e => { if (nav !== n.id) e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
              onMouseLeave={e => { if (nav !== n.id) e.currentTarget.style.background = 'transparent'; }}
            >
              {n.icon}
              {n.label}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 12px 0', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: 999, background: '#34d399' }} />
            <span style={{ fontSize: 10, color: '#34d399', letterSpacing: '0.06em' }}>ACTIVO</span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '32px 36px' }}>
        {/* Page header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
            {nav === 'panel' && 'Panel'}
            {nav === 'buscador' && 'Deep Research'}
            {nav === 'li-contacts' && 'LI Contacts'}
            {nav === 'crm' && 'CRM · Leads'}
            {nav === 'analizador' && 'Analizador'}
            {nav === 'emails' && 'Correos de contacto'}
            {nav === 'analytics' && 'Analytics'}
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.35)', marginTop: 4, margin: 0 }}>
            {nav === 'panel' && 'Vista general del pipeline comercial S-NFI'}
            {nav === 'buscador' && 'Motor de búsqueda con scoring 0-130 · Filtros duros · Clasificación PRIORIDAD ALTA / CANDIDATO VÁLIDO / SEGUIMIENTO / DESCARTAR'}
            {nav === 'li-contacts' && 'Investiga perfiles de LinkedIn en VCs, Capital Markets y directivos clave para primeras tomas de contacto'}
            {nav === 'crm' && 'Gestiona leads, tareas y seguimiento por empresa'}
            {nav === 'analizador' && 'Auditoría profunda W·I·S·M·E·R + Baremo Herzog antes de la primera toma de contacto'}
            {nav === 'emails' && 'Genera correos personalizados 10/10 para cada empresa del CRM'}
            {nav === 'analytics' && 'Métricas y rendimiento del proceso comercial'}
          </p>
        </div>

        {/* Sections */}
        {nav === 'panel' && <PanelOverview leads={leads} tasks={tasks} />}
        {nav === 'buscador' && <Buscador onAddTocrm={addTocrm} />}
        {nav === 'li-contacts' && <LiContacts />}
        {nav === 'emails' && <Emails leads={leads} />}

        {nav === 'crm' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <SheetTabs
              sheets={sheets}
              activeId={activeSheetId}
              onSelect={id => { setActiveSheetId(id); setExpandedLead(null); }}
              onAdd={addSheet}
              onRename={renameSheet}
              onDelete={deleteSheet}
              onColorChange={recolorSheet}
            />
            <CrmSpreadsheet
              leads={leads}
              tasks={tasks}
              setTasks={setTasks}
              onStatusChange={updateStatus}
              onDelete={deleteLead}
              onNotesChange={updateNotes}
              expandedId={expandedLead}
              onToggle={id => setExpandedLead(expandedLead === id ? null : id)}
              sheets={sheets}
              activeSheetId={activeSheetId}
              onMove={moveLeadToSheet}
            />
          </div>
        )}

        {nav === 'analizador' && (
          <Analizador
            leads={leads}
            onGoToCrm={(leadId) => {
              setExpandedLead(leadId);
              setNav('crm');
            }}
          />
        )}
        {nav === 'analytics' && <Analytics leads={leads} tasks={tasks} />}
      </div>
    </div>
  );
}
