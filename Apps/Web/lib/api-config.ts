export type ApiEnvironment = 'development' | 'test' | 'production';

export interface WebApiConfig {
  useRealApi: boolean;
  baseUrl: string | null;
}

function validateBaseUrl(value: string | undefined, environment: ApiEnvironment): string {
  const configuredUrl = value?.trim();
  if (!configuredUrl) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is required when NEXT_PUBLIC_API_MODE=real.');
  }
  if (!/^https?:\/\//i.test(configuredUrl)) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL must be an absolute HTTP(S) URL.');
  }

  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error('NEXT_PUBLIC_API_BASE_URL must be an absolute HTTP(S) URL.');
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL must be an absolute HTTP(S) URL without credentials, query, or fragment.');
  }

  if (environment === 'production') {
    const host = url.hostname.toLowerCase().replace(/\.+$/, '');
    if (
      url.protocol !== 'https:' ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '[::1]' ||
      host === 'example.com' ||
      host.endsWith('.example.com') ||
      host.endsWith('.test') ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.invalid')
    ) {
      throw new Error('NEXT_PUBLIC_API_BASE_URL must use HTTPS and a real, non-placeholder production host.');
    }
  }

  return configuredUrl.replace(/\/+$/, '');
}

export function resolveWebApiConfig(
  mode: string | undefined,
  baseUrl: string | undefined,
  environment: ApiEnvironment,
): WebApiConfig {
  if (mode !== 'real' && mode !== 'mock') {
    throw new Error('NEXT_PUBLIC_API_MODE must be explicitly set to "real" or "mock".');
  }

  if (environment === 'production' && mode !== 'real') {
    throw new Error('NEXT_PUBLIC_API_MODE must be "real" in production.');
  }

  if (mode === 'mock') {
    return { useRealApi: false, baseUrl: null };
  }

  return { useRealApi: true, baseUrl: validateBaseUrl(baseUrl, environment) };
}
