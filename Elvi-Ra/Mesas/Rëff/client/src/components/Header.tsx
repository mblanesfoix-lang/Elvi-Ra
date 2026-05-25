import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User, Agent } from '../lib/api';
import logoSnfi from '../assets/logo-snfi.png';

interface HeaderProps {
  user: User;
  activeAgent?: Agent | null;
}

function AvatarDisplay({
  avatarUrl,
  initials,
  size = 28,
}: {
  avatarUrl?: string | null;
  initials: string;
  size?: number;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt="avatar"
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--accent-dim)',
        color: 'var(--accent)',
        fontSize: size < 24 ? 10 : 12,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}

export function HeaderComponent({ user, activeAgent }: HeaderProps) {
  const navigate = useNavigate();

  const initials = user.displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header
      className="glass flex items-center justify-between flex-shrink-0"
      style={{
        height: 46,
        padding: '0 18px',
        borderTop: 'none',
        borderLeft: 'none',
        borderRight: 'none',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <div className="flex items-center min-w-0">
        <button
          onClick={() => navigate('/crm')}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            transition: 'opacity 160ms',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <img src={logoSnfi} alt="Rëff" style={{ height: 22, width: 'auto', display: 'block' }} />
        </button>

        {activeAgent && (
          <>
            <span
              style={{
                margin: '0 10px',
                fontSize: 12,
                color: 'var(--text-muted)',
                userSelect: 'none',
              }}
            >
              /
            </span>
            <div className="flex items-center gap-2 min-w-0">
              <span
                style={{
                  width: 3,
                  height: 13,
                  borderRadius: 2,
                  background: activeAgent.color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.011em',
                }}
                className="truncate"
              >
                {activeAgent.name}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  background: 'var(--surface-2)',
                  borderRadius: 999,
                  padding: '1px 8px',
                  marginLeft: 4,
                }}
              >
                {activeAgent.category}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center flex-shrink-0">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 10px 4px 4px',
            borderRadius: 999,
            border: '1px solid var(--border-subtle)',
          }}
        >
          <AvatarDisplay avatarUrl={user.avatarUrl} initials={initials} size={22} />
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
            {user.displayName}
          </span>
        </div>
      </div>
    </header>
  );
}

export const Header = memo(HeaderComponent, (prev, next) => {
  return prev.user.id === next.user.id && prev.activeAgent?.id === next.activeAgent?.id;
});
