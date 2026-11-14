import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logger } from '@/core/logging/logger';

/**
 * Application QueryClient and its global failure wiring.
 *
 * Lives beside the logger rather than inside `App.tsx` so the real cache
 * callbacks can be driven by a synthetic rejected query/mutation in a test,
 * without importing the whole router/page/Firebase graph.
 *
 * Behaviour is unchanged from the previous in-`App` definition: the same
 * defaults and the same toast copy. The only addition is a structured log line
 * — the previous `console.error` was outside the logger API, so it carried a
 * raw error object.
 */
const queryCache = new QueryCache({
  onError: (error) => {
    logger.error('query.error', error);
    toast.error('Data load failed', { description: error?.message || 'Please reload and try again' });
  },
});

const mutationCache = new MutationCache({
  onError: (error) => {
    logger.error('mutation.error', error);
    toast.error('Action failed', { description: error?.message || 'Please try again' });
  },
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds
      retry: 1,
    },
  },
  queryCache,
  mutationCache,
});
