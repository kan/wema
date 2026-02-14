import type { NoteId } from './types.js';
import { NoteManager } from './note.js';

/**
 * Layout functions — stubs for Phase 1.
 * Full implementation comes in Phase 3.
 */

export function alignNotes(
  _noteManager: NoteManager,
  _noteIds: NoteId[],
  _alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom',
): void {
  console.warn('alignNotes() is a stub in Phase 1');
}

export function distributeNotes(
  _noteManager: NoteManager,
  _noteIds: NoteId[],
  _direction: 'horizontal' | 'vertical',
): void {
  console.warn('distributeNotes() is a stub in Phase 1');
}

export function autoLayout(
  _noteManager: NoteManager,
  _noteIds?: NoteId[],
): void {
  console.warn('autoLayout() is a stub in Phase 1');
}
