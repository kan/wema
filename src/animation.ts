import type { NoteId } from './types.js';
import type { NoteManager, NoteRect } from './note.js';

/** Fast at first, slowing down into the end (t and the result are in 0..1) */
const easeOut = (t: number): number => 1 - (1 - t) ** 3;

const mix = (from: number, to: number, t: number): number => from + (to - from) * t;

/** Whether the user asked the system for less motion */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animates notes to the place the model has for them. The model is at the
 * end from the start: only where the notes are drawn moves, from where they
 * were drawn to where the model has them now. So nothing is left half done
 * when an animation is cut short, and there is nothing to commit at its end.
 */
export class NoteAnimator {
  private noteManager: NoteManager;
  private onFrame: (noteIds: NoteId[]) => void;
  private running = new Map<NoteId, { from: NoteRect; start: number; duration: number }>();
  private frameId = 0;

  constructor(options: {
    noteManager: NoteManager;
    /** Called after the notes were drawn at a new place (their edges are to follow) */
    onFrame: (noteIds: NoteId[]) => void;
  }) {
    this.noteManager = options.noteManager;
    this.onFrame = options.onFrame;
  }

  /**
   * Animate a note from `from` (where it was drawn until now) to where the
   * model has it. Replaces an animation of the same note that is running.
   */
  start(id: NoteId, from: NoteRect, duration: number): void {
    this.running.set(id, { from: { ...from }, start: performance.now(), duration });
    // Drawn at the start right away: the model's place must not show for a frame
    this.noteManager.setShownRect(id, from);
    if (!this.frameId) this.frameId = requestAnimationFrame(() => this.tick());
  }

  /** Stop animating a note: it is drawn where the model has it. Returns whether it was animated. */
  cancel(id: NoteId): boolean {
    if (!this.running.delete(id)) return false;
    this.noteManager.setShownRect(id, null);
    return true;
  }

  /** Whether any note is on its way */
  isRunning(): boolean {
    return this.running.size > 0;
  }

  /** Stop all animations (the notes may be gone: nothing is drawn again) */
  clear(): void {
    this.running.clear();
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  private tick(): void {
    this.frameId = 0;
    const now = performance.now();
    const moved: NoteId[] = [];
    for (const [id, { from, start, duration }] of this.running) {
      // The end is read in every frame: a measured note may get another
      // height on the way. It is where the note is placed for the display,
      // else where the model has it.
      const note = this.noteManager.getPlacedNote(id);
      const t = (now - start) / duration;
      if (!note || t >= 1) {
        this.running.delete(id);
        this.noteManager.setShownRect(id, null);
      } else {
        const k = easeOut(t);
        this.noteManager.setShownRect(id, {
          x: mix(from.x, note.x, k),
          y: mix(from.y, note.y, k),
          width: mix(from.width, note.width, k),
          height: mix(from.height, note.height, k),
        });
      }
      if (note) moved.push(id);
    }
    if (moved.length > 0) this.onFrame(moved);
    if (this.running.size > 0) this.frameId = requestAnimationFrame(() => this.tick());
  }
}
