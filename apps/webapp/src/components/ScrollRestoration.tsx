import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// Save window.scrollY per pathname in sessionStorage. On PUSH/REPLACE
// navigations scroll to top; on POP (browser back/forward) restore the
// saved offset after render. Works with BrowserRouter — no need to
// migrate to createBrowserRouter just to get scroll restoration.
export default function ScrollRestoration() {
  const { pathname } = useLocation();
  const navType = useNavigationType();

  useEffect(() => {
    const key = `scroll:${pathname}`;

    if (navType === "POP") {
      try {
        const saved = sessionStorage.getItem(key);
        if (saved !== null) {
          const y = parseInt(saved, 10);
          if (!Number.isNaN(y)) {
            // Wait a frame so the new route has painted before we scroll.
            requestAnimationFrame(() => window.scrollTo(0, y));
            return;
          }
        }
      } catch { /* ignore */ }
    }
    window.scrollTo(0, 0);
  }, [pathname, navType]);

  useEffect(() => {
    const onScroll = () => {
      try { sessionStorage.setItem(`scroll:${pathname}`, String(window.scrollY)); } catch { /* ignore */ }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  return null;
}
