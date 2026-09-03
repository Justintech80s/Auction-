import net from 'node:net';

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0;
}

function isBlockedHost(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return true;
  if (net.isIP(host) === 4) return isPrivateIpv4(host);
  if (net.isIP(host) === 6) {
    return host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb');
  }
  return false;
}

export function validateOutboundUrl(value, allowedHosts = []) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new Error('blocked_outbound_url:malformed');
  }

  if (url.protocol !== 'https:') throw new Error('blocked_outbound_url:protocol');
  if (url.username || url.password) throw new Error('blocked_outbound_url:credentials');
  if (isBlockedHost(url.hostname)) throw new Error('blocked_outbound_url:private_host');

  const normalizedAllowed = allowedHosts.map((host) => String(host).toLowerCase());
  if (!normalizedAllowed.includes(url.hostname.toLowerCase())) {
    throw new Error('blocked_outbound_url:host_not_allowed');
  }
  return url;
}

export function validateRedirectChain(urls = [], allowedHosts = [], maxRedirects = 2) {
  if (urls.length - 1 > maxRedirects) throw new Error('blocked_outbound_url:too_many_redirects');
  return urls.map((url) => validateOutboundUrl(url, allowedHosts));
}
