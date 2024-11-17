import { BrowserRouter, Route, Routes } from "react-router-dom";
import Index from "./Index";
import Hello from "./Hello";
import './App.css'
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function App() {
  const queryClient = new QueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/hello" element={<Hello />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
