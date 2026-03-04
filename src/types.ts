/**
 * Common session interface satisfied by both JsonRpcSession and capnweb's RpcSession.
 */
export interface ProtocolSession<Remote> {
  getRemoteMain(): Remote;
  close?: () => void;
}
