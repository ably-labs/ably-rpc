import { type Protocol, PROTOCOLS } from '../../shared/protocol';

export function ProtocolLanding({ protocol }: { protocol: Protocol }) {
  const proto = PROTOCOLS[protocol];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-4xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="mb-4">
            <a
              href="/"
              className="text-gray-400 hover:text-gray-600 transition-colors text-sm"
            >
              &larr; All protocols
            </a>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            {proto.label} <span className="text-indigo-600">over Ably</span>
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            {proto.description}
          </p>
        </div>

        {/* Role cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          <a
            href={`?protocol=${protocol}&role=server`}
            className="group block bg-white rounded-xl shadow-sm border border-gray-200 p-8 hover:shadow-md hover:border-indigo-300 transition-all"
          >
            <div className="text-3xl mb-3">&#x1F5A5;&#xFE0F;</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors">
              Launch Server
            </h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              Runs the counter API in this tab. Listens for client connections
              via Ably presence and creates per-client RPC sessions.
            </p>
          </a>

          <a
            href={`?protocol=${protocol}&role=client`}
            className="group block bg-white rounded-xl shadow-sm border border-gray-200 p-8 hover:shadow-md hover:border-indigo-300 transition-all"
          >
            <div className="text-3xl mb-3">&#x1F4F1;</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors">
              Launch Client
            </h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              Discovers the server via presence and calls remote counter
              methods. The API looks like local function calls.
            </p>
          </a>
        </div>

        {/* Code panels */}
        <div className="bg-gray-900 rounded-xl overflow-hidden shadow-lg">
          <div className="border-b border-gray-800 px-6 py-3">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              How it works
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-800">
            <div className="p-6">
              <div className="text-xs font-mono text-green-400 mb-3">
                // Server (runs in a browser tab)
              </div>
              <pre className="text-sm text-gray-300 font-mono leading-relaxed whitespace-pre">
{protocol === 'capnweb'
  ? `const counterAPI = {
  async increment() { return ++counter; },
  async decrement() { return --counter; },
  async reset()     { counter = 0; return 0; },
  async getValue()  { return counter; },
};

// One RPC session per client
const session = new RpcSession(
  transport, counterAPI
);`
  : `const counterAPI = {
  async increment() { return ++counter; },
  async decrement() { return --counter; },
  async reset()     { counter = 0; return 0; },
  async getValue()  { return counter; },
};

// One RPC session per client
const session = new JsonRpcSession(
  transport, counterAPI
);`}
              </pre>
            </div>
            <div className="p-6">
              <div className="text-xs font-mono text-blue-400 mb-3">
                // Client (runs in another browser tab)
              </div>
              <pre className="text-sm text-gray-300 font-mono leading-relaxed whitespace-pre">
{protocol === 'capnweb'
  ? `const session = new RpcSession(
  transport, clientAPI
);
const server = session.getRemoteMain();

// These cross the network via Ably
await server.increment();  // \u2192 1
await server.getValue();   // \u2192 1
await server.reset();      // \u2192 0`
  : `const session = new JsonRpcSession(
  transport, clientAPI
);
const server = session.getRemoteMain();

// These cross the network via Ably
await server.increment();  // JSON-RPC request
await server.getValue();   // JSON-RPC request
await server.reset();      // JSON-RPC request`}
              </pre>
            </div>
          </div>
          <div className="border-t border-gray-800 px-6 py-3">
            <p className="text-xs text-gray-500">
              {protocol === 'capnweb'
                ? "capnweb serializes calls with Cap'n Proto and sends them over Ably channels. The transport is swappable \u2014 same API works over WebSocket, WebRTC, or any message layer."
                : 'JSON-RPC 2.0 sends standard JSON request/response objects over Ably channels. The same protocol works in every major language.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
