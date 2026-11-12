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
import { useCallback } from 'react';
import { useTable, Column } from 'react-table';
import { act, render } from '@superset-ui/core/spec';
import useSticky from '../../../src/DataTable/hooks/useSticky';
import {
  FROZEN_BODY_Z_INDEX,
  FROZEN_CELL_CLASS,
  FROZEN_EDGE_CLASS,
  FROZEN_HEADER_Z_INDEX,
  HAS_FROZEN_COLUMNS_CLASS,
} from '../../../src/DataTable/utils/freezeColumns';
import { TABLE_FRAME_CLASS } from '../../../src/utils/tableStyle';

// A value distinguishable from any real scrollbar width, so the width
// assertions below can detect whether header/footer's wrapper width was
// computed by subtracting this JS-measured probe from `maxWidth` (the old,
// removed `maxWidth - scrollBarSize` behavior) rather than always being the
// unconditional `maxWidth` the fix uses. If that subtraction is ever
// reintroduced, header/footer's `style.width` would read
// `${MAX_WIDTH - MOCKED_SCROLLBAR_PROBE_SIZE}px`, an unmistakably wrong
// value given how large this mock is.
const MOCKED_SCROLLBAR_PROBE_SIZE = 42;

jest.mock('../../../src/DataTable/utils/getScrollBarSize', () => ({
  __esModule: true,
  CUSTOM_SCROLLBAR_SIZE: 8,
  default: () => 0,
  getCustomScrollBarSize: () => MOCKED_SCROLLBAR_PROBE_SIZE,
}));

const MAX_WIDTH = 300;
const MAX_HEIGHT = 120; // small enough that the mocked content forces a vertical scroll

const TOTAL_HEADER_HEIGHT = 30;
const TOTAL_FOOTER_HEIGHT = 30;
// Larger than `MAX_HEIGHT - TOTAL_HEADER_HEIGHT - TOTAL_FOOTER_HEIGHT`, so the
// sticky layout effect computes `hasVerticalScroll: true`.
const FULL_TABLE_HEIGHT = 400;

// An element inside a `display: none` subtree (an inactive dashboard tab,
// for instance) generates no box at all, so every measurement of it reads
// zero. jsdom does no layout, so the fake has to model that itself.
function isInHiddenSubtree(el: HTMLElement) {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (node.style?.display === 'none') return true;
  }
  return false;
}

function mockMeasurements() {
  jest
    .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
    .mockImplementation(function mockClientHeight(this: HTMLElement) {
      if (isInHiddenSubtree(this)) return 0;
      if (this.tagName === 'THEAD') return TOTAL_HEADER_HEIGHT;
      if (this.tagName === 'TFOOT') return TOTAL_FOOTER_HEIGHT;
      if (this.tagName === 'TABLE') return FULL_TABLE_HEIGHT;
      return 0;
    });
  jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function mockRect(this: HTMLElement) {
      const width = this.tagName === 'TH' && !isInHiddenSubtree(this) ? 60 : 0;
      return {
        width,
        height: 0,
        top: 0,
        left: 0,
        right: width,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      } as DOMRect;
    });
}

type Row = { category: string; amount: string };

const columns: Column<Row>[] = [
  { Header: 'Category', accessor: 'category' },
  { Header: 'SUM(amount)', accessor: 'amount' },
];

const data: Row[] = Array.from({ length: 8 }, (_, i) => ({
  category: `Category ${i}`,
  amount: `${1234567.891234 + i}`,
}));

