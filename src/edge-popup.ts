import type { EdgeId, LineStyle, ArrowHead } from './types.js';
import { EdgeManager } from './edge.js';
import { NoteManager } from './note.js';
import { createElement } from './utils/dom.js';

// SVG icon helpers (24x16 viewBox)
const LINE_ICONS: Record<LineStyle, { svg: string; title: string }> = {
  solid: {
    svg: '<svg width="24" height="16" viewBox="0 0 24 16"><line x1="2" y1="8" x2="22" y2="8" stroke="currentColor" stroke-width="2"/></svg>',
    title: 'Solid',
  },
  dashed: {
    svg: '<svg width="24" height="16" viewBox="0 0 24 16"><line x1="2" y1="8" x2="22" y2="8" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3"/></svg>',
    title: 'Dashed',
  },
  dotted: {
    svg: '<svg width="24" height="16" viewBox="0 0 24 16"><line x1="2" y1="8" x2="22" y2="8" stroke="currentColor" stroke-width="2" stroke-dasharray="2 2"/></svg>',
    title: 'Dotted',
  },
};

const ARROW_ICONS: { value: ArrowHead; svg: string; title: string }[] = [
  {
    value: 'none',
    svg: '<svg width="24" height="16" viewBox="0 0 24 16"><line x1="2" y1="8" x2="22" y2="8" stroke="currentColor" stroke-width="2"/></svg>',
    title: 'No arrow',
  },
  {
    value: 'start',
    svg: '<svg width="24" height="16" viewBox="0 0 24 16"><line x1="8" y1="8" x2="22" y2="8" stroke="currentColor" stroke-width="2"/><polygon points="8,8 14,5 14,11" fill="currentColor"/></svg>',
    title: 'Arrow at start',
  },
  {
    value: 'end',
    svg: '<svg width="24" height="16" viewBox="0 0 24 16"><line x1="2" y1="8" x2="16" y2="8" stroke="currentColor" stroke-width="2"/><polygon points="16,5 22,8 16,11" fill="currentColor"/></svg>',
    title: 'Arrow at end',
  },
  {
    value: 'both',
    svg: '<svg width="24" height="16" viewBox="0 0 24 16"><line x1="8" y1="8" x2="16" y2="8" stroke="currentColor" stroke-width="2"/><polygon points="8,8 14,5 14,11" fill="currentColor"/><polygon points="16,5 22,8 16,11" fill="currentColor"/></svg>',
    title: 'Arrow at both ends',
  },
];

const ARROW_SIZE_ICONS: { value: number; svg: string; title: string }[] = [
  {
    value: 8,
    svg: '<svg width="24" height="16" viewBox="0 0 24 16"><line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="2"/><polygon points="14,5.5 19,8 14,10.5" fill="currentColor"/></svg>',
    title: 'Small',
  },
  {
    value: 12,
    svg: '<svg width="24" height="16" viewBox="0 0 24 16"><line x1="2" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="2"/><polygon points="13,4 21,8 13,12" fill="currentColor"/></svg>',
    title: 'Medium',
  },
  {
    value: 18,
    svg: '<svg width="24" height="16" viewBox="0 0 24 16"><line x1="2" y1="8" x2="11" y2="8" stroke="currentColor" stroke-width="2"/><polygon points="11,2 23,8 11,14" fill="currentColor"/></svg>',
    title: 'Large',
  },
];

const WIDTH_ICONS: { value: number; svg: string; title: string }[] = [
  {
    value: 1,
    svg: '<svg width="24" height="16" viewBox="0 0 24 16"><line x1="2" y1="8" x2="22" y2="8" stroke="currentColor" stroke-width="1"/></svg>',
    title: 'Thin',
  },
  {
    value: 2,
    svg: '<svg width="24" height="16" viewBox="0 0 24 16"><line x1="2" y1="8" x2="22" y2="8" stroke="currentColor" stroke-width="2"/></svg>',
    title: 'Normal',
  },
  {
    value: 4,
    svg: '<svg width="24" height="16" viewBox="0 0 24 16"><line x1="2" y1="8" x2="22" y2="8" stroke="currentColor" stroke-width="4"/></svg>',
    title: 'Thick',
  },
];

const TRASH_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

export class EdgeStylePopup {
  private popupEl: HTMLElement;
  private boardEl: HTMLElement;
  private edgeManager: EdgeManager;
  private noteManager: NoteManager;
  private onDelete: (edgeId: EdgeId) => void;
  private currentEdgeId: EdgeId | null = null;
  private lastX = 0;
  private lastY = 0;

  constructor(options: {
    boardEl: HTMLElement;
    edgeManager: EdgeManager;
    noteManager: NoteManager;
    onDelete: (edgeId: EdgeId) => void;
  }) {
    this.boardEl = options.boardEl;
    this.edgeManager = options.edgeManager;
    this.noteManager = options.noteManager;
    this.onDelete = options.onDelete;

    this.popupEl = createElement('div', 'wema-edge-popup');
    this.popupEl.style.display = 'none';
    this.boardEl.appendChild(this.popupEl);
  }

