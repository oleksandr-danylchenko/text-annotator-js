import { writable } from 'svelte/store';

import type { TextAnnotation } from '../model';
import type { TextAnnotationStore } from './TextAnnotationStore';
import type { Store, Selection, SelectionState } from '@annotorious/core';


export interface TextSelection extends Selection {

  selected: { id: string, editable?: boolean }[],

  event?: PointerEvent | KeyboardEvent;

}

export type TextSelectionState<T extends TextAnnotation> = SelectionState<T> & ReturnType<typeof createTextSelectionState<T>>;

export enum SelectAction {

  EDIT = 'EDIT', // Make annotation target(s) editable on select

  SELECT = 'SELECT',  // Just select, but don't make editable

  NONE = 'NONE' // Won't select - annotation is completely inert

}

const EMPTY: TextSelection = { selected: [] };

export const createTextSelectionState = <T extends TextAnnotation>(
  store: Store<T>,
  selectAction: SelectAction
) => {
  const { subscribe, set } = writable<TextSelection>(EMPTY);

  let currentSelection: TextSelection = EMPTY;

  subscribe(updated => currentSelection = updated);

  const clear = () => set(EMPTY);

  const isEmpty = () => currentSelection.selected?.length === 0;

  const isSelected = (annotationOrId: T | string) => {
    if (currentSelection.selected.length === 0)
      return false;

    const id = typeof annotationOrId === 'string' ? annotationOrId : annotationOrId.id;
    return currentSelection.selected.some(i => i.id === id);
  };

  const isSelectionComplete = () => {
    const { selected, event } = currentSelection;

    if (selected.length === 0) return false;

    switch (event.type) {
      case 'pointerup': {
        return true;
      }
      case 'keyup': {
        const { key, shiftKey } = event as KeyboardEvent;

        // TODO Add Ctrl + A support

        return key === 'Shift' && !shiftKey; // Lifted shift after selection
      }
    }
  };

  const select = (id: string, event: TextSelection['event']) => {
    const annotation = store.getAnnotation(id);

    console.log('Annotation', annotation);

    if (annotation) {
      const action = onPointerSelect(annotation, selectAction);
      if (action === SelectAction.EDIT)
        set({ selected: [{ id, editable: true }], event });
      else if (action === SelectAction.SELECT)
        set({ selected: [{ id }], event });
      else
        set({ selected: [], event });
    } else {
      console.warn('Invalid selection: ' + id);
    }
  };

  const setSelected = (idOrIds: string | string[], editable?: boolean) => {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];

    // Remove invalid
    const annotations =
      ids.map(id => store.getAnnotation(id)!).filter(Boolean);

    set({
      selected: annotations.map(annotation => {
        // If editable is not set, use default behavior
        const isEditable = editable === undefined
          ? onPointerSelect(annotation, selectAction) === SelectAction.EDIT
          : editable;

        return { id: annotation.id, editable: isEditable };
      })
    });

    if (annotations.length !== ids.length)
      console.warn('Invalid selection', idOrIds);
  };

  const removeFromSelection = (ids: string[]) => {
    if (currentSelection.selected.length === 0)
      return false;

    const { selected } = currentSelection;

    // Checks which of the given annotations are actually in the selection
    const toRemove = selected.filter(({ id }) => ids.includes(id));

    if (toRemove.length > 0)
      set({ selected: selected.filter(({ id }) => !ids.includes(id)) });
  };

  // Track store delete and update events
  store.observe(({ changes }) =>
    removeFromSelection((changes.deleted || []).map(a => a.id)));

  return {
    clear,
    select,
    get selected() {
      return currentSelection ? [...currentSelection.selected] : null;
    },
    get event() {
      return currentSelection ? currentSelection.event : null;
    },
    get selectionComplete() {
      return isSelectionComplete();
    },
    isEmpty,
    isSelected,
    setSelected,
    subscribe
  };

};

export const onPointerSelect = <T extends TextAnnotation>(
  annotation: T,
  action?: SelectAction | ((a: T) => SelectAction)
): SelectAction => (typeof action === 'function') ?
  (action(annotation) || SelectAction.EDIT) :
  (action || SelectAction.EDIT);
