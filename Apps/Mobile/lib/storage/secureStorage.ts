/**
 * SECURE STORAGE ABSTRACTION (Section 30, 31).
 * Session/token material lives in the native keychain/keystore via
 * expo-secure-store. Web and non-native paths use an in-memory fallback that
 * never persists secrets to disk.
 *
 * Rules: no raw passwords stored; no plaintext secrets in AsyncStorage; no bundle secrets.
 */

import { Platform } from 'react-native';

let secureStore: { setItemAsync?: (k: string, v: string) => Promise<void>;
  getItemAsync?: (k: string) => Promise<string | null>;
  deleteItemAsync?: (k: string) => Promise<void>; } | null = null;

if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    secureStore = require('expo-secure-store');
  } catch {
    secureStore = null;
  }
}

const STORAGE_KEY_PREFIX = 'finora_sec_v1_';

const memoryVault = new Map<string, string>();

const SESSION_KEYS = ['auth_token', 'refresh_token', 'session_user'] as const;

export const SecureStorage = {
  async setItem(key: string, value: string): Promise<void> {
    memoryVault.set(key, value);
    if (secureStore?.setItemAsync) {
      await secureStore.setItemAsync(`${STORAGE_KEY_PREFIX}${key}`, value);
    }
  },

  async getItem(key: string): Promise<string | null> {
    const memory = memoryVault.get(key);
    if (memory !== undefined) return memory;
    if (secureStore?.getItemAsync) {
      try {
        const raw = await secureStore.getItemAsync(`${STORAGE_KEY_PREFIX}${key}`);
        if (raw !== null && raw !== undefined) {
          memoryVault.set(key, raw);
          return raw;
        }
      } catch {
        // Fall through to memory
      }
    }
    return memoryVault.get(key) ?? null;
  },

  async removeItem(key: string): Promise<void> {
    memoryVault.delete(key);
    if (secureStore?.deleteItemAsync) {
      try {
        await secureStore.deleteItemAsync(`${STORAGE_KEY_PREFIX}${key}`);
      } catch {
        // Best-effort removal
      }
    }
  },

  async clearSession(): Promise<void> {
    await Promise.all(SESSION_KEYS.map((k) => this.removeItem(k)));
  },
};