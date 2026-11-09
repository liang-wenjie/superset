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
import { useEffect } from 'react';

/** Marks an overlay thumb as visible. */
export const VISIBLE_ATTRIBUTE = 'data-visible';
export const OVERLAY_THUMB_CLASS = 'superset-overlay-scrollbar-thumb';

/** How long the thumb stays visible after the last scroll event, in ms. */
export const SCROLLBAR_HIDE_DELAY = 700;

const THUMB_SIZE = 5;
const EDGE_OFFSET = 3;
const MIN_THUMB_LENGTH = 24;

type Rect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

/**
 * Native scrollbars are hidden globally (see `GlobalStyles`), so they never
 * consume layout space. This hook draws a fixed-position thumb over whichever
 * container is scrolling instead, matching the overlay scrollbar behaviour of
 * macOS: it floats above the content, is visible only while scrolling, and
 * never shifts the layout.
 *
 * A single listener on `document` covers every scroll container, including
 * dropdowns portalled onto `body`, because scroll events travel through the
 * capture phase even though they do not bubble. The thumb is purely visual
 * (`pointer-events: none`), so it cannot intercept clicks on the content
 * underneath; scrolling stays with the wheel, trackpad, keyboard and any
 * drag-to-scroll behaviour a component implements itself.
 */
export function useAutoHideScrollbars(): void {
  useEffect(() => {
    const vertical = document.createElement('div');
    const horizontal = document.createElement('div');
    for (const thumb of [vertical, horizontal]) {
      thumb.className = OVERLAY_THUMB_CLASS;
      thumb.setAttribute('aria-hidden', 'true');
    }
    vertical.dataset.axis = 'y';
    horizontal.dataset.axis = 'x';
    document.body.append(vertical, horizontal);

    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const hide = () => {
      vertical.removeAttribute(VISIBLE_ATTRIBUTE);
      horizontal.removeAttribute(VISIBLE_ATTRIBUTE);
    };

    const place = (
      thumb: HTMLDivElement,
      x: number,
      y: number,
      width: number,
      height: number,
    ) => {
      thumb.style.width = `${width}px`;
      thumb.style.height = `${height}px`;
      thumb.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      thumb.setAttribute(VISIBLE_ATTRIBUTE, 'true');
    };

    const update = (element: Element) => {
      const scrollable = element as HTMLElement;
      // The root scroller is measured against the viewport, not against the
      // full-document rect returned by <html>.getBoundingClientRect().
      const isRoot =
        scrollable === document.scrollingElement ||
        scrollable === document.documentElement;
      const rect: Rect = isRoot
        ? {
            top: 0,
            left: 0,
            right: window.innerWidth,
            bottom: window.innerHeight,
            width: window.innerWidth,
            height: window.innerHeight,
          }
        : scrollable.getBoundingClientRect();

      const verticalRange = scrollable.scrollHeight - scrollable.clientHeight;
      const horizontalRange = scrollable.scrollWidth - scrollable.clientWidth;
      const hasVertical = verticalRange > 1 && rect.height > MIN_THUMB_LENGTH;
      const hasHorizontal =
        horizontalRange > 1 && rect.width > MIN_THUMB_LENGTH;

      if (hasVertical) {
        const track = rect.height;
        const length = Math.max(
          MIN_THUMB_LENGTH,
          (scrollable.clientHeight / scrollable.scrollHeight) * track,
        );
        const offset =
          (scrollable.scrollTop / verticalRange) * (track - length);
        place(
          vertical,
          rect.right - THUMB_SIZE - EDGE_OFFSET,
          rect.top + offset,
          THUMB_SIZE,
          length,
        );
      } else {
        vertical.removeAttribute(VISIBLE_ATTRIBUTE);
      }

      if (hasHorizontal) {
        // Leave room for the vertical thumb in the bottom-right corner.
        const track = rect.width - (hasVertical ? THUMB_SIZE + EDGE_OFFSET : 0);
        const length = Math.max(
          MIN_THUMB_LENGTH,
          (scrollable.clientWidth / scrollable.scrollWidth) * track,
        );
        const offset =
          (scrollable.scrollLeft / horizontalRange) *
          Math.max(0, track - length);
        place(
          horizontal,
          rect.left + offset,
          rect.bottom - THUMB_SIZE - EDGE_OFFSET,
          length,
          THUMB_SIZE,
        );
      } else {
        horizontal.removeAttribute(VISIBLE_ATTRIBUTE);
      }
    };

    const onScroll = (event: Event) => {
      const { target } = event;
      const element =
        target instanceof Element
          ? target
          : target === document
            ? (document.scrollingElement ?? document.documentElement)
            : null;
      if (!element) {
        return;
      }

      update(element);
      if (hideTimer !== undefined) {
        clearTimeout(hideTimer);
      }
      hideTimer = setTimeout(hide, SCROLLBAR_HIDE_DELAY);
    };

    // A resize can move the scroll container while the thumb is still shown.
    // Hiding it is cheaper than tracking layout changes; the next scroll
    // recomputes the geometry.
    const onResize = () => hide();

    document.addEventListener('scroll', onScroll, { capture: true });
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onResize);
      if (hideTimer !== undefined) {
        clearTimeout(hideTimer);
      }
      vertical.remove();
      horizontal.remove();
    };
  }, []);
}
