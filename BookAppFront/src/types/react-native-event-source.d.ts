declare module 'react-native-event-source' {
  type EventSourceListener = (event: { data: string }) => void;

  interface EventSourceConfig {
    headers?: Record<string, string>;
  }

  export default class EventSource {
    constructor(url: string, config?: EventSourceConfig);
    addEventListener(type: string, listener: EventSourceListener): void;
    removeEventListener(type: string, listener: EventSourceListener): void;
    close(): void;
  }
}
