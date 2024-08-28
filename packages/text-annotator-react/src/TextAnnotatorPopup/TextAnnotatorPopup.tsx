import React, { FC, PointerEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  inline,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  useRole
} from '@floating-ui/react';

import { useAnnotator, useSelection } from '@annotorious/react';
import {
  denormalizeRectWithOffset,
  toDomRectList,
  type TextAnnotation,
  type TextAnnotator,
} from '@soomo/text-annotator';

import { useAnnouncePopupNavigation } from '../hooks';
import './TextAnnotatorPopup.css';

interface TextAnnotationPopupProps {

  popupNavigationMessage?: string;

  popup(props: TextAnnotatorPopupProps): ReactNode;

}

export interface TextAnnotatorPopupProps {

  selected: { annotation: TextAnnotation, editable?: boolean }[];

}

export const TextAnnotatorPopup: FC<TextAnnotationPopupProps> = (props) => {

  const { popup, popupNavigationMessage } = props;

  const r = useAnnotator<TextAnnotator>();

  const { selected, event } = useSelection<TextAnnotation>();
  const annotation = selected[0]?.annotation;

  const [isOpen, setOpen] = useState(selected?.length > 0);
  const handleClose = () => r?.cancelSelected();

  const [isFloatingFocused, setFloatingFocused] = useState(false);
  const handleFloatingFocus = () => setFloatingFocused(true);
  const handleFloatingBlur = () => setFloatingFocused(false);
  useEffect(() => {
    if (!isOpen) handleFloatingBlur();
  }, [isOpen, handleFloatingBlur]);

  const { refs, floatingStyles, update, context } = useFloating({
    placement: 'top',
    open: isOpen,
    onOpenChange: (open, _event, reason) => {
      setOpen(open);

      if (!open) {
        if (reason === 'escape-key' || reason === 'focus-out') {
          handleClose();
        }
      }
    },
    middleware: [
      offset(10),
      inline(),
      flip(),
      shift({ mainAxis: false, crossAxis: true, padding: 10 })
    ],
    whileElementsMounted: autoUpdate
  });

  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'dialog' });
  const { getFloatingProps } = useInteractions([dismiss, role]);

  const selectedKey = selected.map(a => a.annotation.id).join('-');
  useEffect(() => {
    // Ignore all selection changes except those accompanied by a user event.
    if (selected.length > 0 && event) {
      setOpen(event.type === 'pointerup' || event.type === 'keydown');
    }
  }, [selectedKey, event]);

  useEffect(() => {
    // Close the popup if the selection is cleared
    if (selected.length === 0 && isOpen) {
      setOpen(false);
    }
  }, [isOpen, selectedKey]);

  useEffect(() => {
    if (!r) return;

    if (isOpen && annotation?.id) {
      refs.setPositionReference({
        getBoundingClientRect: () => denormalizeRectWithOffset(
          r.state.store.getAnnotationBounds(annotation.id),
          r.element.getBoundingClientRect()
        ),
        getClientRects: () => {
          const rects = r.state.store.getAnnotationRects(annotation.id);
          const denormalizedRects = rects.map(
            rect => denormalizeRectWithOffset(rect, r.element.getBoundingClientRect())
          );
          return toDomRectList(denormalizedRects);
        }
      });
    } else {
      // Don't leave the reference depending on the previously selected annotation
      refs.setPositionReference(null);
    }
  }, [isOpen, annotation?.id, annotation?.target, r]);

  // Prevent text-annotator from handling the irrelevant events triggered from the popup
  const getStopEventsPropagationProps = useCallback(
    () => ({ onPointerUp: (event: PointerEvent<HTMLDivElement>) => event.stopPropagation() }),
    []
  );

  useEffect(() => {
    const config: MutationObserverInit = { attributes: true, childList: true, subtree: true };

    const mutationObserver = new MutationObserver(() => update());
    mutationObserver.observe(document.body, config);

    window.document.addEventListener('scroll', update, true);

    return () => {
      mutationObserver.disconnect();
      window.document.removeEventListener('scroll', update, true);
    };
  }, [update]);

  /**
   * Announce the navigation hint only on the keyboard selection,
   * because the focus isn't shifted to the popup automatically then
   */
  useAnnouncePopupNavigation({
    disabled: isFloatingFocused,
    floatingOpen: isOpen,
    message: popupNavigationMessage,
  });

  return isOpen && selected.length > 0 ? (
    <FloatingPortal>
      <FloatingFocusManager
        context={context}
        modal={false}
        closeOnFocusOut={true}
        initialFocus={
          /**
           * Don't shift focus to the floating element
           * when the selection performed with the keyboard
           */
          event?.type === 'keydown' ? -1 : 0
        }
        returnFocus={false}
      >
        <div
          className="annotation-popup text-annotation-popup not-annotatable"
          ref={refs.setFloating}
          style={floatingStyles}
          onFocus={handleFloatingFocus}
          onBlur={handleFloatingBlur}
          {...getFloatingProps()}
          {...getStopEventsPropagationProps()}>
          {popup({ selected })}

          {/* It lets keyboard/sr users to know that the dialog closes when they focus out of it */}
          <button className="popup-close-message" onClick={handleClose}>
            This dialog closes when you leave it.
          </button>
        </div>
      </FloatingFocusManager>
    </FloatingPortal>
  ) : null;

};
