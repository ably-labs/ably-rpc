import {
  JSONRPCServer,
  JSONRPCClient,
  JSONRPCServerAndClient,
} from 'json-rpc-2.0';
import type { AblyTransport } from './ably-transport';

/**
 * JSON-RPC 2.0 session over Ably, matching capnweb's RpcSession interface.
 *
 * - Registers all methods from `localApi` so the remote side can call them
 * - `getRemoteMain()` returns a Proxy that maps property access to JSON-RPC requests
 * - Drives its own receive loop to process incoming messages
 */
export class JsonRpcSession<Remote, Local extends object> {
  private rpc: JSONRPCServerAndClient;
  private running = true;

  constructor(
    private transport: AblyTransport,
    localApi: Local
  ) {
    const server = new JSONRPCServer();
    const client = new JSONRPCClient(async (payload) => {
      await this.transport.send(JSON.stringify(payload));
    });
    this.rpc = new JSONRPCServerAndClient(server, client);

    // Register every method from the local API object
    for (const key of Object.keys(localApi) as (keyof Local & string)[]) {
      const fn = localApi[key];
      if (typeof fn === 'function') {
        this.rpc.addMethod(key, (params: unknown) => {
          const args = Array.isArray(params) ? params : [];
          return (fn as Function).apply(localApi, args);
        });
      }
    }

    // Start the receive loop
    this.receiveLoop();
  }

  private async receiveLoop(): Promise<void> {
    while (this.running) {
      try {
        const raw = await this.transport.receive();
        if (!raw || !this.running) break;
        const payload = JSON.parse(raw);
        await this.rpc.receiveAndSend(payload, undefined as void, undefined as void);
      } catch {
        // Transport closed or aborted — stop the loop
        break;
      }
    }
  }

  getRemoteMain(): Remote {
    return new Proxy({} as object, {
      get: (_target, prop: string) => {
        // Prevent the proxy from being treated as a "thenable" by await/Promise.resolve.
        // JS checks for .then to detect Promise-like objects; returning undefined here
        // tells the runtime this is a plain object, not a Promise.
        if (prop === 'then') return undefined;
        return (...args: unknown[]) => {
          return this.rpc.request(prop, args, undefined as void);
        };
      },
    }) as Remote;
  }

  close(): void {
    this.running = false;
    this.rpc.rejectAllPendingRequests('Session closed');
  }
}
