import { useEffect, useRef, useState, useCallback } from 'react';
import * as Ably from 'ably';
import { AblyTransport } from '@ably/rpc';
import type { CounterAPI, ClientAPI } from '../../shared/types';
import { type Protocol, PROTOCOLS } from '../../shared/protocol';
import { createProtocolSession } from '../../shared/create-session';
import { ConnectionStatus } from './ConnectionStatus';

const CLIENT_ID = `client-${Math.random().toString(36).slice(2, 8)}`;

interface Notification {
  id: string;
  message: string;
}

export function ClientView({ protocol }: { protocol: Protocol }) {
  const proto = PROTOCOLS[protocol];
  const [counter, setCounter] = useState<number | null>(null);
  const [serverPresent, setServerPresent] = useState(false);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [serverStub, setServerStub] = useState<CounterAPI | null>(null);
  const [pendingOp, setPendingOp] = useState<string | null>(null);

  const ablyRef = useRef<Ably.Realtime | null>(null);
  const transportRef = useRef<AblyTransport | null>(null);

  const showNotification = useCallback((message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setNotifications((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  }, []);

  useEffect(() => {
    let mounted = true;
    let hasServer = false;
    let connecting = false; // Prevents concurrent connectToServer calls

    const clientAPI: ClientAPI = {
      async notify(message: string) {
        if (mounted) showNotification(message);
      },
    };

    function createRpcSession(ably: Ably.Realtime) {
      if (transportRef.current) {
        transportRef.current.abort(new Error('Recreating session'));
        transportRef.current = null;
      }
      const channelName = `${proto.rpcChannelPrefix}${CLIENT_ID}`;
      ably.channels.release(channelName);

      const rpcChannel = ably.channels.get(channelName);
      const transport = new AblyTransport(rpcChannel, false, ably);
      transportRef.current = transport;

      return transport.waitReady().then(() => {
        const session = createProtocolSession<CounterAPI, ClientAPI>(protocol, transport, clientAPI);
        return session.getRemoteMain();
      });
    }

    const init = async () => {
      const ably = new Ably.Realtime({
        authUrl: '/api/token',
        authParams: { clientId: CLIENT_ID },
        clientId: CLIENT_ID,
        echoMessages: false,
      });
      ablyRef.current = ably;

      ably.connection.once('connected', async () => {
        if (!mounted) return;
        setConnected(true);

        try {
          const presenceChannel = ably.channels.get(proto.presenceChannel);
          const stateChannel = ably.channels.get(proto.stateChannel);

          // Subscribe to counter state updates
          stateChannel.subscribe('update', (msg) => {
            if (mounted) setCounter(msg.data.value);
          });

          // Subscribe to ALL presence events — this covers:
          // - 'present': members already on channel when we attach (initial sync)
          // - 'enter': new members joining after we attach
          // - 'leave': members departing
          // On any event, recheck the full presence set for ground truth.
          presenceChannel.presence.subscribe(async () => {
            if (!mounted) return;
            try {
              const members = await presenceChannel.presence.get();
              const servers = members.filter(
                (m) => m.data && (m.data as { role?: string }).role === 'server'
              );

              if (servers.length > 0 && !hasServer && !connecting) {
                connecting = true;
                try {
                  hasServer = true;
                  const stub = await createRpcSession(ably);
                  if (!mounted) return;
                  setServerPresent(true);
                  setServerStub(() => stub);
                  // Verify server is responsive with a timeout — stale presence
                  // entries from ungraceful disconnects may linger for ~15s.
                  const timeout = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Server not responding')), 5000)
                  );
                  try {
                    const value = await Promise.race([stub.getValue(), timeout]);
                    if (mounted) setCounter(value);
                  } catch {
                    // Server didn't respond — treat as stale, reset and
                    // let the next presence event retry.
                    hasServer = false;
                    if (mounted) {
                      setServerPresent(false);
                      setServerStub(null);
                    }
                  }
                } catch (err) {
                  console.error('Failed to set up RPC session:', err);
                  hasServer = false;
                  if (mounted) {
                    setServerPresent(false);
                    setServerStub(null);
                  }
                } finally {
                  connecting = false;
                }
              } else if (servers.length === 0 && hasServer) {
                hasServer = false;
                if (mounted) {
                  setServerPresent(false);
                  setServerStub(null);
                  setCounter(null);
                }
              }
            } catch {
              // Channel might be detaching during cleanup
            }
          });

          // Enter presence as client
          await presenceChannel.presence.enter({ role: 'client' });
        } catch (err) {
          console.error('Failed to initialize client:', err);
          if (mounted) {
            setConnected(false);
            setServerPresent(false);
            setServerStub(null);
          }
        }
      });
    };

    init();

    const cleanup = () => {
      mounted = false;
      ablyRef.current?.close();
    };

    window.addEventListener('beforeunload', cleanup);
    return () => {
      window.removeEventListener('beforeunload', cleanup);
      cleanup();
    };
  }, [showNotification, protocol, proto]);

  const callServer = (method: 'increment' | 'decrement' | 'reset') => {
    if (!serverStub) return;
    setPendingOp(method);
    serverStub[method]()
      .catch((error) => console.error(`Failed to ${method}:`, error))
      .finally(() => setPendingOp(null));
  };

  const buttonsDisabled = !connected || !serverPresent || !serverStub;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {notifications.map((n) => (
          <div
            key={n.id}
            className="notification-enter bg-white shadow-lg rounded-lg p-4 max-w-sm border-l-4 border-indigo-500"
          >
            <p className="text-sm text-gray-900">{n.message}</p>
          </div>
        ))}
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <a
              href={`/?protocol=${protocol}`}
              className="text-gray-400 hover:text-gray-600 transition-colors text-lg"
            >
              &larr;
            </a>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">Client</h1>
                <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                  {CLIENT_ID}
                </span>
                <span className="px-2.5 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                  {proto.label}
                </span>
              </div>
              <p className="text-sm text-gray-500">Remote counter controls</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <ConnectionStatus
              status={serverPresent ? 'connected' : 'waiting'}
              label={serverPresent ? 'Server connected' : 'No server'}
            />
            <ConnectionStatus
              status={connected ? 'connected' : 'disconnected'}
            />
          </div>
        </div>

        {/* Server status warning */}
        {connected && !serverPresent && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse" />
              <span className="font-medium text-yellow-800">
                Waiting for server...
              </span>
            </div>
            <p className="text-sm text-yellow-700">
              Open a{' '}
              <a
                href={`?protocol=${protocol}&role=server`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium"
              >
                server tab
              </a>{' '}
              to start the counter API.
            </p>
          </div>
        )}

        {/* Counter display */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 mb-6 text-center">
          <div className="text-sm text-gray-500 mb-4">Counter Value</div>
          {counter === null ? (
            <div className="flex justify-center mb-8">
              <div className="h-16 w-32 bg-gray-200 rounded-lg animate-pulse" />
            </div>
          ) : (
            <div className="text-7xl font-bold text-gray-900 mb-8 tabular-nums counter-update">
              {counter}
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-center gap-3">
            <button
              onClick={() => callServer('increment')}
              disabled={buttonsDisabled || pendingOp === 'increment'}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-8 rounded-lg shadow-sm transition-all hover:shadow-md disabled:shadow-none"
            >
              {pendingOp === 'increment' ? '...' : '+1'}
            </button>
            <button
              onClick={() => callServer('decrement')}
              disabled={buttonsDisabled || pendingOp === 'decrement'}
              className="bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-8 rounded-lg shadow-sm transition-all hover:shadow-md disabled:shadow-none"
            >
              {pendingOp === 'decrement' ? '...' : '-1'}
            </button>
            <button
              onClick={() => callServer('reset')}
              disabled={buttonsDisabled || pendingOp === 'reset'}
              className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-8 rounded-lg shadow-sm transition-all hover:shadow-md disabled:shadow-none"
            >
              {pendingOp === 'reset' ? '...' : 'Reset'}
            </button>
          </div>
        </div>

        {/* Code snippet */}
        <div className="bg-gray-900 rounded-xl p-6 shadow-lg">
          <div className="text-xs font-mono text-blue-400 mb-3">
            // What's running in this tab ({proto.label})
          </div>
          <pre className="text-sm text-gray-300 font-mono leading-relaxed whitespace-pre">
{protocol === 'capnweb'
  ? `const session = new RpcSession<CounterAPI>(
  transport, clientAPI
);
const server = session.getRemoteMain();

// These calls cross the network via Ably
await server.increment();  // calls server's increment()
await server.decrement();  // calls server's decrement()
await server.reset();      // calls server's reset()

// Server can also call us:
// clientAPI.notify("Hello!") \u2192 toast notification`
  : `const session = new JsonRpcSession(
  transport, clientAPI
);
const server = session.getRemoteMain();

// These calls cross the network via Ably
await server.increment();  // JSON-RPC request
await server.decrement();  // JSON-RPC request
await server.reset();      // JSON-RPC request

// Server can also call us:
// clientAPI.notify("Hello!") \u2192 toast notification`}
          </pre>
        </div>
      </div>
    </div>
  );
}
