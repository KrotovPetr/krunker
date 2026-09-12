import { describe, expect, it } from 'vitest';
import { resolveServerEndpoint } from './endpoint.js';

describe('resolveServerEndpoint', () => {
  it.each([
    'http://89.169.162.158',
    'https://play.example.com',
    'http://localhost:8088',
    'http://[::1]:8088',
  ])('uses the page origin in a container build: %s', (origin) => {
    expect(resolveServerEndpoint('same-origin', new URL(origin))).toBe(origin);
  });

  it('preserves an explicit endpoint for existing deployments and e2e tests', () => {
    expect(
      resolveServerEndpoint(
        'http://127.0.0.1:2568',
        new URL('http://localhost:4174'),
      ),
    ).toBe('http://127.0.0.1:2568');
  });

  it.each([undefined, ''])(
    'keeps the development default for %s',
    (configured) => {
      expect(
        resolveServerEndpoint(configured, new URL('http://localhost:5173')),
      ).toBe('http://localhost:2567');
    },
  );
});
