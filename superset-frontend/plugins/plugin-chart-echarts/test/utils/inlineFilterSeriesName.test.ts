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
  getDimensionColumnNames,
  getHiddenDimensionLabels,
  getHiddenDimensionLabelsByQuery,
  stripDimensionValueLabels,
} from '../../src/utils/inlineFilterSeriesName';

const asFormData = (value: Record<string, unknown>): QueryFormData =>
  value as unknown as QueryFormData;

const singleConfig = {
  id: 'f1',
  column: 'gender',
  filterType: 'single',
};

const injected = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  filterOptionName: 'inline_f1',
  expressionType: 'SIMPLE',
  subject: 'gender',
  operator: '==',
  comparator: 'girl',
  isExtra: true,
  ...overrides,
});

const makeFormData = ({
  config = [singleConfig],
  filters = [injected()],
  key = 'adhoc_filters',
}: {
  config?: Record<string, unknown>[];
  filters?: Record<string, unknown>[];
  key?: string;
} = {}) =>
  asFormData({
    inline_filters: config,
    [key]: filters,
  });

describe('getHiddenDimensionLabels', () => {
  test('returns the effective value of a single-select inline filter', () => {
    expect(getHiddenDimensionLabels(makeFormData())).toEqual([
      { column: 'gender', value: 'girl' },
    ]);
  });

  test('also reads injected filters from mixed-chart Query B sections', () => {
    expect(
      getHiddenDimensionLabels(makeFormData({ key: 'adhoc_filters_b' })),
    ).toEqual([{ column: 'gender', value: 'girl' }]);
  });

  // `ChartProps` camelCases the top-level form data keys. Reading only
  // snake_case keys silently disabled the feature in the running app.
  test('reads the camelCased chartProps.formData shape', () => {
    const camelCased = asFormData({
      inlineFilters: [singleConfig],
      adhocFilters: [injected()],
    });
    expect(getHiddenDimensionLabels(camelCased)).toEqual([
      { column: 'gender', value: 'girl' },
    ]);
  });

  test('reads camelCased mixed-chart Query B sections', () => {
    const camelCased = asFormData({
      inlineFilters: [singleConfig],
      adhocFiltersB: [injected()],
    });
    expect(getHiddenDimensionLabels(camelCased)).toEqual([
      { column: 'gender', value: 'girl' },
    ]);
  });

  test('merges camelCased formData with the raw snake_case form data', () => {
    const camelCased = asFormData({
      inlineFilters: [singleConfig],
      adhocFilters: [injected()],
    });
    const raw = makeFormData({ key: 'adhoc_filters_b' });
    expect(getHiddenDimensionLabels(camelCased, raw)).toEqual([
      { column: 'gender', value: 'girl' },
    ]);
    // Neither source alone is required to carry both halves.
    expect(
      getHiddenDimensionLabels(
        asFormData({ inlineFilters: [singleConfig] }),
        asFormData({ adhoc_filters: [injected()] }),
      ),
    ).toEqual([{ column: 'gender', value: 'girl' }]);
  });

  test('returns nothing when no value is selected (All / explicit clear)', () => {
    expect(getHiddenDimensionLabels(makeFormData({ filters: [] }))).toEqual([]);
  });

  test('returns nothing when there is no inline filter config', () => {
    expect(getHiddenDimensionLabels(makeFormData({ config: [] }))).toEqual([]);
  });

  test('ignores plain chart filters that were not injected inline', () => {
    expect(
      getHiddenDimensionLabels(
        makeFormData({
          filters: [{ operator: '==', comparator: 'girl', subject: 'gender' }],
        }),
      ),
    ).toEqual([]);
  });

  test.each([
    ['multiple', 'multiple', 'IN', ['girl']],
    ['text input', 'input', '==', 'girl'],
    ['fuzzy input', 'input', 'ILIKE', '%gir%'],
    ['inverse selection', 'single', '!=', 'girl'],
  ])(
    'does not hide labels for %s',
    (_name, filterType, operator, comparator) => {
      expect(
        getHiddenDimensionLabels(
          makeFormData({
            config: [{ ...singleConfig, filterType }],
            filters: [injected({ operator, comparator })],
          }),
        ),
      ).toEqual([]);
    },
  );

  test('does not hide labels when the inverse switch is on', () => {
    expect(
      getHiddenDimensionLabels(
        makeFormData({
          config: [{ ...singleConfig, inverseSelection: true }],
        }),
      ),
    ).toEqual([]);
  });

  test('legacy configs without filterType follow the multi flag', () => {
    expect(
      getHiddenDimensionLabels(
        makeFormData({ config: [{ id: 'f1', column: 'gender' }] }),
      ),
    ).toEqual([{ column: 'gender', value: 'girl' }]);
    expect(
      getHiddenDimensionLabels(
        makeFormData({
          config: [{ id: 'f1', column: 'gender', multi: true }],
        }),
      ),
    ).toEqual([]);
  });

  test('supports numeric dimension values', () => {
    expect(
      getHiddenDimensionLabels(
        makeFormData({
          config: [{ id: 'f1', column: 'month', filterType: 'single' }],
          filters: [injected({ subject: 'month', comparator: 202607 })],
        }),
      ),
    ).toEqual([{ column: 'month', value: '202607' }]);
  });

  test('keeps only filters whose ids resolve to an injected value', () => {
    expect(
      getHiddenDimensionLabels(
        makeFormData({
          config: [
            singleConfig,
            { id: 'f2', column: 'region', filterType: 'single' },
          ],
        }),
      ),
    ).toEqual([{ column: 'gender', value: 'girl' }]);
  });
});

