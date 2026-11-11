/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import {
  DRAG_ATTRIBUTE,
  HOVER_ATTRIBUTE,
  OVERLAY_THUMB_CLASS,
  SCROLLBAR_ACTIVE_ATTRIBUTE,
  SCROLLBAR_EDGE_OFFSET,
  SCROLLBAR_HIDE_DELAY,
  SCROLLBAR_THUMB_CLASS,
  SCROLLBAR_TRACK_CLASS,
  SCROLLBAR_TRACK_HEIGHT,
  VISIBLE_ATTRIBUTE,
  useAutoHideScrollbars,
} from './useAutoHideScrollbars';

type RectLike = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type Geometry = {
  rect: RectLike;
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
  scrollWidth: number;
  clientWidth: number;
  scrollLeft: number;
};

const DEFAULT_GEOMETRY: Geometry = {
  rect: {
    top: 100,
    left: 50,
    right: 350,
    bottom: 400,
    width: 300,
    height: 300,
  },
  scrollHeight: 900,
  clientHeight: 300,
  scrollTop: 0,
  scrollWidth: 300,
  clientWidth: 300,
  scrollLeft: 0,
};

const WIDE_GEOMETRY = { scrollWidth: 900, clientWidth: 300 };

const setGeometry = (element: Element, overrides: Partial<Geometry> = {}) => {
  const geometry = { ...DEFAULT_GEOMETRY, ...overrides };
  Object.defineProperties(element, {
    scrollHeight: { configurable: true, value: geometry.scrollHeight },
    clientHeight: { configurable: true, value: geometry.clientHeight },
    scrollWidth: { configurable: true, value: geometry.scrollWidth },
    clientWidth: { configurable: true, value: geometry.clientWidth },
    scrollTop: {
      configurable: true,
      writable: true,
      value: geometry.scrollTop,
    },
    scrollLeft: {
      configurable: true,
      writable: true,
      value: geometry.scrollLeft,
    },
  });
  const rect = {
    ...geometry.rect,
    x: geometry.rect.left,
    y: geometry.rect.top,
    toJSON: () => ({}),
  } as unknown as DOMRect;
  jest.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect);
};

const getVerticalThumb = () =>
  document.querySelector(
    `.${OVERLAY_THUMB_CLASS}[data-axis="y"]`,
  ) as HTMLDivElement;

const Probe = ({
  two = false,
  show = true,
  clipped = false,
}: {
  two?: boolean;
  show?: boolean;
  clipped?: boolean;
}) => {
  useAutoHideScrollbars();
  return (
    <>
      {show && (
        <div
          data-test="scroller"
          style={{ overflowX: clipped ? 'hidden' : 'auto' }}
        >
          <span data-test="cell" />
        </div>
      )}
      {show && two && (
        <div data-test="scroller-1" style={{ overflowX: 'auto' }} />
      )}
    </>
  );
};

// jsdom has no PointerEvent constructor, but a MouseEvent carrying a pointer
// event name exposes the same clientX/clientY/pointerId shape the hook reads.
const firePointer = (
  target: Element | Document,
  type: string,
  init: MouseEventInit = {},
) =>
  fireEvent(
    target,
    new MouseEvent(type, { bubbles: true, cancelable: true, ...init }),
  );

const getBars = () =>
  Array.from(
    document.querySelectorAll(`.${SCROLLBAR_TRACK_CLASS}`),
  ) as HTMLDivElement[];

const getThumb = (bar: HTMLDivElement) =>
  bar.firstElementChild as HTMLDivElement;

/** Simulate what the browser reports as the topmost element at a point. */
const setTopmostElement = (value: Element | null) => {
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    writable: true,
    value: jest.fn(() => value),
  });
};

const visibleBottomTop = () =>
  window.innerHeight - SCROLLBAR_TRACK_HEIGHT - SCROLLBAR_EDGE_OFFSET;

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  Reflect.deleteProperty(document, 'elementFromPoint');
});

test('mounts one transient vertical thumb and no transient horizontal thumb', () => {
  render(<Probe />);
  const vertical = getVerticalThumb();

  expect(vertical).toBeTruthy();
  expect(vertical.parentElement).toBe(document.body);
  expect(vertical.getAttribute('aria-hidden')).toBe('true');
  expect(vertical.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(false);
  expect(
    document.querySelectorAll(`.${OVERLAY_THUMB_CLASS}[data-axis="x"]`),
  ).toHaveLength(0);
  expect(getBars()).toHaveLength(0);
});

test('positions the vertical thumb against the scrolling container', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller);

  fireEvent.scroll(scroller);

  expect(getVerticalThumb().hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
  // 300 / 900 * 300 = 100 long, at the right edge minus the 5px thumb and gap.
  expect(getVerticalThumb().style.width).toBe('5px');
  expect(getVerticalThumb().style.height).toBe('100px');
  expect(getVerticalThumb().style.transform).toBe(
    'translate3d(342px, 100px, 0)',
  );
});

