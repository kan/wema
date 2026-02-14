import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from '../src/events';

interface TestEventMap {
  greet: { name: string };
  count: { value: number };
}

describe('EventEmitter', () => {
  it('calls registered handler on emit', () => {
    const emitter = new EventEmitter<TestEventMap>();
    const handler = vi.fn();
    emitter.on('greet', handler);
    emitter.emit('greet', { name: 'Alice' });
    expect(handler).toHaveBeenCalledWith({ name: 'Alice' });
  });

  it('supports multiple handlers for the same event', () => {
    const emitter = new EventEmitter<TestEventMap>();
    const h1 = vi.fn();
    const h2 = vi.fn();
    emitter.on('greet', h1);
    emitter.on('greet', h2);
    emitter.emit('greet', { name: 'Bob' });
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('does not call handler after off()', () => {
    const emitter = new EventEmitter<TestEventMap>();
    const handler = vi.fn();
    emitter.on('greet', handler);
    emitter.off('greet', handler);
    emitter.emit('greet', { name: 'Charlie' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('handles emit with no registered handlers', () => {
    const emitter = new EventEmitter<TestEventMap>();
    expect(() => emitter.emit('greet', { name: 'Dave' })).not.toThrow();
  });

  it('isolates errors in handlers', () => {
    const emitter = new EventEmitter<TestEventMap>();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const badHandler = () => { throw new Error('boom'); };
    const goodHandler = vi.fn();

    emitter.on('greet', badHandler);
    emitter.on('greet', goodHandler);
    emitter.emit('greet', { name: 'Eve' });

    expect(goodHandler).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('removeAllListeners clears all handlers', () => {
    const emitter = new EventEmitter<TestEventMap>();
    const h1 = vi.fn();
    const h2 = vi.fn();
    emitter.on('greet', h1);
    emitter.on('count', h2);
    emitter.removeAllListeners();
    emitter.emit('greet', { name: 'Frank' });
    emitter.emit('count', { value: 42 });
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it('supports multiple event types independently', () => {
    const emitter = new EventEmitter<TestEventMap>();
    const greetHandler = vi.fn();
    const countHandler = vi.fn();
    emitter.on('greet', greetHandler);
    emitter.on('count', countHandler);

    emitter.emit('greet', { name: 'Grace' });
    expect(greetHandler).toHaveBeenCalledOnce();
    expect(countHandler).not.toHaveBeenCalled();

    emitter.emit('count', { value: 7 });
    expect(countHandler).toHaveBeenCalledOnce();
  });
});
