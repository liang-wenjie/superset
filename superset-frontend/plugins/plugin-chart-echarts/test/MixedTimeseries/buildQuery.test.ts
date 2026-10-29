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
  BinaryAdhocFilter,
  ComparisonType,
  FreeFormAdhocFilter,
  QueryFormMetric,
  RollingType,
  TimeGranularity,
} from '@superset-ui/core';
import buildQuery from '../../src/MixedTimeseries/buildQuery';

const formDataMixedChart = {
  datasource: 'dummy',
  viz_type: 'my_chart',
  // query
  //   -- common
  time_range: '1980 : 2000',
  time_grain_sqla: TimeGranularity.WEEK,
  granularity_sqla: 'ds',
  //   -- query a
  groupby: ['foo'],
  metrics: ['sum(sales)'],
  adhoc_filters: [
    {
      clause: 'WHERE',
      expressionType: 'SQL',
      sqlExpression: "foo in ('a', 'b')",
    } as FreeFormAdhocFilter,
  ],
  limit: 5,
  row_limit: 10,
  timeseries_limit_metric: 'count',
  order_desc: true,
  truncate_metric: true,
  show_empty_columns: true,
  //   -- query b
  groupby_b: [],
  metrics_b: ['count'],
  adhoc_filters_b: [
    {
      clause: 'WHERE',
      expressionType: 'SQL',
      sqlExpression: "name in ('c', 'd')",
    } as FreeFormAdhocFilter,
  ],
  limit_b: undefined,
  row_limit_b: 100,
  timeseries_limit_metric_b: undefined,
  order_desc_b: false,
  truncate_metric_b: true,
  show_empty_columns_b: true,
  // chart configs
  show_value: false,
  show_valueB: undefined,
};
const formDataMixedChartWithAA = {
  ...formDataMixedChart,
  rolling_type: RollingType.Cumsum,
  time_compare: ['1 years ago'],
  comparison_type: ComparisonType.Values,
  resample_rule: '1AS',
  resample_method: 'zerofill',

  rolling_type_b: RollingType.Sum,
  rolling_periods_b: 1,
  min_periods_b: 1,
  comparison_type_b: ComparisonType.Difference,
  time_compare_b: ['3 years ago'],
  resample_rule_b: '1A',
  resample_method_b: 'asfreq',
};

test('should compile query object A', () => {
  const query = buildQuery(formDataMixedChart).queries[0];
  expect(query).toEqual({
    time_range: '1980 : 2000',
    since: undefined,
    until: undefined,
    granularity: 'ds',
    filters: [],
    extras: {
      having: '',
      time_grain_sqla: 'P1W',
      where: "(foo in ('a', 'b'))",
    },
    applied_time_extras: {},
    columns: ['foo'],
    metrics: ['sum(sales)'],
    annotation_layers: [],
    row_limit: 10,
    row_offset: undefined,
    series_columns: ['foo'],
    series_limit: 5,
    series_limit_metric: 'count',
    order_desc: true,
    group_others_when_limit_reached: false,
    url_params: {},
    custom_params: {},
    custom_form_data: {},
    is_timeseries: true,
    time_offsets: [],
    post_processing: [
      {
        operation: 'pivot',
        options: {
          aggregates: {
            'sum(sales)': {
              operator: 'mean',
            },
          },
          columns: ['foo'],
          drop_missing_columns: false,
          index: ['__timestamp'],
        },
      },
      {
        operation: 'rename',
        options: {
          columns: {
            'sum(sales)': null,
          },
          inplace: true,
          level: 0,
        },
      },
      {
        operation: 'flatten',
      },
    ],
    orderby: [['count', false]],
  });
});

