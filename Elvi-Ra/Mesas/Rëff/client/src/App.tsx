import { Navigate, Route, Routes } from 'react-router-dom';
import { AgentPage } from './pages/AgentPage';
import type { User } from './lib/api';

const GUEST_USER: User = {
  id: 1,
  username: 'marc',
  displayName: 'Marc',
  avatarUrl: null,
  agents: ['captador'],
};

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/crm" replace />} />
      <Route path="/crm" element={<AgentPage user={GUEST_USER} agentId="captador" />} />
      <Route path="*" element={<Navigate to="/crm" replace />} />
    </Routes>
  );
}