test('moves the vertical thumb with scrollTop and caps it at the bottom', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, { scrollTop: 300 });

  fireEvent.scroll(scroller);
  expect(getVerticalThumb().style.transform).toBe(
    'translate3d(342px, 200px, 0)',
  );

  setGeometry(scroller, { scrollTop: 600 });
  fireEvent.scroll(scroller);
  expect(getVerticalThumb().style.transform).toBe(
    'translate3d(342px, 300px, 0)',
  );
});

test('hides the vertical thumb once scrolling stops', () => {
  jest.useFakeTimers();
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller);

  fireEvent.scroll(scroller);
  expect(getVerticalThumb().hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);

  jest.advanceTimersByTime(SCROLLBAR_HIDE_DELAY - 1);
  expect(getVerticalThumb().hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);

  jest.advanceTimersByTime(1);
  expect(getVerticalThumb().hasAttribute(VISIBLE_ATTRIBUTE)).toBe(false);
});

test('a resize hides a stale vertical thumb', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller);

  fireEvent.scroll(scroller);
  expect(getVerticalThumb().hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
  window.dispatchEvent(new Event('resize'));
  expect(getVerticalThumb().hasAttribute(VISIBLE_ATTRIBUTE)).toBe(false);
});

test('a root-level scroll measures against the viewport', () => {
  render(<Probe />);
  setGeometry(document.documentElement, {
    scrollHeight: 2000,
    clientHeight: window.innerHeight,
    scrollWidth: window.innerWidth,
    clientWidth: window.innerWidth,
  });

  fireEvent.scroll(document);

  expect(getVerticalThumb().hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
  expect(getVerticalThumb().style.transform).toContain(
    `translate3d(${window.innerWidth - 8}px, 0px, 0)`,
  );
});

test('unmount removes the overlays and the scroll listener', () => {
  const { unmount } = render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, WIDE_GEOMETRY);

  firePointer(scroller, 'pointerover');
  fireEvent.scroll(scroller);
  unmount();

  expect(document.querySelectorAll(`.${OVERLAY_THUMB_CLASS}`)).toHaveLength(0);
  expect(getBars()).toHaveLength(0);
  fireEvent.scroll(scroller);
  expect(document.querySelectorAll(`.${OVERLAY_THUMB_CLASS}`)).toHaveLength(0);
});

test('any horizontally scrollable container reveals a bar on hover, with no opt-in', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, WIDE_GEOMETRY);
  expect(scroller.hasAttribute('data-wide-table-scrollbar')).toBe(false);
  expect(document.body.hasAttribute('data-wide-table-scrollbar-mode')).toBe(
    false,
  );

  firePointer(scroller, 'pointerover');
  const bars = getBars();
  expect(bars).toHaveLength(1);
  expect(bars[0].hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
  expect(bars[0].hasAttribute(SCROLLBAR_ACTIVE_ATTRIBUTE)).toBe(true);
  expect(bars[0].className).toBe(SCROLLBAR_TRACK_CLASS);
  expect(getThumb(bars[0]).className).toBe(SCROLLBAR_THUMB_CLASS);
});

test('reveals the bar for a pointer over a child element too', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, WIDE_GEOMETRY);

  firePointer(screen.getByTestId('cell'), 'pointermove');
  expect(getBars()[0].hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
});

test('keeps the bar visible for as long as the pointer stays in the container', () => {
  jest.useFakeTimers();
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, WIDE_GEOMETRY);

  firePointer(scroller, 'pointerover');
  jest.advanceTimersByTime(SCROLLBAR_HIDE_DELAY * 3);
  expect(getBars()[0].hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
  expect(getBars()[0].hasAttribute(SCROLLBAR_ACTIVE_ATTRIBUTE)).toBe(true);
});

