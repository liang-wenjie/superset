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
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { supersetTheme, ThemeProvider } from '@apache-superset/core/theme';
import ChartDataTable from './ChartDataTable';
import type { ColumnLayout, DataTable } from './chartDataTableUtils';

const data: DataTable = {
  columns: [
    { key: '202607', value: 202607 },
    { key: '202608', value: 202608 },
    { key: '202609', value: 202609 },
  ],
  // Mirrors the reported screenshot: the last category has no values at all
  // and the middle one is empty on the second row.
  rows: [
    {
      name: '上月金额',
      isLine: false,
      cells: ['6,683.96', '7,845.29', ''],
    },
    {
      name: '当月金额',
      isLine: false,
      cells: ['7,100.00', '', ''],
    },
  ],
};

const layout: ColumnLayout = {
  boundaries: [120, 240, 360, 480],
  indexes: [0, 1, 2],
};

const renderTable = (tableData: DataTable = data, tableLayout = layout) =>
  render(
    <ThemeProvider theme={supersetTheme}>
      <ChartDataTable width={600} data={tableData} layout={tableLayout} />
    </ThemeProvider>,
  );

const getSeparators = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll<HTMLElement>(
      '[data-test="data-table-column-separator"]',
    ),
  );

test('draws a separator for every column boundary, including empty ones', () => {
  const { container } = renderTable();
  const separators = getSeparators(container);

  // Four boundaries (legend + three value columns) on each of the two rows.
  expect(separators).toHaveLength(8);
  separators.forEach(separator => {
    expect(separator.style.position).toBe('absolute');
    expect(separator.style.width).toBe('1px');
    expect(separator.style.backgroundColor).not.toBe('');
    expect(separator.style.pointerEvents).toBe('none');
  });
  expect(separators.slice(0, 4).map(line => line.style.left)).toEqual([
    '119px',
    '239px',
    '359px',
    '479px',
  ]);

  // The last category has no values in either row but still gets its line.
  const cells = container.querySelectorAll<HTMLElement>(
    '[data-test="data-table-value-cell"]',
  );
  expect(cells).toHaveLength(6);
  expect(cells[2].textContent).toBe('');
  expect(cells[5].textContent).toBe('');
});

test('separators do not depend on a value cell being rendered or having width', () => {
  const sparseData: DataTable = {
    columns: data.columns,
    rows: [
      {
        name: '上月金额',
        isLine: false,
        // No entries at all for the last two categories.
        cells: ['6,683.96'],
      },
    ],
  };
  // The second column collapsed to zero width; its boundary still has a line.
  const collapsedLayout: ColumnLayout = {
    boundaries: [120, 240, 240, 480],
    indexes: [0, 1, 2],
  };
  const { container } = renderTable(sparseData, collapsedLayout);
  const separators = getSeparators(container);

  expect(separators).toHaveLength(4);
  expect(separators.map(line => line.style.left)).toEqual([
    '119px',
    '239px',
    '239px',
    '479px',
  ]);
});

test('separators stay inside the measured column widths', () => {
  renderTable();

  // Cells leave their borders to the overlay, so the flex widths still line
  // up with the X axis category centers exactly.
  const firstValue = screen.getByText('6,683.96');
  expect(firstValue.style.width).toBe('120px');
  expect(firstValue.style.boxSizing).toBe('border-box');
  expect(firstValue.style.borderRightWidth).toBe('');
  const nameCell = screen.getByText('上月金额').parentElement;
  expect(nameCell?.style.borderRightWidth).toBe('');
});
