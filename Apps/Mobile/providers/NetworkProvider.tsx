/**
 * NETWORK PROVIDER (Section 51) — Online / Requesting / Offline / Failed / Retrying.
 */

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useNetworkStatus, NetworkStatus } from '../lib/network/networkMonitor';

interface NetworkContextValue {
  isOffline: boolean;
  status: NetworkStatus;
  refresh: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const { isOffline, status, refresh } = useNetworkStatus();
  const value = useMemo<NetworkContextValue>(
    () => ({ isOffline, status, refresh }),
    [isOffline, status, refresh],
  );
  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkContextValue {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within NetworkProvider');
  }
  return context;
}