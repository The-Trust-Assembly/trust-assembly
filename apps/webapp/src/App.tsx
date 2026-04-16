import { lazy, Suspense, useMemo } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import './App.css'
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QueryBoundaryProvider from "./contexts/QueryBoundaryProvider";
import SessionProvider from "./contexts/SessionProvider";
import ScrollRestoration from "./components/ScrollRestoration";

const Index = lazy(() => import("./Index"));
const Hello = lazy(() => import("./Hello"));
const ParsedArticle = lazy(() => import("./ParsedArticle"));
const Replacements = lazy(() => import("./Replacements"));
const NewHeadlinePage = lazy(() => import("./NewHeadline"));

const RouteFallback = () => (
  <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }} aria-live="polite">
    Loading…
  </div>
);

function App() {
  const queryClient = useMemo(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 0,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  }), []);

  return (
    <QueryClientProvider client={queryClient}>
      <QueryBoundaryProvider>
        <SessionProvider>
          <BrowserRouter>
            <ScrollRestoration />
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/hello" element={<Hello />} />
                <Route path="/parsedArticle" element={<ParsedArticle />} />
                <Route path="/replacements" element={<Replacements />} />
                <Route path="/newHeadline" element={<NewHeadlinePage />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </SessionProvider>
      </QueryBoundaryProvider>
    </QueryClientProvider>
  )
}

export default App
