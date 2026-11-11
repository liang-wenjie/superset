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
  createLabelWidthMeasure,
  DATA_TABLE_FONT_SIZE,
  getDataTableGridLeft,
  getDataTableHeight,
  getDataTableMinLegendWidth,
  getGridLabelGutter,
  LABEL_SAFETY_MARGIN,
  LEGEND_GAP,
  LEGEND_MARKER_WIDTH,
  LEGEND_PADDING,
  MIN_GRID_LEFT,
  resolveDataTableGrid,
  type ColumnLayout,
} from './chartDataTableUtils';

type FakeCanvasContext = {
  font: string;
  measureText: (text: string) => { width: number };
};

let canvasSpy: jest.SpyInstance | undefined;

const mockCanvas = (context: FakeCanvasContext | null) => {
  canvasSpy?.mockRestore();
  const createElement = document.createElement.bind(document);
  canvasSpy = jest
    .spyOn(document, 'createElement')
    .mockImplementation(((tagName: string) =>
      tagName === 'canvas'
        ? ({ getContext: () => context } as unknown as HTMLCanvasElement)
        : createElement(tagName)) as unknown as typeof document.createElement);
};

// jsdom has no canvas implementation. Default to an unavailable context so
// the estimate path is the baseline; individual tests opt into real metrics.
beforeEach(() => mockCanvas(null));
afterEach(() => canvasSpy?.mockRestore());

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

const fakeContext = (): FakeCanvasContext => ({
  font: '',
  measureText: (text: string) => ({ width: text.length * 7 }),
});

test('getDataTableGridLeft measures names with the browser font metrics', () => {
  const context = fakeContext();
  mockCanvas(context);
  const rows = [makeRow('SUM(当月金额)'), makeRow('A')];
  const width = getDataTableGridLeft(rows, DATA_TABLE_FONT_SIZE, 660);

  expect(context.font).toContain(`${DATA_TABLE_FONT_SIZE}px`);
  // 9 characters at 7px plus the real DOM chrome and the safety margin.
  expect(width).toBe(
    63 +
      LEGEND_MARKER_WIDTH +
      LEGEND_GAP +
      LEGEND_PADDING +
      LABEL_SAFETY_MARGIN,
  );
});

test('getDataTableGridLeft falls back to a conservative estimate without canvas', () => {
  expect(createLabelWidthMeasure(DATA_TABLE_FONT_SIZE)).toBeUndefined();
  const rows = [makeRow('SUM(当月金额)')];
  const fallback = getDataTableGridLeft(rows, DATA_TABLE_FONT_SIZE, 660);
  mockCanvas(fakeContext());
  expect(getDataTableGridLeft(rows, DATA_TABLE_FONT_SIZE, 660)).toBeLessThan(
    fallback,
  );
});

test('the reserved width covers the measured label plus the real DOM chrome', () => {
  const context = fakeContext();
  mockCanvas(context);
  const rows = [makeRow('上年度数据'), makeRow('本年度利率')];
  const width = getDataTableGridLeft(rows, DATA_TABLE_FONT_SIZE, 660);
  const measured = Math.max(
    ...rows.map(row => context.measureText(row.name).width),
  );
  // marker + gap + padding + the 1px right border must not eat into the text.
  expect(width).toBeGreaterThanOrEqual(
    measured + LEGEND_MARKER_WIDTH + LEGEND_GAP + LEGEND_PADDING + 1,
  );
});

test('getDataTableGridLeft reserves no grid space for an empty table', () => {
  expect(getDataTableGridLeft([], DATA_TABLE_FONT_SIZE, 660)).toBe(0);
});

test('getDataTableMinLegendWidth accepts both key spellings and rejects junk', () => {
  expect(getDataTableMinLegendWidth({})).toBe(0);
  expect(getDataTableMinLegendWidth({ dataTableMinLegendWidth: 120 })).toBe(
    120,
  );
  expect(
    getDataTableMinLegendWidth({ data_table_min_legend_width: '96' }),
  ).toBe(96);
  expect(getDataTableMinLegendWidth({ dataTableMinLegendWidth: -10 })).toBe(0);
  expect(
    getDataTableMinLegendWidth({ dataTableMinLegendWidth: Number.NaN }),
  ).toBe(0);
  expect(getDataTableMinLegendWidth({ dataTableMinLegendWidth: 'nope' })).toBe(
    0,
  );
});

test('getDataTableGridLeft honours a configured minimum label column width', () => {
  const rows = [makeRow('SUM(当月金额)')];
  const automatic = getDataTableGridLeft(rows, DATA_TABLE_FONT_SIZE, 660);
  const widened = getDataTableGridLeft(rows, DATA_TABLE_FONT_SIZE, 660, 0, 220);
  expect(widened).toBe(220);
  expect(widened).toBeGreaterThan(automatic);
  // The plot edge is grid.left + gutter, so the minimum still holds after the
  // measured Y-axis label gutter has been subtracted.
  expect(getDataTableGridLeft(rows, DATA_TABLE_FONT_SIZE, 660, 35, 220)).toBe(
    185,
  );
});

