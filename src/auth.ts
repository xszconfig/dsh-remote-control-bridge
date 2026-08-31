/**
 * REST 路由共用鉴权 / 响应辅助（shell 与 core 共用同一份源码）。
 *
 * shell（src/index.ts）静态 import 本文件：改动此处后 shell 自身的两个路由
 * （/remote/reload、/remote/hot）仍走进程启动时已缓存的旧逻辑，直到下次重启。
 * core（src/core.ts）随版本化暂存目录热换：改动此处后 core 内部路由立即换新。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

export function isLoopback(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? ''
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

export function isLoopbackHostHeader(req: IncomingMessage): boolean {
  const host = (req.headers.host ?? '').split(':')[0].toLowerCase().replace(/^\[|\]$/g, '')
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

/**
 * Local-only surfaces: allow genuine loopback requests (Host header must also be
 * loopback, so traffic arriving via a local reverse tunnel is NOT trusted), or
 * non-loopback requests that present the env token.
 */
export function allowLocalOrEnvToken(req: IncomingMessage, res: ServerResponse, envToken: string): boolean {
  if (isLoopback(req) && isLoopbackHostHeader(req)) return true
  if (envToken && bearerToken(req.headers.authorization) === envToken) return true
  return false
}

export function bearerToken(header: string | undefined): string | null {
  if (!header || !header.startsWith('Bearer ')) return null
  return header.slice(7)
}

export function json(res: ServerResponse, body: unknown, status = 200): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  })
  res.end(payload)
}

export function denied(res: ServerResponse): void {
  json(res, { error: 'loopback_only' }, 403)
}
