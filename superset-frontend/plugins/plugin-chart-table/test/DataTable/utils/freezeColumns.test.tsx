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
  FROZEN_BODY_Z_INDEX,
  FROZEN_CELL_CLASS,
  FROZEN_EDGE_CLASS,
  FROZEN_HEADER_Z_INDEX,
  freezeTableSection,
  getColumnOffsets,
} from '../../../src/DataTable/utils/freezeColumns';

const offsets = [0, 60, 140, 180];

function buildBody() {
  return (
    <tbody>
      <tr>
        <td>A</td>
        <td>B</td>
        <td>C</td>
      </tr>
      <tr>
        <td>D</td>
        <td>E</td>
        <td>F</td>
      </tr>
    </tbody>
  );
}

function renderBody(freezeColumns: number) {
  const section = freezeTableSection(buildBody(), offsets, freezeColumns);
  const { container } = render(<table>{section}</table>);
  return Array.from(container.querySelectorAll('tbody tr')).map(row =>
    Array.from(row.querySelectorAll('td')),
  );
}

test('getColumnOffsets returns cumulative left edges', () => {
  expect(getColumnOffsets([60, 80, 40])).toEqual(offsets);
  expect(getColumnOffsets([10, Number.NaN, 5])).toEqual([0, 10, 10, 15]);
});

test('freezeTableSection leaves the element untouched when nothing is frozen', () => {
  const section = buildBody();
  expect(freezeTableSection(section, offsets, 0)).toBe(section);
  const rows = renderBody(0);
  rows.flat().forEach(cell => {
    expect(cell.classList.contains(FROZEN_CELL_CLASS)).toBe(false);
    expect(cell.style.position).toBe('');
  });
});

test('pins the leftmost columns with cumulative offsets', () => {
  const rows = renderBody(2);
  rows.forEach(row => {
    expect(row[0].classList.contains(FROZEN_CELL_CLASS)).toBe(true);
    expect(row[0].style.position).toBe('sticky');
    expect(parseFloat(row[0].style.left)).toBe(0);
    expect(row[0].classList.contains(FROZEN_EDGE_CLASS)).toBe(false);

    expect(row[1].classList.contains(FROZEN_CELL_CLASS)).toBe(true);
    expect(row[1].style.position).toBe('sticky');
    expect(parseFloat(row[1].style.left)).toBe(60);
    expect(row[1].classList.contains(FROZEN_EDGE_CLASS)).toBe(true);

    expect(row[2].classList.contains(FROZEN_CELL_CLASS)).toBe(false);
    expect(row[2].style.position).toBe('');
  });
});

test('pins every data row above the columns scrolling past it', () => {
  const rows = renderBody(2);
  expect(rows).toHaveLength(2);
  rows.forEach(row => {
    expect(row[0].classList.contains(FROZEN_CELL_CLASS)).toBe(true);
    expect(row[0].style.position).toBe('sticky');
    expect(row[0].style.zIndex).toBe(String(FROZEN_BODY_Z_INDEX));
    expect(row[1].classList.contains(FROZEN_CELL_CLASS)).toBe(true);
    expect(row[1].style.zIndex).toBe(String(FROZEN_BODY_Z_INDEX));

    // Unpinned columns must stay in the normal layer so nothing competes
    // with the frozen block for the same stacking level.
    expect(row[2].classList.contains(FROZEN_CELL_CLASS)).toBe(false);
    expect(row[2].style.position).toBe('');
    expect(row[2].style.zIndex).toBe('');
  });
});

test('places frozen header cells one layer above frozen body cells', () => {
  expect(FROZEN_HEADER_Z_INDEX).toBeGreaterThan(FROZEN_BODY_Z_INDEX);
  const section = (
    <thead>
      <tr>
        <th>A</th>
        <th>B</th>
      </tr>
    </thead>
  );
  const { container } = render(
    <table>{freezeTableSection(section, offsets, 1)}</table>,
  );
  const [first, second] = container.querySelectorAll('th');
  expect(first.style.position).toBe('sticky');
  expect(first.style.zIndex).toBe(String(FROZEN_HEADER_Z_INDEX));
  expect(second.style.zIndex).toBe('');
});

test('keeps an existing className and inline style on pinned cells', () => {
  const section = (
    <tbody>
      <tr>
        <td className="dt-metric" style={{ textAlign: 'right' }}>
          A
        </td>
        <td>B</td>
      </tr>
    </tbody>
  );
  const { container } = render(
    <table>{freezeTableSection(section, offsets, 1)}</table>,
  );
  const cell = container.querySelector('td')!;
  expect(cell.classList.contains('dt-metric')).toBe(true);
  expect(cell.classList.contains(FROZEN_CELL_CLASS)).toBe(true);
  expect(cell.style.textAlign).toBe('right');
  expect(cell.style.position).toBe('sticky');
});

test('walks fragment-wrapped grouped header rows and honours colSpan', () => {
  const section = (
    <thead>
      <>
        <tr>
          <th colSpan={2}>Group A</th>
          <th>Group B</th>
        </tr>
      </>
      <tr>
        <th>A1</th>
        <th>A2</th>
        <th>B1</th>
      </tr>
    </thead>
  );
  const { container } = render(
    <table>{freezeTableSection(section, offsets, 2)}</table>,
  );
  const [groupRow, leafRow] = Array.from(container.querySelectorAll('tr'));
  const groupCells = groupRow.querySelectorAll('th');
  expect(groupCells[0].classList.contains(FROZEN_CELL_CLASS)).toBe(true);
  expect(parseFloat(groupCells[0].style.left)).toBe(0);
  expect(groupCells[0].classList.contains(FROZEN_EDGE_CLASS)).toBe(true);
  expect(groupCells[1].classList.contains(FROZEN_CELL_CLASS)).toBe(false);

  const leafCells = leafRow.querySelectorAll('th');
  expect(leafCells[0].classList.contains(FROZEN_CELL_CLASS)).toBe(true);
  expect(leafCells[1].classList.contains(FROZEN_CELL_CLASS)).toBe(true);
  expect(parseFloat(leafCells[1].style.left)).toBe(60);
  expect(leafCells[2].classList.contains(FROZEN_CELL_CLASS)).toBe(false);
});

test('leaves a grouped header that crosses the freeze boundary unpinned', () => {
  const section = (
    <thead>
      <tr>
        <th colSpan={2}>Group A</th>
        <th>Group B</th>
      </tr>
    </thead>
  );
  const { container } = render(
    <table>{freezeTableSection(section, offsets, 1)}</table>,
  );
  container.querySelectorAll('th').forEach(cell => {
    expect(cell.classList.contains(FROZEN_CELL_CLASS)).toBe(false);
  });
});
