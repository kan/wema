/** Type-safe event emitter */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class EventEmitter<TEventMap extends { [K in keyof TEventMap]: any }> {
  private handlers = new Map<keyof TEventMap, Set<(payload: never) => void>>();

  /** Register an event handler */
  on<K extends keyof TEventMap>(event: K, handler: (payload: TEventMap[K]) => void): void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as (payload: never) => void);
  }

  /** Remove an event handler */
  off<K extends keyof TEventMap>(event: K, handler: (payload: TEventMap[K]) => void): void {
    this.handlers.get(event)?.delete(handler as (payload: never) => void);
  }

  /** Emit an event to all registered handlers */
  emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        (handler as (payload: TEventMap[K]) => void)(payload);
      } catch (e) {
        console.error(`Error in event handler for "${String(event)}":`, e);
      }
    }
  }

  /** Remove all handlers for all events */
  removeAllListeners(): void {
    this.handlers.clear();
  }
}
