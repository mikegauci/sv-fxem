// Only public https addresses: no credentials, ports, IP literals or local names.
export function isPublicHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      url.hostname.includes('.') && !/^[\d.]+$|^\[|\.(local|internal|localhost)$/i.test(url.hostname);
  } catch { return false; }
}

