import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

/** Loads data whenever the screen comes into focus, with pull-to-refresh support. */
export function useFocusData<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const run = useCallback(async () => {
    try {
      setError(null);
      setData(await loader());
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      run();
    }, [run]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await run();
    setRefreshing(false);
  }, [run]);

  return { data, error, refreshing, refresh };
}
