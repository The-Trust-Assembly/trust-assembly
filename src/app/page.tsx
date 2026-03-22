"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../../spa/lib/queryClient";
import TrustAssembly from "../../trust-assembly-v5.jsx";

export default function Home() {
  return (
    <QueryClientProvider client={queryClient}>
      <TrustAssembly />
    </QueryClientProvider>
  );
}
