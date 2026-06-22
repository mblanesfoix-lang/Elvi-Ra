import { useState } from 'react';
import type { Sheet } from '../lib/api';

interface Props {
  sheets: Sheet[];
  activeSheetId: number | null;
  onSelect: (id: number) => void;
  onCreate: (name: string) => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
}

export function SheetTabs({ sheets, activeSheetId, onSelect, onCreate, onRename, onDelete }: Props) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  function startEdit(sheet: Sheet) {
    setEditingId(sheet.id);
    setEditValue(sheet.name);
  }

  function commitEdit() {
    if (editingId != null && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  }

  function handleCreate() {
    const name = window.prompt('Nombre de la nueva hoja:');
    if (name && name.trim()) onCreate(name.trim());
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid var(--border-mid)', padding: '0 24px', overflowX: 'auto' }}>
      {sheets.map((sheet) => {
        const active = sheet.id === activeSheetId;
        return (
          <div
            key={sheet.id}
            onClick={() => onSelect(sheet.id)}
            onDoubleClick={() => startEdit(sheet)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              cursor: 'pointer',
              borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: active ? 600 : 400,
              fontSize: 13,
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            {editingId === sheet.id ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit();
                  if (e.key === 'Escape') setEditingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                style={{ font: 'inherit', border: 'none', borderBottom: '1px solid var(--accent)', background: 'transparent', outline: 'none', width: 120 }}
              />
            ) : (
              <span>{sheet.name}</span>
            )}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, opacity: 0.5 }}>{sheet.companyCount}</span>
            {sheets.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`¿Eliminar la hoja "${sheet.name}" y todas sus empresas?`)) onDelete(sheet.id);
                }}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', opacity: 0.35, fontSize: 14, padding: 0, lineHeight: 1 }}
                title="Eliminar hoja"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      <button
        onClick={handleCreate}
        style={{
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          color: 'var(--accent)',
          fontSize: 18,
          padding: '8px 12px',
          fontWeight: 600,
        }}
        title="Nueva hoja"
      >
        +
      </button>
    </div>
  );
}
