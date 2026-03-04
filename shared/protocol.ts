export type Protocol = 'capnweb' | 'jsonrpc';

export interface ProtocolMeta {
  id: Protocol;
  label: string;
  description: string;
  presenceChannel: string;
  rpcChannelPrefix: string;
  stateChannel: string;
}

export const PROTOCOLS: Record<Protocol, ProtocolMeta> = {
  capnweb: {
    id: 'capnweb',
    label: "Cap'n Proto (capnweb)",
    description:
      'Cloudflare\'s JS RPC library with promise pipelining, pass-by-reference, and zero-boilerplate bidirectional calls.',
    presenceChannel: 'presence:capnweb:lobby',
    rpcChannelPrefix: 'rpc:capnweb:',
    stateChannel: 'state:capnweb:counter',
  },
  jsonrpc: {
    id: 'jsonrpc',
    label: 'JSON-RPC 2.0',
    description:
      'The standard lightweight RPC protocol. Plain JSON on the wire, supported by every major language.',
    presenceChannel: 'presence:jsonrpc:lobby',
    rpcChannelPrefix: 'rpc:jsonrpc:',
    stateChannel: 'state:jsonrpc:counter',
  },
};
