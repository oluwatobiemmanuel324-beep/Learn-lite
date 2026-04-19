import { useEffect, useMemo, useState } from 'react';

const ROLE_LABELS = {
  SYSTEM_OWNER: 'System Owner',
  ROOT_ADMIN: 'Root Admin',
  FINANCE_CONTROLLER: 'Financial Controller',
  OPS_MODERATOR: 'Ops Moderator',
  SOCIAL_MEDIA_CONTROLLER: 'Social Media Controller',
  ACADEMIC_REGISTRAR: 'Academic Registrar'
};

function safeParseUser(rawValue) {
  try {
    const parsed = JSON.parse(rawValue || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function useAuth() {
  const [user, setUser] = useState(() => safeParseUser(localStorage.getItem('learn_lite_user')));
  const [role, setRole] = useState(() => localStorage.getItem('user_role') || user?.role || 'USER');
  const [token, setToken] = useState(() => localStorage.getItem('learn_lite_token') || '');

  useEffect(() => {
    const sync = () => {
      const nextUser = safeParseUser(localStorage.getItem('learn_lite_user'));
      const nextRole = localStorage.getItem('user_role') || nextUser?.role || 'USER';
      const nextToken = localStorage.getItem('learn_lite_token') || '';
      setUser(nextUser);
      setRole(nextRole);
      setToken(nextToken);
    };

    const onStorage = (event) => {
      if (!event || !event.key) return;
      const authKeys = new Set(['learn_lite_token', 'learn_lite_user', 'user_id', 'user_role']);
      if (!authKeys.has(event.key)) return;
      sync();
    };

    sync();
    window.addEventListener('storage', onStorage);
    window.addEventListener('learnlite-auth-changed', sync);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('learnlite-auth-changed', sync);
    };
  }, []);

  return useMemo(() => ({
    user,
    role,
    roleLabel: ROLE_LABELS[role] || role,
    token,
    isAuthenticated: Boolean(token)
  }), [user, role, token]);
}
