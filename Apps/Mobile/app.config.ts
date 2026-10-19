import { ExpoConfig, ConfigContext } from 'expo/config';
import { resolveMobileApiConfig } from './lib/api/apiConfig.js';

const DEFAULT_BUNDLE_ID = 'com.finora.mobile';

function requiredProductionId(name: string, fallback: string): string {
  const value = process.env[name]?.trim() || fallback;
  if (
    process.env.FINORA_RELEASE === 'production' &&
    (!value || value === DEFAULT_BUNDLE_ID)
  ) {
    throw new Error(
      `${name} must be set to the owning organization's real identifier for production builds.`,
    );
  }
  return value;
}

/**
 * Finora Mobile — environment-owned application identity.
 * Development/preview builds may use the safe placeholder. Production builds
 * fail closed until the owning organization's store identifiers are supplied.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const iosBundleIdentifier = requiredProductionId(
    'FINORA_IOS_BUNDLE_ID',
    DEFAULT_BUNDLE_ID,
  );
  const androidPackage = requiredProductionId(
    'FINORA_ANDROID_PACKAGE',
    DEFAULT_BUNDLE_ID,
  );

  if (
    process.env.FINORA_RELEASE === 'production' ||
    process.env.NODE_ENV === 'production'
  ) {
    resolveMobileApiConfig(
      process.env.EXPO_PUBLIC_USE_REAL_API,
      process.env.EXPO_PUBLIC_API_URL,
      'production',
    );
  }

  return {
    ...config,
    name: 'Finora',
    slug: 'finora-mobile',
    version: '0.1.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    scheme: 'finora',
    backgroundColor: '#F3F8FD',
    ios: {
      supportsTablet: false,
      bundleIdentifier: iosBundleIdentifier,
    },
    android: {
      package: androidPackage,
      adaptiveIcon: {
        foregroundImage: './assets/icon.png',
        backgroundColor: '#F3F8FD',
      },
    },
    plugins: [
      [
        'expo-splash-screen',
        {
          backgroundColor: '#F3F8FD',
          image: './assets/icon.png',
          imageWidth: 160,
        },
      ],
    ],
  };
};
