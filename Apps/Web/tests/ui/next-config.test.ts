import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config.js';

async function getContentSecurityPolicy(apiBaseUrl: string): Promise<string> {
  const originalApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = apiBaseUrl;

  try {
    if (!nextConfig.headers) {
      throw new Error('Next.js headers configuration was not configured');
    }
    const headerRules = await nextConfig.headers();
    const policy = headerRules
      .flatMap((rule) => rule.headers)
      .find((header) => header.key === 'Content-Security-Policy-Report-Only');

    if (!policy) {
      throw new Error('Content-Security-Policy-Report-Only header was not configured');
    }

    return policy.value;
  } finally {
    if (originalApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalApiBaseUrl;
    }
  }
}

describe('Next.js development UI configuration', () => {
  it('disables the built-in development indicator', () => {
    expect(nextConfig.devIndicators).toBe(false);
  });

  it('allows the configured local API origin without broadening connect-src', async () => {
    const policy = await getContentSecurityPolicy('http://localhost:3001/api/v1');
    const connectSource = policy
      .split(';')
      .find((directive) => directive.trim().startsWith('connect-src '))
      ?.trim();

    expect(connectSource).toBe("connect-src 'self' https: http://localhost:3001");
  });

  it('keeps relative API URLs on the existing same-origin policy', async () => {
    const policy = await getContentSecurityPolicy('/api/v1');
    const connectSource = policy
      .split(';')
      .find((directive) => directive.trim().startsWith('connect-src '))
      ?.trim();

    expect(connectSource).toBe("connect-src 'self' https:");
  });
});
