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
import {
  flattenMetricSlots,
  isMetricMode,
  resolveMetricRows,
  SLOTS_PER_ROW,
} from './metricRows';

jest.mock('@apache-superset/core/translation', () => ({
  t: (text: string) => text,
}));

test('synthesizes the legacy MoM/YoY pair as row 1', () => {
  const rows = resolveMetricRows({});
  expect(rows).toHaveLength(1);
  expect(rows[0].slots).toHaveLength(SLOTS_PER_ROW);
  expect(rows[0].slots[0]).toMatchObject({
    show: true,
    label: 'MoM',
    mode: 'time_shift',
    offset: '1 month ago',
    implicitOffset: true,
  });
  expect(rows[0].slots[1]).toMatchObject({
    show: true,
    label: 'YoY',
    mode: 'time_shift',
    offset: '1 year ago',
    implicitOffset: true,
  });
});

test('reads legacy controls written in snake_case', () => {
  const rows = resolveMetricRows({
    show_comparison1: false,
    comparison1_label: '环比',
    comparison1_offset: '2 months ago',
    comparison1_mode: 'metric',
    comparison1_column: 'prev_sales',
    comparison1_percent_difference_format: ',.1%',
    comparison1_left: 30,
    show_comparison2: true,
    comparison2_label: '同比',
    comparison2_offset: '3 years ago',
  });
  expect(rows[0].slots[0]).toMatchObject({
    show: false,
    label: '环比',
    mode: 'metric',
    offset: '2 months ago',
    column: 'prev_sales',
    numberFormat: ',.1%',
    left: 30,
    implicitOffset: false,
  });
  expect(rows[0].slots[1]).toMatchObject({
    show: true,
    label: '同比',
    mode: 'time_shift',
    offset: '3 years ago',
    implicitOffset: false,
  });
});

test('reads the same legacy controls written in camelCase', () => {
  const rows = resolveMetricRows({
    showComparison2: false,
    comparison2Label: 'YoY',
    comparison2Mode: 'metric',
    comparison2Column: { expressionType: 'SQL', sqlExpression: 'SUM(x)' },
  });
  expect(rows[0].slots[1]).toMatchObject({
    show: false,
    label: 'YoY',
    mode: 'metric',
    column: { expressionType: 'SQL', sqlExpression: 'SUM(x)' },
  });
});

test('an unset legacy mode with a column falls back to metric mode', () => {
  const rows = resolveMetricRows({ comparison1_column: 'prev_sales' });
  expect(rows[0].slots[0].mode).toBe('metric');
  expect(isMetricMode(rows[0].slots[0].mode, rows[0].slots[0].column)).toBe(
    true,
  );
});

test('an explicit metric_rows list wins over the legacy controls and pads to two slots', () => {
  const rows = resolveMetricRows({
    show_comparison1: false,
    metric_rows: [
      {
        id: 'row_a',
        slots: [
          { label: 'Headcount', mode: 'metric', column: 'headcount' },
          { label: 'Cost', mode: 'metric', column: 'cost' },
        ],
      },
      { id: 'row_b', slots: [{ label: 'Only one' }] },
    ],
  });
  expect(rows).toHaveLength(2);
  expect(rows[0].id).toBe('row_a');
  expect(rows[0].slots[0].label).toBe('Headcount');
  expect(rows[1].slots).toHaveLength(SLOTS_PER_ROW);
  expect(rows[1].slots[1]).toEqual({ mode: undefined });
  expect(flattenMetricSlots(rows).map(slot => slot.label)).toEqual([
    'Headcount',
    'Cost',
    'Only one',
    undefined,
  ]);
});

test('an explicitly saved empty list stays empty', () => {
  expect(resolveMetricRows({ metric_rows: [] })).toEqual([]);
  expect(resolveMetricRows({ metricRows: [] })).toEqual([]);
});

test('camelCase metricRows is accepted and invalid modes are dropped', () => {
  const rows = resolveMetricRows({
    metricRows: [{ slots: [{ mode: 'unknown' }, { mode: 'time_shift' }] }],
  });
  expect(rows[0].slots[0].mode).toBeUndefined();
  expect(rows[0].slots[1].mode).toBe('time_shift');
});