function StickyTableHarness({
  withFooter = true,
  freezeColumns = 0,
}: { withFooter?: boolean; freezeColumns?: number } = {}) {
  const getTableSize = useCallback(
    () => ({ width: MAX_WIDTH, height: MAX_HEIGHT }),
    [],
  );
  const { getTableProps, headerGroups, rows, prepareRow, wrapStickyTable } =
    useTable<Row>(
      {
        columns,
        data,
        getTableSize,
        freezeColumns,
      },
      useSticky,
    );

  const renderTable = () => (
    <table {...getTableProps()}>
      <thead>
        {headerGroups.map(hg => (
          <tr {...hg.getHeaderGroupProps()} key={hg.id}>
            {hg.headers.map(col => (
              <th {...col.getHeaderProps()} key={col.id}>
                {col.render('Header')}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {rows.map(row => {
          prepareRow(row);
          return (
            <tr {...row.getRowProps()} key={row.id}>
              {row.cells.map(cell => (
                <td {...cell.getCellProps()} key={cell.column.id}>
                  {cell.render('Cell')}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
      {withFooter && (
        <tfoot>
          <tr key="footer">
            <th>Summary</th>
            <td>
              <strong>14814904.694808</strong>
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );

  return <div data-test="sticky-root">{wrapStickyTable(renderTable)}</div>;
}

test('sticky header/footer width matches the body, independent of the scrollbar-size probe', () => {
  mockMeasurements();

  const { container } = render(<StickyTableHarness />);

  const root = container.querySelector('[data-test="sticky-root"] > div');
  expect(root).not.toBeNull();
  const [headerDiv, bodyDiv, footerDiv] = Array.from(
    root!.children,
  ) as HTMLDivElement[];

  expect(bodyDiv.style.width).toBe(`${MAX_WIDTH}px`);

  // This is the load-bearing assertion for the reported bug. Before the fix
  // these read `${MAX_WIDTH - MOCKED_SCROLLBAR_PROBE_SIZE}px` (258px) --
  // genuinely narrower than the body, from a real CSS `width` subtraction
  // (`maxWidth - scrollBarSize`), not just a smaller reported `clientWidth`.
  // A wrapper that's actually narrower than the shared, fixed-layout
  // colgroup it has to display gets genuinely clipped by its own
  // `overflow: hidden` (verified with real hit-testing in a real browser --
  // this is not true of the `scrollbarGutter` assertions below). The fix
  // makes header/footer always exactly `maxWidth`, which the colgroup
  // (bounded by the sizer's `clientWidth`, itself bounded by `maxWidth`)
  // can never exceed.
  expect(headerDiv.style.width).toBe(`${MAX_WIDTH}px`);
  expect(footerDiv.style.width).toBe(`${MAX_WIDTH}px`);

  // Secondary, not itself load-bearing for preventing clipping: real
  // hit-testing shows `scrollbar-gutter` on an `overflow: hidden` box
  // changes what `clientWidth` reports without moving where it actually
  // clips, so this doesn't guard against the reported bug by itself. It's
  // asserted because header/footer's reported `clientWidth` still needs to
  // match body's `clientWidth` for their programmatically
  // synced `scrollLeft` (see `onScroll` in `useSticky.tsx`) to reveal the
  // same slice of the row body actually shows, when a horizontal scrollbar
  // is present alongside a vertical one.
  expect(headerDiv.style.scrollbarGutter).toBe(bodyDiv.style.scrollbarGutter);
  expect(footerDiv.style.scrollbarGutter).toBe(bodyDiv.style.scrollbarGutter);
  expect(bodyDiv.style.scrollbarGutter).toBe('stable');

  // Pin the `css={scrollBarStyles}` addition to header/footer directly (part
  // of the same secondary consistency measure as the `scrollbarGutter`
  // assertions above, not the clipping fix). This component carries
  // `/** @jsxImportSource @emotion/react */`, which makes
  // Babel route its `css` prop through Emotion's jsx runtime instead of
  // passing `css` straight through as an inert DOM attribute (the default in
  // this repo's Jest/Babel setup, which -- unlike the webpack/SWC build --
  // doesn't set `importSource: '@emotion/react'` globally). With the pragma
  // in place, an applied `css` prop is observable as a real, non-empty
  // className, so this assertion actually fails without the fix instead of
  // passing regardless of whether `scrollBarStyles` is wired up.
  //
  // Before `css={scrollBarStyles}` was added to header/footer, they had no
  // emotion-generated class at all (`className === ''`) while the body kept
  // its own -- so this fails pre-fix and passes post-fix.
  expect(headerDiv.className).not.toBe('');
  expect(headerDiv.className).toBe(bodyDiv.className);
  expect(footerDiv.className).toBe(bodyDiv.className);

  jest.restoreAllMocks();
});

test('sticky wrapper owns the whole outer border frame', () => {
  mockMeasurements();

  const { container } = render(<StickyTableHarness />);
  const root = container.querySelector(
    '[data-test="sticky-root"] > div',
  ) as HTMLDivElement;
  const [headerDiv, bodyDiv, footerDiv] = Array.from(
    root.children,
  ) as HTMLDivElement[];

  // One element -- the wrapper -- draws all four edges with a single border
  // declaration. That is what makes the bottom edge identical to the top and
  // keeps it visible while the body scrolls.
  expect(root.classList.contains(TABLE_FRAME_CLASS)).toBe(true);
  expect(container.querySelectorAll(`.${TABLE_FRAME_CLASS}`)).toHaveLength(1);
  // The cloned tables must not paint their own edges: doing so used to add a
  // second line right below the header and put the bottom edge at the end of
  // the scrollable content instead of at the bottom of the viewport.
  [
    headerDiv.querySelector('table')!,
    bodyDiv.querySelector('table')!,
    footerDiv.querySelector('table')!,
  ].forEach(table => {
    expect(table.classList.contains(TABLE_FRAME_CLASS)).toBe(false);
  });

  jest.restoreAllMocks();
});

test('the wrapper still owns the frame when there is no footer', () => {
  mockMeasurements();

  const { container } = render(<StickyTableHarness withFooter={false} />);
  const root = container.querySelector(
    '[data-test="sticky-root"] > div',
  ) as HTMLDivElement;

  // Without a footer the body table used to take over the bottom edge. Now
  // the wrapper owns it in both layouts, so the frame never changes shape.
  expect(root.classList.contains(TABLE_FRAME_CLASS)).toBe(true);
  expect(container.querySelectorAll(`.${TABLE_FRAME_CLASS}`)).toHaveLength(1);
  root.querySelectorAll('table').forEach(table => {
    expect(table.classList.contains(TABLE_FRAME_CLASS)).toBe(false);
  });

  jest.restoreAllMocks();
});

function installResizeObserverMock() {
  const callbacks: ResizeObserverCallback[] = [];
  const original = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) {
      callbacks.push(callback);
    }

    observe() {}

    unobserve() {}

    disconnect() {}
  } as unknown as typeof ResizeObserver;
  return {
    trigger: () =>
      callbacks.forEach(callback => callback([], {} as ResizeObserver)),
    restore: () => {
      globalThis.ResizeObserver = original;
    },
  };
}

// When useSticky cannot measure, `StickyWrap` renders only its hidden
// "sizer" table (`visibility: hidden`), which still contains a full tbody.
// So count only the data cells a user could actually see.
function visibleDataCellCount(container: HTMLElement) {
  return Array.from(container.querySelectorAll('tbody td')).filter(cell => {
    for (
      let node: HTMLElement | null = cell as HTMLElement;
      node;
      node = node.parentElement
    ) {
      if (node.style?.visibility === 'hidden') return false;
    }
    return true;
  }).length;
}

test('sticky table paints once it gains a box, when first rendered inside a hidden dashboard tab', () => {
  mockMeasurements();
  const resizeObserver = installResizeObserverMock();

  // An inactive dashboard tab keeps its charts mounted under `display: none`,
  // so a chart that (re)mounts while its tab is hidden does its one and only
  // layout measurement against zero-sized boxes.
  const host = document.createElement('div');
  host.style.display = 'none';
  document.body.append(host);

  try {
    render(<StickyTableHarness />, { container: host });

    expect(visibleDataCellCount(host)).toBe(0);

    // Switching to the tab gives the chart a real box. Neither `maxWidth`,
    // `maxHeight`, `setStickyState` nor the scrollbar size changes, so
    // without the ResizeObserver the sticky layout is never recomputed and
    // the chart stays blank until it is force-refreshed or the window is
    // resized.
    host.style.display = '';
    act(() => {
      resizeObserver.trigger();
    });

    expect(visibleDataCellCount(host)).toBe(data.length * columns.length);
  } finally {
    host.remove();
    resizeObserver.restore();
    jest.restoreAllMocks();
  }
});

test('pins frozen columns in the header, body and footer clones only', () => {
  mockMeasurements();

  const { container } = render(<StickyTableHarness freezeColumns={1} />);
  const root = container.querySelector(
    '[data-test="sticky-root"] > div',
  ) as HTMLDivElement;
  const [headerDiv, bodyDiv, footerDiv] = Array.from(
    root.children,
  ) as HTMLDivElement[];

  [headerDiv, bodyDiv, footerDiv].forEach(section => {
    const rows = section.querySelectorAll('tr');
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach(row => {
      const cells = row.querySelectorAll<HTMLElement>('th, td');
      expect(cells[0].classList.contains(FROZEN_CELL_CLASS)).toBe(true);
      expect(cells[0].style.position).toBe('sticky');
      expect(parseFloat(cells[0].style.left)).toBe(0);
      expect(cells[0].classList.contains(FROZEN_EDGE_CLASS)).toBe(true);
      expect(Number(cells[0].style.zIndex)).toBeGreaterThanOrEqual(
        FROZEN_BODY_Z_INDEX,
      );
      expect(cells[1].classList.contains(FROZEN_CELL_CLASS)).toBe(false);
    });
  });

  // The hidden sizer must stay unmodified: it measures natural column widths.
  const sizer = root.children[3];
  if (sizer) {
    sizer.querySelectorAll('th, td').forEach(cell => {
      expect(cell.classList.contains(FROZEN_CELL_CLASS)).toBe(false);
    });
  }

  jest.restoreAllMocks();
});

test('pins the first column in every visible body data row', () => {
  mockMeasurements();

  const { container } = render(<StickyTableHarness freezeColumns={1} />);
  const bodyDiv = container.querySelector(
    '[data-test="sticky-root"] > div > div:nth-child(2)',
  ) as HTMLDivElement;
  const rows = bodyDiv.querySelectorAll('tbody tr');
  expect(rows).toHaveLength(data.length);
  rows.forEach(row => {
    const [first, second] = row.querySelectorAll('td');
    expect(first.classList.contains(FROZEN_CELL_CLASS)).toBe(true);
    expect(first.style.position).toBe('sticky');
    expect(first.style.zIndex).toBe(String(FROZEN_BODY_Z_INDEX));
    expect(second.style.position).toBe('');
    expect(second.style.zIndex).toBe('');
  });

  jest.restoreAllMocks();
});

test('keeps frozen header cells above frozen body cells', () => {
  mockMeasurements();

  const { container } = render(<StickyTableHarness freezeColumns={1} />);
  const root = container.querySelector(
    '[data-test="sticky-root"] > div',
  ) as HTMLDivElement;
  const [headerDiv, bodyDiv] = Array.from(root.children) as HTMLDivElement[];
  const headerCell = headerDiv.querySelector('thead th') as HTMLElement;
  const bodyCell = bodyDiv.querySelector('tbody td') as HTMLElement;
  expect(headerCell.style.zIndex).toBe(String(FROZEN_HEADER_Z_INDEX));
  expect(bodyCell.style.zIndex).toBe(String(FROZEN_BODY_Z_INDEX));
  expect(Number(headerCell.style.zIndex)).toBeGreaterThan(
    Number(bodyCell.style.zIndex),
  );

  jest.restoreAllMocks();
});

test('uses measured column widths for the second frozen column', () => {
  mockMeasurements();

  const { container } = render(<StickyTableHarness freezeColumns={2} />);
  const bodyDiv = container.querySelector(
    '[data-test="sticky-root"] > div > div:nth-child(2)',
  ) as HTMLDivElement;
  const cells = bodyDiv.querySelector('tr')!.querySelectorAll('td');
  expect(parseFloat(cells[0].style.left)).toBe(0);
  expect(parseFloat(cells[1].style.left)).toBe(60);
  expect(cells[1].classList.contains(FROZEN_EDGE_CLASS)).toBe(true);

  jest.restoreAllMocks();
});

test('clamps an oversized frozen count to the real column count', () => {
  mockMeasurements();

  const { container } = render(<StickyTableHarness freezeColumns={99} />);
  const bodyDiv = container.querySelector(
    '[data-test="sticky-root"] > div > div:nth-child(2)',
  ) as HTMLDivElement;
  const cells = bodyDiv.querySelector('tr')!.querySelectorAll('td');
  expect(cells[0].classList.contains(FROZEN_CELL_CLASS)).toBe(true);
  expect(cells[1].classList.contains(FROZEN_CELL_CLASS)).toBe(true);
  expect(parseFloat(cells[1].style.left)).toBe(60);
  // Without clamping the boundary marker would sit on a nonexistent column
  // and the frozen block would have no visible right edge.
  expect(cells[1].classList.contains(FROZEN_EDGE_CLASS)).toBe(true);

  jest.restoreAllMocks();
});

test('switches to per-cell borders only when freezing is active', () => {
  mockMeasurements();

  const { container } = render(<StickyTableHarness freezeColumns={1} />);
  const root = container.querySelector(
    '[data-test="sticky-root"] > div',
  ) as HTMLDivElement;
  expect(root.classList.contains(HAS_FROZEN_COLUMNS_CLASS)).toBe(true);

  jest.restoreAllMocks();
});

test('does not mark any cell when freezing is disabled', () => {
  mockMeasurements();

  const { container } = render(<StickyTableHarness />);
  expect(container.querySelectorAll(`.${FROZEN_CELL_CLASS}`)).toHaveLength(0);
  const root = container.querySelector(
    '[data-test="sticky-root"] > div',
  ) as HTMLDivElement;
  // Collapsed borders must stay untouched for every chart without frozen
  // columns; otherwise this fix would restyle the whole plugin.
  expect(root.classList.contains(HAS_FROZEN_COLUMNS_CLASS)).toBe(false);

  jest.restoreAllMocks();
});