test('hides the bar 700ms after the pointer leaves the container', () => {
  jest.useFakeTimers();
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, WIDE_GEOMETRY);

  firePointer(scroller, 'pointerover');
  firePointer(document.body, 'pointerover');
  const bar = getBars()[0];
  expect(bar.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
  expect(bar.hasAttribute(SCROLLBAR_ACTIVE_ATTRIBUTE)).toBe(false);

  jest.advanceTimersByTime(SCROLLBAR_HIDE_DELAY - 1);
  expect(bar.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
  jest.advanceTimersByTime(1);
  expect(bar.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(false);
});

test('hovering the bar thumb keeps it visible after leaving the container', () => {
  jest.useFakeTimers();
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, WIDE_GEOMETRY);
  firePointer(scroller, 'pointerover');
  const bar = getBars()[0];
  const thumb = getThumb(bar);

  firePointer(document.body, 'pointerover');
  firePointer(thumb, 'pointerenter');
  expect(thumb.hasAttribute(HOVER_ATTRIBUTE)).toBe(true);
  jest.advanceTimersByTime(SCROLLBAR_HIDE_DELAY * 2);
  expect(bar.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);

  firePointer(thumb, 'pointerleave');
  jest.advanceTimersByTime(SCROLLBAR_HIDE_DELAY);
  expect(bar.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(false);
});

test('scrolling reveals the bar briefly even when the pointer is outside', () => {
  jest.useFakeTimers();
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, WIDE_GEOMETRY);

  fireEvent.scroll(scroller);
  const bar = getBars()[0];
  expect(bar.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
  expect(bar.hasAttribute(SCROLLBAR_ACTIVE_ATTRIBUTE)).toBe(false);

  jest.advanceTimersByTime(SCROLLBAR_HIDE_DELAY);
  expect(bar.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(false);
});

test('draws one bar per container and only the hovered one stays visible', () => {
  jest.useFakeTimers();
  render(<Probe two />);
  const first = screen.getByTestId('scroller');
  const second = screen.getByTestId('scroller-1');
  setGeometry(first, WIDE_GEOMETRY);
  setGeometry(second, WIDE_GEOMETRY);

  firePointer(first, 'pointerover');
  expect(getBars()).toHaveLength(1);
  firePointer(second, 'pointerover');
  expect(getBars()).toHaveLength(2);
  expect(getBars()[1].hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);

  jest.advanceTimersByTime(SCROLLBAR_HIDE_DELAY);
  expect(getBars()[0].hasAttribute(VISIBLE_ATTRIBUTE)).toBe(false);
  expect(getBars()[1].hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
});

test('positions and moves the bar thumb with scrollLeft', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, { ...WIDE_GEOMETRY, scrollLeft: 0 });
  firePointer(scroller, 'pointerover');

  const bar = getBars()[0];
  expect(bar.style.width).toBe('300px');
  expect(bar.style.height).toBe(`${SCROLLBAR_TRACK_HEIGHT}px`);
  expect(bar.style.transform).toBe('translate3d(50px, 389px, 0)');
  expect(getThumb(bar).style.width).toBe('100px');
  expect(getThumb(bar).style.transform).toBe('translate3d(0px, 0, 0)');

  setGeometry(scroller, { ...WIDE_GEOMETRY, scrollLeft: 300 });
  fireEvent.scroll(scroller);
  expect(getThumb(bar).style.transform).toBe('translate3d(100px, 0, 0)');
});

test('does not create a bar without horizontal overflow', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller);

  firePointer(scroller, 'pointerover');
  expect(getBars()).toHaveLength(0);
});

test('ignores a few pixels of rounding when the content is wide enough', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  // 2px comes from borders / zoom / sub-pixel rounding, not real content.
  setGeometry(scroller, { scrollWidth: 302, clientWidth: 300 });

  firePointer(scroller, 'pointerover');
  fireEvent.scroll(scroller);
  expect(getBars()).toHaveLength(0);
});

test('does not treat an overflow:hidden clipping container as scrollable', () => {
  render(<Probe clipped />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, WIDE_GEOMETRY);

  firePointer(screen.getByTestId('cell'), 'pointerover');
  expect(getBars()).toHaveLength(0);
});

test('still draws a bar once the content really exceeds the width', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, { scrollWidth: 340, clientWidth: 300 });

  firePointer(scroller, 'pointerover');
  expect(getBars()[0].hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
});

test('a vertically scrollable container shows only the vertical thumb', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller);

  fireEvent.scroll(scroller);
  expect(getVerticalThumb().hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
  expect(getBars()).toHaveLength(0);
});

