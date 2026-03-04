import express from 'express';
import * as Ably from 'ably';
import jwt from 'jsonwebtoken';
import { RpcSession } from 'capnweb';
import { AblyTransport } from '../shared/ably-transport.js';
import type { CounterAPI, ClientAPI } from '../shared/types.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const app = express();
const PORT = 3000;

// Counter state
let counter = 0;

// Store RPC sessions for each client
const sessions = new Map<string, RpcSession<ClientAPI>>();

// Initialize Ably
const ably = new Ably.Realtime({
  key: process.env.ABLY_API_KEY!,
  clientId: 'server',
  // Each side of the RPC channel only needs messages from the other side,
  // not echoes of its own publishes
  echoMessages: false
});

function broadcastCounterUpdate() {
  const stateChannel = ably.channels.get('state:counter');
  stateChannel.publish('update', { value: counter });
}

// Create counter API as plain object (not RpcTarget class)
function createCounterAPI(): CounterAPI {
  return {
    async increment() {
      counter++;
      console.log(`Counter incremented to ${counter}`);
      broadcastCounterUpdate();
      return counter;
    },

    async decrement() {
      counter--;
      console.log(`Counter decremented to ${counter}`);
      broadcastCounterUpdate();
      return counter;
    },

    async reset() {
      counter = 0;
      console.log('Counter reset to 0');
      broadcastCounterUpdate();

      // Notify all clients - do this async
      setTimeout(async () => {
        for (const [clientId, session] of sessions.entries()) {
          try {
            const clientStub = session.getRemoteMain();
            await clientStub.notify('Counter was reset!');
            console.log(`✅ Notified ${clientId} about reset`);
          } catch (err) {
            console.error(`Failed to notify client ${clientId}:`, err);
          }
        }
      }, 100);

      return counter;
    },

    async getValue() {
      return counter;
    }
  };
}

// Set up RPC server for each new client connection
ably.connection.on('connected', () => {
  console.log('✅ Server connected to Ably');
});

// Listen for presence events to set up RPC for each client
const presenceChannel = ably.channels.get('presence:lobby');

presenceChannel.presence.subscribe('enter', async (member) => {
  const clientId = member.clientId;
  if (clientId && clientId !== 'server') {
    console.log(`📥 Client connected: ${clientId}`);

    // Wait a moment for client to set up their RPC session
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Set up RPC channel for this client
    const rpcChannel = ably.channels.get(`rpc:${clientId}`);
    const transport = new AblyTransport(rpcChannel, true, ably); // Enable debug logging

    // Wait for transport to be ready
    await transport.waitReady();

    // Create counter API instance
    const counterAPI = createCounterAPI();

    // Create RPC session - T is the REMOTE type (ClientAPI)
    console.log(`[Server] Creating RPC session for ${clientId}`);
    const session = new RpcSession<ClientAPI>(transport, counterAPI);
    sessions.set(clientId, session);

    console.log(`✅ RPC session established for ${clientId}`);

    // Wait a bit more, then try to send welcome
    setTimeout(async () => {
      try {
        const clientStub = session.getRemoteMain();
        console.log(`[Server] Got client stub for ${clientId}, calling notify...`);
        await clientStub.notify(`Welcome! Counter is at ${counter}`);
        console.log(`✅ Sent welcome to ${clientId}`);
      } catch (err) {
        console.error(`Failed to send welcome to ${clientId}:`, err);
      }
    }, 500);
  }
});

presenceChannel.presence.subscribe('leave', (member) => {
  const clientId = member.clientId;
  if (clientId && clientId !== 'server') {
    console.log(`📤 Client disconnected: ${clientId}`);
    sessions.delete(clientId);
  }
});

// Parse Ably API key into components for JWT signing
const apiKey = process.env.ABLY_API_KEY!;
const [keyName, keySecret] = apiKey.split(':');

// Token endpoint — issues Ably JWTs for client auth
app.get('/api/token', (req, res) => {
  const clientId = (req.query.clientId as string) || 'anonymous';

  const token = jwt.sign(
    {
      'x-ably-capability': '{"*":["*"]}',
      'x-ably-clientId': clientId,
    },
    keySecret,
    {
      header: { typ: 'JWT', alg: 'HS256', kid: keyName },
      expiresIn: 3600,
      noTimestamp: false,
    }
  );

  res.set('Content-Type', 'application/jwt').send(token);
});

// Express routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', counter });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔗 Using Ably API key: ${process.env.ABLY_API_KEY?.substring(0, 10)}...`);
});
