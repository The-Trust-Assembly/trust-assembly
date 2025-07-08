import { BrowserRouter, Route, Routes } from "react-router-dom";
import Hello from "./Hello";
import './App.css'
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QueryBoundaryProvider from "./contexts/QueryBoundaryProvider";
import ParsedArticle from "./ParsedArticle";
import SessionProvider from "./contexts/SessionProvider";
import Index from "./Index";
import Replacements from "./Replacements";
import NewHeadlinePage from "./NewHeadline";

function App() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 0,
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <QueryBoundaryProvider>
        <SessionProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/hello" element={<Hello />} />
              <Route path="/parsedArticle" element={<ParsedArticle />} />
              <Route path="/replacements" element={<Replacements />} />
              <Route path="/newHeadline" element={<NewHeadlinePage />} />
            </Routes>
          </BrowserRouter>
        </SessionProvider>
      </QueryBoundaryProvider>
    </QueryClientProvider>
  )
}

export default App
