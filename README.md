# capnweb over Ably

Bidirectional RPC between browser and server, using [capnweb](https://github.com/cloudflare/capnweb) for the RPC layer and [Ably](https://ably.com) as the transport.

## Why this is interesting

Building RPC over pub/sub typically means inventing your own request/response protocol, correlation IDs, error handling, and serialization. **capnweb gives you all of that out of the box** — you define plain functions on the server, and call them from the client as if they were local.

Ably replaces the raw WebSocket that capnweb normally uses. That means RPC calls get Ably's connection recovery, global edge routing, message ordering guarantees, and 99.999% uptime — without changing a line of application code.

![CleanShot 2026-03-04 at 01 29 28](https://github.com/user-attachments/assets/d1ce5252-d967-4903-ad52-a8e826c90148)

## What is capnweb?

[capnweb](https://blog.cloudflare.com/capnweb-javascript-rpc-library/) is Cloudflare's JavaScript RPC library (inspired by Cap'n Proto). Key points:

- **No schemas or code generation** — just export an object with async methods
- **Bidirectional** — server can call client methods too
- **Promise pipelining** — chain calls without round-trip overhead
- **Transport-agnostic** — works over any send/receive pair (WebSocket, Ably, postMessage)

## How it works with Ably

Both sides share an Ably channel. A thin `AblyTransport` adapter bridges capnweb's `send`/`receive` interface to `channel.publish`/`channel.subscribe`:

```ts
// Server
const channel = ably.channels.get(`rpc:${clientId}`);
const transport = new AblyTransport(channel);

const counterAPI = {
  async increment() { return ++counter; },
  async decrement() { return --counter; },
};

new RpcSession(transport, counterAPI);
```

```ts
// Client
const channel = ably.channels.get(`rpc:${clientId}`);
const transport = new AblyTransport(channel);

const session = new RpcSession(transport, clientAPI);
const server = session.getRemoteMain();

await server.increment(); // calls the server function above
```

The transport adapter itself is ~60 lines — it serializes sends to preserve ordering and filters echo messages. See [`shared/ably-transport.ts`](shared/ably-transport.ts).

## Running the demo

```bash
cp .env.example .env        # add your Ably API key
npm install
npm run dev                  # starts server (3000) + client (5173)
```

Open http://localhost:5173 in multiple tabs — click the buttons and watch the counter sync in real time.

## Project structure

```
shared/ably-transport.ts   Ably transport adapter for capnweb
shared/types.ts            Shared TypeScript interfaces
server/index.ts            Express server with counter API + JWT auth
client/App.tsx             React UI
```

## License

MIT
