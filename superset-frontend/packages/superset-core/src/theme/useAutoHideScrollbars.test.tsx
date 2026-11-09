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
  OVERLAY_THUMB_CLASS,
  SCROLLBAR_HIDE_DELAY,
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

const getThumbs = () => ({
  vertical: document.querySelector(
    `.${OVERLAY_THUMB_CLASS}[data-axis="y"]`,
  ) as HTMLDivElement,
  horizontal: document.querySelector(
    `.${OVERLAY_THUMB_CLASS}[data-axis="x"]`,
  ) as HTMLDivElement,
});

const Probe = () => {
  useAutoHideScrollbars();
  return <div data-test="scroller" />;
};

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('mounts one vertical and one horizontal overlay thumb outside the content', () => {
  render(<Probe />);
  const { vertical, horizontal } = getThumbs();

  expect(vertical).toBeTruthy();
  expect(horizontal).toBeTruthy();
  expect(vertical.parentElement).toBe(document.body);
  expect(vertical.getAttribute('aria-hidden')).toBe('true');
  expect(vertical.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(false);
  expect(horizontal.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(false);
});

test('positions the vertical thumb against the scrolling container', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller);

  fireEvent.scroll(scroller);
  const { vertical, horizontal } = getThumbs();

  expect(vertical.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
  // 300 / 900 * 300 = 100 long, at the right edge minus the 5px thumb and gap.
  expect(vertical.style.width).toBe('5px');
  expect(vertical.style.height).toBe('100px');
  expect(vertical.style.transform).toBe('translate3d(342px, 100px, 0)');
  expect(horizontal.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(false);
});

test('moves the thumb with scrollTop and caps it at the bottom', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, { scrollTop: 300 });

  fireEvent.scroll(scroller);
  expect(getThumbs().vertical.style.transform).toBe(
    'translate3d(342px, 200px, 0)',
  );

  setGeometry(scroller, { scrollTop: 600 });
  fireEvent.scroll(scroller);
  expect(getThumbs().vertical.style.transform).toBe(
    'translate3d(342px, 300px, 0)',
  );
});

test('draws a horizontal thumb only when there is horizontal overflow', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller, { scrollWidth: 600, clientWidth: 300, scrollLeft: 0 });

  fireEvent.scroll(scroller);
  const { horizontal, vertical } = getThumbs();

  expect(horizontal.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
  expect(horizontal.style.height).toBe('5px');
  expect(horizontal.style.transform).toBe('translate3d(50px, 392px, 0)');
  expect(vertical.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
});

test('hides the thumb once scrolling stops', () => {
  jest.useFakeTimers();
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller);

  fireEvent.scroll(scroller);
  expect(getThumbs().vertical.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);

  jest.advanceTimersByTime(SCROLLBAR_HIDE_DELAY - 1);
  expect(getThumbs().vertical.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);

  jest.advanceTimersByTime(1);
  expect(getThumbs().vertical.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(false);
});

test('a resize hides a stale thumb', () => {
  render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller);

  fireEvent.scroll(scroller);
  expect(getThumbs().vertical.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
  window.dispatchEvent(new Event('resize'));
  expect(getThumbs().vertical.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(false);
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
  const { vertical } = getThumbs();

  expect(vertical.hasAttribute(VISIBLE_ATTRIBUTE)).toBe(true);
  expect(vertical.style.transform).toContain(
    `translate3d(${window.innerWidth - 8}px, 0px, 0)`,
  );
});

test('unmount removes the thumbs and the scroll listener', () => {
  const { unmount } = render(<Probe />);
  const scroller = screen.getByTestId('scroller');
  setGeometry(scroller);

  fireEvent.scroll(scroller);
  unmount();

  expect(document.querySelectorAll(`.${OVERLAY_THUMB_CLASS}`)).toHaveLength(0);
  fireEvent.scroll(scroller);
  expect(document.querySelectorAll(`.${OVERLAY_THUMB_CLASS}`)).toHaveLength(0);
});