  show(edgeId: EdgeId, clientX?: number, clientY?: number): void {
    const edge = this.edgeManager.getEdge(edgeId);
    if (!edge) return;

    this.currentEdgeId = edgeId;
    this.popupEl.innerHTML = '';

    // Resolve current effective values
    const lineStyle: LineStyle = edge.lineStyle ?? (edge.style === 'dashed' ? 'dashed' : 'solid');
    const arrowHead: ArrowHead = edge.arrowHead ?? (edge.style === 'arrow' ? 'end' : 'none');
    const arrowSize = edge.arrowSize ?? 12;
    const strokeWidth = edge.strokeWidth ?? 2;

    // Line style section
    const lineSection = createElement('div', 'wema-popup-section');
    const lineLabel = createElement('div', 'wema-popup-label');
    lineLabel.textContent = 'Line';
    lineSection.appendChild(lineLabel);
    const lineGroup = createElement('div', 'wema-popup-group');
    for (const ls of ['solid', 'dashed', 'dotted'] as LineStyle[]) {
      const icon = LINE_ICONS[ls];
      const btn = createElement('button', 'wema-popup-btn') as HTMLButtonElement;
      btn.innerHTML = icon.svg;
      btn.title = icon.title;
      if (ls === lineStyle) btn.classList.add('active');
      btn.addEventListener('click', () => {
        if (!this.currentEdgeId) return;
        this.edgeManager.updateEdge(this.currentEdgeId, { lineStyle: ls });
        this.show(this.currentEdgeId);
      });
      lineGroup.appendChild(btn);
    }
    lineSection.appendChild(lineGroup);

    // Arrow section
    const arrowSection = createElement('div', 'wema-popup-section');
    const arrowLabel = createElement('div', 'wema-popup-label');
    arrowLabel.textContent = 'Arrow';
    arrowSection.appendChild(arrowLabel);
    const arrowGroup = createElement('div', 'wema-popup-group');
    for (const item of ARROW_ICONS) {
      const btn = createElement('button', 'wema-popup-btn') as HTMLButtonElement;
      btn.innerHTML = item.svg;
      btn.title = item.title;
      if (item.value === arrowHead) btn.classList.add('active');
      btn.addEventListener('click', () => {
        if (!this.currentEdgeId) return;
        this.edgeManager.updateEdge(this.currentEdgeId, { arrowHead: item.value });
        this.show(this.currentEdgeId);
      });
      arrowGroup.appendChild(btn);
    }
    arrowSection.appendChild(arrowGroup);

    // Arrow size section
    const arrowSizeSection = createElement('div', 'wema-popup-section');
    const arrowSizeLabel = createElement('div', 'wema-popup-label');
    arrowSizeLabel.textContent = 'Size';
    arrowSizeSection.appendChild(arrowSizeLabel);
    const arrowSizeGroup = createElement('div', 'wema-popup-group');
    for (const item of ARROW_SIZE_ICONS) {
      const btn = createElement('button', 'wema-popup-btn') as HTMLButtonElement;
      btn.innerHTML = item.svg;
      btn.title = item.title;
      if (item.value === arrowSize) btn.classList.add('active');
      btn.addEventListener('click', () => {
        if (!this.currentEdgeId) return;
        this.edgeManager.updateEdge(this.currentEdgeId, { arrowSize: item.value });
        this.show(this.currentEdgeId);
      });
      arrowSizeGroup.appendChild(btn);
    }
    arrowSizeSection.appendChild(arrowSizeGroup);

    // Width section
    const widthSection = createElement('div', 'wema-popup-section');
    const widthLabel = createElement('div', 'wema-popup-label');
    widthLabel.textContent = 'Width';
    widthSection.appendChild(widthLabel);
    const widthGroup = createElement('div', 'wema-popup-group');
    for (const item of WIDTH_ICONS) {
      const btn = createElement('button', 'wema-popup-btn') as HTMLButtonElement;
      btn.innerHTML = item.svg;
      btn.title = item.title;
      if (item.value === strokeWidth) btn.classList.add('active');
      btn.addEventListener('click', () => {
        if (!this.currentEdgeId) return;
        this.edgeManager.updateEdge(this.currentEdgeId, { strokeWidth: item.value });
        this.show(this.currentEdgeId);
      });
      widthGroup.appendChild(btn);
    }
    widthSection.appendChild(widthGroup);

    // Delete section
    const deleteSection = createElement('div', 'wema-popup-section wema-popup-delete-section');
    const deleteBtn = createElement('button', 'wema-popup-btn wema-popup-btn-delete') as HTMLButtonElement;
    deleteBtn.innerHTML = TRASH_ICON;
    deleteBtn.title = 'Delete';
    deleteBtn.addEventListener('click', () => {
      if (!this.currentEdgeId) return;
      const id = this.currentEdgeId;
      this.hide();
      this.onDelete(id);
    });
    deleteSection.appendChild(deleteBtn);

    this.popupEl.appendChild(lineSection);
    this.popupEl.appendChild(arrowSection);
    this.popupEl.appendChild(arrowSizeSection);
    this.popupEl.appendChild(widthSection);
    this.popupEl.appendChild(deleteSection);

    // Position at click point (convert client coords to board-relative)
    if (clientX != null && clientY != null) {
      const rect = this.boardEl.getBoundingClientRect();
      this.lastX = clientX - rect.left;
      this.lastY = clientY - rect.top;
    }
    this.popupEl.style.left = `${this.lastX}px`;
    this.popupEl.style.top = `${this.lastY + 12}px`;

    this.popupEl.style.display = '';
  }

  hide(): void {
    this.popupEl.style.display = 'none';
    this.currentEdgeId = null;
  }

  destroy(): void {
    this.popupEl.remove();
  }
}
