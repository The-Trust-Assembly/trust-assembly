import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,         // 30s before refetch on mount
      gcTime: 5 * 60_000,        // 5 min garbage collection
      refetchOnWindowFocus: true, // Refetch when tab regains focus
      retry: 1,
    },
  },
});