test('hides an existing bar when the container stops overflowing', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, WIDE_GEOMETRY);
  firePointer(scroller, 'pointerover');
  expect(getBars()[0].hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);

  setGeometry(scroller);
  window.dispatchEvent(new Event('resize'));
  expect(getBars()[0].hasAttribute(VISIBLE_ATTRIBUTE)).toBe(false);
});

test('hides the bar when the pointer leaves the document', () => {
  jest.useFakeTimers();
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, WIDE_GEOMETRY);
  firePointer(scroller, 'pointerover');

  firePointer(document, 'pointerout');
  jest.advanceTimersByTime(SCROLLBAR_HIDE_DELAY);
  expect(getBars()[0].hasAttribute(VISIBLE_ATTRIBUTE)).toBe(false);
});

test('cleans up the bar when the container is removed', () => {
  const { rerender } = render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, WIDE_GEOMETRY);
  firePointer(scroller, 'pointerover');
  expect(getBars()).toHaveLength(1);

  rerender(<Probe show={false} />);
  window.dispatchEvent(new Event('resize'));
  expect(getBars()).toHaveLength(0);
});

test('unmount removes the bars as well', () => {
  const { unmount } = render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, WIDE_GEOMETRY);
  firePointer(scroller, 'pointerover');
  expect(getBars()).toHaveLength(1);

  unmount();
  expect(getBars()).toHaveLength(0);
});

test('hovering the vertical thumb keeps it visible until the pointer leaves', () => {
  jest.useFakeTimers();
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller);
  fireEvent.scroll(scroller);
  const vertical = getVerticalThumb();

  firePointer(vertical, 'pointerenter');
  expect(vertical.hasAttribute(HOVER_ATTRIBUTE)).toBe(true);
  jest.advanceTimersByTime(SCROLLBAR_HIDE_DELAY * 2);
  expect(vertical.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);

  firePointer(vertical, 'pointerleave');
  expect(vertical.hasAttribute(HOVER_ATTRIBUTE)).toBe(false);
  jest.advanceTimersByTime(SCROLLBAR_HIDE_DELAY);
  expect(vertical.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(false);
});

test('a drag is not interrupted by the hide timer', () => {
  jest.useFakeTimers();
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller);
  fireEvent.scroll(scroller);
  const vertical = getVerticalThumb();

  firePointer(vertical, 'pointerdown', { clientY: 100 });
  jest.advanceTimersByTime(SCROLLBAR_HIDE_DELAY * 3);
  expect(vertical.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
  expect(vertical.hasAttribute(DRAG_ATTRIBUTE)).toBe(true);
  firePointer(document, 'pointerup');
});

test('dragging the vertical thumb scrolls the container', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller);
  fireEvent.scroll(scroller);
  const vertical = getVerticalThumb();

  firePointer(vertical, 'pointerdown', { clientY: 100 });
  expect(vertical.hasAttribute(DRAG_ATTRIBUTE)).toBe(true);
  firePointer(document, 'pointermove', { clientY: 150 });
  // 600px of range over 200px of thumb travel = 3px per thumb pixel.
  expect(scroller.scrollTop).toBe(150);
  firePointer(document, 'pointerup');
  expect(vertical.hasAttribute(DRAG_ATTRIBUTE)).toBe(false);
});

test('dragging the horizontal bar thumb scrolls the container', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, WIDE_GEOMETRY);
  firePointer(scroller, 'pointerover');
  const thumb = getThumb(getBars()[0]);

  firePointer(thumb, 'pointerdown', { clientX: 100 });
  expect(thumb.hasAttribute(DRAG_ATTRIBUTE)).toBe(true);
  firePointer(document, 'pointermove', { clientX: 150 });
  expect(scroller.scrollLeft).toBe(150);
  expect(thumb.style.transform).toBe('translate3d(50px, 0, 0)');
  firePointer(document, 'pointerup');
  expect(thumb.hasAttribute(DRAG_ATTRIBUTE)).toBe(false);
});

test('a drag keeps the horizontal bar visible', () => {
  jest.useFakeTimers();
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, WIDE_GEOMETRY);
  firePointer(scroller, 'pointerover');
  const bar = getBars()[0];
  const thumb = getThumb(bar);

  firePointer(thumb, 'pointerdown', { clientX: 100 });
  firePointer(document.body, 'pointerover');
  jest.advanceTimersByTime(SCROLLBAR_HIDE_DELAY * 3);
  expect(bar.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);

  firePointer(document, 'pointerup');
  jest.advanceTimersByTime(SCROLLBAR_HIDE_DELAY);
  expect(bar.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(false);
});

