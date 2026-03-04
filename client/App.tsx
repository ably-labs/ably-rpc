import { useEffect, useState } from 'react';
import * as Ably from 'ably';
import { RpcSession, RpcStub } from 'capnweb';
import { AblyTransport } from '../shared/ably-transport';
import type { CounterAPI, ClientAPI } from '../shared/types';

// Generate a random client ID
const CLIENT_ID = `client-${Math.random().toString(36).substring(7)}`;

interface Notification {
  id: string;
  message: string;
}

interface PresenceMember {
  clientId: string;
}

function App() {
  const [counter, setCounter] = useState<number>(0);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const [serverStub, setServerStub] = useState<RpcStub<CounterAPI> | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    let ably: Ably.Realtime;
    let mounted = true;

    const init = async () => {
      try {
        // Initialize Ably
        ably = new Ably.Realtime({
          authUrl: '/api/token',
          authParams: { clientId: CLIENT_ID },
          clientId: CLIENT_ID,
          // Each side of the RPC channel only needs messages from the other side,
          // not echoes of its own publishes
          echoMessages: false
        });

        // Connection status
        ably.connection.on('connected', async () => {
          console.log('✅ Connected to Ably');
          setConnected(true);

          // Set up RPC BEFORE entering presence
          const rpcChannel = ably.channels.get(`rpc:${CLIENT_ID}`);
          const transport = new AblyTransport(rpcChannel, true, ably); // Enable debug to see what's happening

          // Wait for transport to be ready
          await transport.waitReady();

          // Client API implementation (plain object, not RpcTarget)
          const clientAPI: ClientAPI = {
            async notify(message: string) {
              console.log('📬 Server notification:', message);
              if (mounted) {
                const notification = {
                  id: Date.now().toString(),
                  message
                };
                setNotifications(prev => [...prev, notification]);

                // Auto-remove after 5 seconds
                setTimeout(() => {
                  setNotifications(prev => prev.filter(n => n.id !== notification.id));
                }, 5000);
              }
            }
          };

          // Create RPC session - T is the REMOTE type (CounterAPI)
          const session = new RpcSession<CounterAPI>(transport, clientAPI);

          // Get server stub
          const server = session.getRemoteMain();

          console.log('✅ RPC session created');

          // Subscribe to presence BEFORE entering
          const presenceChannel = ably.channels.get('presence:lobby');

          presenceChannel.presence.subscribe(async () => {
            try {
              const members = await presenceChannel.presence.get();
              if (mounted) {
                setMembers(members.map(m => ({ clientId: m.clientId })));
              }
            } catch (err) {
              console.error('Failed to get presence members:', err);
            }
          });

          // NOW enter presence - server will create its session when it sees this
          await presenceChannel.presence.enter();
          console.log('✅ Entered presence');

          // Wait for server to set up its session
          await new Promise(resolve => setTimeout(resolve, 1500));

          if (mounted) {
            // Must wrap in arrow fn — React useState treats function values as updater
            // functions, and capnweb stubs are Proxies around functions, so React would
            // call server(prevState) which sends spurious RPC messages.
            setServerStub(() => server);

            // Get initial counter value
            try {
              const initialValue = await server.getValue();
              setCounter(initialValue);
              console.log('✅ Got initial counter value:', initialValue);
            } catch (err) {
              console.error('Failed to get initial value:', err);
            }
          }

          // Subscribe to counter state updates
          const stateChannel = ably.channels.get('state:counter');
          stateChannel.subscribe('update', (message) => {
            if (mounted) {
              setCounter(message.data.value);
            }
          });
        });

        ably.connection.on('disconnected', () => {
          console.log('❌ Disconnected from Ably');
          setConnected(false);
        });

      } catch (error) {
        console.error('Failed to initialize:', error);
      }
    };

    init();

    return () => {
      mounted = false;
      if (ably) {
        ably.close();
      }
    };
  }, []);

  const handleIncrement = async () => {
    if (!serverStub) return;
    setLoading('increment');
    try {
      await serverStub.increment();
    } catch (error) {
      console.error('Failed to increment:', error);
    } finally {
      setLoading(null);
    }
  };

  const handleDecrement = async () => {
    if (!serverStub) return;
    setLoading('decrement');
    try {
      await serverStub.decrement();
    } catch (error) {
      console.error('Failed to decrement:', error);
    } finally {
      setLoading(null);
    }
  };

  const handleReset = async () => {
    if (!serverStub) return;
    setLoading('reset');
    try {
      await serverStub.reset();
    } catch (error) {
      console.error('Failed to reset:', error);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {notifications.map((notif) => (
          <div
            key={notif.id}
            className="notification-enter bg-white shadow-lg rounded-lg p-4 max-w-sm border-l-4 border-blue-500"
          >
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <span className="text-2xl">🔔</span>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900">{notif.message}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">
                capnweb over Ably
              </h1>
              <p className="text-gray-600 mt-1">
                Bidirectional RPC with enterprise reliability
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm text-gray-600">
                {connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>

        {/* Counter Display */}
        <div className="bg-white rounded-lg shadow-md p-12 mb-8">
          <div className="text-center">
            <p className="text-gray-600 mb-4 text-lg">Counter Value</p>
            <div className="counter-update text-8xl font-bold text-indigo-600 mb-8">
              {counter}
            </div>

            {/* Controls */}
            <div className="flex justify-center space-x-4">
              <button
                onClick={handleIncrement}
                disabled={!connected || !serverStub || loading === 'increment'}
                className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-bold py-4 px-8 rounded-lg shadow-lg transition-all transform hover:scale-105 disabled:transform-none"
              >
                {loading === 'increment' ? '...' : '+1'}
              </button>
              <button
                onClick={handleDecrement}
                disabled={!connected || !serverStub || loading === 'decrement'}
                className="bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-bold py-4 px-8 rounded-lg shadow-lg transition-all transform hover:scale-105 disabled:transform-none"
              >
                {loading === 'decrement' ? '...' : '-1'}
              </button>
              <button
                onClick={handleReset}
                disabled={!connected || !serverStub || loading === 'reset'}
                className="bg-gray-500 hover:bg-gray-600 disabled:bg-gray-300 text-white font-bold py-4 px-8 rounded-lg shadow-lg transition-all transform hover:scale-105 disabled:transform-none"
              >
                {loading === 'reset' ? '...' : 'Reset'}
              </button>
            </div>
          </div>
        </div>

        {/* Presence */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Who's Online ({members.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {members.map((member) => (
              <div
                key={member.clientId}
                className={`px-4 py-2 rounded-full text-sm ${
                  member.clientId === CLIENT_ID
                    ? 'bg-indigo-100 text-indigo-800 font-semibold'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {member.clientId === CLIENT_ID ? '👤 You' : `👤 ${member.clientId}`}
              </div>
            ))}
          </div>
        </div>

        {/* Code Sample */}
        <div className="mt-8 bg-gray-900 rounded-lg p-6 shadow-lg">
          <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">
            How it works
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-mono text-green-400 mb-2">// Server</p>
              <pre className="text-sm text-gray-200 font-mono leading-relaxed whitespace-pre">{`const channel = ably.channels.get('rpc');
const transport = new AblyTransport(channel);

const counterAPI = {
  async increment() {
    return ++counter;
  }
};

new RpcSession(transport, counterAPI);`}</pre>
            </div>
            <div>
              <p className="text-xs font-mono text-blue-400 mb-2">// Client</p>
              <pre className="text-sm text-gray-200 font-mono leading-relaxed whitespace-pre">{`const channel = ably.channels.get('rpc');
const transport = new AblyTransport(channel);

const session = new RpcSession(transport);
const server = session.getRemoteMain();

await server.increment(); // calls server`}</pre>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            capnweb RPC over Ably &mdash; the transport is swappable, the API calls look like local functions.
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
