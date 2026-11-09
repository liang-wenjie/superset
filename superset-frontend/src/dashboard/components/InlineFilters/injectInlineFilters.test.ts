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
import {
  buildInlineAdhocFilter,
  getInlineFilterDependencies,
  getInlineFilterType,
  isInlineFilterInput,
  isInlineFilterInverse,
  isInlineFilterMulti,
} from './types';
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

test('a default value is applied when the filter has never been touched', () => {
  const withDefault: InlineFilterConfig = { ...single, defaultValue: 'A' };
  const result = injectInlineFilters(makeFormData(), [withDefault], {});
  expect(injectedFilters(result)[0]).toMatchObject({
    subject: 'category',
    operator: '==',
    comparator: 'A',
  });
});

test('an explicit clear (null) suppresses the default value', () => {
  const withDefault: InlineFilterConfig = { ...single, defaultValue: 'A' };
  const result = injectInlineFilters(makeFormData(), [withDefault], {
    f1: null,
  });
  expect(injectedFilters(result)).toHaveLength(0);
  expect(result.adhoc_filters).toHaveLength(1);
});

test('a required filter keeps its default even after a clear', () => {
  const required: InlineFilterConfig = {
    ...single,
    required: true,
    defaultValue: 'A',
  };
  const result = injectInlineFilters(makeFormData(), [required], { f1: null });
  expect(injectedFilters(result)[0]).toMatchObject({ comparator: 'A' });

  // The same state on an optional filter must stay cleared.
  expect(
    injectedFilters(
      injectInlineFilters(makeFormData(), [{ ...single, defaultValue: 'A' }], {
        f1: null,
      }),
    ),
  ).toHaveLength(0);
});

test('a scalar default on a multi filter becomes a one-item IN clause', () => {
  const result = injectInlineFilters(
    makeFormData(),
    [{ ...multi, defaultValue: 'A' }],
    {},
  );
  expect(injectedFilters(result)[0]).toMatchObject({
    operator: 'IN',
    comparator: ['A'],
  });
});

test('an array default on a single filter uses only the first value', () => {
  const result = injectInlineFilters(
    makeFormData(),
    [{ ...single, defaultValue: ['A', 'B'] }],
    {},
  );
  expect(injectedFilters(result)[0]).toMatchObject({
    operator: '==',
    comparator: 'A',
  });
});

test('an empty array default never produces an IN () clause', () => {
  const result = injectInlineFilters(
    makeFormData(),
    [{ ...multi, defaultValue: [], required: true }],
    {},
  );
  expect(injectedFilters(result)).toHaveLength(0);
});

test('a dynamic first-value default is resolved by the bar, not by injection', () => {
  const dynamic: InlineFilterConfig = {
    ...single,
    defaultToFirstItem: true,
    defaultValue: 'A', // stale value must be ignored, as in dashboard filters
  };
  // The injection layer has no option list; it waits for the bar to write the
  // first value into the selection.
  expect(
    injectedFilters(injectInlineFilters(makeFormData(), [dynamic], {})),
  ).toHaveLength(0);
  const afterBar = injectInlineFilters(makeFormData(), [dynamic], { f1: 'B' });
  expect(injectedFilters(afterBar)[0]).toMatchObject({ comparator: 'B' });
});

test('a required first-value filter does not fall back to a concrete default', () => {
  const dynamic: InlineFilterConfig = {
    ...single,
    required: true,
    defaultToFirstItem: true,
    defaultValue: 'A',
  };
  expect(
    injectedFilters(
      injectInlineFilters(makeFormData(), [dynamic], { f1: null }),
    ),
  ).toHaveLength(0);
});

test('inverse selection injects a NOT IN clause for multiple values', () => {
  const inverse: InlineFilterConfig = {
    ...multi,
    inverseSelection: true,
  };
  const result = injectInlineFilters(makeFormData(), [inverse], {
    f2: ['A', 'B'],
  });
  expect(injectedFilters(result)[0]).toMatchObject({
    subject: 'category',
    operator: 'NOT IN',
    comparator: ['A', 'B'],
  });
  expect(buildInlineAdhocFilter(inverse, ['A']).operator).toBe('NOT IN');
});

test('inverse selection injects a != clause for a single value', () => {
  const inverse: InlineFilterConfig = { ...single, inverseSelection: true };
  const result = injectInlineFilters(makeFormData(), [inverse], { f1: 'A' });
  expect(injectedFilters(result)[0]).toMatchObject({
    operator: '!=',
    comparator: 'A',
  });
  expect(buildInlineAdhocFilter(inverse, 'A').operator).toBe('!=');
});

