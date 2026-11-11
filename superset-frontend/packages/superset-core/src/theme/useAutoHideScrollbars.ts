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

/** Marks an overlay thumb (or a horizontal track) as visible. */
export const VISIBLE_ATTRIBUTE = 'data-visible';
/** The pointer is on the thumb: keep it visible and grow it for dragging. */
export const HOVER_ATTRIBUTE = 'data-hover';
/** The thumb is being dragged. */
export const DRAG_ATTRIBUTE = 'data-drag';
/** The transient vertical thumb, drawn while scrolling. */
export const OVERLAY_THUMB_CLASS = 'superset-overlay-scrollbar-thumb';

/**
 * Every horizontally scrollable container gets one of these tracks. They are
 * revealed while the pointer is inside that container (or on the track's
 * thumb) and fade out `SCROLLBAR_HIDE_DELAY` after the pointer leaves.
 */
export const SCROLLBAR_TRACK_CLASS = 'superset-scrollbar-track';
export const SCROLLBAR_THUMB_CLASS = 'superset-scrollbar-thumb';
/** The pointer is in the container or on its thumb: draw the thumb strongly. */
export const SCROLLBAR_ACTIVE_ATTRIBUTE = 'data-active';
export const SCROLLBAR_TRACK_HEIGHT = 8;
export const SCROLLBAR_EDGE_OFFSET = 3;

/** How long a thumb stays visible after scrolling stops / the pointer leaves. */
export const SCROLLBAR_HIDE_DELAY = 700;

const THUMB_SIZE = 5;
const MIN_THUMB_LENGTH = 24;

/**
 * Browsers routinely report a few pixels of horizontal "overflow" from
 * sub-pixel rounding, borders, zoom levels or an absolutely positioned child,
 * even when all the content fits. That is wide enough: no bar is needed.
 */
const HORIZONTAL_OVERFLOW_TOLERANCE = 4;
const NON_SCROLLABLE_OVERFLOW = new Set(['visible', 'hidden', 'clip']);

const getHorizontalRange = (element: Element) => {
  const scrollable = element as HTMLElement;
  return scrollable.scrollWidth - scrollable.clientWidth;
};

const hasHorizontalOverflow = (element: Element) =>
  getHorizontalRange(element) > HORIZONTAL_OVERFLOW_TOLERANCE;

/**
 * An `overflow: hidden` ancestor can have a larger scrollWidth because it
 * clips a child, but the user cannot scroll it, so it must not get a bar.
 * Prefer the inline value: jsdom does not expand the `overflow` shorthand
 * into `overflowX`, and inline styles win over stylesheet rules anyway.
 */
const canScrollHorizontally = (element: HTMLElement) => {
  const inline = element.style.overflowX || element.style.overflow;
  const overflowX = inline || window.getComputedStyle(element).overflowX;
  return !NON_SCROLLABLE_OVERFLOW.has(overflowX);
};

type Rect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type Placement = {
  target: Element;
  x: number;
  y: number;
  width: number;
  height: number;
};

type HoverBar = {
  element: Element;
  track: HTMLDivElement;
  thumb: HTMLDivElement;
  /** The container has horizontal overflow and is inside the viewport. */
  available: boolean;
  /** The pointer is inside the container (not merely on the thumb). */
  pointerInside: boolean;
  hideTimer?: ReturnType<typeof setTimeout>;
};

type ThumbGeometry = {
  target: HTMLElement;
  axis: 'x' | 'y';
  /** Scrollable pixels represented by one pixel of thumb travel. */
  scrollPerPx: number;
};

type DragSession = {
  thumb: HTMLDivElement;
  geometry: ThumbGeometry;
  startPos: number;
  startScroll: number;
  pointerId: number;
};

