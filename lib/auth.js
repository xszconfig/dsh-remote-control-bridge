export function isLoopback(req) {
    const addr = req.socket.remoteAddress ?? '';
    return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}
export function isLoopbackHostHeader(req) {
    const host = (req.headers.host ?? '').split(':')[0].toLowerCase().replace(/^\[|\]$/g, '');
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}
/**
 * Local-only surfaces: allow genuine loopback requests (Host header must also be
 * loopback, so traffic arriving via a local reverse tunnel is NOT trusted), or
 * non-loopback requests that present the env token.
 */
export function allowLocalOrEnvToken(req, res, envToken) {
    if (isLoopback(req) && isLoopbackHostHeader(req))
        return true;
    if (envToken && bearerToken(req.headers.authorization) === envToken)
        return true;
    return false;
}
export function bearerToken(header) {
    if (!header || !header.startsWith('Bearer '))
        return null;
    return header.slice(7);
}
export function json(res, body, status = 200) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
        'cache-control': 'no-store',
    });
    res.end(payload);
}
export function denied(res) {
    json(res, { error: 'loopback_only' }, 403);
}
