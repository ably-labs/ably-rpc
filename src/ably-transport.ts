import * as Ably from 'ably';

/**
 * Ably transport adapter for RPC libraries.
 *
 * Bridges Ably pub/sub channels to a send/receive transport interface
 * compatible with capnweb's RpcSession and JsonRpcSession.
 */
export class AblyTransport {
  private messageQueue: string[] = [];
  private waitingReceivers: ((message: string) => void)[] = [];
  private isOpen = true;
  private abortError: Error | null = null;
  private ready: Promise<void>;
  private myConnectionId: string | null = null;
  // Serializes sends so messages arrive in order (capnweb assumes synchronous WebSocket sends)
  private sendChain: Promise<void> = Promise.resolve();

  constructor(
    private channel: Ably.RealtimeChannel,
    private debug = false,
    private ably?: Ably.Realtime
  ) {
    this.ready = this.setupChannel();
  }

  private async setupChannel(): Promise<void> {
    await this.channel.attach();

    // Get our connection ID to filter out our own messages
    if (this.ably) {
      this.myConnectionId = this.ably.connection.id ?? null;
      if (this.debug) {
        console.log(`[Transport] My connection ID: ${this.myConnectionId}`);
      }
    }

    // Subscribe to messages on this channel
    this.channel.subscribe((message: Ably.Message) => {
      if (!this.isOpen) return;

      // Filter out our own messages
      if (this.myConnectionId && message.connectionId === this.myConnectionId) {
        if (this.debug) {
          console.log(`[Transport] Ignoring own message`);
        }
        return;
      }

      const data = typeof message.data === 'string'
        ? message.data
        : JSON.stringify(message.data);

      if (this.debug) {
        const parsed = JSON.parse(data);
        const type = parsed[0];
        if (type === 'push' && Array.isArray(parsed[1]) && parsed[1][0] === 'pipeline') {
          const [, pipelineId, path] = parsed[1];
          console.log(`[Transport] RECV push pipeline=${pipelineId} path=${JSON.stringify(path)}`);
        } else {
          console.log(`[Transport] RECV ${type}`, data.substring(0, 200));
        }
      }

      // If there's a receiver waiting, give it the message immediately
      const receiver = this.waitingReceivers.shift();
      if (receiver) {
        receiver(data);
      } else {
        // Otherwise, queue the message
        this.messageQueue.push(data);
      }
    });
  }

  /**
   * Wait for transport to be ready
   */
  async waitReady(): Promise<void> {
    await this.ready;
  }

  /**
   * Send data through Ably channel.
   * Uses a send chain to serialize publishes — capnweb fires multiple sends
   * synchronously (like WebSocket.send) and expects them to arrive in order.
   */
  send(message: string): Promise<void> {
    if (!this.isOpen) {
      return Promise.reject(new Error('Transport is closed'));
    }
    if (this.abortError) {
      return Promise.reject(this.abortError);
    }

    if (this.debug) {
      const parsed = JSON.parse(message);
      const type = parsed[0];
      if (type === 'push' && Array.isArray(parsed[1]) && parsed[1][0] === 'pipeline') {
        const [, pipelineId, path] = parsed[1];
        console.log(`[Transport] SEND push pipeline=${pipelineId} path=${JSON.stringify(path)}`);
      } else {
        console.log(`[Transport] SEND ${type}`, message.substring(0, 200));
      }
    }

    // Chain sends to preserve ordering
    this.sendChain = this.sendChain.then(async () => {
      await this.ready;
      await this.channel.publish('rpc', message);
    });
    return this.sendChain;
  }

  /**
   * Receive next message from the channel
   * Returns a promise that resolves when a message is received
   */
  async receive(): Promise<string> {
    await this.ready; // Ensure we're ready before receiving

    if (!this.isOpen) {
      return Promise.reject(new Error('Transport is closed'));
    }
    if (this.abortError) {
      return Promise.reject(this.abortError);
    }

    // If there's a queued message, return it immediately
    const queuedMessage = this.messageQueue.shift();
    if (queuedMessage !== undefined) {
      if (this.debug) {
        console.log(`[Transport] Returning queued message (${queuedMessage.length} chars)`);
      }
      return Promise.resolve(queuedMessage);
    }

    // Otherwise, wait for the next message
    return new Promise((resolve, reject) => {
      if (this.debug) {
        console.log(`[Transport] Waiting for message...`);
      }
      this.waitingReceivers.push(resolve);

      // If transport is aborted while waiting, reject
      const checkAbort = setInterval(() => {
        if (this.abortError) {
          clearInterval(checkAbort);
          const index = this.waitingReceivers.indexOf(resolve);
          if (index > -1) {
            this.waitingReceivers.splice(index, 1);
          }
          reject(this.abortError);
        }
      }, 100);
    });
  }

  /**
   * Abort the transport with an error
   */
  abort(reason: any): void {
    this.isOpen = false;
    this.abortError = reason instanceof Error ? reason : new Error(String(reason));

    // Reject all waiting receivers
    for (const receiver of this.waitingReceivers) {
      receiver(''); // This will cause receive() to reject
    }
    this.waitingReceivers = [];
    this.messageQueue = [];

    this.channel.detach().catch(() => {});
  }

  /**
   * Close the transport cleanly
   */
  async close(): Promise<void> {
    this.isOpen = false;
    await this.channel.detach();
  }
}
