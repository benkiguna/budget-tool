import { useState, useEffect, useCallback } from 'react';

function parseHash(hash) {
  const raw = (hash || '').replace(/^#\/?/, '');
  const segments = raw.split('/').filter(Boolean);
  return {
    tab: segments[0] || 'dashboard',
    subtab: segments[1] || '',
  };
}

export function useRouter() {
  const [loc, setLoc] = useState(() => parseHash(window.location.hash));

  useEffect(() => {
    function onHashChange() {
      setLoc(parseHash(window.location.hash));
    }
    window.addEventListener('hashchange', onHashChange);
    if (!window.location.hash || window.location.hash === '#') {
      window.history.replaceState(null, '', '#/dashboard');
      setLoc({ tab: 'dashboard', subtab: '' });
    }
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((tab, subtab = '') => {
    window.location.hash = subtab ? `#/${tab}/${subtab}` : `#/${tab}`;
  }, []);

  return { tab: loc.tab, subtab: loc.subtab, navigate };
}
