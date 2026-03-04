import { RpcSession } from 'capnweb';
import type { AblyTransport } from './ably-transport';
import type { Protocol } from './protocol';
import { JsonRpcSession } from './jsonrpc-session';

export interface ProtocolSession<Remote> {
  getRemoteMain(): Remote;
  close?: () => void;
}

export function createProtocolSession<Remote, Local extends object>(
  protocol: Protocol,
  transport: AblyTransport,
  localApi: Local
): ProtocolSession<Remote> {
  if (protocol === 'capnweb') {
    // RpcSession.getRemoteMain() returns Stub<Remote> which is structurally
    // compatible with Remote at runtime (Proxy-based), so the cast is safe.
    return new RpcSession<Remote>(transport, localApi) as unknown as ProtocolSession<Remote>;
  }
  return new JsonRpcSession<Remote, Local>(transport, localApi);
}
