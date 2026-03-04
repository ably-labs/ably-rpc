// Shared TypeScript types for the demo

export interface CounterAPI {
  increment(): Promise<number>;
  decrement(): Promise<number>;
  reset(): Promise<number>;
  getValue(): Promise<number>;
}

export interface ClientAPI {
  notify(message: string): Promise<void>;
}
