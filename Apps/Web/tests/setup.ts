import { afterEach, expect, vi } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';

process.env.NEXT_PUBLIC_API_MODE = 'mock';

expect.extend(matchers);

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

// jsdom polyfills required by Radix-based components
if (typeof window !== 'undefined') {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

// jsdom lacks window.matchMedia in some versions
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
