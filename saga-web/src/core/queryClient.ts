import { QueryClient } from "@tanstack/react-query";

// staleTime: data fetched in the last 30 s is reused instead of refetched, so
// switching tabs/windows back to Saga no longer re-downloads every list on
// the page. Mutations still invalidate what they change explicitly.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});