/**
 * Native scrollbars are hidden globally (see `GlobalStyles`), so they never
 * consume layout space. This hook draws fixed-position thumbs instead. They
 * float above their own scroll container and never reflow the page.
 *
 * Horizontal scrollbars share one behavior everywhere in the app, with no
 * per-chart opt-in and no user setting: a container reveals its horizontal
 * bar while the pointer is inside it (or on the bar's thumb), and fades the
 * bar out `SCROLLBAR_HIDE_DELAY` after the pointer leaves. Scrolling or a
 * wheel gesture also reveals the bar briefly when the pointer is elsewhere.
 * One bar is drawn per container, so several tables on a dashboard behave
 * independently. Vertical thumbs remain the lightweight scroll feedback:
 * they appear while scrolling and fade out once scrolling stops.
 *
 * Every thumb is draggable. Hovering one keeps it visible and widens it;
 * dragging it scrolls the container directly. Hidden thumbs do not accept
 * pointer input, so they never intercept clicks on the content underneath.
 *
 * The overlays sit just below `theme.zIndexPopupBase` (see `GlobalStyles`),
 * so modal masks, drawers, dropdowns and popovers always stay on top. A bar
 * is also clamped to the intersection of its own container and the viewport:
 * it never docks to the window bottom, never grows wider than the visible
 * part of the table, and stays glued to that table's visible bottom edge.
 * Every scroll event re-measures all bars so they follow a table smoothly as
 * the page scrolls; no transform transition is used because that would make
 * the bar lag behind the content it belongs to.
 */
