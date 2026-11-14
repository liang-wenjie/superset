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
import { QueryFormData } from '@superset-ui/core';
import {
  DISPLAY_SUFFIXES,
  QUERY_SUFFIXES,
  displayKey,
  getEnabledQueryCount,
  queryKey,
  retainQuerySuffix,
  stripQuerySuffixes,
} from '../../src/MixedTimeseries/queryConfig';

const formData = (overrides: Record<string, unknown>): QueryFormData =>
  ({
    datasource: '1__table',
    viz_type: 'mixed_timeseries',
    ...overrides,
  }) as unknown as QueryFormData;

test('queries A and B always run, C and D are gated by their own metrics', () => {
  expect(getEnabledQueryCount(formData({}))).toBe(2);
  expect(getEnabledQueryCount(formData({ metrics_c: ['count'] }))).toBe(3);
  expect(
    getEnabledQueryCount(
      formData({ metrics_c: ['count'], metrics_d: ['sum(price)'] }),
    ),
  ).toBe(4);
  // D without C would leave a hole in the suffix -> queriesData index mapping.
  expect(getEnabledQueryCount(formData({ metrics_d: ['sum(price)'] }))).toBe(2);
});

test('suffix helpers cover both form_data naming conventions', () => {
  expect(QUERY_SUFFIXES).toEqual(['', '_b', '_c', '_d']);
  expect(DISPLAY_SUFFIXES).toEqual(['', 'B', 'C', 'D']);
  expect(queryKey('groupby', 2)).toBe('groupby_c');
  expect(displayKey('seriesType', 3)).toBe('seriesTypeD');
});

test('stripQuerySuffixes removes every query-specific key from Query A', () => {
  const result = stripQuerySuffixes(
    formData({
      metrics: ['sum(sales)'],
      metrics_b: ['count'],
      metrics_c: ['avg(price)'],
      adhoc_filters_d: [],
      color_scheme: 'bnbColors',
    }),
  );
  expect(result).toEqual({
    datasource: '1__table',
    viz_type: 'mixed_timeseries',
    metrics: ['sum(sales)'],
    color_scheme: 'bnbColors',
  });
});

test('retainQuerySuffix promotes only its own suffix', () => {
  const result = retainQuerySuffix(
    formData({
      metrics: ['sum(sales)'],
      metrics_b: ['count'],
      metrics_c: ['avg(price)'],
      groupby: ['category'],
      groupby_c: ['region'],
      adhoc_filters_c: [],
    }),
    2,
  );
  expect(result.metrics).toEqual(['avg(price)']);
  expect(result.groupby).toEqual(['region']);
  // Other queries' leftovers must not leak into the shared query builder.
  expect(result).not.toHaveProperty('metrics_b');
  expect(result).not.toHaveProperty('metrics_c');
  expect(result).not.toHaveProperty('groupby_c');
  expect(result).not.toHaveProperty('adhoc_filters_c');
});
