import { useState, useEffect, useRef } from 'react';
import { storage } from '../lib/storage.js';

const POPUP_BASE = '';

export default function PlaidLinkButton({ itemCount = 0, onConnected }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const atLimit = itemCount >= 10;

  useEffect(() => {
    return () => clearInterval(pollRef.current);
  }, []);

  async function handleClick() {
    setLoading(true);
    setError(null);

    try {
      // Fetch link token — same-origin API call, works fine under COEP
      const data = await storage.plaid.createLinkToken();

      const popupUrl = `${POPUP_BASE}/plaid-link?token=${encodeURIComponent(data.link_token)}`;
      const popup = window.open(popupUrl, 'plaid-link', 'width=500,height=700,left=200,top=100');

      if (!popup) {
        setError('Popup was blocked — allow popups for this site and try again.');
        setLoading(false);
        return;
      }

      const prevCount = itemCount;

      // Poll until popup closes, then check if a new item was added
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        if (!popup.closed) return;
        clearInterval(pollRef.current);

        try {
          const items = await storage.plaid.getItems();
          if (items.length > prevCount) {
            onConnected?.();
          }
        } catch {
          // silent — user can manually refresh
        }
        setLoading(false);
      }, 500);

    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading || atLimit}
        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
      >
        {loading ? (
          <>
            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Connecting…
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Connect Bank
          </>
        )}
      </button>

      {atLimit && (
        <p className="text-xs text-amber-500 mt-2">10/10 banks connected — Trial plan limit reached.</p>
      )}
      {error && (
        <p className="text-xs text-red-400 mt-2">{error}</p>
      )}
    </div>
  );
}
