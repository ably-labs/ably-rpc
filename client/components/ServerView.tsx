import { useEffect, useRef, useState, useCallback } from 'react';
import * as Ably from 'ably';
import { AblyTransport } from '../../shared/ably-transport';
import type { CounterAPI, ClientAPI } from '../../shared/types';
import { type Protocol, PROTOCOLS } from '../../shared/protocol';
import { createProtocolSession, type ProtocolSession } from '../../shared/create-session';
import { ConnectionStatus } from './ConnectionStatus';
import { LogPanel, type LogEntry } from './LogPanel';

const SERVER_ID = 'server';

interface ClientInfo {
  clientId: string;
  joinedAt: Date;
}

export function ServerView({ protocol }: { protocol: Protocol }) {
  const proto = PROTOCOLS[protocol];
  const [connected, setConnected] = useState(false);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [counterDisplay, setCounterDisplay] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [blocked, setBlocked] = useState(false);

  const counterRef = useRef(0);
  const sessionsRef = useRef(new Map<string, ProtocolSession<ClientAPI>>());
  const ablyRef = useRef<Ably.Realtime | null>(null);

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    setLogs((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date(),
        type,
        message,
      },
    ]);
  }, []);

  useEffect(() => {
    let mounted = true;

    function broadcastCounter(ably: Ably.Realtime) {
      ably.channels
        .get(proto.stateChannel)
        .publish('update', { value: counterRef.current });
    }

    function notifyAllClients(message: string) {
      for (const [cId, session] of sessionsRef.current) {
        session
          .getRemoteMain()
          .notify(message)
          .catch(() => {
            if (mounted) addLog('error', `Failed to notify ${cId}`);
          });
      }
    }

    const init = async () => {
      const ably = new Ably.Realtime({
        authUrl: '/api/token',
        authParams: { clientId: SERVER_ID },
        clientId: SERVER_ID,
        echoMessages: false,
      });
      ablyRef.current = ably;

      ably.connection.once('connected', async () => {
        if (!mounted) return;

        // Check for existing server before entering presence
        const presenceChannel = ably.channels.get(proto.presenceChannel);
        const members = await presenceChannel.presence.get();
        const hasServer = members.some(
          (m) => m.data && (m.data as { role?: string }).role === 'server'
        );

        if (hasServer) {
          ably.close();
          if (mounted) {
            setBlocked(true);
            addLog(
              'error',
              'Another server is already running. Only one server allowed.'
            );
          }
          return;
        }

        setConnected(true);
        addLog('info', 'Connected to Ably');

        // Enter presence as server
        await presenceChannel.presence.enter({ role: 'server' });
        addLog('info', 'Entered presence as server');

        // Set up an RPC session for a given client
        async function setupClientSession(clientId: string) {
          // Skip if we already have a session for this client
          if (sessionsRef.current.has(clientId)) return;

          addLog('info', `Client connected: ${clientId}`);
          if (mounted) {
            setClients((prev) => {
              if (prev.some((c) => c.clientId === clientId)) return prev;
              return [...prev, { clientId, joinedAt: new Date() }];
            });
          }

          const rpcChannel = ably.channels.get(`${proto.rpcChannelPrefix}${clientId}`);
          const transport = new AblyTransport(rpcChannel, false, ably);
          await transport.waitReady();

          const counterAPI: CounterAPI = {
            async increment() {
              counterRef.current++;
              if (mounted) {
                setCounterDisplay(counterRef.current);
                addLog(
                  'rpc',
                  `${clientId} \u2192 increment() = ${counterRef.current}`
                );
              }
              broadcastCounter(ably);
              return counterRef.current;
            },
            async decrement() {
              counterRef.current--;
              if (mounted) {
                setCounterDisplay(counterRef.current);
                addLog(
                  'rpc',
                  `${clientId} \u2192 decrement() = ${counterRef.current}`
                );
              }
              broadcastCounter(ably);
              return counterRef.current;
            },
            async reset() {
              counterRef.current = 0;
              if (mounted) {
                setCounterDisplay(0);
                addLog('rpc', `${clientId} \u2192 reset() = 0`);
              }
              broadcastCounter(ably);
              notifyAllClients('Counter was reset!');
              return 0;
            },
            async getValue() {
              if (mounted) {
                addLog(
                  'rpc',
                  `${clientId} \u2192 getValue() = ${counterRef.current}`
                );
              }
              return counterRef.current;
            },
          };

          const session = createProtocolSession<ClientAPI, CounterAPI>(protocol, transport, counterAPI);
          sessionsRef.current.set(clientId, session);

          // Send welcome notification
          try {
            const clientStub = session.getRemoteMain();
            await clientStub.notify(
              `Welcome! Counter is at ${counterRef.current}`
            );
            addLog('info', `Sent welcome to ${clientId}`);
          } catch {
            addLog('error', `Failed to send welcome to ${clientId}`);
          }
        }

        // Create sessions for any clients already in presence
        const existingClients = members.filter(
          (m) => m.data && (m.data as { role?: string }).role === 'client'
        );
        for (const client of existingClients) {
          setupClientSession(client.clientId);
        }

        // Handle new client connections
        presenceChannel.presence.subscribe('enter', async (member) => {
          if (!mounted) return;
          const data = member.data as { role?: string } | undefined;
          if (data?.role !== 'client') return;
          await setupClientSession(member.clientId);
        });

        presenceChannel.presence.subscribe('leave', (member) => {
          if (!mounted) return;
          const data = member.data as { role?: string } | undefined;
          if (data?.role !== 'client') return;

          const clientId = member.clientId;
          addLog('info', `Client disconnected: ${clientId}`);
          sessionsRef.current.delete(clientId);
          if (mounted) {
            setClients((prev) =>
              prev.filter((c) => c.clientId !== clientId)
            );
          }
        });
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
  }, [addLog, protocol, proto]);

  if (blocked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-md p-8 max-w-md text-center">
          <div className="text-4xl mb-4">&#x26A0;&#xFE0F;</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Server Already Running
          </h2>
          <p className="text-gray-600 mb-6">
            Another server tab is already active. Only one server is allowed at
            a time.
          </p>
          <a
            href={`?protocol=${protocol}&role=client`}
            className="inline-block bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Launch as Client Instead
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
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
                <h1 className="text-2xl font-bold text-gray-900">Server</h1>
                <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-full">
                  {SERVER_ID}
                </span>
                <span className="px-2.5 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                  {proto.label}
                </span>
              </div>
              <p className="text-sm text-gray-500">Hosting counter API</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-sm text-gray-600">
              {clients.length} client{clients.length !== 1 ? 's' : ''}
            </div>
            <ConnectionStatus
              status={connected ? 'connected' : 'disconnected'}
            />
          </div>
        </div>

        {/* Counter */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-6 text-center">
          <div className="text-sm text-gray-500 mb-2">Counter Value</div>
          <div className="text-6xl font-bold text-gray-900 tabular-nums">
            {counterDisplay}
          </div>
        </div>

        {/* Connected Clients */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
            Connected Clients
          </h2>
          {clients.length === 0 ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
              Waiting for clients to connect...
            </div>
          ) : (
            <div className="space-y-2">
              {clients.map((c) => (
                <div
                  key={c.clientId}
                  className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-sm font-mono text-gray-700">
                      {c.clientId}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    joined {c.joinedAt.toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Log */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="px-6 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Event Log
            </h2>
          </div>
          <LogPanel entries={logs} maxHeight="400px" />
        </div>

        {/* Code snippet */}
        <div className="bg-gray-900 rounded-xl p-6 shadow-lg">
          <div className="text-xs font-mono text-green-400 mb-3">
            // What's running in this tab ({proto.label})
          </div>
          <pre className="text-sm text-gray-300 font-mono leading-relaxed whitespace-pre">
{protocol === 'capnweb'
  ? `const counterAPI = {
  async increment() { return ++counter; },
  async decrement() { return --counter; },
  async reset()     { counter = 0; return 0; },
  async getValue()  { return counter; },
};

// When a client connects via presence:
const session = new RpcSession<ClientAPI>(
  transport, counterAPI
);

// Server can call client too:
session.getRemoteMain().notify("Hello!");`
  : `const counterAPI = {
  async increment() { return ++counter; },
  async decrement() { return --counter; },
  async reset()     { counter = 0; return 0; },
  async getValue()  { return counter; },
};

// When a client connects via presence:
const session = new JsonRpcSession(
  transport, counterAPI
);

// Server can call client too:
session.getRemoteMain().notify("Hello!");`}
          </pre>
        </div>
      </div>
    </div>
  );
}
