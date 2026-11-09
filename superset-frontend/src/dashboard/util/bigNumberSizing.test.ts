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
import type { RootState } from 'src/dashboard/types';
import { selectBigNumberFitCharsByChartId } from './bigNumberSizing';

type StateParts = {
  enabled?: boolean;
  charts?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  datasources?: Record<string, unknown>;
};

const kpiChart = (value: number, format = ',.2f') => ({
  form_data: {
    viz_type: 'big_number_yoy_mom',
    metric: 'SUM(sales)',
    datasource: '1__table',
    y_axis_format: format,
  },
  queriesResponse: [{ data: [{ 'SUM(sales)': value }] }],
});

const layoutItem = (chartId: number, width: number, height: number) => ({
  type: 'CHART',
  meta: { chartId, width, height },
});

const makeState = ({
  enabled = true,
  charts = {},
  layout = {},
  datasources = {},
}: StateParts) =>
  ({
    dashboardInfo: { metadata: { uniform_big_number_font_size: enabled } },
    charts,
    dashboardLayout: { present: layout },
    datasources,
  }) as unknown as RootState;

test('returns no fit lengths when uniform sizing is disabled', () => {
  const result = selectBigNumberFitCharsByChartId(
    makeState({ enabled: false, charts: { 101: kpiChart(3808637.34) } }),
  );
  expect(result.size).toBe(0);
});

test('shares the longest formatted number across tiles with the same area', () => {
  const result = selectBigNumberFitCharsByChartId(
    makeState({
      charts: {
        101: kpiChart(3808637.34),
        102: kpiChart(7.81),
      },
      layout: {
        c1: layoutItem(101, 4, 3),
        c2: layoutItem(102, 4, 3),
      },
    }),
  );

  // "3,808,637.34" is 12 characters; the short value gets the same reference.
  expect(result.get('101')).toBe(12);
  expect(result.get('102')).toBe(12);
});

test('keeps a separate reference for tiles with a different area', () => {
  const result = selectBigNumberFitCharsByChartId(
    makeState({
      charts: {
        101: kpiChart(3808637.34),
        104: kpiChart(7.81, ',.0f'),
      },
      layout: {
        c1: layoutItem(101, 4, 3),
        c4: layoutItem(104, 8, 3),
      },
    }),
  );

  expect(result.get('101')).toBe(12);
  // The raw value "7.81" is longer than the ",.0f" output "8".
  expect(result.get('104')).toBe(4);
});

test('ignores charts that are not Big Number with YoY & MoM', () => {
  const tableChart = {
    form_data: { viz_type: 'table' },
    queriesResponse: [{ data: [{ 'SUM(sales)': 123456789.12345 }] }],
  };
  const result = selectBigNumberFitCharsByChartId(
    makeState({
      charts: {
        101: kpiChart(7.81),
        103: tableChart,
      },
      layout: {
        c1: layoutItem(101, 4, 3),
        c3: layoutItem(103, 4, 3),
      },
    }),
  );

  expect(result.get('101')).toBe(4);
  expect(result.has('103')).toBe(false);
});

test('prefers a metric level d3format over the chart number format', () => {
  const result = selectBigNumberFitCharsByChartId(
    makeState({
      charts: { 101: kpiChart(3808637.34, ',.2f') },
      layout: { c1: layoutItem(101, 4, 3) },
      datasources: {
        '1__table': {
          metrics: [{ metric_name: 'SUM(sales)', d3format: ',.0f' }],
        },
      },
    }),
  );

  // "3,808,637" is 9 characters, but the raw value is 10 characters long.
  expect(result.get('101')).toBe(10);
});
