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
import { render } from '@superset-ui/core/spec';
import {
  FROZEN_CELL_CLASS,
  FROZEN_EDGE_CLASS,
  FROZEN_HEADER_Z_INDEX,
  HAS_FROZEN_COLUMNS_CLASS,
} from '../src/DataTable/utils/freezeColumns';
import TableChart from '../src/TableChart';
import transformProps from '../src/transformProps';
import testData from './testData';

jest.mock('../src/DataTable/utils/getScrollBarSize', () => ({
  __esModule: true,
  CUSTOM_SCROLLBAR_SIZE: 8,
  default: () => 0,
  getCustomScrollBarSize: () => 0,
}));

/**
 * TableChart's real `Header` and `Cell` are function components, not plain
 * `<th>`/`<td>` elements. freezeTableSection clones the element react-table
 * returns and injects className/style -- so a regression where those props are
 * swallowed by the renderer is invisible to pure-element unit tests. Rendering
 * the actual chart is the only way to catch it.
 */
function mockMeasurements() {
  jest
    .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
    .mockImplementation(function mockClientHeight(this: HTMLElement) {
      if (this.tagName === 'THEAD') return 30;
      if (this.tagName === 'TFOOT') return 30;
      if (this.tagName === 'TABLE') return 400;
      return 0;
    });
  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        width: 60,
        height: 0,
        top: 0,
        left: 0,
        right: 60,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      }) as DOMRect,
  );
}

function renderFrozenChart(freezeColumns: number) {
  const props = {
    ...transformProps(testData.basic),
    freezeColumns,
    width: 800,
    height: 400,
  };
  return render(<TableChart {...props} sticky />);
}

afterEach(() => {
  jest.restoreAllMocks();
});

test('forwards freeze styles through the real Header/Cell function components', () => {
  mockMeasurements();

  const { container } = renderFrozenChart(1);

  const wrapper = container.querySelector(`.${HAS_FROZEN_COLUMNS_CLASS}`);
  expect(wrapper).toBeInTheDocument();

  // The visible body clone is the one that must be pinned. Every rendered
  // data row has to keep its first column above the scrolling columns.
  const rows = Array.from(wrapper!.querySelectorAll('tbody tr'));
  expect(rows.length).toBeGreaterThan(0);
  rows.forEach(row => {
    const firstCell = row.querySelector('td') as HTMLElement;
    expect(firstCell.classList.contains(FROZEN_CELL_CLASS)).toBe(true);
    expect(firstCell.classList.contains(FROZEN_EDGE_CLASS)).toBe(true);
    expect(firstCell.style.position).toBe('sticky');
    expect(parseFloat(firstCell.style.left)).toBe(0);
    // Conditional formatting / striped colours are emitted as a class, so the
    // frozen cell still needs its own opaque background from Styles.tsx.
    expect(firstCell.getAttribute('role')).toBe('cell');
  });

  const headerCells = Array.from(
    wrapper!.querySelectorAll('thead tr:last-child th'),
  );
  expect(headerCells.length).toBeGreaterThan(0);
  const firstHeader = headerCells[0] as HTMLElement;
  expect(firstHeader.classList.contains(FROZEN_CELL_CLASS)).toBe(true);
  expect(firstHeader.style.position).toBe('sticky');
  expect(firstHeader.style.zIndex).toBe(String(FROZEN_HEADER_Z_INDEX));
  expect(headerCells[1].classList.contains(FROZEN_CELL_CLASS)).toBe(false);
});

test('leaves the real chart unpinned when freezing is disabled', () => {
  mockMeasurements();

  const { container } = renderFrozenChart(0);

  expect(
    container.querySelector(`.${HAS_FROZEN_COLUMNS_CLASS}`),
  ).not.toBeInTheDocument();
  expect(container.querySelectorAll(`.${FROZEN_CELL_CLASS}`)).toHaveLength(0);
});
