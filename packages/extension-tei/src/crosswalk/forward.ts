import { rangeToSelector, reviveTarget as reviveTextOffsetTarget } from '@soomo/text-annotator';
import type { TEIAnnotation, TEIAnnotationTarget, TEIRangeSelector } from '../TEIAnnotation';
import { reanchor } from './utils';
import type { 
  TextAnnotation, 
  TextAnnotationTarget, 
  TextSelector
} from '@soomo/text-annotator';

/**
 * Helper: Returns the given XPath for a DOM node, in the form of 
 * a list of segments.
 * 
 * Note that this method is used recursively,
 */
const getXPath = (node: Node, path: string[] = []) => {
  let xpath: string;
  let count: number;
  let predicate: string;

  if (node.nodeType === Node.ELEMENT_NODE && (node as Element).hasAttribute('xml:id')) {
    path.push('/');
  } else if (node.parentNode) {
    path = getXPath(node.parentNode, path);
  }

  if (node.nodeType === Node.ELEMENT_NODE && node.nodeName.toLowerCase().startsWith('tei-')) {
    const el = node as Element;

    if (el.hasAttribute('xml:id')) {
      predicate = `[@xml:id='${el.getAttribute("xml:id")}']`;
    } else {
      xpath = `count(preceding-sibling::${el.localName})`;
      count = document.evaluate(xpath, node, null, XPathResult.NUMBER_TYPE, null).numberValue + 1;
  
      predicate = `[${count}]`;
    }

    path.push('/');
    path.push(el.getAttribute('data-origname') + predicate);
  }

  return path;
}

/**
 * For the given path sgement lists, this function returns the the
 * start & end XPath expression pair.
 */
const toTEIXPaths = (container: HTMLElement, startPath: string[], endPath: string[], selectedRange: Range) => {
  
  const findFirstTEIChild = (node: Node): Element | null => {
    const iterator = document.createNodeIterator(
      node,
      NodeFilter.SHOW_ELEMENT,
      (node) => {
        return (node as Element).nodeName.toLowerCase().startsWith('tei-')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      }
    );
    
    return iterator.nextNode() as Element | null;
  }

  // For a given node, returns the closest parent that is a TEI element
  const getClosestTEINode = (node: Node | null) => {
    if (!node) return null;

    // Edge case: node is the container itself
    if (node === container) {
      return findFirstTEIChild(node);
    } else {
      return (node.nodeName.toLowerCase().indexOf('tei-') === 0) ?
        node : getClosestTEINode(node.parentNode);
    }
  };

  // Helper to compute char offsets between end of XPath and a given reference node
  const getOffsetFromTo = (fromNode: Node, toNode: Node, toOffset: number) => {
    const range = document.createRange();
    range.setStart(fromNode, 0);
    range.setEnd(toNode, toOffset);
    return range.toString().length;
  }

  const startOffset = getOffsetFromTo(
    getClosestTEINode(selectedRange.startContainer),
    selectedRange.startContainer,
    selectedRange.startOffset);

  const endOffset = getOffsetFromTo(
    getClosestTEINode(selectedRange.endContainer),
    selectedRange.endContainer,
    selectedRange.endOffset);

  const start = startPath.join('') + '::' + startOffset;
  const end = endPath.join('') + '::' + endOffset;

  return { start, end }; 
}


/**
 * Using the DOM Range from a (revived!) TextSelector, this function computes
 * the TEIRangeSelector corresponding to that range.
 */
export const textToTEISelector = (container: HTMLElement) => (selector: TextSelector): TEIRangeSelector => {
  const { range } = selector;

  // XPath segments for Range start and end nodes as a list
  const startPathSegments: string[] = getXPath(range.startContainer);
  const endPathSegments: string[] = getXPath(range.endContainer);

  // TEI XPath expressions
  const { start, end } = toTEIXPaths(container, startPathSegments, endPathSegments, range);

  return {
    start: selector.start,
    startSelector: {
      type: 'XPathSelector',
      value: start
    },
    end: selector.end,
    endSelector: {
      type: 'XPathSelector',
      value: end
    },
    quote: selector.quote?.replace(/\s+/g, ' '),
    range
  };
}

export const reviveTarget = (t: TextAnnotationTarget, container: HTMLElement) => {
  const selector = Array.isArray(t.selector) ? t.selector[0] : t.selector;

  if ('start' in selector && 'end' in selector) {
    return reviveTextOffsetTarget(t, container);
  } else {
    const startExpression = (selector as TEIRangeSelector).startSelector?.value;
    const endExpression = (selector as TEIRangeSelector).endSelector?.value;

    if (!startExpression || !endExpression) {
      console.error(t);
      throw 'Could not revive TEI target.'
    }

    const evaluateSelector = (value: string) => {
      const splitIdx = value.indexOf('::');

      if (splitIdx < 0) return;

      const path = value.substring(0, splitIdx).replace(/\/([^[/]+)/g, (_, p1) => {
        return '/tei-' + p1.toLowerCase();
      }).replace(/xml:/g, '');

      const node = document.evaluate('.' + path,
        container, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

      const offset = parseInt(value.substring(splitIdx + 2));

      return [node, offset] as [Node, number];
    }

    const [startNode, startOffset] = evaluateSelector(startExpression);
    const [endNode, endOffset] = evaluateSelector(endExpression);

    const range = document.createRange();

    // Helper
    const reanchorIfNeeded = (parent: Node, offset: number) => {
      if (parent.firstChild instanceof Text && parent.firstChild.length >= offset) {
        return { node: parent.firstChild, offset };
      } else {
        return reanchor(parent.firstChild, parent, offset);
      }
    }

    const reanchoredStart = reanchorIfNeeded(startNode, startOffset);
    range.setStart(reanchoredStart.node, reanchoredStart.offset);

    const reanchoredEnd = reanchorIfNeeded(endNode, endOffset);
    range.setEnd(reanchoredEnd.node, reanchoredEnd.offset);

    const textSelector = rangeToSelector(range, container);

    return reviveTextOffsetTarget({
      ...t,
      selector: [{
        ...textSelector,
        ...(selector as TEIRangeSelector),
        range
      }]
    }, container);
  }
}

export const textToTEITarget = (container: HTMLElement) => (t: TextAnnotationTarget): TEIAnnotationTarget => {
  const target = reviveTarget(t, container);
  return {
    ...t,
    selector: target.selector.map(textToTEISelector(container))
  }
}

export const textToTEIAnnotation = (container: HTMLElement) => (a: TextAnnotation): TEIAnnotation => ({
  ...a,
  target: textToTEITarget(container)(a.target)
})