test('should compile query object B', () => {
  const query = buildQuery(formDataMixedChart).queries[1];
  expect(query).toEqual({
    time_range: '1980 : 2000',
    since: undefined,
    until: undefined,
    granularity: 'ds',
    filters: [],
    extras: {
      having: '',
      time_grain_sqla: 'P1W',
      where: "(name in ('c', 'd'))",
    },
    applied_time_extras: {},
    columns: [],
    metrics: ['count'],
    annotation_layers: [],
    row_limit: 100,
    row_offset: undefined,
    series_columns: [],
    series_limit: 0,
    series_limit_metric: undefined,
    order_desc: false,
    group_others_when_limit_reached: false,
    url_params: {},
    custom_params: {},
    custom_form_data: {},
    is_timeseries: true,
    time_offsets: [],
    post_processing: [
      {
        operation: 'pivot',
        options: {
          aggregates: {
            count: {
              operator: 'mean',
            },
          },
          columns: [],
          drop_missing_columns: false,
          index: ['__timestamp'],
        },
      },
      {
        operation: 'flatten',
      },
    ],
    orderby: [['count', true]],
  });
});

test('should compile Matrixify filters for both mixed timeseries queries', () => {
  // Matrixify injects a per-cell dimension filter into `adhoc_filters` and every
  // query-specific `adhoc_filters_*` collection. Query A reads `adhoc_filters`
  // and query B reads `adhoc_filters_b`, so both queries must end up filtered.
  const matrixifyCountryFilter: BinaryAdhocFilter = {
    clause: 'WHERE',
    expressionType: 'SIMPLE',
    subject: 'country',
    operator: '==',
    comparator: 'USA',
    isExtra: false,
  };
  const formData = {
    ...formDataMixedChart,
    adhoc_filters: [
      ...formDataMixedChart.adhoc_filters,
      matrixifyCountryFilter,
    ],
    adhoc_filters_b: [
      ...formDataMixedChart.adhoc_filters_b,
      matrixifyCountryFilter,
    ],
  };

  const [queryA, queryB] = buildQuery(formData).queries;

  expect(queryA.filters).toEqual([{ col: 'country', op: '==', val: 'USA' }]);
  expect(queryB.filters).toEqual([{ col: 'country', op: '==', val: 'USA' }]);
  // The pre-existing free-form filter on query B is preserved in `extras`.
  expect(queryB.extras?.where).toBe("(name in ('c', 'd'))");
});

test('should compile AA in query A', () => {
  const query = buildQuery(formDataMixedChartWithAA).queries[0];
  // time comparison
  expect(query.time_offsets).toEqual(['1 years ago']);

  // pivot
  expect(
    query.post_processing?.find(operator => operator?.operation === 'pivot'),
  ).toEqual({
    operation: 'pivot',
    options: {
      index: ['__timestamp'],
      columns: ['foo'],
      drop_missing_columns: false,
      aggregates: {
        'sum(sales)': { operator: 'mean' },
        'sum(sales)__1 years ago': { operator: 'mean' },
      },
    },
  });
  // cumsum
  expect(
    query.post_processing?.find(operator => operator?.operation === 'cum')
      ?.operation,
  ).toEqual('cum');

  // resample
  expect(
    query.post_processing?.find(operator => operator?.operation === 'resample'),
  ).toEqual({
    operation: 'resample',
    options: {
      method: 'asfreq',
      rule: '1AS',
      fill_value: 0,
    },
  });
});

test('should compile AA in query B', () => {
  const query = buildQuery(formDataMixedChartWithAA).queries[1];
  // time comparison
  expect(query.time_offsets).toEqual(['3 years ago']);

  // rolling total
  expect(
    query.post_processing?.find(operator => operator?.operation === 'rolling'),
  ).toEqual({
    operation: 'rolling',
    options: {
      rolling_type: 'sum',
      window: 1,
      min_periods: 1,
      columns: {
        count: 'count',
        'count__3 years ago': 'count__3 years ago',
      },
    },
  });

  // resample
  expect(
    query.post_processing?.find(operator => operator?.operation === 'resample'),
  ).toEqual({
    operation: 'resample',
    options: {
      method: 'asfreq',
      rule: '1A',
      fill_value: null,
    },
  });
});