test('getDataTableGridLeft never shrinks below the measured label width', () => {
  const rows = [makeRow('SUM(当月金额)')];
  const automatic = getDataTableGridLeft(rows, DATA_TABLE_FONT_SIZE, 660);
  expect(getDataTableGridLeft(rows, DATA_TABLE_FONT_SIZE, 660, 0, 20)).toBe(
    automatic,
  );
});

test('getDataTableGridLeft ignores unusable minimum widths', () => {
  const rows = [makeRow('SUM(当月金额)')];
  const automatic = getDataTableGridLeft(rows, DATA_TABLE_FONT_SIZE, 660);
  expect(
    getDataTableGridLeft(rows, DATA_TABLE_FONT_SIZE, 660, 0, Number.NaN),
  ).toBe(automatic);
  expect(getDataTableGridLeft(rows, DATA_TABLE_FONT_SIZE, 660, 0, -100)).toBe(
    automatic,
  );
});

test('getDataTableGridLeft still caps an oversized minimum width', () => {
  const rows = [makeRow('SUM(当月金额)')];
  expect(getDataTableGridLeft(rows, DATA_TABLE_FONT_SIZE, 300, 0, 500)).toBe(
    120,
  );
});

test('createLabelWidthMeasure ignores unusable canvas metrics', () => {
  const context = fakeContext();
  context.measureText = () => ({ width: Number.NaN });
  mockCanvas(context);
  const measure = createLabelWidthMeasure(DATA_TABLE_FONT_SIZE);
  expect(measure).toBeDefined();
  expect(measure?.('SUM(当月金额)', DATA_TABLE_FONT_SIZE)).toBeGreaterThan(0);
});

test('createLabelWidthMeasure survives a canvas that throws', () => {
  canvasSpy?.mockRestore();
  canvasSpy = jest.spyOn(document, 'createElement').mockImplementation((() => {
    throw new Error('canvas blocked');
  }) as unknown as typeof document.createElement);
  expect(createLabelWidthMeasure(DATA_TABLE_FONT_SIZE)).toBeUndefined();
});

test('compact margins still leave room for marker, gap and padding', () => {
  const width = getDataTableGridLeft(
    [makeRow('SUM(当月金额)')],
    DATA_TABLE_FONT_SIZE,
    660,
  );
  expect(width).toBeGreaterThan(
    LEGEND_MARKER_WIDTH + LEGEND_GAP + LEGEND_PADDING,
  );
  // ChartDataTable splits LEGEND_PADDING evenly between both sides.
  expect(LEGEND_PADDING % 2).toBe(0);
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
  expect(short).toBeGreaterThanOrEqual(MIN_GRID_LEFT);
});

test('getDataTableGridLeft caps very long names so the plot stays usable', () => {
  const rows = [makeRow('X'.repeat(200))];
  expect(getDataTableGridLeft(rows, DATA_TABLE_FONT_SIZE, 300)).toBe(120);
});

test('getDataTableGridLeft subtracts the Y-axis label gutter', () => {
  const rows = [makeRow('SUM(当月金额)')];
  const uncompensated = getDataTableGridLeft(rows, DATA_TABLE_FONT_SIZE, 600);
  const compensated = getDataTableGridLeft(rows, DATA_TABLE_FONT_SIZE, 600, 36);
  expect(uncompensated - compensated).toBe(36);
  // The plot edge ends up at grid.left + gutter, i.e. back at the width the
  // legend column actually needs, so the text is not clipped.
  expect(compensated + 36).toBe(uncompensated);
});

test('getDataTableGridLeft never shrinks below its floor or below zero', () => {
  const rows = [makeRow('A')];
  expect(getDataTableGridLeft(rows, DATA_TABLE_FONT_SIZE, 600, 1000)).toBe(
    MIN_GRID_LEFT,
  );
  expect(getDataTableGridLeft(rows, DATA_TABLE_FONT_SIZE, 600, -50)).toBe(
    getDataTableGridLeft(rows, DATA_TABLE_FONT_SIZE, 600),
  );
});

test('getGridLabelGutter measures the space ECharts reserves for Y labels', () => {
  expect(getGridLabelGutter(126, 91)).toBe(35);
  expect(getGridLabelGutter(40, 16)).toBe(24);
});

test('getGridLabelGutter falls back to 0 for unusable measurements', () => {
  // A layout fallback left of the configured grid.left, a missing boundary,
  // and non-finite values all keep the conservative column width.
  expect(getGridLabelGutter(10, 40)).toBe(0);
  expect(getGridLabelGutter(0, 0)).toBe(0);
  expect(getGridLabelGutter(Number.NaN, 20)).toBe(0);
  expect(getGridLabelGutter(120, Number.POSITIVE_INFINITY)).toBe(0);
});

