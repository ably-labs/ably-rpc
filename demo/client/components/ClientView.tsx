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
  const serverPresentRef = useRef(false);

  const showNotification = useCallback((message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setNotifications((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  }, []);

  useEffect(() => {
    let mounted = true;

    // Client API for server to call back into
    const clientAPI: ClientAPI = {
      async notify(message: string) {
        if (mounted) showNotification(message);
      },
    };

    async function createRpcSession(ably: Ably.Realtime) {
      // Release any existing channel to get a clean slate
      if (transportRef.current) {
        transportRef.current.abort(new Error('Recreating session'));
        transportRef.current = null;
      }
      const channelName = `${proto.rpcChannelPrefix}${CLIENT_ID}`;
      ably.channels.release(channelName);

      const rpcChannel = ably.channels.get(channelName);
      const transport = new AblyTransport(rpcChannel, false, ably);
      await transport.waitReady();
      transportRef.current = transport;

      const session = createProtocolSession<CounterAPI, ClientAPI>(protocol, transport, clientAPI);
      return session.getRemoteMain();
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

          // Set up initial RPC session before entering presence
          const server = await createRpcSession(ably);

          // Enter presence as client
          await presenceChannel.presence.enter({ role: 'client' });

          // Check for existing server — pick oldest by timestamp
          const members = await presenceChannel.presence.get();
          const servers = members
            .filter(m => m.data && (m.data as { role?: string }).role === 'server')
            .sort((a, b) => a.timestamp - b.timestamp);
          const hasServer = servers.length > 0;

          if (mounted && hasServer) {
            setServerPresent(true);
            serverPresentRef.current = true;
            // Wrap in arrow fn — React treats function values as updater functions,
            // and capnweb stubs are Proxies that React would call as functions
            setServerStub(() => server);
            try {
              const value = await server.getValue();
              if (mounted) setCounter(value);
            } catch {
              // Will get value from state channel
            }
          }

          // Subscribe to counter state updates
          const stateChannel = ably.channels.get(proto.stateChannel);
          stateChannel.subscribe('update', (msg) => {
            if (mounted) setCounter(msg.data.value);
          });

          // Watch presence for server enter/leave
          presenceChannel.presence.subscribe('enter', async (member) => {
            if (!mounted) return;
            const data = member.data as { role?: string } | undefined;
            if (data?.role !== 'server') return;

            // If we already have a server, ignore — the new server is newer
            // and will self-terminate via the election logic.
            if (serverPresentRef.current) return;

            try {
              setServerPresent(true);
              serverPresentRef.current = true;
              const newServer = await createRpcSession(ably);
              if (mounted) {
                setServerStub(() => newServer);
                try {
                  const value = await newServer.getValue();
                  if (mounted) setCounter(value);
                } catch {
                  // Will get value from state channel
                }
              }
            } catch (err) {
              console.error('Failed to set up RPC session on server enter:', err);
              if (mounted) {
                setServerPresent(false);
                serverPresentRef.current = false;
                setServerStub(null);
              }
            }
          });

          presenceChannel.presence.subscribe('leave', async (member) => {
            if (!mounted) return;
            const data = member.data as { role?: string } | undefined;
            if (data?.role !== 'server') return;

            // Verify the server is actually gone (not just a duplicate closing)
            try {
              const currentMembers = await presenceChannel.presence.get();
              const serverStillPresent = currentMembers.some(
                (m) =>
                  m.data && (m.data as { role?: string }).role === 'server'
              );
              if (serverStillPresent) return;
            } catch {
              // If we can't check, assume the leave is real
            }

            if (!mounted) return;
            setServerPresent(false);
            serverPresentRef.current = false;
            setServerStub(null);
            setCounter(null);
          });
        } catch (err) {
          console.error('Failed to initialize client:', err);
          if (mounted) {
            setConnected(false);
            setServerPresent(false);
            serverPresentRef.current = false;
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
    // Fire-and-forget: counter updates arrive via the state:counter pub/sub
    // channel, so there's no need to await the RPC response and block the UI.
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
