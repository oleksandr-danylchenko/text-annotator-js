import { ReactNode, useCallback, useEffect, useState, PointerEvent } from 'react';
import { useAnnotator, useSelection } from '@annotorious/react';
import { type TextAnnotation, type TextAnnotator } from '@soomo/text-annotator';
import {
  autoUpdate,
  inline,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  useRole
} from '@floating-ui/react';

interface TextAnnotationPopupProps {

  popup(props: TextAnnotatorPopupProps): ReactNode;

}

export interface TextAnnotatorPopupProps {

  selected: { annotation: TextAnnotation, editable?: boolean }[];

}

export const TextAnnotatorPopup = (props: TextAnnotationPopupProps) => {
  const r = useAnnotator<TextAnnotator>();

  const { selected, pointerEvent } = useSelection<TextAnnotation>();

  const annotation = selected[0]?.annotation;

  const [isOpen, setOpen] = useState(selected?.length > 0);

  const { refs, floatingStyles, context } = useFloating({
    placement: 'top',
    open: isOpen,
    onOpenChange: (open, _event, reason) => {
      setOpen(open);
      if (!open && reason === 'escape-key') {
        r?.cancelSelected();
      }
    },
    middleware: [
      offset(10),
      inline(),

      shift({ mainAxis: false, crossAxis: true, padding: 10 })
    ],
    whileElementsMounted: autoUpdate
  });

  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });
  const { getFloatingProps } = useInteractions([dismiss, role]);

  const selectedKey = selected.map(a => a.annotation.id).join('-');
  useEffect(() => {
    // Ignore all selection changes except those accompanied by a pointer event.
    if (pointerEvent) {
      setOpen(selected.length > 0 && pointerEvent.type === 'pointerup');
    }
  }, [pointerEvent?.type, selectedKey]);

  useEffect(() => {
    if (!isOpen || !annotation) return;

    const {
      target: {
        selector: [{ range }]
      }
    } = annotation;

    refs.setPositionReference({
      getBoundingClientRect: range.getBoundingClientRect.bind(range),
      getClientRects: range.getClientRects.bind(range)
    });
  }, [isOpen, annotation, refs]);

  // Prevent text-annotator from handling the irrelevant events triggered from the popup
  const getStopEventsPropagationProps = useCallback(
    () => ({ onPointerUp: (event: PointerEvent<HTMLDivElement>) => event.stopPropagation() }),
    []
  );

  return isOpen && selected.length > 0 ? (
    <div
      className="annotation-popup text-annotation-popup not-annotatable"
      ref={refs.setFloating}
      style={floatingStyles}
      {...getFloatingProps()}
      {...getStopEventsPropagationProps()}>
      {props.popup({ selected })}
    </div>
  ) : null;

}
