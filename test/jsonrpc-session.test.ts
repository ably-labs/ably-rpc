import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JsonRpcSession } from '../src/jsonrpc-session';

/**
 * Minimal mock of AblyTransport.
 * - send() stores outgoing messages
 * - deliver() injects messages into the receive queue
 */
function createMockTransport() {
  const outgoing: string[] = [];
  const receiveQueue: string[] = [];
  const waitingReceivers: ((msg: string) => void)[] = [];
  let closed = false;

  return {
    send: vi.fn(async (msg: string) => {
      outgoing.push(msg);
    }),
    receive: vi.fn(async () => {
      if (closed) throw new Error('Transport closed');
      const queued = receiveQueue.shift();
      if (queued !== undefined) return queued;
      return new Promise<string>((resolve) => {
        waitingReceivers.push(resolve);
      });
    }),
    close: vi.fn(async () => { closed = true; }),
    abort: vi.fn(() => { closed = true; }),
    waitReady: vi.fn(async () => {}),

    // Test helpers
    _outgoing: outgoing,
    _deliver(msg: string) {
      const receiver = waitingReceivers.shift();
      if (receiver) {
        receiver(msg);
      } else {
        receiveQueue.push(msg);
      }
    },
  };
}

describe('JsonRpcSession', () => {
  let transport: ReturnType<typeof createMockTransport>;

  beforeEach(() => {
    transport = createMockTransport();
  });

  it('registers local API methods and responds to remote calls', async () => {
    const localApi = {
      greet: vi.fn(async (name: string) => `Hello, ${name}!`),
    };

    new JsonRpcSession<{}, typeof localApi>(transport as any, localApi);

    // Simulate incoming JSON-RPC request
    const request = JSON.stringify({
      jsonrpc: '2.0',
      method: 'greet',
      params: ['World'],
      id: 1,
    });
    transport._deliver(request);

    // Wait for processing
    await vi.waitFor(() => {
      expect(transport.send).toHaveBeenCalled();
    });

    expect(localApi.greet).toHaveBeenCalledWith('World');

    const response = JSON.parse(transport._outgoing[0]);
    expect(response.jsonrpc).toBe('2.0');
    expect(response.result).toBe('Hello, World!');
    expect(response.id).toBe(1);
  });

  it('getRemoteMain returns a proxy that sends JSON-RPC requests', async () => {
    const localApi = {};
    const session = new JsonRpcSession<{ add(a: number, b: number): Promise<number> }, typeof localApi>(
      transport as any,
      localApi
    );

    const remote = session.getRemoteMain();

    // Start the call — it sends a request and waits for a response
    const resultPromise = remote.add(2, 3);

    // Wait for the request to be sent
    await vi.waitFor(() => {
      expect(transport._outgoing.length).toBeGreaterThan(0);
    });

    const request = JSON.parse(transport._outgoing[0]);
    expect(request.method).toBe('add');
    expect(request.params).toEqual([2, 3]);

    // Deliver the response
    transport._deliver(JSON.stringify({
      jsonrpc: '2.0',
      result: 5,
      id: request.id,
    }));

    const result = await resultPromise;
    expect(result).toBe(5);
  });

  it('proxy .then returns undefined (not thenable)', () => {
    const session = new JsonRpcSession<{ foo(): Promise<void> }, {}>(
      transport as any,
      {}
    );
    const remote = session.getRemoteMain();
    // Accessing .then should return undefined so await doesn't treat it as a Promise
    expect((remote as any).then).toBeUndefined();
  });

  it('close rejects pending requests', async () => {
    const session = new JsonRpcSession<{ slow(): Promise<void> }, {}>(
      transport as any,
      {}
    );

    const remote = session.getRemoteMain();
    const promise = remote.slow();

    // Wait for request to be sent
    await vi.waitFor(() => {
      expect(transport._outgoing.length).toBeGreaterThan(0);
    });

    session.close();
    await expect(promise).rejects.toThrow();
  });

  it('handles multiple local API methods', async () => {
    const localApi = {
      add: vi.fn(async (a: number, b: number) => a + b),
      multiply: vi.fn(async (a: number, b: number) => a * b),
    };

    new JsonRpcSession<{}, typeof localApi>(transport as any, localApi);

    // Call add
    transport._deliver(JSON.stringify({
      jsonrpc: '2.0',
      method: 'add',
      params: [3, 4],
      id: 1,
    }));

    await vi.waitFor(() => {
      expect(transport._outgoing.length).toBe(1);
    });

    // Call multiply
    transport._deliver(JSON.stringify({
      jsonrpc: '2.0',
      method: 'multiply',
      params: [3, 4],
      id: 2,
    }));

    await vi.waitFor(() => {
      expect(transport._outgoing.length).toBe(2);
    });

    const addResult = JSON.parse(transport._outgoing[0]);
    const mulResult = JSON.parse(transport._outgoing[1]);
    expect(addResult.result).toBe(7);
    expect(mulResult.result).toBe(12);
  });

  it('returns error for unknown method', async () => {
    new JsonRpcSession<{}, {}>(transport as any, {});

    transport._deliver(JSON.stringify({
      jsonrpc: '2.0',
      method: 'nonexistent',
      params: [],
      id: 1,
    }));

    await vi.waitFor(() => {
      expect(transport._outgoing.length).toBe(1);
    });

    const response = JSON.parse(transport._outgoing[0]);
    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32601); // Method not found
  });
});
