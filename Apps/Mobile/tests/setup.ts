/**
 * JEST SETUP (jest-expo preset).
 * Pure-logic suites (format / errors / telemetry / mock engine) require no
 * native-module shims. Math.random is intentionally NOT mocked: the mock
 * adapter derives entity ids from it — a fixed seed would collide ids and
 * collapse the in-memory Maps.
 */

process.env.EXPO_PUBLIC_USE_REAL_API = '0';
