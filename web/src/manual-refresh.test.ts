import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

describe('manual refresh with an existing RFQ cache', () => {
  const key = ['rfq', 'REFRESH-TEST'];
  let client: QueryClient;
  let unsubscribe: (() => void) | undefined;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    client.setQueryData(key, { version: 'cached' });
  });

  afterEach(() => {
    unsubscribe?.();
    client.clear();
  });

  it('reproduces why mutations must not cancel a pending manual refresh', async () => {
    const observer = new QueryObserver(client, {
      queryKey: key, staleTime: Infinity, queryFn: () => new Promise<{ version: string }>(() => {}),
    });
    unsubscribe = observer.subscribe(() => {});
    const refresh = observer.refetch({ throwOnError: true });
    await client.cancelQueries({ queryKey: key });
    const result = await refresh;
    // Even throwOnError cannot distinguish cancellation from a completed GET here.
    expect(result.isError).toBe(false);
    expect(result.data).toEqual({ version: 'cached' });
  });

  it('keeps a refresh pending until the actual request completes when no mutation cancels it', async () => {
    let complete!: (value: { version: string }) => void;
    const request = new Promise<{ version: string }>((resolve) => { complete = resolve; });
    const observer = new QueryObserver(client, {
      queryKey: key, staleTime: Infinity, queryFn: () => request,
    });
    unsubscribe = observer.subscribe(() => {});
    let finished = false;
    const refresh = observer.refetch().then((result) => { finished = true; return result; });
    await Promise.resolve();
    expect(finished).toBe(false);
    expect(observer.getCurrentResult().isFetching).toBe(true);
    complete({ version: 'fresh' });
    await expect(refresh).resolves.toMatchObject({ isError: false, data: { version: 'fresh' } });
  });

  it('reports failure even when the previous RFQ remains available', async () => {
    const observer = new QueryObserver(client, {
      queryKey: key, staleTime: Infinity, queryFn: async () => { throw new Error('HTTP 503'); },
    });
    unsubscribe = observer.subscribe(() => {});
    await expect(observer.refetch()).resolves.toMatchObject({
      isError: true, data: { version: 'cached' }, error: new Error('HTTP 503'),
    });
  });
});
