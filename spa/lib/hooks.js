import { useEffect, useRef } from "react";

const DRAFT_DEBOUNCE = 500;

export function useDraft(key, state, restoreFn) {
  const timer = useRef(null);
  const restored = useRef(false);
  // Restore once on mount
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(key);
      if (raw) { const parsed = JSON.parse(raw); restoreFn(parsed); }
    } catch {}
  }, []);
  // Save on every state change (debounced)
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
    }, DRAFT_DEBOUNCE);
    return () => clearTimeout(timer.current);
  }, [state]);
}

export function clearDraft(key) { try { localStorage.removeItem(key); } catch {} }