test("shouldn't convert a queryObject with axis", () => {
  const { queries } = buildQuery(formDataMixedChart);
  expect(queries[0]).toEqual(
    expect.objectContaining({
      granularity: 'ds',
      columns: ['foo'],
      series_columns: ['foo'],
      metrics: ['sum(sales)'],
      is_timeseries: true,
      extras: {
        time_grain_sqla: 'P1W',
        having: '',
        where: "(foo in ('a', 'b'))",
      },
      post_processing: [
        {
          operation: 'pivot',
          options: {
            aggregates: {
              'sum(sales)': {
                operator: 'mean',
              },
            },
            columns: ['foo'],
            drop_missing_columns: false,
            index: ['__timestamp'],
          },
        },
        {
          operation: 'rename',
          options: { columns: { 'sum(sales)': null }, inplace: true, level: 0 },
        },
        {
          operation: 'flatten',
        },
      ],
    }),
  );
  expect(queries[1]).toEqual(
    expect.objectContaining({
      granularity: 'ds',
      columns: [],
      series_columns: [],
      metrics: ['count'],
      is_timeseries: true,
      extras: {
        time_grain_sqla: 'P1W',
        having: '',
        where: "(name in ('c', 'd'))",
      },
      post_processing: [
        {
          operation: 'pivot',
          options: {
            aggregates: {
              count: {
                operator: 'mean',
              },
            },
            columns: [],
            drop_missing_columns: false,
            index: ['__timestamp'],
          },
        },
        {
          operation: 'flatten',
        },
      ],
    }),
  );
});

test('ensure correct pivot columns', () => {
  const query = buildQuery({ ...formDataMixedChartWithAA, x_axis: 'ds' })
    .queries[0];

  expect(query.time_offsets).toEqual(['1 years ago']);

  // pivot
  expect(
    query.post_processing?.find(operator => operator?.operation === 'pivot'),
  ).toEqual({
    operation: 'pivot',
    options: {
      index: ['ds'],
      columns: ['foo'],
      drop_missing_columns: false,
      aggregates: {
        'sum(sales)': { operator: 'mean' },
        'sum(sales)__1 years ago': { operator: 'mean' },
      },
    },
  });
});

test('preserves order_desc and series_limit_metric for both queries', () => {
  // Regression for sc-107146: toggling "Sort Descending" off in a Mixed Chart
  // updated the displayed SQL but not the rendered result. The backend
  // series-limit subquery picks the top-N series from `order_desc`, so dropping
  // it (as `normalizeOrderBy` does) made the sort direction silently ignored.
  const ascendingFormData = {
    ...formDataMixedChart,
    order_desc: false,
    order_desc_b: false,
    timeseries_limit_metric_b: 'count',
  };
  const { queries } = buildQuery(ascendingFormData);

  // Query A: ascending sort by its explicit sort metric must survive.
  expect(queries[0]).toEqual(
    expect.objectContaining({
      order_desc: false,
      series_limit_metric: 'count',
      orderby: [['count', true]],
    }),
  );

  // Query B: the `_b` query must independently keep its own direction/metric.
  expect(queries[1]).toEqual(
    expect.objectContaining({
      order_desc: false,
      series_limit_metric: 'count',
      orderby: [['count', true]],
    }),
  );
});

const sortMetric: QueryFormMetric = {
  expressionType: 'SIMPLE',
  column: { column_name: 'category1' },
  aggregate: 'COUNT',
  label: 'COUNT(category1)',
};

// A mixed chart on a categorical (non-temporal) generic-axes x-axis — the
// configuration where the backend `pivot` step re-sorts the index
// lexicographically and would otherwise discard the SQL ORDER BY.
const categoricalXAxisFormData = {
  ...formDataMixedChart,
  x_axis: 'category1',
  granularity_sqla: undefined,
  groupby: [],
  metrics: ['count'],
  timeseries_limit_metric: sortMetric,
  order_desc: false,
  temporal_columns_lookup: { created_at: true },
  groupby_b: [],
  metrics_b: ['count'],
  timeseries_limit_metric_b: sortMetric,
  order_desc_b: true,
  limit: undefined,
};

const sortOperations = (queries: ReturnType<typeof buildQuery>['queries']) =>
  queries.map(query =>
    query.post_processing?.filter(
      (op): op is { operation: 'sort'; options: Record<string, unknown> } =>
        op?.operation === 'sort',
    ),
  );

