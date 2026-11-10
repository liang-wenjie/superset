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
import { selectBigNumberReferenceTextsByChartId } from './bigNumberSizing';

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

test('returns no reference text when uniform sizing is disabled', () => {
  const result = selectBigNumberReferenceTextsByChartId(
    makeState({
      enabled: false,
      charts: { 101: kpiChart(3808637.34) },
      layout: { c1: layoutItem(101, 4, 3) },
    }),
  );
  expect(result.size).toBe(0);
});

test('shares one reference list across all KPI tiles', () => {
  const result = selectBigNumberReferenceTextsByChartId(
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

  const group = result.get('101');
  expect(group).toContain('3,808,637.34');
  expect(group).toContain('3808637.34');
  expect(group).toContain('7.81');
  // The whole dashboard resolves against the very same list, so a long
  // number shrinks every tile rather than just its own tile.
  expect(result.get('102')).toBe(group);
});

test('shares the longest number across tiles with different grid sizes', () => {
  // Reproduces dashboard 5: a KPI nested directly under a COLUMN reports
  // meta.width=1 while an identically wide KPI nested one ROW deeper reports
  // width=2. Grouping by grid area used to leave those width=1 tiles with
  // only their own short numbers and a visibly larger font.
  const result = selectBigNumberReferenceTextsByChartId(
    makeState({
      charts: {
        101: kpiChart(3808637.34),
        102: kpiChart(7.81),
        103: kpiChart(9457.13),
      },
      layout: {
        c1: layoutItem(101, 2, 23),
        c2: layoutItem(102, 1, 23),
        c3: layoutItem(103, 1, 23),
      },
    }),
  );

  expect(result.get('102')).toBe(result.get('101'));
  expect(result.get('103')).toBe(result.get('101'));
  expect(result.get('102')).toContain('3,808,637.34');
  expect(result.get('103')).toContain('3,808,637.34');
});

test('ignores charts that are not Big Number with YoY & MoM', () => {
  const tableChart = {
    form_data: { viz_type: 'table' },
    queriesResponse: [{ data: [{ 'SUM(sales)': 123456789.12345 }] }],
  };
  const result = selectBigNumberReferenceTextsByChartId(
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

  expect(result.get('101')).toContain('7.81');
  expect(result.has('103')).toBe(false);
});

test('prefers a metric level d3format over the chart number format', () => {
  const result = selectBigNumberReferenceTextsByChartId(
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

  expect(result.get('101')).toContain('3,808,637');
  expect(result.get('101')).not.toContain('3,808,637.34');
  // The raw value is still a candidate, so the plugin can pick the widest.
  expect(result.get('101')).toContain('3808637.34');
});

test('skips KPI charts without a loaded query result', () => {
  const result = selectBigNumberReferenceTextsByChartId(
    makeState({
      charts: {
        101: kpiChart(7.81),
        102: { form_data: kpiChart(1).form_data, queriesResponse: [] },
      },
      layout: {
        c1: layoutItem(101, 4, 3),
        c2: layoutItem(102, 4, 3),
      },
    }),
  );

  // The tile is still part of the group: it must receive the group list so it
  // uses the same font size while its own data is loading.
  expect(result.get('102')).toEqual(result.get('101'));
  expect(result.get('101')).toContain('7.81');
});

test('skips charts that are not placed in the dashboard layout', () => {
  const result = selectBigNumberReferenceTextsByChartId(
    makeState({
      charts: { 101: kpiChart(7.81) },
    }),
  );

  expect(result.size).toBe(0);
});