describe('getHiddenDimensionLabelsByQuery', () => {
  test('a Query A filter never hides a Query B dimension label', () => {
    expect(
      getHiddenDimensionLabelsByQuery(
        makeFormData({ config: [{ ...singleConfig, queryScope: 'A' }] }),
      ),
    ).toEqual({
      A: [{ column: 'gender', value: 'girl' }],
      B: [],
    });
  });

  test('a Query B filter never hides a Query A dimension label', () => {
    expect(
      getHiddenDimensionLabelsByQuery(
        makeFormData({
          key: 'adhoc_filters_b',
          config: [{ ...singleConfig, queryScope: 'B' }],
        }),
      ),
    ).toEqual({
      A: [],
      B: [{ column: 'gender', value: 'girl' }],
    });
  });

  test('two query sections keep independently injected values', () => {
    const both = asFormData({
      inline_filters: [
        { ...singleConfig, queryScope: 'A' },
        { ...singleConfig, id: 'f2', queryScope: 'B' },
      ],
      adhoc_filters: [injected()],
      adhoc_filters_b: [
        injected({ filterOptionName: 'inline_f2', comparator: 'boy' }),
      ],
    });
    expect(getHiddenDimensionLabelsByQuery(both)).toEqual({
      A: [{ column: 'gender', value: 'girl' }],
      B: [{ column: 'gender', value: 'boy' }],
    });
  });

  test('a legacy unscoped filter still affects both queries', () => {
    // Charts saved before query scopes existed may only carry the injected
    // clause on Query A. Their selection must keep rewriting both queries'
    // series names exactly as before.
    expect(getHiddenDimensionLabelsByQuery(makeFormData())).toEqual({
      A: [{ column: 'gender', value: 'girl' }],
      B: [{ column: 'gender', value: 'girl' }],
    });
  });

  test('an unscoped injection present in both sections reaches both queries', () => {
    const both = asFormData({
      inline_filters: [singleConfig],
      adhoc_filters: [injected()],
      adhoc_filters_b: [injected()],
    });
    expect(getHiddenDimensionLabelsByQuery(both)).toEqual({
      A: [{ column: 'gender', value: 'girl' }],
      B: [{ column: 'gender', value: 'girl' }],
    });
    expect(getHiddenDimensionLabels(both)).toEqual([
      { column: 'gender', value: 'girl' },
    ]);
  });

  test('reads camelCased Query B sections into the B bucket only', () => {
    const camelCased = asFormData({
      inlineFilters: [{ ...singleConfig, queryScope: 'B' }],
      adhocFiltersB: [injected()],
    });
    expect(getHiddenDimensionLabelsByQuery(camelCased)).toEqual({
      A: [],
      B: [{ column: 'gender', value: 'girl' }],
    });
  });
});

describe('getDimensionColumnNames', () => {
  test('accepts physical column strings and adhoc column objects', () => {
    expect([
      ...getDimensionColumnNames(['gender', { column_name: 'region' }, null]),
    ]).toEqual(['gender', 'region']);
  });
});

describe('stripDimensionValueLabels', () => {
  test('removes the trailing dimension value', () => {
    expect(stripDimensionValueLabels('sum__num, girl', ['girl'])).toBe(
      'sum__num',
    );
  });

  test('works with query identifiers in the metric part', () => {
    expect(
      stripDimensionValueLabels('sum__num (Query A), girl', ['girl']),
    ).toBe('sum__num (Query A)');
  });

  test('removes only the matching segment when several dimensions exist', () => {
    expect(stripDimensionValueLabels('sum__num, girl, north', ['girl'])).toBe(
      'sum__num, north',
    );
  });

  test('leaves an unrelated dimension value in place', () => {
    expect(stripDimensionValueLabels('sum__num, boy', ['girl'])).toBe(
      'sum__num, boy',
    );
  });

  test('never strips the first (metric) segment', () => {
    expect(stripDimensionValueLabels('girl, girl', ['girl'])).toBe('girl');
    expect(stripDimensionValueLabels('sum__num', ['sum__num'])).toBe(
      'sum__num',
    );
  });

  test('is a no-op without candidate values', () => {
    expect(stripDimensionValueLabels('sum__num, girl', [])).toBe(
      'sum__num, girl',
    );
  });
});
