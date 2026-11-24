interface MetrixSqliteResult<T = Record<string, unknown>> {
  success: true;
  results: T[];
  meta: { changes: number; last_row_id: number; duration: number };
}

interface MetrixSqliteStatement {
  bind(...values: unknown[]): MetrixSqliteStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<MetrixSqliteResult<T>>;
  run(): Promise<MetrixSqliteResult>;
}

interface MetrixSqlite {
  prepare(sql: string): MetrixSqliteStatement;
  exec(sql: string): Promise<void>;
}

interface MetrixSocketInfo {
  remoteAddress: string;
  remotePort: number;
  localAddress: string;
  localPort: number;
}

interface MetrixSocket {
  readonly opened: Promise<MetrixSocketInfo>;
  readonly closed: Promise<void>;
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  close(): Promise<void>;
}

declare module "cloudflare:sockets" {
  export function connect(
    address: string,
    options?: { secureTransport?: "off" | "on" | "starttls"; allowHalfOpen?: boolean },
  ): MetrixSocket;
}

declare const $metrix: {
  readonly appVersion: string;
  readonly timeZone: string;
  invalidate(): void;
  schedule(delayMs: number | null): void;
  log(...args: unknown[]): void;
  openURL(url: string): void;
  toast(message: string): void;
  secret(name: string): string;
  setSecret(name: string, value: string): Promise<void>;
  deleteSecret(name: string): Promise<void>;
  openPath(path: string): void;
  showItemInFolder(path: string): void;
  beep(): void;
  showOpenDialog(options?: unknown): Promise<string[]>;
  showSaveDialog(options?: unknown): Promise<string | null>;
  writeFile(
    path: string,
    data: Uint8Array | ArrayBuffer | string,
    options?: { expectedVersion?: string | null },
  ): Promise<{ version: string }>;
  files: {
    read(path: string, options?: { offset?: number; length?: number }): Promise<Uint8Array>;
    stat(path: string): Promise<{ size: number; mtime: number; identity: string | null }>;
  };
  auth: {
    authorize(options: {
      url: string;
      timeoutMs?: number;
      callback?: "loopback" | "scheme";
    }): Promise<Record<string, string>>;
  };
  sqlite: {
    open(name: string): Promise<MetrixSqlite>;
  };
};

interface Navigator {
  clipboard: {
    writeText(text: string): Promise<void>;
    read(): Promise<{ types: string[]; getType(type: string): Promise<Blob> }[]>;
  };
}

declare class Notification {
  constructor(title: string, options?: { body?: string; tag?: string });
  onclick: (() => void) | null;
  close(): void;
}

interface Navigator {
  setAppBadge(count?: number): Promise<void>;
  clearAppBadge(): Promise<void>;
}
