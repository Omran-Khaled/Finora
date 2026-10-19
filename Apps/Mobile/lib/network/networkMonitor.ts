/**
 * NETWORK STATE (Section 51).
 * Clear states: Online / Requesting / Offline / Failed / Retrying.
 * MVP offline = clear UX, not a local financial ledger synchronization..
 */

import { useEffect, useState, useCallback } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export type NetworkStatus = 'online' | 'offline' | 'unknown';

interface UseNetworkResult {
  isOffline: boolean;
  status: NetworkStatus;
  refresh: () => Promise<void>;
}

let cachedStatus: NetworkStatus = 'unknown';

export function getCachedNetworkStatus(): NetworkStatus {
  return cachedStatus;
}

export function useNetworkStatus(): UseNetworkResult {
  const [status, setStatus] = useState<NetworkStatus>(cachedStatus);

  const applyState = useCallback((state: NetInfoState) => {
    const next: NetworkStatus = state.isConnected === false ? 'offline' : 'online';
    cachedStatus = next;
    setStatus(next);
  }, []);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (mounted) applyState(state);
    });

    NetInfo.fetch()
      .then((state) => {
        if (mounted) applyState(state);
      })
      .catch(() => {
        // Keep last known status
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [applyState]);

  const refresh = useCallback(async () => {
    try {
      const state = await NetInfo.fetch();
      applyState(state);
    } catch {
      // Keep last known status
    }
  }, [applyState]);

  return {
    isOffline: status === 'offline',
    status,
    refresh,
  };
}