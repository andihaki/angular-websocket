declare module 'stomp-broker-js' {
  interface StompServerConfig {
    server: unknown;
    serverName?: string;
    path?: string;
    heartbeat?: [number, number];
    heartbeatErrorMargin?: number;
    debug?: (...args: unknown[]) => void;
    protocol?: string;
  }

  interface MessageHeaders {
    destination: string;
    subscription: string;
    'message-id': string;
    'content-type': string;
    'content-length'?: number;
    [key: string]: string | number | undefined;
  }

  type MessageCallback = (msg: unknown, headers: MessageHeaders) => void;

  class StompServer {
    constructor(config: StompServerConfig);
    subscribe(topic: string, callback?: MessageCallback, headers?: Record<string, string>): string;
    unsubscribe(id: string): boolean;
    send(topic: string, headers: Record<string, string>, body: string): void;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export default StompServer;
}
