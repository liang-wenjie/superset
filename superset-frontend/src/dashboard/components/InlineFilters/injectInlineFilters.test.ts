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
import type { QueryFormData } from '@superset-ui/core';
import { injectInlineFilters } from './injectInlineFilters';
import { buildInlineAdhocFilter } from './types';
import type { InlineFilterConfig } from './types';

const single: InlineFilterConfig = { id: 'f1', column: 'category' };
const multi: InlineFilterConfig = {
  id: 'f2',
  column: 'category',
  multi: true,
};

const makeFormData = (extra: Record<string, unknown> = {}) =>
  ({
    datasource: '1__table',
    viz_type: 'table',
    adhoc_filters: [
      {
        clause: 'WHERE',
        expressionType: 'SIMPLE',
        subject: 'region',
        operator: '==',
        comparator: 'CN',
      },
    ],
    ...extra,
  }) as unknown as QueryFormData;

type Filters = Record<string, unknown>[];

const injectedFilters = (formData: QueryFormData): Filters =>
  ((formData.adhoc_filters ?? []) as unknown as Filters).filter(
    f => f.isExtra === true,
  );

const queryB = (formData: QueryFormData): Filters =>
  (formData as unknown as Record<string, Filters>).adhoc_filters_b;

test('a single selection injects an equality WHERE clause', () => {
  const result = injectInlineFilters(makeFormData(), [single], { f1: 'A' });
  const injected = injectedFilters(result);
  expect(injected).toHaveLength(1);
  expect(injected[0]).toMatchObject({
    clause: 'WHERE',
    expressionType: 'SIMPLE',
    subject: 'category',
    operator: '==',
    comparator: 'A',
    isExtra: true,
    filterOptionName: 'inline_f1',
  });
  expect(buildInlineAdhocFilter(single, 'A').operator).toBe('==');
});

test('a multi selection injects an IN clause with every value', () => {
  const result = injectInlineFilters(makeFormData(), [multi], {
    f2: ['A', 'B', 'C'],
  });
  const injected = injectedFilters(result);
  expect(injected).toHaveLength(1);
  expect(injected[0]).toMatchObject({
    subject: 'category',
    operator: 'IN',
    comparator: ['A', 'B', 'C'],
    filterOptionName: 'inline_f2',
  });
  expect(buildInlineAdhocFilter(multi, ['A', 'B']).comparator).toEqual([
    'A',
    'B',
  ]);
});

test('an empty multi selection injects nothing', () => {
  const result = injectInlineFilters(makeFormData(), [multi], { f2: [] });
  expect(injectedFilters(result)).toHaveLength(0);
  expect(result.adhoc_filters).toHaveLength(1);
});

test('array default values are injected when nothing is selected yet', () => {
  const withDefault: InlineFilterConfig = {
    ...multi,
    defaultValue: ['A', 'B'],
  };
  const result = injectInlineFilters(makeFormData(), [withDefault], {});
  expect(injectedFilters(result)[0]).toMatchObject({
    operator: 'IN',
    comparator: ['A', 'B'],
  });
});

test('re-injecting strips the previous inline clause and covers every query section', () => {
  const first = injectInlineFilters(
    makeFormData({ adhoc_filters_b: [] }),
    [single],
    { f1: 'A' },
  );
  expect(first.adhoc_filters).toHaveLength(2);
  expect(queryB(first)).toHaveLength(1);

  const second = injectInlineFilters(first, [multi], { f2: ['A', 'B'] });
  expect(injectedFilters(second)).toHaveLength(1);
  expect(injectedFilters(second)[0].operator).toBe('IN');
  expect(queryB(second)).toHaveLength(1);
});
