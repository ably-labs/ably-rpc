# @ably/rpc

> **Status: Experimental** - This library is under active development. APIs may change between minor versions.

RPC over Ably Realtime - JSON-RPC 2.0 and Cap'n Proto support.

Use any RPC protocol over [Ably](https://ably.com) pub/sub channels. Get connection recovery, global edge routing, message ordering guarantees, and 99.999% uptime without changing a line of application code.

![CleanShot 2026-03-04 at 01 29 28](https://github.com/user-attachments/assets/d1ce5252-d967-4903-ad52-a8e826c90148)

## Install

```bash
npm install @ably/rpc ably
```

## JSON-RPC Quick Start

```ts
import Ably from 'ably';
import { AblyTransport, JsonRpcSession } from '@ably/rpc';

const ably = new Ably.Realtime({ key: 'your-ably-key' });
const channel = ably.channels.get('rpc:my-session');
const transport = new AblyTransport(channel, false, ably);
await transport.waitReady();

// Server side - expose methods
const session = new JsonRpcSession(transport, {
  async add(a: number, b: number) { return a + b; },
  async greet(name: string) { return `Hello, ${name}!`; },
});

// Client side - call remote methods
const remote = session.getRemoteMain();
await remote.add(2, 3);     // 5
await remote.greet('World'); // "Hello, World!"
```

## Cap'n Proto Quick Start

Install `capnweb` separately:

```bash
npm install @ably/rpc ably capnweb
```

```ts
import Ably from 'ably';
import { RpcSession } from 'capnweb';
import { AblyTransport } from '@ably/rpc';

const ably = new Ably.Realtime({ key: 'your-ably-key' });
const channel = ably.channels.get('rpc:my-session');
const transport = new AblyTransport(channel, false, ably);
await transport.waitReady();

// Pass AblyTransport directly to capnweb's RpcSession
const session = new RpcSession(transport, {
  async increment() { return ++counter; },
  async getValue() { return counter; },
});

const remote = session.getRemoteMain();
await remote.increment(); // promise pipelining, pass-by-reference
```

## API Reference

### `AblyTransport`

Bridges an Ably `RealtimeChannel` to a send/receive transport interface.

```ts
new AblyTransport(channel: Ably.RealtimeChannel, debug?: boolean, ably?: Ably.Realtime)
```

- **`waitReady()`** - Wait for the channel to attach
- **`send(message: string)`** - Send a message (serialized to preserve ordering)
- **`receive()`** - Receive the next message (queues if none waiting)
- **`abort(reason)`** - Abort the transport with an error
- **`close()`** - Close the transport cleanly

The `ably` parameter enables echo filtering (messages from your own connection are ignored).

### `JsonRpcSession<Remote, Local>`

JSON-RPC 2.0 session over the transport. Registers local methods, provides a proxy for remote calls.

```ts
new JsonRpcSession(transport: AblyTransport, localApi: Local)
```

- **`getRemoteMain()`** - Returns a typed proxy; property access maps to JSON-RPC requests
- **`close()`** - Stop the receive loop and reject pending requests

### `ProtocolSession<Remote>`

Interface satisfied by both `JsonRpcSession` and capnweb's `RpcSession`:

```ts
interface ProtocolSession<Remote> {
  getRemoteMain(): Remote;
  close?: () => void;
}
```

Use this type when writing protocol-agnostic code.

## Demo

The `demo/` directory contains a full working example: a counter app with bidirectional RPC between browser tabs, supporting both JSON-RPC 2.0 and Cap'n Proto.

```bash
cd demo
cp .env.example .env  # add your Ably API key
npm install
npm run dev
```

## License

Apache 2.0
