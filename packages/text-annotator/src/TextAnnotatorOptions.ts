import type { FormatAdapter, PointerSelectAction } from '@annotorious/core';
import type { PresencePainterOptions } from './presence';
import type { TextAnnotation } from './model';
import type { HighlightStyleExpression } from './highlight';

export interface TextAnnotatorOptions<T extends unknown = TextAnnotation> {

  adapter?: FormatAdapter<TextAnnotation, T> | null;

  annotationEnabled?: boolean;

  renderer?: RendererType;

  offsetReferenceSelector?: string;

  pointerAction?: PointerSelectAction | ((annotation: TextAnnotation) => PointerSelectAction);

  presence?: PresencePainterOptions;

  style?: HighlightStyleExpression;
    
}

export type RendererType = 'SPANS' | 'CANVAS' | 'CSS_HIGHLIGHTS';

export const fillDefaults = <T extends unknown = TextAnnotation>  (
  opts: TextAnnotatorOptions<T>,
  defaults: TextAnnotatorOptions<T>
): TextAnnotatorOptions<T> => {

  return {
    ...opts,
    annotationEnabled: opts.annotationEnabled === undefined ? defaults.annotationEnabled : opts.annotationEnabled
  };

};
