# RPC over Ably

Bidirectional RPC between browser tabs using [Ably](https://ably.com) as the transport. Two protocol options demonstrate that Ably works with *any* RPC layer:

| Protocol | Library | Highlights |
|----------|---------|------------|
| **capnweb** | [capnweb](https://github.com/nicolo-ribaudo/capnweb) | Promise pipelining, pass-by-reference, zero boilerplate |
| **JSON-RPC 2.0** | [json-rpc-2.0](https://github.com/shogowada/json-rpc-2.0) | RFC standard, every major language, plain JSON |

## Why this is interesting

Building RPC over pub/sub typically means inventing your own request/response protocol, correlation IDs, error handling, and serialization. Both capnweb and JSON-RPC give you that out of the box — you define functions on the server, and call them from the client as if they were local.

Ably replaces the raw WebSocket that these libraries normally use. That means RPC calls get Ably's connection recovery, global edge routing, message ordering guarantees, and 99.999% uptime — without changing a line of application code.

![CleanShot 2026-03-04 at 01 29 28](https://github.com/user-attachments/assets/d1ce5252-d967-4903-ad52-a8e826c90148)

## How it works

Both sides share an Ably channel. A thin `AblyTransport` adapter bridges each library's send/receive interface to `channel.publish`/`channel.subscribe`:

```ts
// Server — works identically for both protocols
const counterAPI = {
  async increment() { return ++counter; },
  async decrement() { return --counter; },
};

const session = createProtocolSession(protocol, transport, counterAPI);
```

```ts
// Client
const session = createProtocolSession(protocol, transport, clientAPI);
const server = session.getRemoteMain();

await server.increment(); // crosses the network via Ably
```

The transport adapter is ~60 lines — it serializes sends to preserve ordering and filters echo messages. See [`shared/ably-transport.ts`](shared/ably-transport.ts).

## Running the demo

```bash
cp .env.example .env        # add your Ably API key
npm install
npm run dev
```

Open http://localhost:5173 — choose a protocol, then open server and client tabs.

## Project structure

```
shared/protocol.ts          Protocol types and channel config
shared/ably-transport.ts    Ably transport adapter (shared by both protocols)
shared/jsonrpc-session.ts   JSON-RPC 2.0 session wrapper
shared/create-session.ts    Factory: creates capnweb or JSON-RPC session
shared/types.ts             Shared TypeScript interfaces
client/App.tsx              Four-way router (protocol + role)
client/components/          Landing pages, ServerView, ClientView
api/token.ts                Vercel serverless JWT auth
```

## License

MIT