test('a wheel gesture reveals the vertical thumb and the horizontal bar', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, WIDE_GEOMETRY);

  fireEvent.wheel(scroller);
  expect(getVerticalThumb().hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
  expect(getBars()[0].hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
});

test('keeps the bar inside its table even when another layer covers the page', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, WIDE_GEOMETRY);
  // A modal mask sits on top. The bar stays inside its own table, and the
  // z-index contract in GlobalStyles keeps it below the popup layer.
  setTopmostElement(document.body);

  firePointer(scroller, 'pointerover');
  expect(getBars()).toHaveLength(1);
  expect(getBars()[0].hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
  expect(getBars()[0].style.width).toBe('300px');
  expect(getBars()[0].style.transform).toBe('translate3d(50px, 389px, 0)');
});

test('does not draw the vertical thumb over a covering popup layer', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller);
  setTopmostElement(document.body);

  fireEvent.scroll(scroller);
  expect(getVerticalThumb().hasAttribute(VISIBLE_ATTRIBUTE)).toBe(false);
});

test('draws overlays when the topmost element belongs to the container', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, WIDE_GEOMETRY);
  setTopmostElement(scroller);

  firePointer(scroller, 'pointerover');
  fireEvent.scroll(scroller);
  expect(getBars()[0].hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
  expect(getVerticalThumb().hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
});

test('a refresh does not mistake its own thumb for a foreign layer', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, WIDE_GEOMETRY);
  setTopmostElement(scroller);
  firePointer(scroller, 'pointerover');
  const thumb = getThumb(getBars()[0]);

  // Once drawn, the thumb is the topmost element at that point. A refresh
  // must not mistake it for a foreign popup and hide the bar again.
  setTopmostElement(thumb);
  fireEvent.scroll(scroller);
  expect(getBars()[0].hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
  expect(getVerticalThumb().hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
});

test('clamps the bar to the visible bottom when the table is cut off below', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, {
    ...WIDE_GEOMETRY,
    rect: {
      top: window.innerHeight - 60,
      left: 50,
      right: 350,
      bottom: window.innerHeight + 240,
      width: 300,
      height: 300,
    },
  });

  firePointer(scroller, 'pointerover');
  const bar = getBars()[0];
  expect(bar.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
  // Never wider than the table, never below the visible part of it.
  expect(bar.style.width).toBe('300px');
  expect(bar.style.transform).toBe(
    `translate3d(50px, ${visibleBottomTop()}px, 0)`,
  );
});

test('clamps the bar horizontally when the table runs past the viewport edge', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, {
    ...WIDE_GEOMETRY,
    rect: {
      top: 100,
      left: window.innerWidth - 100,
      right: window.innerWidth + 200,
      bottom: 400,
      width: 300,
      height: 300,
    },
  });

  firePointer(scroller, 'pointerover');
  const bar = getBars()[0];
  expect(bar.style.width).toBe('100px');
  expect(bar.style.transform).toBe(
    `translate3d(${window.innerWidth - 100}px, 389px, 0)`,
  );
});

test('follows the visible table bottom smoothly while the page scrolls', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  const rectAt = (top: number) => ({
    top,
    left: 50,
    right: 350,
    bottom: top + 300,
    width: 300,
    height: 300,
  });
  setGeometry(scroller, { ...WIDE_GEOMETRY, rect: rectAt(100) });
  firePointer(scroller, 'pointerover');
  expect(getBars()[0].style.transform).toBe('translate3d(50px, 389px, 0)');

  setGeometry(scroller, { ...WIDE_GEOMETRY, rect: rectAt(300) });
  fireEvent.scroll(document);
  expect(getBars()[0].style.transform).toBe('translate3d(50px, 589px, 0)');

  // Once the table bottom leaves the viewport the bar pins to the visible edge.
  setGeometry(scroller, {
    ...WIDE_GEOMETRY,
    rect: rectAt(window.innerHeight - 60),
  });
  fireEvent.scroll(document);
  expect(getBars()[0].style.transform).toBe(
    `translate3d(50px, ${visibleBottomTop()}px, 0)`,
  );
});

test('hides the bar once the table is scrolled completely out of view', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, {
    ...WIDE_GEOMETRY,
    rect: {
      top: -500,
      left: 50,
      right: 350,
      bottom: -200,
      width: 300,
      height: 300,
    },
  });

  firePointer(scroller, 'pointerover');
  expect(getBars()[0].hasAttribute(VISIBLE_ATTRIBUTE)).toBe(false);
});