test('resolveDataTableGrid raises grid.left without mutating the options', () => {
  const base = {
    grid: { containLabel: true, left: 20 },
  } as EChartsCoreOption;
  const { chartOptions, appliedGridLeft } = resolveDataTableGrid(base, 91);
  expect(appliedGridLeft).toBe(91);
  expect((chartOptions as { grid: { left: number } }).grid.left).toBe(91);
  expect(
    (chartOptions as { grid: { containLabel: boolean } }).grid.containLabel,
  ).toBe(true);
  expect(base).toEqual({ grid: { containLabel: true, left: 20 } });
});

test('resolveDataTableGrid keeps the chart padding when no extra room is needed', () => {
  const base = { grid: { left: 20 } } as EChartsCoreOption;
  const result = resolveDataTableGrid(base, 10);
  expect(result.appliedGridLeft).toBe(20);
  expect(result.chartOptions).toBe(base);
});

test('resolveDataTableGrid is a no-op for a disabled table or unusable grid', () => {
  const base = { grid: { left: 20 } } as EChartsCoreOption;
  expect(resolveDataTableGrid(base, 0)).toEqual({
    chartOptions: base,
    appliedGridLeft: 0,
  });
  const noGrid = {} as EChartsCoreOption;
  expect(resolveDataTableGrid(noGrid, 91).chartOptions).toBe(noGrid);
  const gridArray = { grid: [{ left: 20 }] } as unknown as EChartsCoreOption;
  expect(resolveDataTableGrid(gridArray, 91).chartOptions).toBe(gridArray);
});

test('the legend column shrinks to the label width after measuring the gutter', () => {
  const rows = [makeRow('SUM(当月金额)')];
  const width = 660;
  const base = { grid: { left: 20 } } as EChartsCoreOption;
  const labelWidth = getDataTableGridLeft(rows, DATA_TABLE_FONT_SIZE, width);
  const first = resolveDataTableGrid(base, labelWidth);
  // ECharts adds the Y-axis label gutter on top of grid.left.
  const gutter = getGridLabelGutter(
    first.appliedGridLeft + 35,
    first.appliedGridLeft,
  );
  expect(gutter).toBe(35);
  const compensated = getDataTableGridLeft(
    rows,
    DATA_TABLE_FONT_SIZE,
    width,
    gutter,
  );
  const second = resolveDataTableGrid(base, compensated);
  expect(second.appliedGridLeft).toBeLessThan(first.appliedGridLeft);
  // The plot edge ends up exactly at the width the series name needs, so the
  // text stays fully visible while the empty gutter disappears.
  expect(second.appliedGridLeft + gutter).toBe(labelWidth);
});

test('getDataTableHeight caps the table at the maximum visible rows', () => {
  expect(getDataTableHeight(0)).toBe(0);
  expect(getDataTableHeight(3)).toBe(3 * 28 + 1);
  expect(getDataTableHeight(20)).toBe(8 * 28 + 1);
});

test('buildDataTable keeps axis categories that have no series values', () => {
  const withAxis = {
    xAxis: { type: 'category', data: [202607, 202608, 202609] },
    series: [
      {
        name: '上月金额',
        type: 'bar',
        queryIndex: 0,
        data: [
          [202607, 6683.96],
          [202608, 7845.29],
        ],
      },
      {
        name: '当月金额',
        type: 'bar',
        queryIndex: 0,
        data: [[202607, 7100]],
      },
    ],
  } as unknown as EChartsCoreOption;

  const table = buildDataTable(withAxis, ',.2f');
  expect(table.columns.map(column => column.value)).toEqual([
    202607, 202608, 202609,
  ]);
  expect(table.rows[0].cells).toEqual(['6,683.96', '7,845.29', '']);
  expect(table.rows[1].cells).toEqual(['7,100.00', '', '']);
});

test('buildDataTable maps bare scalar series data onto axis categories', () => {
  const withAxis = {
    xAxis: { type: 'category', data: ['A', 'B', 'C'] },
    series: [
      {
        name: 'series',
        type: 'bar',
        queryIndex: 0,
        data: [1, null, 3],
      },
    ],
  } as unknown as EChartsCoreOption;

  const table = buildDataTable(withAxis, ',.2f');
  expect(table.columns.map(column => column.key)).toEqual(['A', 'B', 'C']);
  expect(table.rows[0].cells).toEqual(['1.00', '', '3.00']);
});

test('buildDataTable preserves the category axis order instead of sorting it', () => {
  const withAxis = {
    xAxis: { data: [202609, 202607, 202608] },
    series: [
      {
        name: 'series',
        type: 'bar',
        queryIndex: 0,
        data: [[202607, 1]],
      },
    ],
  } as unknown as EChartsCoreOption;

  const table = buildDataTable(withAxis, ',.2f');
  expect(table.columns.map(column => column.value)).toEqual([
    202609, 202607, 202608,
  ]);
  expect(table.rows[0].cells).toEqual(['', '1.00', '']);
});
