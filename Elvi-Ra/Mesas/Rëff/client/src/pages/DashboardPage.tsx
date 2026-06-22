import { useEffect, useState } from 'react';
import { Globe3D } from '../components/Globe3D';
import { CityTooltip } from '../components/CityTooltip';
import { fetchGlobeCities, type GlobeCity } from '../lib/api';
import { STATUS_META } from '../lib/status';

export function DashboardPage() {
  const [cities, setCities] = useState<GlobeCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ city: GlobeCity; x: number; y: number } | null>(null);

  useEffect(() => {
    fetchGlobeCities()
      .then(({ cities }) => setCities(cities))
      .catch((e) => setError(e?.message || 'Error al cargar el globo'))
      .finally(() => setLoading(false));
  }, []);

  const totalCompanies = cities.reduce((sum, c) => sum + c.companies.length, 0);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', background: 'var(--surface-0)', overflow: 'hidden' }}>
      {/* Header overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '24px 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            Dashboard Global
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: 4 }}>
            {cities.length} {cities.length === 1 ? 'ciudad' : 'ciudades'} · {totalCompanies} {totalCompanies === 1 ? 'empresa' : 'empresas'} registradas
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          {Object.entries(STATUS_META).map(([key, meta]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color }} />
              <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>{meta.label}</span>
            </div>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
          <span className="spinner" />
        </div>
      )}

      {error && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
          <span style={{ color: '#ff6b6b', fontFamily: 'var(--font-mono)', fontSize: 13 }}>{error}</span>
        </div>
      )}

      {!loading && !error && (
        <Globe3D
          cities={cities}
          onHoverCity={(city, x, y) => setHover(city ? { city, x, y } : null)}
        />
      )}

      {hover && <CityTooltip city={hover.city} x={hover.x} y={hover.y} />}

      {!loading && !error && cities.length === 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 32,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-muted)',
            letterSpacing: '0.08em',
            pointerEvents: 'none',
          }}
        >
          Sin empresas registradas. Añade empresas desde el CRM para verlas aquí.
        </div>
      )}
    </div>
  );
}
