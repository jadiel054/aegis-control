export function checkApiKey(req: Request): boolean {
  const expectedKey = process.env.AEGIS_API_KEY;
  if (!expectedKey) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[auth] Fail closed: AEGIS_API_KEY is not set in production');
      return false;
    }
    return true;
  }
  const authHeader = req.headers.get('authorization');
  const xApiKey = req.headers.get('x-api-key');
  if (xApiKey && xApiKey === expectedKey) return true;
  if (authHeader) {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    if (token === expectedKey) return true;
  }
  return false;
}