test('a categorical x-axis orders rows by the query sort controls', () => {
  const { queries } = buildQuery(categoricalXAxisFormData);
  const [sortsA, sortsB] = sortOperations(queries);

  // Query A: Sort Descending off -> ascending, by the displayed metric. The
  // sort metric COUNT(category1) is not one of the pivot columns, so the
  // ordering falls back to the first displayed metric, matching
  // normalizeOrderBy's SQL fallback.
  expect(sortsA).toEqual([
    { operation: 'sort', options: { by: 'count', ascending: true } },
  ]);
  expect(queries[0].orderby).toEqual([[sortMetric, true]]);

  // Query B: Sort Descending on -> descending.
  expect(sortsB).toEqual([
    { operation: 'sort', options: { by: 'count', ascending: false } },
  ]);
  expect(queries[1].orderby).toEqual([[sortMetric, false]]);
});

test('the sort metric is used directly when it is one of the displayed metrics', () => {
  const formData = {
    ...categoricalXAxisFormData,
    timeseries_limit_metric: 'count',
    timeseries_limit_metric_b: 'count',
  };
  const [sortsA, sortsB] = sortOperations(buildQuery(formData).queries);
  expect(sortsA).toEqual([
    { operation: 'sort', options: { by: 'count', ascending: true } },
  ]);
  expect(sortsB).toEqual([
    { operation: 'sort', options: { by: 'count', ascending: false } },
  ]);
});

test('no sort step is emitted for a legacy temporal x-axis', () => {
  const formData = {
    ...categoricalXAxisFormData,
    x_axis: undefined,
    granularity_sqla: 'created_at',
    temporal_columns_lookup: undefined,
  };
  const { queries } = buildQuery(formData);
  expect(sortOperations(queries)).toEqual([[], []]);
});

test('no sort step is emitted when the generic-axes x-axis column is temporal', () => {
  const formData = {
    ...categoricalXAxisFormData,
    x_axis: 'created_at',
    temporal_columns_lookup: { created_at: true },
  };
  const { queries } = buildQuery(formData);
  expect(sortOperations(queries)).toEqual([[], []]);
});

test('no sort step is emitted when the query pivots over a groupby series dimension', () => {
  const formData = {
    ...categoricalXAxisFormData,
    groupby: ['category2'],
    groupby_b: ['category2'],
  };
  const [sortsA, sortsB] = sortOperations(buildQuery(formData).queries);
  expect(sortsA).toEqual([]);
  expect(sortsB).toEqual([]);
});

test('without an explicit sort metric the sort step falls back to the first displayed metric', () => {
  const formData = {
    ...categoricalXAxisFormData,
    timeseries_limit_metric: undefined,
    timeseries_limit_metric_b: undefined,
  };
  const { queries } = buildQuery(formData);
  // Mirror `normalizeOrderBy`: the SQL still orders by the first displayed
  // metric, so the sort step must as well.
  expect(queries[0].orderby).toEqual([['count', true]]);
  expect(queries[1].orderby).toEqual([['count', false]]);
  const [sortsA, sortsB] = sortOperations(queries);
  expect(sortsA).toEqual([
    { operation: 'sort', options: { by: 'count', ascending: true } },
  ]);
  expect(sortsB).toEqual([
    { operation: 'sort', options: { by: 'count', ascending: false } },
  ]);
});

const turnoverMetric: QueryFormMetric = {
  expressionType: 'SIMPLE',
  column: { column_name: '销售收入（人民币）' },
  aggregate: 'SUM',
  hasCustomLabel: true,
  label: '营业额',
};

const grossProfitMetric: QueryFormMetric = {
  expressionType: 'SIMPLE',
  column: { column_name: '利润（人民币）' },
  aggregate: 'SUM',
  hasCustomLabel: true,
  label: '毛利',
};

const profitSortMetric: QueryFormMetric = {
  expressionType: 'SIMPLE',
  column: { column_name: '利润（人民币）' },
  aggregate: 'SUM',
  label: 'SUM(利润（人民币）)',
};

