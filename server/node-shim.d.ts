// Мінімальні типи Node для сервера кімнат: @types/node у проєкті немає, а нову залежність без дозволу не додаємо.
declare module "node:http" {
  export interface IncomingMessage {
    url?: string; method?: string;
    on(event: "data", cb: (chunk: Uint8Array) => void): this;
    on(event: "end", cb: () => void): this;
    on(event: "error", cb: (e: Error) => void): this;
    destroy(): void;
  }
  export interface ServerResponse {
    headersSent: boolean;
    on(event: "close", cb: () => void): this;
    writeHead(status: number, headers?: Record<string, string>): this;
    end(body?: string): void;
  }
  export interface Server {
    listen(port: number, host: string, cb?: () => void): this;
    close(cb?: () => void): this;
    address(): { port: number } | string | null;
  }
  export function createServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Server;
}
declare module "node:crypto" {
  export function randomInt(max: number): number;
  export function randomUUID(): string;
}
declare module "node:fs" {
  export function realpathSync(path: string): string;
}
declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}
declare const process: {
  argv: string[]; env: Record<string, string | undefined>; exit(code?: number): never;
};
declare const Buffer: {
  concat(chunks: Uint8Array[]): { toString(encoding: string): string };
  from(x: string): Uint8Array;
};
interface ImportMeta { url: string }