export function useAutoHideScrollbars(): void {
  useEffect(() => {
    const vertical = document.createElement('div');
    vertical.className = OVERLAY_THUMB_CLASS;
    vertical.setAttribute('aria-hidden', 'true');
    vertical.dataset.axis = 'y';
    document.body.append(vertical);

    /** Hide timer for the transient vertical thumb. */
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let verticalPlacement: Placement | undefined;
    let hoveredThumb: HTMLDivElement | undefined;
    let drag: DragSession | undefined;
    let pointerContainer: Element | undefined;
    let lastRegionTarget: EventTarget | null = null;
    const thumbGeometry = new Map<HTMLDivElement, ThumbGeometry>();
    const hoverBars = new Map<Element, HoverBar>();
    const barByThumb = new Map<HTMLDivElement, HoverBar>();
    let mutationObserver: MutationObserver | undefined;
    let resizeObserver: ResizeObserver | undefined;

    const allThumbs = () => [
      vertical,
      ...Array.from(hoverBars.values(), bar => bar.thumb),
    ];

    const clearHideTimer = () => {
      if (hideTimer !== undefined) {
        clearTimeout(hideTimer);
        hideTimer = undefined;
      }
    };

    const hideVertical = () => {
      vertical.removeAttribute(VISIBLE_ATTRIBUTE);
      thumbGeometry.delete(vertical);
      verticalPlacement = undefined;
    };

    const hide = () => {
      if (hoveredThumb === vertical) {
        hoveredThumb = undefined;
      }
      if (drag?.thumb === vertical) {
        drag = undefined;
      }
      vertical.removeAttribute(HOVER_ATTRIBUTE);
      vertical.removeAttribute(DRAG_ATTRIBUTE);
      hideVertical();
      // Horizontal tracks own their visibility: a pointer that is still
      // inside a container keeps its bar on screen until the pointer leaves.
    };

    const scheduleHide = () => {
      clearHideTimer();
      // A hovered or dragged thumb must stay put, otherwise pointer input
      // disappears from under the cursor mid-interaction. Only the transient
      // vertical thumb uses this timer; bars have their own timers.
      if (drag?.thumb === vertical || hoveredThumb === vertical) {
        return;
      }
      hideTimer = setTimeout(hide, SCROLLBAR_HIDE_DELAY);
    };

    const clearBarTimer = (bar: HoverBar) => {
      if (bar.hideTimer !== undefined) {
        clearTimeout(bar.hideTimer);
        bar.hideTimer = undefined;
      }
    };

    const hideBar = (bar: HoverBar) => {
      clearBarTimer(bar);
      bar.track.removeAttribute(VISIBLE_ATTRIBUTE);
      bar.track.removeAttribute(SCROLLBAR_ACTIVE_ATTRIBUTE);
      thumbGeometry.delete(bar.thumb);
    };

    /** Whether the user is actively reading or dragging this bar. */
    const pointerEngaged = (bar: HoverBar) =>
      bar.pointerInside ||
      hoveredThumb === bar.thumb ||
      drag?.thumb === bar.thumb;

    const isBarHeld = (bar: HoverBar) => bar.available && pointerEngaged(bar);

    const scheduleBarHide = (bar: HoverBar) => {
      clearBarTimer(bar);
      if (isBarHeld(bar)) {
        return;
      }
      bar.hideTimer = setTimeout(() => {
        bar.hideTimer = undefined;
        hideBar(bar);
      }, SCROLLBAR_HIDE_DELAY);
    };

    const refreshBar = (bar: HoverBar) => {
      if (!bar.available) {
        hideBar(bar);
        return;
      }
      if (isBarHeld(bar)) {
        clearBarTimer(bar);
        bar.track.setAttribute(VISIBLE_ATTRIBUTE, 'true');
        bar.track.setAttribute(SCROLLBAR_ACTIVE_ATTRIBUTE, 'true');
      } else {
        bar.track.removeAttribute(SCROLLBAR_ACTIVE_ATTRIBUTE);
        if (bar.track.hasAttribute(VISIBLE_ATTRIBUTE)) {
          scheduleBarHide(bar);
        }
      }
    };

    const refreshBarForThumb = (thumb: HTMLDivElement) => {
      const bar = barByThumb.get(thumb);
      if (bar) {
        refreshBar(bar);
      }
    };

    /**
     * `undefined` means hit testing is unavailable (jsdom); `null` means the
     * point is outside the viewport. Our own overlays count as transparent,
     * otherwise a visible thumb would hide itself on the next refresh.
     */
    const getTopmost = (x: number, y: number): Element | null | undefined => {
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
        return null;
      }
      if (typeof document.elementFromPoint !== 'function') {
        return undefined;
      }
      return document.elementFromPoint(x, y);
    };

    const isOwnOverlay = (node: Element) =>
      node.classList.contains(OVERLAY_THUMB_CLASS) ||
      node.classList.contains(SCROLLBAR_TRACK_CLASS) ||
      node.classList.contains(SCROLLBAR_THUMB_CLASS);

    /**
     * Hit testing is only used by the transient vertical thumb. Horizontal
     * bars never hide because of a covering layer: they stay clamped inside
     * their own table, and the z-index contract in `GlobalStyles` keeps them
     * below popups.
     */
    const isUnobstructed = (container: Element, x: number, y: number) => {
      const top = getTopmost(x, y);
      if (top === undefined) {
        return true;
      }
      if (top === null) {
        return false;
      }
      if (isOwnOverlay(top)) {
        return true;
      }
      return top === container || container.contains(top);
    };

    const attachThumbInteractions = (thumb: HTMLDivElement) => {
      thumb.addEventListener('pointerenter', () => {
        hoveredThumb = thumb;
        thumb.setAttribute(HOVER_ATTRIBUTE, 'true');
        if (thumb === vertical) {
          clearHideTimer();
        }
        refreshBarForThumb(thumb);
      });
      thumb.addEventListener('pointerleave', () => {
        if (drag) {
          return;
        }
        if (hoveredThumb === thumb) {
          hoveredThumb = undefined;
        }
        thumb.removeAttribute(HOVER_ATTRIBUTE);
        if (thumb === vertical) {
          scheduleHide();
        }
        refreshBarForThumb(thumb);
      });
      thumb.addEventListener('pointerdown', (event: PointerEvent) => {
        const geometry = thumbGeometry.get(thumb);
        if (!geometry) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const isVertical = geometry.axis === 'y';
        drag = {
          thumb,
          geometry,
          startPos: isVertical ? event.clientY : event.clientX,
          startScroll: isVertical
            ? geometry.target.scrollTop
            : geometry.target.scrollLeft,
          pointerId: event.pointerId,
        };
        hoveredThumb = thumb;
        thumb.setAttribute(HOVER_ATTRIBUTE, 'true');
        thumb.setAttribute(DRAG_ATTRIBUTE, 'true');
        if (thumb === vertical) {
          clearHideTimer();
        }
        refreshBarForThumb(thumb);
      });
    };

    const updateBarGeometry = (element: Element, bar: HoverBar) => {
      const scrollable = element as HTMLElement;
      const rect = scrollable.getBoundingClientRect();
      const horizontalRange = getHorizontalRange(element);
      // The bar must never leave the table. Intersect the table with the
      // viewport so a table scrolled partly off-screen keeps a bar glued to
      // the bottom of the portion that is actually visible.
      const visibleLeft = Math.max(rect.left, 0);
      const visibleRight = Math.min(rect.right, window.innerWidth);
      const visibleTop = Math.max(rect.top, 0);
      const visibleBottom = Math.min(rect.bottom, window.innerHeight);
      const placementWidth = visibleRight - visibleLeft;
      if (
        !element.isConnected ||
        !hasHorizontalOverflow(element) ||
        placementWidth <= MIN_THUMB_LENGTH ||
        visibleBottom - visibleTop <=
          SCROLLBAR_TRACK_HEIGHT + SCROLLBAR_EDGE_OFFSET
      ) {
        bar.available = false;
        hideBar(bar);
        return false;
      }
      const placementTop =
        visibleBottom - SCROLLBAR_TRACK_HEIGHT - SCROLLBAR_EDGE_OFFSET;
      const length = Math.max(
        MIN_THUMB_LENGTH,
        (scrollable.clientWidth / scrollable.scrollWidth) * placementWidth,
      );
      const offset =
        (scrollable.scrollLeft / horizontalRange) *
        Math.max(0, placementWidth - length);
      bar.track.style.width = `${placementWidth}px`;
      bar.track.style.height = `${SCROLLBAR_TRACK_HEIGHT}px`;
      bar.track.style.transform = `translate3d(${visibleLeft}px, ${placementTop}px, 0)`;
      bar.thumb.style.width = `${length}px`;
      bar.thumb.style.transform = `translate3d(${offset}px, 0, 0)`;
      bar.available = true;
      thumbGeometry.set(bar.thumb, {
        target: scrollable,
        axis: 'x',
        scrollPerPx: horizontalRange / Math.max(1, placementWidth - length),
      });
      return true;
    };

    const revealBar = (element: Element, bar: HoverBar) => {
      if (!updateBarGeometry(element, bar)) {
        return;
      }
      bar.track.setAttribute(VISIBLE_ATTRIBUTE, 'true');
      refreshBar(bar);
    };

    const createBar = (element: Element): HoverBar => {
      const track = document.createElement('div');
      track.className = SCROLLBAR_TRACK_CLASS;
      track.setAttribute('aria-hidden', 'true');
      const thumb = document.createElement('div');
      thumb.className = SCROLLBAR_THUMB_CLASS;
      thumb.dataset.axis = 'x';
      attachThumbInteractions(thumb);
      track.append(thumb);
      document.body.append(track);
      return {
        element,
        track,
        thumb,
        available: false,
        pointerInside: false,
      };
    };

    const getOrCreateBar = (element: Element): HoverBar => {
      let bar = hoverBars.get(element);
      if (!bar) {
        bar = createBar(element);
        hoverBars.set(element, bar);
        barByThumb.set(bar.thumb, bar);
        resizeObserver?.observe(element);
      }
      return bar;
    };

    const destroyBar = (bar: HoverBar) => {
      if (hoveredThumb === bar.thumb) {
        hoveredThumb = undefined;
      }
      if (drag?.thumb === bar.thumb) {
        drag = undefined;
      }
      if (pointerContainer === bar.element) {
        pointerContainer = undefined;
      }
      hideBar(bar);
      bar.track.remove();
      hoverBars.delete(bar.element);
      barByThumb.delete(bar.thumb);
      resizeObserver?.unobserve(bar.element);
    };

    const getHorizontalScroller = (element: Element): Element | null => {
      let current = element instanceof HTMLElement ? element : null;
      while (current) {
        if (
          current !== document.body &&
          current !== document.documentElement &&
          hasHorizontalOverflow(current) &&
          canScrollHorizontally(current)
        ) {
          return current;
        }
        if (current === document.body) {
          break;
        }
        current = current.parentElement;
      }
      // The viewport itself can scroll horizontally without an explicit
      // overflow style, so check only its real range.
      const root = document.scrollingElement ?? document.documentElement;
      if (root instanceof HTMLElement && hasHorizontalOverflow(root)) {
        return root;
      }
      return null;
    };

    const getScrollableAncestor = (element: Element): HTMLElement | null => {
      let current = element instanceof HTMLElement ? element : null;
      while (current) {
        if (
          current.scrollHeight - current.clientHeight > 1 ||
          current.scrollWidth - current.clientWidth > 1
        ) {
          return current;
        }
        if (current === document.body) {
          break;
        }
        current = current.parentElement;
      }
      const root = document.scrollingElement ?? document.documentElement;
      return root instanceof HTMLElement ? root : null;
    };

    /** Move the hover-held horizontal bar to whichever container the pointer is over. */
    const syncPointerRegion = (target: EventTarget | null) => {
      const element = target instanceof Element ? target : null;
      const overlayThumb = element?.closest(
        `.${SCROLLBAR_THUMB_CLASS}`,
      ) as HTMLDivElement | null;
      const thumbBar = overlayThumb ? barByThumb.get(overlayThumb) : undefined;
      const container =
        thumbBar?.element ?? (element ? getHorizontalScroller(element) : null);
      if (container === pointerContainer) {
        return;
      }
      const previous = pointerContainer
        ? hoverBars.get(pointerContainer)
        : undefined;
      pointerContainer = container ?? undefined;
      if (previous && previous.element !== container) {
        previous.pointerInside = false;
        refreshBar(previous);
      }
      if (container) {
        const bar = getOrCreateBar(container);
        bar.pointerInside = true;
        revealBar(container, bar);
      }
    };

    const placeVertical = (element: Element) => {
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
      const range = scrollable.scrollHeight - scrollable.clientHeight;
      if (range <= 1 || rect.height <= MIN_THUMB_LENGTH) {
        hideVertical();
        return;
      }
      const track = rect.height;
      const length = Math.max(
        MIN_THUMB_LENGTH,
        (scrollable.clientHeight / scrollable.scrollHeight) * track,
      );
      const x = rect.right - THUMB_SIZE - SCROLLBAR_EDGE_OFFSET;
      const y = rect.top + (scrollable.scrollTop / range) * (track - length);
      if (!isUnobstructed(element, x + THUMB_SIZE / 2, y + length / 2)) {
        hideVertical();
        return;
      }
      vertical.style.width = `${THUMB_SIZE}px`;
      vertical.style.height = `${length}px`;
      vertical.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      vertical.setAttribute(VISIBLE_ATTRIBUTE, 'true');
      thumbGeometry.set(vertical, {
        target: scrollable,
        axis: 'y',
        scrollPerPx: range / Math.max(1, track - length),
      });
      verticalPlacement = {
        target: element,
        x,
        y,
        width: THUMB_SIZE,
        height: length,
      };
    };

    const refresh = (
      verticalTarget: Element | null,
      horizontalTarget: Element | null,
    ) => {
      if (horizontalTarget) {
        revealBar(horizontalTarget, getOrCreateBar(horizontalTarget));
      }
      if (verticalTarget) {
        placeVertical(verticalTarget);
      } else {
        hideVertical();
      }
      scheduleHide();
    };

    /** Re-check every drawn overlay after DOM/layout changes. */
    const syncBars = () => {
      for (const bar of Array.from(hoverBars.values())) {
        if (!bar.element.isConnected) {
          destroyBar(bar);
          continue;
        }
        // Re-measure without resetting the hide timer: React re-renders
        // constantly and must not keep a fading bar alive forever.
        updateBarGeometry(bar.element, bar);
        if (isBarHeld(bar)) {
          refreshBar(bar);
        }
      }
      if (verticalPlacement && vertical.hasAttribute(VISIBLE_ATTRIBUTE)) {
        const { target, x, y, width, height } = verticalPlacement;
        if (!isUnobstructed(target, x + width / 2, y + height / 2)) {
          hideVertical();
        }
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
      const horizontalTarget = hasHorizontalOverflow(element) ? element : null;
      refresh(getScrollableAncestor(element), horizontalTarget);
      // Page scrolling moves every table on screen without changing their own
      // scrollLeft. Reposition all bars on every scroll event (not just on
      // resize/DOM mutations) so they stay glued to the visible bottom edge
      // and track the table smoothly instead of jumping to a stale position.
      syncBars();
    };

    // A wheel gesture at a scroll boundary fires no `scroll` event, but the
    // user is still asking to scroll: reveal the thumbs so they can be grabbed.
    const onWheel = (event: WheelEvent) => {
      if (!(event.target instanceof Element)) {
        return;
      }
      refresh(
        getScrollableAncestor(event.target),
        getHorizontalScroller(event.target),
      );
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.target !== lastRegionTarget) {
        lastRegionTarget = event.target;
        syncPointerRegion(event.target);
      }
      if (
        !drag ||
        (event.pointerId !== undefined && event.pointerId !== drag.pointerId)
      ) {
        return;
      }
      const { geometry, startPos, startScroll } = drag;
      const isVertical = geometry.axis === 'y';
      const delta = (isVertical ? event.clientY : event.clientX) - startPos;
      const next = startScroll + delta * geometry.scrollPerPx;
      if (isVertical) {
        geometry.target.scrollTop = next;
      } else {
        geometry.target.scrollLeft = next;
      }
      // Programmatic scrolling does not dispatch a scroll event in every
      // browser/jsdom, so re-measure the dragged bar immediately.
      const bar = barByThumb.get(drag.thumb);
      if (bar) {
        updateBarGeometry(bar.element, bar);
      }
    };

    // `pointerover` also fires when a container appears under a stationary
    // pointer (React re-render, page scroll), where no pointermove happens.
    const onPointerOver = (event: PointerEvent) => {
      lastRegionTarget = event.target;
      syncPointerRegion(event.target);
    };

    const onPointerOut = (event: PointerEvent) => {
      // A null related target means the pointer left the document entirely.
      if (!event.relatedTarget) {
        lastRegionTarget = null;
        syncPointerRegion(null);
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (
        !drag ||
        (event.pointerId !== undefined && event.pointerId !== drag.pointerId)
      ) {
        return;
      }
      const { thumb } = drag;
      thumb.removeAttribute(DRAG_ATTRIBUTE);
      // `pointerleave` is ignored while dragging, so release a hover that is
      // no longer real when the pointer ended somewhere else.
      if (event.target !== thumb) {
        hoveredThumb = undefined;
        thumb.removeAttribute(HOVER_ATTRIBUTE);
      }
      drag = undefined;
      if (thumb === vertical) {
        scheduleHide();
      }
      refreshBarForThumb(thumb);
    };

    // A resize can move the scroll container while a thumb is still shown.
    // Re-measure the bars and drop the transient thumb; the next scroll
    // recomputes its geometry.
    const onResize = () => {
      hoveredThumb = undefined;
      drag = undefined;
      for (const thumb of allThumbs()) {
        thumb.removeAttribute(HOVER_ATTRIBUTE);
        thumb.removeAttribute(DRAG_ATTRIBUTE);
      }
      hideVertical();
      syncBars();
    };

    attachThumbInteractions(vertical);

    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(() => syncBars());
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => syncBars());
    }

    document.addEventListener('scroll', onScroll, { capture: true });
    document.addEventListener('wheel', onWheel, {
      capture: true,
      passive: true,
    });
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      document.removeEventListener('wheel', onWheel, { capture: true });
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('resize', onResize);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      clearHideTimer();
      for (const bar of hoverBars.values()) {
        hideBar(bar);
        bar.track.remove();
      }
      hoverBars.clear();
      barByThumb.clear();
      thumbGeometry.clear();
      vertical.remove();
    };
  }, []);
}