test('a sort metric with a custom-labeled display metric sorts by that metric', () => {
  // Regression for chart 28: the sort control SUM(利润（人民币）) is the same
  // column+aggregate as the displayed metric labelled 毛利, but their labels
  // differ. Sorting must follow 毛利, not fall back to the first displayed
  // metric (营业额).
  const formData = {
    ...categoricalXAxisFormData,
    metrics: [turnoverMetric, grossProfitMetric],
    timeseries_limit_metric: profitSortMetric,
    order_desc: true,
  };
  const [sortsA] = sortOperations(buildQuery(formData).queries);
  expect(sortsA).toEqual([
    { operation: 'sort', options: { by: '毛利', ascending: false } },
  ]);
});

test('Query B inherits Query A settings when sharing is enabled', () => {
  // "Share settings with Query A": Query B must select the same categories as
  // Query A even if B has its own saved direction/limit/empty-column values.
  const formData = {
    ...categoricalXAxisFormData,
    share_query_settings: true,
    order_desc: false,
    order_desc_b: true,
    row_limit: 10,
    row_limit_b: 100,
    show_empty_columns: false,
    show_empty_columns_b: true,
  };
  const { queries } = buildQuery(formData);
  const [, queryB] = queries;
  const [sortsA, sortsB] = sortOperations(queries);

  // Query A keeps its own settings.
  expect(queries[0].order_desc).toBe(false);
  expect(queries[0].row_limit).toBe(10);
  expect(sortsA).toEqual([
    { operation: 'sort', options: { by: 'count', ascending: true } },
  ]);

  // Query B follows A: direction, row limit, sort metric and empty-column
  // handling all come from Query A, ignoring B's saved values.
  expect(queryB.order_desc).toBe(false);
  expect(queryB.row_limit).toBe(10);
  expect(queryB.orderby).toEqual([[sortMetric, true]]);
  expect(queryB.post_processing?.find(op => op?.operation === 'pivot')).toEqual(
    expect.objectContaining({
      options: expect.objectContaining({ drop_missing_columns: true }),
    }),
  );
  expect(sortsB).toEqual([
    { operation: 'sort', options: { by: 'count', ascending: true } },
  ]);
});

test('Query B inherits Query A filters when filter sharing is enabled and B has none', () => {
  // A's filters must reach B too, or B's result can include categories A has
  // filtered out (e.g. fee rows) that then show up as empty columns on the
  // shared x-axis.
  const formData = {
    ...categoricalXAxisFormData,
    share_query_filters: true,
    adhoc_filters_b: undefined,
  };
  const { queries } = buildQuery(formData);
  const [, queryB] = queries;
  expect(queryB.extras?.where).toContain("foo in ('a', 'b')");
});

test('Query B does not inherit Query A filters without filter sharing', () => {
  // Filter sharing is its own switch: settings sharing alone must not leak
  // A's filters into B.
  const formData = {
    ...categoricalXAxisFormData,
    share_query_settings: true,
    adhoc_filters_b: undefined,
  };
  const { queries } = buildQuery(formData);
  const [, queryB] = queries;
  expect(queryB.extras?.where ?? '').not.toContain("foo in ('a', 'b')");
});

test('Query B keeps its own filters when filter sharing is enabled', () => {
  // B's explicitly configured filters take precedence over A's.
  const formData = {
    ...categoricalXAxisFormData,
    share_query_filters: true,
  };
  const { queries } = buildQuery(formData);
  const [, queryB] = queries;
  expect(queryB.extras?.where).toContain("name in ('c', 'd')");
});

test('Query B settings stay independent when sharing is disabled', () => {
  const formData = {
    ...categoricalXAxisFormData,
    share_query_settings: false,
    order_desc: false,
    order_desc_b: true,
    row_limit: 10,
    row_limit_b: 100,
    show_empty_columns: false,
    show_empty_columns_b: true,
  };
  const { queries } = buildQuery(formData);
  const [, queryB] = queries;
  const [, sortsB] = sortOperations(queries);

  expect(queryB.order_desc).toBe(true);
  expect(queryB.row_limit).toBe(100);
  expect(queryB.orderby).toEqual([[sortMetric, false]]);
  expect(queryB.post_processing?.find(op => op?.operation === 'pivot')).toEqual(
    expect.objectContaining({
      options: expect.objectContaining({ drop_missing_columns: false }),
    }),
  );
  expect(sortsB).toEqual([
    { operation: 'sort', options: { by: 'count', ascending: false } },
  ]);
});
