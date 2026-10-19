import { afterEach, describe, expect, it } from 'vitest';
import { resolveWebApiConfig } from '@/lib/api-config';

describe('Web API configuration', () => {
  afterEach(() => {
    delete process.env.FINORA_HTTP_SMOKE;
  });

  it('selects the real adapter for an explicit valid real configuration', () => {
    expect(resolveWebApiConfig('real', 'https://api.finora.com/api/v1/', 'production')).toEqual({
      useRealApi: true,
      baseUrl: 'https://api.finora.com/api/v1',
    });
  });

  it('accepts HTTPS production endpoints on private production DNS names', () => {
    expect(resolveWebApiConfig('real', 'https://api.internal.finora/api/v1', 'production')).toEqual({
      useRealApi: true,
      baseUrl: 'https://api.internal.finora/api/v1',
    });
  });

  it('allows explicit mock mode in development and test only', () => {
    expect(resolveWebApiConfig('mock', undefined, 'development')).toEqual({
      useRealApi: false,
      baseUrl: null,
    });
    expect(resolveWebApiConfig('mock', undefined, 'test').useRealApi).toBe(false);
  });

  it.each([undefined, '', 'typo', 'REAL'])('rejects missing or invalid mode: %s', (mode) => {
    expect(() => resolveWebApiConfig(mode, 'https://api.finora.test/api/v1', 'production')).toThrow(
      'NEXT_PUBLIC_API_MODE must be explicitly set',
    );
  });

  it('rejects explicit mock mode in production', () => {
    expect(() => resolveWebApiConfig('mock', undefined, 'production')).toThrow(
      'NEXT_PUBLIC_API_MODE must be "real" in production',
    );
  });

  it.each([
    undefined,
    '',
    'not-a-url',
    '/api/v1',
    'https:api.finora.test/api/v1',
    'https://user:pass@api.finora.test/api/v1',
    'https://api.finora.test/api/v1?debug=1',
  ])(
    'rejects missing or malformed production API URL: %s',
    (baseUrl) => {
      expect(() => resolveWebApiConfig('real', baseUrl, 'production')).toThrow();
    },
  );

  it.each([
    'http://api.finora.com/api/v1',
    'https://localhost:3001/api/v1',
    'https://localhost./api/v1',
    'https://127.0.0.1/api/v1',
    'https://[::1]/api/v1',
    'https://api.finora.test/api/v1',
    'https://api.finora.test./api/v1',
    'https://example.com/api/v1',
    'https://api.example.com/api/v1',
    'https://api.localhost/api/v1',
    'https://api.local/api/v1',
    'https://api.invalid/api/v1',
  ])('rejects unsafe production API URL: %s', (baseUrl) => {
    expect(() => resolveWebApiConfig('real', baseUrl, 'production')).toThrow(
      'must use HTTPS and a real, non-placeholder production host',
    );
  });

  it('allows only a loopback HTTP endpoint for the explicit smoke mode', () => {
    process.env.FINORA_HTTP_SMOKE = '1';

    expect(resolveWebApiConfig('real', 'http://127.0.0.1:5000/api/v1', 'production')).toEqual({
      useRealApi: true,
      baseUrl: 'http://127.0.0.1:5000/api/v1',
    });
    expect(() => resolveWebApiConfig('real', 'http://api.finora.com/api/v1', 'production')).toThrow(
      'FINORA_HTTP_SMOKE may only use an HTTP loopback API URL.',
    );
  });
});