test('inverse selection still respects an explicit clear', () => {
  const inverse: InlineFilterConfig = {
    ...single,
    inverseSelection: true,
    defaultValue: 'A',
  };
  expect(
    injectedFilters(
      injectInlineFilters(makeFormData(), [inverse], { f1: null }),
    ),
  ).toHaveLength(0);
});

test('dependencies default to every sibling and can be narrowed or disabled', () => {
  const all: InlineFilterConfig[] = [
    { id: 'a', column: 'region' },
    { id: 'b', column: 'country' },
    { id: 'c', column: 'city' },
  ];
  expect(getInlineFilterDependencies(all[0], all).map(f => f.id)).toEqual([
    'b',
    'c',
  ]);
  expect(
    getInlineFilterDependencies({ ...all[0], dependsOn: ['c'] }, all).map(
      f => f.id,
    ),
  ).toEqual(['c']);
  expect(
    getInlineFilterDependencies({ ...all[0], dependsOn: [] }, all),
  ).toEqual([]);
  // A stale id in the config must never widen the dependency list.
  expect(
    getInlineFilterDependencies({ ...all[0], dependsOn: ['missing'] }, all),
  ).toEqual([]);
});

test('filterType is the source of truth, with the legacy multi flag as fallback', () => {
  expect(getInlineFilterType(single)).toBe('single');
  expect(getInlineFilterType(multi)).toBe('multiple');
  // Exclusion is an independent switch; it no longer changes the type.
  expect(
    getInlineFilterType({ id: 'f', column: 'c', inverseSelection: true }),
  ).toBe('single');
  expect(
    getInlineFilterType({
      id: 'f',
      column: 'c',
      filterType: 'input',
      multi: true,
      inverseSelection: true,
    }),
  ).toBe('input');
  expect(
    isInlineFilterMulti({ id: 'f', column: 'c', filterType: 'input' }),
  ).toBe(false);
  expect(
    isInlineFilterInput({ id: 'f', column: 'c', filterType: 'input' }),
  ).toBe(true);
  expect(
    isInlineFilterInverse({
      id: 'f',
      column: 'c',
      filterType: 'multiple',
      inverseSelection: true,
    }),
  ).toBe(true);
  expect(
    isInlineFilterInverse({ id: 'f', column: 'c', filterType: 'multiple' }),
  ).toBe(false);
});

test('the inverse switch injects NOT IN for a multi filter', () => {
  const inverse: InlineFilterConfig = {
    ...single,
    filterType: 'multiple',
    inverseSelection: true,
    defaultValue: ['A', 'B'],
  };
  const result = injectInlineFilters(makeFormData(), [inverse], {});
  expect(injectedFilters(result)[0]).toMatchObject({
    operator: 'NOT IN',
    comparator: ['A', 'B'],
  });
});

test('the inverse switch negates a fuzzy text input', () => {
  const inverse: InlineFilterConfig = {
    ...single,
    filterType: 'input',
    matchMode: 'contains',
    inverseSelection: true,
  };
  expect(buildInlineAdhocFilter(inverse, 'bei')).toMatchObject({
    operator: 'NOT ILIKE',
    comparator: '%bei%',
  });
});

test('a multiple filter type ignores a stale single-value selection', () => {
  const config: InlineFilterConfig = {
    ...single,
    filterType: 'multiple',
    multi: false,
  };
  expect(
    injectedFilters(
      injectInlineFilters(makeFormData(), [config], { f1: 'A' }),
    )[0],
  ).toMatchObject({ operator: 'IN', comparator: ['A'] });
});

test('a text-input filter with exact matching injects equality', () => {
  const config: InlineFilterConfig = { ...single, filterType: 'input' };
  const result = injectInlineFilters(makeFormData(), [config], {
    f1: 'Beijing',
  });
  expect(injectedFilters(result)[0]).toMatchObject({
    operator: '==',
    comparator: 'Beijing',
  });
  expect(buildInlineAdhocFilter(config, 'Beijing').operator).toBe('==');
});

test('a text-input filter with fuzzy matching injects ILIKE with wildcards', () => {
  const config: InlineFilterConfig = {
    ...single,
    filterType: 'input',
    matchMode: 'contains',
  };
  const result = injectInlineFilters(makeFormData(), [config], { f1: 'bei' });
  expect(injectedFilters(result)[0]).toMatchObject({
    subject: 'category',
    operator: 'ILIKE',
    comparator: '%bei%',
  });
});

test('a fuzzy text input still respects an explicit clear', () => {
  const config: InlineFilterConfig = {
    ...single,
    filterType: 'input',
    matchMode: 'contains',
    defaultValue: 'A',
  };
  expect(
    injectedFilters(
      injectInlineFilters(makeFormData(), [config], { f1: null }),
    ),
  ).toHaveLength(0);
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
