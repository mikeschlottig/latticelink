import type { Context } from 'hono';
interface LogData {
  level: 'info' | 'warn' | 'error';
  msg: string;
  url: string;
  method: string;
  status?: number;
  latencyMs?: number;
}
export function log(c: Context, data: Omit<LogData, 'url' | 'method'>) {
  const logEntry: LogData = {
    ...data,
    url: c.req.url,
    method: c.req.method,
  };
  console.log(JSON.stringify(logEntry));
}