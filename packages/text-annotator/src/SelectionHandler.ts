import { Filter, Origin, type User } from '@annotorious/core';
import { v4 as uuidv4 } from 'uuid';
import type { TextAnnotatorState } from './state';
import type { TextAnnotationTarget } from './model';
import {
  debounce,
  splitAnnotatableRanges,
  rangeToSelector,
  isWhitespaceOrEmpty,
  NOT_ANNOTATABLE_SELECTOR
} from './utils';

export const SelectionHandler = (
  container: HTMLElement,
  state: TextAnnotatorState,
  annotatingEnabled: boolean,
  offsetReferenceSelector?: string
) => {

  let currentUser: User | undefined;

  const setUser = (user?: User) => currentUser = user;

  let currentFilter: Filter | undefined;

  const setFilter = (filter?: Filter) => currentFilter = filter;

  const { store, selection } = state;

  let currentTarget: TextAnnotationTarget | undefined;

  let isLeftClick = false;

  let lastPointerDown: PointerEvent | undefined;

  const onSelectStart = (evt: PointerEvent) => {
    if (!isLeftClick) return;

    // Make sure we don't listen to selection changes that were
    // not started on the container, or which are not supposed to
    // be annotatable (like a component popup).
    // Note that Chrome/iOS will sometimes return the root doc as target!
    const annotatable = !(evt.target as Node).parentElement?.closest(NOT_ANNOTATABLE_SELECTOR);
    if (annotatable) {
      currentTarget = {
        annotation: uuidv4(),
        selector: [],
        creator: currentUser,
        created: new Date()
      };
    } else {
      currentTarget = undefined;
    }
  }

  if (annotatingEnabled)
    container.addEventListener('selectstart', onSelectStart);

  const onSelectionChange = debounce((evt: PointerEvent) => {
    const sel = document.getSelection();

    // This is to handle cases where the selection is "hijacked" by another element
    // in a not-annotatable area. A rare case in theory. But rich text editors
    // will like Quill do it...
    const annotatable = !sel.anchorNode?.parentElement?.closest(NOT_ANNOTATABLE_SELECTOR);
    if (!annotatable) {
      currentTarget = undefined;
      return;
    }

    // Chrome/iOS does not reliably fire the 'selectstart' event!
    if (evt.timeStamp - (lastPointerDown?.timeStamp || evt.timeStamp) < 1000 && !currentTarget)
      onSelectStart(lastPointerDown);

    if (sel.isCollapsed || !isLeftClick || !currentTarget) return;

    const selectionRange = sel.getRangeAt(0);
    if (isWhitespaceOrEmpty(selectionRange)) return;
    
    const annotatableRanges = splitAnnotatableRanges(selectionRange.cloneRange());

    const hasChanged =
      annotatableRanges.length !== currentTarget.selector.length ||
      annotatableRanges.some((r, i) => r.toString() !== currentTarget.selector[i]?.quote);
      
    if (!hasChanged) return;

    currentTarget = {
      ...currentTarget,
      selector: annotatableRanges.map(r => rangeToSelector(r, container, offsetReferenceSelector)),
      updated: new Date()
    };

    if (store.getAnnotation(currentTarget.annotation)) {
      store.updateTarget(currentTarget, Origin.LOCAL);
    } else {
      // Proper lifecycle management: clear selection first...
      selection.clear();
      
      // ...then add annotation to store...
      store.addAnnotation({
        id: currentTarget.annotation,
        bodies: [],
        target: currentTarget
      });

      // ...then make the new annotation the current selection. (Reminder:
      // select events don't have offsetX/offsetY - reuse last up/down)
      selection.userSelect(currentTarget.annotation, lastPointerDown);
    }
  })

  if (annotatingEnabled)
    document.addEventListener('selectionchange', onSelectionChange);

  // Select events don't carry information about the mouse button
  // Therefore, to prevent right-click selection, we need to listen
  // to the initial pointerdown event and remember the button
  const onPointerDown = (evt: PointerEvent) => {
    // Note that the event itself can be ephemeral!
    const { target, timeStamp, offsetX, offsetY, type } = evt;
    lastPointerDown = { ...evt, target, timeStamp, offsetX, offsetY, type };

    isLeftClick = evt.button === 0;
  }

  container.addEventListener('pointerdown', onPointerDown);

  const onPointerUp = (evt: PointerEvent) => {
    const annotatable = !(evt.target as Node).parentElement?.closest(NOT_ANNOTATABLE_SELECTOR);
    if (!annotatable || !isLeftClick)
      return;

    // Logic for selecting an existing annotation by clicking it
    const clickSelect = () => {
      const { x, y } = container.getBoundingClientRect();

      const hovered = store.getAt(evt.clientX - x, evt.clientY - y, currentFilter);
      if (hovered) {
        const { selected } = selection;

        if (selected.length !== 1 || selected[0].id !== hovered.id)
          selection.userSelect(hovered.id, evt);
      } else if (!selection.isEmpty()) {
        selection.clear();
      }
    }

    const timeDifference = evt.timeStamp - lastPointerDown.timeStamp;

    // Just a click, not a selection
    if (document.getSelection().isCollapsed && timeDifference < 300) {
      currentTarget = undefined;
      clickSelect();
    } else if (currentTarget) {
      selection.userSelect(currentTarget.annotation, evt);
    }
  }

  document.addEventListener('pointerup', onPointerUp);

  const destroy = () => {
    container.removeEventListener('selectstart', onSelectStart);
    document.removeEventListener('selectionchange', onSelectionChange);
    
    container.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('pointerup', onPointerUp);
  }

  return {
    destroy,
    setFilter,
    setUser
  }

}
