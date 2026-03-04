import { RpcSession } from 'capnweb';
import { AblyTransport, type ProtocolSession } from '@ably/rpc';
import { JsonRpcSession } from '@ably/rpc/json-rpc';
import type { Protocol } from './protocol';

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
