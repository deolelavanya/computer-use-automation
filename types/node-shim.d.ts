declare module "node:http" {
  export type IncomingMessage = any;
  export type ServerResponse = any;
  export function createServer(handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>): { listen(port: number, cb?: () => void): void };
}
declare const process: { env: Record<string, string | undefined> };
