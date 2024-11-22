import { BrowserRouter, Route, Routes } from "react-router-dom";
import Index from "./Index";
import Hello from "./Hello";
import './App.css'
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QueryBoundaryProvider from "./contexts/QueryBoundaryProvider";
import ParsedArticle from "./ParsedArticle";

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
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/hello" element={<Hello />} />
            <Route path="/parsedArticle" element={<ParsedArticle />} />
          </Routes>
        </BrowserRouter>
      </QueryBoundaryProvider>
    </QueryClientProvider>
  )
}

export default App
