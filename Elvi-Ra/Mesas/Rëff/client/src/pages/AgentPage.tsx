import { useEffect, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAgents, type Agent, type User } from '../lib/api';

const CaptadorDashboard = lazy(() =>
  import('../components/CaptadorDashboard').then((m) => ({ default: m.CaptadorDashboard }))
);

const ComponentLoader = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: 200,
    }}
  >
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <span className="spinner" />
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cargando…</span>
    </div>
  </div>
);

interface Props {
  user: User;
  agentId?: string;
}

export function AgentPage({ user, agentId }: Props) {
  const navigate = useNavigate();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAgents()
      .then(({ agents }) => {
        const found = agents.find((a) => a.id === agentId);
        if (!found) {
          navigate('/crm', { replace: true });
          return;
        }
        setAgent(found);
      })
      .catch((e) => setError(e?.message || 'Error'))
      .finally(() => setLoading(false));
  }, [agentId, navigate]);

  if (loading) {
    return (
      <div className="flex h-screen flex-col" style={{ background: 'var(--surface-0)' }}>
        <div className="flex flex-1 items-center justify-center">
          <span className="spinner" />
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="flex h-screen flex-col" style={{ background: 'var(--surface-0)' }}>
        <div className="flex flex-1 items-center justify-center">
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{error || 'Agente no encontrado'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col" style={{ background: 'var(--surface-0)' }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Suspense fallback={<ComponentLoader />}>
          <CaptadorDashboard agent={agent} onBack={() => {}} />
        </Suspense>
      </div>
    </div>
  );
}
