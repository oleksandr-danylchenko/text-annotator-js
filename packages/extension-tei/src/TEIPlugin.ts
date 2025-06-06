import type { 
  TextAnnotator,
  TextAnnotation,
  TextAnnotationTarget, 
} from '@recogito/text-annotator';
import type { 
  Annotator,
  Origin,  
  Store,  
} from '@annotorious/core';
import { 
  textToTEIAnnotation, 
  textToTEITarget 
} from './crosswalk';
import type { 
  TEIAnnotation,
  TEIAnnotationTarget
} from './TEIAnnotation';

export type TEIAnnotationStore = Store<TEIAnnotation> & {

  // Minor change to default Annotorious store - text store returns annotations
  // that failed to render, to support lazy document loading scenarios
  bulkAddAnnotation(annotations: TextAnnotation[], replace: boolean, origin: Origin): TEIAnnotation[];

  getAt(x: number, y: number): TEIAnnotation | undefined;
  
  getIntersecting(minX: number, minY: number, maxX: number, maxY: number): TEIAnnotation[];
  
  recalculatePositions(): void;

}

export interface RecogitoTEIAnnotator<T extends unknown = TEIAnnotation> extends Annotator<TEIAnnotation, T> { }

export const TEIPlugin = (anno: TextAnnotator): RecogitoTEIAnnotator => {

  const container: HTMLElement = anno.element;

  const toTEI = textToTEIAnnotation(container);

  const toTEITarget = textToTEITarget(container);

  // Monkey-patch the store
  const store = anno.state.store;

  const _addAnnotation = store.addAnnotation;
  store.addAnnotation = (annotation: TEIAnnotation | TextAnnotation, origin: Origin) => {
    const { selector } = annotation.target;
    try {
      return ('startSelector' in selector && 'start' in selector) ?
        _addAnnotation(annotation, origin) :
        _addAnnotation(toTEI(annotation), origin);
    } catch (error) {
      console.warn(error);
      console.warn(`Failed to render annotation`, annotation);
    }
  }

  const _bulkAddAnnotations = store.bulkAddAnnotations;
  store.bulkAddAnnotations = (annotations: Array<TEIAnnotation | TextAnnotation>, replace = true, origin: Origin) => {
    const teiAnnotations = annotations.map(a => {
      const { selector } = a.target;
      try {
        return ('startSelector' in selector && 'start' in selector) ? a : toTEI(a);
      } catch (error) {
        console.warn(error);
      }
    });

    const valid = teiAnnotations.filter(Boolean);

    if (teiAnnotations.length !== valid.length) {
      console.warn(`Failed to render ${teiAnnotations.length - valid.length} annotations.`);
      teiAnnotations.forEach((a, idx) => {
        if (!a) console.warn(annotations[idx]);
      })
    }
    
    return _bulkAddAnnotations(valid, replace, origin);
  }

  const _updateAnnotation = store.updateAnnotation;
  store.updateAnnotation = (annotation: TEIAnnotation | TextAnnotation, origin: Origin) =>
    _updateAnnotation(toTEI(annotation), origin);

  const _updateTarget = store.updateTarget;
  store.updateTarget = (target: TEIAnnotationTarget | TextAnnotationTarget, origin: Origin) => 
    _updateTarget(toTEITarget(target), origin);

  return {
    ...anno,
    state: {
      ...anno.state,
      // @ts-ignore
      store
    }
  }

}
