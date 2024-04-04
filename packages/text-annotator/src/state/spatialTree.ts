import RBush from 'rbush';
import type { Store } from '@annotorious/core';
import type { TextAnnotation, TextAnnotationTarget } from '../model';
import { mergeClientRects } from '../utils';
import { getClientRectsPonyfill } from '../utils/getClientRectsPonyfill';
import { reviveSelector } from '../utils';
import type { AnnotationRects } from './TextAnnotationStore';

const isFirefox = false; // navigator.userAgent.match(/firefox|fxios/i);

if (isFirefox) console.warn('Firefox interop enabled');

interface IndexedHighlightRect {

  minX: number;

  minY: number;

  maxX: number;

  maxY: number;

  annotation: {
    
    id: string;

    rects: DOMRect[];

  }

}

export const createSpatialTree = (store: Store<TextAnnotation>, container: HTMLElement) => {

  const tree = new RBush<IndexedHighlightRect>();

  const index = new Map<string, IndexedHighlightRect[]>();

  // Helper: converts a single text annotation target to a list of hightlight rects
  const toItems = (target: TextAnnotationTarget, offset: DOMRect): IndexedHighlightRect[] => {
    const rects = target.selector.flatMap(s => {
      const isValidRange =
        s.range instanceof Range &&
        !s.range.collapsed &&
        s.range.startContainer.nodeType === Node.TEXT_NODE &&
        s.range.endContainer.nodeType === Node.TEXT_NODE;

      const revivedRange = isValidRange ? s.range : reviveSelector(s, container).range;
      
      return isFirefox ?
        getClientRectsPonyfill(revivedRange) :
        Array.from(revivedRange.getClientRects());
    });

    const merged = mergeClientRects(rects)
      // Offset the merged client rects so that coords
      // are relative to the parent container
      .map(({ left, top, right, bottom }) =>  
        new DOMRect(left - offset.left, top - offset.top, right - left, bottom - top));

    return merged.map(rect => {
      const { x, y, width, height } = rect;

      return {
        minX: x,
        minY: y,
        maxX: x + width,
        maxY: y + height,
        annotation: {
          id: target.annotation,
          rects: merged
        }
      }
    });
  }

  const all = () => [...index.values()];

  const clear = () => {
    tree.clear();
    index.clear();
  }

  const insert = (target: TextAnnotationTarget) => {
    const rects = toItems(target, container.getBoundingClientRect());

    rects.forEach(rect => tree.insert(rect));
    index.set(target.annotation, rects);
  }

  const remove = (target: TextAnnotationTarget) => {
    const rects = index.get(target.annotation);
    if (rects) {
      rects.forEach(rect => tree.remove(rect));
      index.delete(target.annotation);
    }
  }

  const update = (target: TextAnnotationTarget) => {
    remove(target);
    insert(target);
  }

  const set = (targets: TextAnnotationTarget[], replace: boolean = true) => {
    if (replace)
      clear();

    const offset = container.getBoundingClientRect();

    const rectsByTarget = targets.map(target => ({ target, rects: toItems(target, offset) }));
    rectsByTarget.forEach(({ target, rects }) => index.set(target.annotation, rects));

    const allRects = rectsByTarget.reduce((all, { rects }) => [...all, ...rects], []);
    tree.load(allRects);
  }

  const getAt = (x: number, y: number): string | undefined => {
    const hits = tree.search({
      minX: x,
      minY: y,
      maxX: x,
      maxY: y
    });

    const area = (rect: IndexedHighlightRect) =>
      rect.annotation.rects.reduce((area, r) =>
        area + r.width * r.height, 0);
    
    // Get smallest rect
    if (hits.length > 0) {
      hits.sort((a, b) => area(a) - area(b));
      return hits[0].annotation.id;
    }
  }

  const getAnnotationBounds = (id: string): DOMRect => {
    const rects = getAnnotationRects(id);

    if (rects.length === 0)
      return undefined;

    let left = rects[0].left;
    let top = rects[0].top;
    let right = rects[0].right;
    let bottom = rects[0].bottom;

    for (let i = 1; i < rects.length; i++) {
      const rect = rects[i];

      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    }

    return new DOMRect(left, top, right - left, bottom - top);
  }

  const getAnnotationRects = (id: string): DOMRect[] => {
    const indexed = index.get(id);
    if (indexed) {
      // Reminder: *each* IndexedHighlightRect stores *all*
      // DOMRects for the annotation for convenience
      return indexed[0].annotation.rects;
    } else {
      return [];
    }
  }

  const getIntersecting = (
    minX: number, 
    minY: number, 
    maxX: number, 
    maxY: number,
  ): AnnotationRects[] => {
    // All rects in this area, regardless of annotation
    const rects = tree.search({ minX, minY, maxX, maxY });

    // Distinct annotation IDs
    const annotationIds = new Set(rects.reduce<string[]>((ids, rect) => ([...ids, rect.annotation.id]), []));

    // Resolve annotation IDs. Note that the tree could be slightly out of sync (because 
    // it updates by listening to changes, just like anyone else)
    return Array.from(annotationIds).map(annotationId => ({
      annotation: store.getAnnotation(annotationId),
      rects: getAnnotationRects(annotationId)
    })).filter(t => Boolean(t.annotation));
  }

  const size = () => tree.all().length;

  const recalculate = () =>
    set(store.all().map(a => a.target), true);

  return {
    all,
    clear,
    getAt,
    getAnnotationBounds,
    getAnnotationRects,
    getIntersecting,
    insert,
    recalculate,
    remove,
    set,
    size,
    update
  }

}
