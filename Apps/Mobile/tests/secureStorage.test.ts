import { afterEach, describe, expect, it, jest } from '@jest/globals';

type SecureStoreModule = typeof import('../lib/storage/secureStorage');

function createSecureStoreMock() {
  return {
    setItemAsync: jest.fn(async (_key: string, _value: string): Promise<void> => undefined),
    getItemAsync: jest.fn(async (_key: string): Promise<string | null> => null),
    deleteItemAsync: jest.fn(async (_key: string): Promise<void> => undefined),
  };
}

function loadSecureStorage(
  platform: 'web' | 'ios' | 'android',
  secureStore: ReturnType<typeof createSecureStoreMock>,
) {
  jest.resetModules();
  jest.doMock('react-native', () => ({ Platform: { OS: platform } }));
  jest.doMock('expo-secure-store', () => secureStore);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../lib/storage/secureStorage') as SecureStoreModule;
}

afterEach(() => {
  jest.dontMock('react-native');
  jest.dontMock('expo-secure-store');
  jest.resetModules();
});

describe('SecureStorage platform behavior', () => {
  it('uses only the in-memory fallback on web', async () => {
    const secureStore = createSecureStoreMock();
    secureStore.setItemAsync.mockImplementation(async () => {
      throw new Error('Native SecureStore is unavailable on web');
    });
    secureStore.getItemAsync.mockImplementation(async () => {
      throw new Error('Native SecureStore is unavailable on web');
    });
    secureStore.deleteItemAsync.mockImplementation(async () => {
      throw new Error('Native SecureStore is unavailable on web');
    });
    const { SecureStorage } = loadSecureStorage('web', secureStore);

    await SecureStorage.setItem('auth_token', 'web-token');
    expect(await SecureStorage.getItem('auth_token')).toBe('web-token');
    await SecureStorage.removeItem('auth_token');
    expect(await SecureStorage.getItem('auth_token')).toBeNull();
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
    expect(secureStore.getItemAsync).not.toHaveBeenCalled();
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it.each(['ios', 'android'] as const)(
    'keeps native SecureStore behavior on %s',
    async (platform: 'ios' | 'android') => {
      const secureStore = createSecureStoreMock();
      secureStore.getItemAsync.mockResolvedValue('native-token');
      const { SecureStorage } = loadSecureStorage(platform, secureStore);

      expect(await SecureStorage.getItem('auth_token')).toBe('native-token');
      expect(secureStore.getItemAsync).toHaveBeenCalledWith('finora_sec_v1_auth_token');

      await SecureStorage.setItem('refresh_token', 'refresh');
      expect(secureStore.setItemAsync).toHaveBeenCalledWith('finora_sec_v1_refresh_token', 'refresh');

      await SecureStorage.removeItem('refresh_token');
      expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('finora_sec_v1_refresh_token');
    },
  );
});
