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
import type { EChartsCoreOption, EChartsType } from 'echarts/core';
import {
  areColumnLayoutsEqual,
  buildDataTable,
  computeColumnLayout,
  DATA_TABLE_FONT_SIZE,
  getDataTableGridLeft,
  getDataTableHeight,
  type ColumnLayout,
} from './chartDataTableUtils';

const options = {
  series: [
    {
      name: '上年度数据',
      type: 'bar',
      queryIndex: 0,
      yAxisIndex: 0,
      itemStyle: { color: 'series-blue' },
      data: [
        [2022, 1000],
        [2023, 2000],
      ],
    },
    {
      name: '本年度利率',
      type: 'line',
      queryIndex: 1,
      yAxisIndex: 1,
      lineStyle: { color: 'series-gray' },
      data: [
        [2022, 0.183],
        [2023, 0.327],
      ],
    },
  ],
} as unknown as EChartsCoreOption;

test('buildDataTable keeps one column per category and one row per series', () => {
  const table = buildDataTable(options, ',.2f', ',.1%');

  expect(table.columns.map(column => column.value)).toEqual([2022, 2023]);
  expect(table.rows).toHaveLength(2);
  expect(table.rows[0]).toMatchObject({
    name: '上年度数据',
    color: 'series-blue',
    isLine: false,
    cells: ['1,000.00', '2,000.00'],
  });
  expect(table.rows[1]).toMatchObject({
    name: '本年度利率',
    color: 'series-gray',
    isLine: true,
    cells: ['18.3%', '32.7%'],
  });
});

test('buildDataTable skips annotation and forecast helper series', () => {
  const baseSeries = (options as { series: unknown[] }).series;
  const withHelpers = {
    series: [
      ...baseSeries,
      {
        name: 'annotation',
        type: 'line',
        data: [[2022, 1]],
      },
      {
        name: '上年度数据__yhat',
        type: 'line',
        queryIndex: 0,
        data: [[2022, 1]],
      },
    ],
  } as unknown as EChartsCoreOption;

  const table = buildDataTable(withHelpers, ',.2f', ',.1%');
  expect(table.rows.map(row => row.name)).toEqual(['上年度数据', '本年度利率']);
});

test('buildDataTable leaves missing values empty instead of formatting null', () => {
  const withNull = {
    series: [
      {
        name: 'series',
        type: 'bar',
        queryIndex: 0,
        itemStyle: { color: 'series-black' },
        data: [
          [2022, null],
          [2023, 5],
        ],
      },
    ],
  } as unknown as EChartsCoreOption;

  expect(buildDataTable(withNull, ',.2f').rows[0].cells).toEqual(['', '5.00']);
});

const makeChart = (centers: Record<string, number>) =>
  ({
    getWidth: () => 400,
    getModel: () => ({
      getComponent: () => ({
        coordinateSystem: {
          getRect: () => ({ x: 60, width: 300 }),
        },
      }),
    }),
    convertToPixel: (_finder: unknown, value: string | number) =>
      centers[String(value)],
  }) as unknown as EChartsType;

test('computeColumnLayout aligns columns to X axis category centers', () => {
  const table = buildDataTable(options, ',.2f', ',.1%');
  const layout = computeColumnLayout(
    makeChart({ '2022': 135, '2023': 285 }),
    table.columns,
  );

  expect(layout.indexes).toEqual([0, 1]);
  expect(layout.boundaries).toEqual([60, 210, 360]);
});

test('computeColumnLayout keeps all columns when coordinates fall outside the grid', () => {
  const table = buildDataTable(options, ',.2f', ',.1%');
  // A category such as 202607 is a finite value but can be parsed as a 1970
  // timestamp on a time axis, landing far outside the grid. Columns must not
  // be dropped -- that would render a table with no data at all.
  const layout = computeColumnLayout(
    makeChart({ '2022': -50, '2023': 285 }),
    table.columns,
  );

  expect(layout.indexes).toEqual([0, 1]);
  expect(layout.boundaries).toEqual([60, 210, 360]);
});

test('computeColumnLayout falls back to container width when the grid is unavailable', () => {
  const table = buildDataTable(options, ',.2f', ',.1%');
  const chart = {
    getWidth: () => 0,
    getModel: () => {
      throw new Error('grid not ready');
    },
    convertToPixel: () => Number.NaN,
  } as unknown as EChartsType;

  const layout = computeColumnLayout(chart, table.columns, 400);
  expect(layout.indexes).toEqual([0, 1]);
  expect(layout.boundaries[0]).toBe(40);
  expect(layout.boundaries[2]).toBe(380);
});

test('areColumnLayoutsEqual tolerates sub-pixel geometry changes', () => {
  const base: ColumnLayout = { boundaries: [60, 210, 360], indexes: [0, 1] };
  expect(
    areColumnLayoutsEqual(base, {
      boundaries: [60, 210.2, 360],
      indexes: [0, 1],
    }),
  ).toBe(true);
  expect(
    areColumnLayoutsEqual(base, {
      boundaries: [60, 210, 360],
      indexes: [1],
    }),
  ).toBe(false);
});

test('buildDataTable handles ECharts data items with name and scalar value', () => {
  const withObjects = {
    series: [
      {
        name: 'series',
        type: 'bar',
        queryIndex: 0,
        itemStyle: { color: 'series-black' },
        data: [
          { name: 202607, value: 7.81 },
          { name: 202608, value: 9.5 },
        ],
      },
    ],
  } as unknown as EChartsCoreOption;

  const table = buildDataTable(withObjects, ',.2f');
  expect(table.columns.map(column => column.value)).toEqual([202607, 202608]);
  expect(table.rows[0].cells).toEqual(['7.81', '9.50']);
});

const makeRow = (name: string) => ({
  name,
  color: 'series-black',
  isLine: false,
  cells: [],
});

test('getDataTableGridLeft grows with the longest series name', () => {
  const short = getDataTableGridLeft([makeRow('A')], DATA_TABLE_FONT_SIZE, 600);
  const long = getDataTableGridLeft(
    [makeRow('SUM(当月金额), 净利润')],
    DATA_TABLE_FONT_SIZE,
    600,
  );

  expect(long).toBeGreaterThan(short);
  expect(long).toBeGreaterThan(150);
  expect(short).toBeGreaterThanOrEqual(24);
});

test('getDataTableGridLeft caps very long names so the plot stays usable', () => {
  const rows = [makeRow('X'.repeat(200))];
  expect(getDataTableGridLeft(rows, DATA_TABLE_FONT_SIZE, 300)).toBe(120);
});

test('getDataTableHeight caps the table at the maximum visible rows', () => {
  expect(getDataTableHeight(0)).toBe(0);
  expect(getDataTableHeight(3)).toBe(3 * 28 + 1);
  expect(getDataTableHeight(20)).toBe(8 * 28 + 1);
});
