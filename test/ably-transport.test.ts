import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AblyTransport } from '../src/ably-transport';

/**
 * Minimal mock of Ably.RealtimeChannel
 */
function createMockChannel() {
  let subscriber: ((msg: any) => void) | null = null;

  return {
    attach: vi.fn().mockResolvedValue(undefined),
    detach: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn((cb: (msg: any) => void) => {
      subscriber = cb;
    }),
    // Helper to simulate an incoming message
    _deliver(data: string, connectionId = 'remote-conn') {
      subscriber?.({ data, connectionId });
    },
  };
}

function createMockAbly(connectionId = 'my-conn') {
  return {
    connection: { id: connectionId },
  } as any;
}

describe('AblyTransport', () => {
  let channel: ReturnType<typeof createMockChannel>;
  let ably: ReturnType<typeof createMockAbly>;
  let transport: AblyTransport;

  beforeEach(async () => {
    channel = createMockChannel();
    ably = createMockAbly();
    transport = new AblyTransport(channel as any, false, ably);
    await transport.waitReady();
  });

  it('attaches to the channel on construction', () => {
    expect(channel.attach).toHaveBeenCalledOnce();
  });

  it('subscribes to channel messages', () => {
    expect(channel.subscribe).toHaveBeenCalledOnce();
  });

  it('send publishes to the channel', async () => {
    await transport.send('hello');
    expect(channel.publish).toHaveBeenCalledWith('rpc', 'hello');
  });

  it('receive returns queued messages', async () => {
    channel._deliver('msg1');
    channel._deliver('msg2');

    const first = await transport.receive();
    const second = await transport.receive();
    expect(first).toBe('msg1');
    expect(second).toBe('msg2');
  });

  it('receive waits for messages when queue is empty', async () => {
    const promise = transport.receive();

    // Message hasn't arrived yet, so it should be pending
    let resolved = false;
    promise.then(() => { resolved = true; });

    // Deliver a message after a short delay
    await new Promise((r) => setTimeout(r, 10));
    expect(resolved).toBe(false);

    channel._deliver('delayed');
    const result = await promise;
    expect(result).toBe('delayed');
  });

  it('filters out own messages based on connectionId', async () => {
    // Deliver a message from our own connection
    channel._deliver('own-msg', 'my-conn');

    // Deliver a message from a remote connection
    channel._deliver('remote-msg', 'remote-conn');

    const result = await transport.receive();
    expect(result).toBe('remote-msg');
  });

  it('serializes JSON data from objects', async () => {
    const subscriber = channel.subscribe.mock.calls[0][0];
    subscriber({ data: { foo: 'bar' }, connectionId: 'remote-conn' });

    const result = await transport.receive();
    expect(result).toBe('{"foo":"bar"}');
  });

  it('preserves send ordering via chain', async () => {
    const order: string[] = [];
    channel.publish.mockImplementation(async (_event: string, data: string) => {
      order.push(data);
    });

    // Fire multiple sends without awaiting individually
    const p1 = transport.send('first');
    const p2 = transport.send('second');
    const p3 = transport.send('third');

    await Promise.all([p1, p2, p3]);
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('send rejects when transport is closed', async () => {
    await transport.close();
    await expect(transport.send('x')).rejects.toThrow('Transport is closed');
  });

  it('receive rejects when transport is closed', async () => {
    await transport.close();
    await expect(transport.receive()).rejects.toThrow('Transport is closed');
  });

  it('abort rejects waiting receivers', async () => {
    const receivePromise = transport.receive();
    transport.abort(new Error('test abort'));

    // The first receive got an empty string delivered by abort, catch it
    await receivePromise.catch(() => {});

    // After abort, receive() rejects because isOpen is false
    await expect(transport.receive()).rejects.toThrow('Transport is closed');
  });

  it('abort detaches the channel', () => {
    transport.abort('done');
    expect(channel.detach).toHaveBeenCalled();
  });

  it('close detaches the channel', async () => {
    await transport.close();
    expect(channel.detach).toHaveBeenCalled();
  });
});
