/**
 * REST 路由共用鉴权 / 响应辅助（shell 与 core 共用同一份源码）。
 *
 * shell（src/index.ts）静态 import 本文件：改动此处后 shell 自身的两个路由
 * （/remote/reload、/remote/hot）仍走进程启动时已缓存的旧逻辑，直到下次重启。
 * core（src/core.ts）随版本化暂存目录热换：改动此处后 core 内部路由立即换新。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
export declare function isLoopback(req: IncomingMessage): boolean;
export declare function isLoopbackHostHeader(req: IncomingMessage): boolean;
/**
 * Local-only surfaces: allow genuine loopback requests (Host header must also be
 * loopback, so traffic arriving via a local reverse tunnel is NOT trusted), or
 * non-loopback requests that present the env token.
 */
export declare function allowLocalOrEnvToken(req: IncomingMessage, res: ServerResponse, envToken: string): boolean;
export declare function bearerToken(header: string | undefined): string | null;
export declare function json(res: ServerResponse, body: unknown, status?: number): void;
export declare function denied(res: ServerResponse): void;
