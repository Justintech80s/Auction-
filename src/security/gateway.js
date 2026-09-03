const DEFAULT_MAX_FIELD_LENGTH = 512;

function normalizeMethod(method) {
  return String(method || 'POST').toUpperCase();
}

function assertBoundedValue(value, maxFieldLength, path = 'body') {
  if (typeof value === 'string' && value.length > maxFieldLength) {
    throw new Error(`invalid_input:${path}`);
  }
  if (Array.isArray(value)) {
    if (value.length > 100) throw new Error(`invalid_input:${path}`);
    value.forEach((entry, index) => assertBoundedValue(entry, maxFieldLength, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (key.length > 128) throw new Error(`invalid_input:${path}`);
      assertBoundedValue(entry, maxFieldLength, `${path}.${key}`);
    }
  }
}

export function validateGuardianRequest(request = {}, options = {}) {
  const method = normalizeMethod(request.method);
  const allowedMethods = options.allowedMethods || ['POST'];
  if (!allowedMethods.includes(method)) {
    throw new Error('method_not_allowed');
  }

  const body = request.body ?? {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('invalid_input:body');
  }

  assertBoundedValue(body, options.maxFieldLength ?? DEFAULT_MAX_FIELD_LENGTH);

  const requestId = String(request.requestId || '').trim() || `req-${Date.now().toString(36)}`;
  return {
    ok: true,
    context: {
      requestId: requestId.slice(0, 128),
      method,
      action: String(request.action || 'valuation').slice(0, 64)
    }
  };
}

export function safePublicError(error) {
  const message = String(error?.message || '');
  if (message.startsWith('invalid_input')) {
    return { code: 'invalid_input', message: 'The request contains invalid input.' };
  }
  if (message === 'method_not_allowed') {
    return { code: 'method_not_allowed', message: 'This request method is not allowed.' };
  }
  if (message.startsWith('blocked_outbound_url')) {
    return { code: 'blocked_security_policy', message: 'The requested network destination is not allowed.' };
  }
  if (message.startsWith('rate_limit_exceeded')) {
    return { code: 'rate_limit_exceeded', message: 'Too many requests.' };
  }
  return { code: 'internal_failure', message: 'The request could not be completed.' };
}
