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
import { getInlineDashboardFilters } from './getInlineDashboardFilters';

const filters = [
  { col: '年份', op: 'IN', val: ['2026'] },
  { col: '年份', op: 'IN', val: ['2026'], valueTransform: '{col}+1' },
];

test('returns runtime filters injected as extra_form_data', () => {
  expect(
    getInlineDashboardFilters({
      adhoc_filters: [{ clause: 'WHERE' }],
      extra_form_data: { filters },
    }),
  ).toEqual(filters);
});

test('also accepts the camelCase top-level form data key', () => {
  expect(getInlineDashboardFilters({ extraFormData: { filters } })).toEqual(
    filters,
  );
});

test('ignores missing or malformed filter lists', () => {
  expect(getInlineDashboardFilters(undefined)).toEqual([]);
  expect(getInlineDashboardFilters({})).toEqual([]);
  expect(
    getInlineDashboardFilters({ extra_form_data: { filters: 'not-an-array' } }),
  ).toEqual([]);
});

test('never falls back to the chart saved adhoc_filters', () => {
  expect(
    getInlineDashboardFilters({
      adhoc_filters: [{ expressionType: 'SQL', sqlExpression: '1 = 1' }],
    }),
  ).toEqual([]);
});
