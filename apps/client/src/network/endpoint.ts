/** Container builds use the page origin; local development keeps port 2567. */
export function resolveServerEndpoint(
  configured: string | undefined,
  page: Pick<Location, 'origin' | 'protocol' | 'hostname'>,
): string {
  if (configured === 'same-origin') return page.origin;
  return configured || `${page.protocol}//${page.hostname}:2567`;
}
