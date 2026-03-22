import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../spa/lib/queryClient";
import TrustAssembly from "../trust-assembly-v5.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TrustAssembly />
    </QueryClientProvider>
  </React.StrictMode>
);
