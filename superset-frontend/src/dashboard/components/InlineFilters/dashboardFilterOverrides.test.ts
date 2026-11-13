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
  getDashboardFilterOverrides,
  hasDashboardFilterOverride,
} from './dashboardFilterOverrides';

test('mirrors a native select filter value as a string', () => {
  expect(
    getDashboardFilterOverrides([
      { col: '报告月份', op: 'IN', val: [202606] },
      { col: '年份', op: '==', val: 2026 },
    ]),
  ).toEqual({
    报告月份: { value: '202606' },
    年份: { value: '2026' },
  });
});

test('keeps every value of a multi-select dashboard filter', () => {
  expect(
    getDashboardFilterOverrides([
      { col: 'region', op: 'IN', val: ['North', 'South'] },
    ]),
  ).toEqual({ region: { value: ['North', 'South'] } });
});

test('a valueTransform clause still owns the column but has no display value', () => {
  const overrides = getDashboardFilterOverrides([
    {
      col: '报告月份',
      op: 'IN',
      val: [202606],
      valueTransform: '报告月份+100',
    },
  ]);
  expect(overrides).toEqual({ 报告月份: {} });
  expect(hasDashboardFilterOverride(overrides, '报告月份')).toBe(true);
});

test('exclusion, range and SQL clauses do not disable an inline filter', () => {
  expect(
    getDashboardFilterOverrides([
      { col: 'a', op: 'NOT IN', val: ['x'] },
      { col: 'b', op: '!=', val: 'y' },
      { col: 'c', op: 'ILIKE', val: '%z%' },
      { expressionType: 'SQL', sqlExpression: '1 = 1' },
      { col: { label: 'd' }, op: 'IN', val: ['z'] },
    ]),
  ).toEqual({});
});

test('an unparseable value still marks the column as dashboard-controlled', () => {
  const overrides = getDashboardFilterOverrides([
    { col: 'a', op: 'IN', val: [{ custom: true }] },
  ]);
  expect(overrides).toEqual({ a: {} });
});

test('ignores missing or malformed filter lists', () => {
  expect(getDashboardFilterOverrides(undefined)).toEqual({});
  expect(getDashboardFilterOverrides([])).toEqual({});
  expect(hasDashboardFilterOverride({}, 'toString')).toBe(false);
});
