/** Ativa facilidades temporárias apenas nos deployments de Preview do Cloudflare Pages. */
export function isPreviewTestMode(hostname = typeof window === 'undefined' ? '' : window.location.hostname): boolean {
  return hostname !== 'fibula-online.pages.dev' && hostname.endsWith('.fibula-online.pages.dev');
}
