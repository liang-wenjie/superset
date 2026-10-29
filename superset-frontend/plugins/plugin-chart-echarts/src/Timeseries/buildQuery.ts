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
  buildQueryContext,
  DTTM_ALIAS,
  ensureIsArray,
  getMetricLabel,
  getXAxisColumn,
  getXAxisLabel,
  isXAxisSet,
  normalizeOrderBy,
  PostProcessingPivot,
  PostProcessingSort,
  QueryFormData,
  QueryFormMetric,
  QueryObject,
} from '@superset-ui/core';
import {
  contributionOperator,
  extractExtraMetrics,
  flattenOperator,
  isTimeComparison,
  pivotOperator,
  prophetOperator,
  renameOperator,
  resampleOperator,
  rollingWindowOperator,
  sortOperator,
  timeComparePivotOperator,
  timeCompareOperator,
} from '@superset-ui/chart-controls';

/**
 * Identity of a SIMPLE adhoc metric: the physical column it aggregates plus
 * the aggregate function. Custom labels on a displayed metric (e.g. "毛利")
 * differ from the sort metric's auto label ("SUM(利润（人民币）)") even though
 * they describe the same column + aggregate, so matching by label alone would
 * silently fall back to the first displayed metric and sort by the wrong
 * column. Matching by identity maps the sort metric onto the displayed metric
 * that aggregates the same column.
 */
const getMetricIdentity = (metric: QueryFormMetric | undefined) => {
  if (
    typeof metric === 'string' ||
    !metric ||
    metric.expressionType !== 'SIMPLE'
  ) {
    return undefined;
  }
  const columnName = metric.column?.column_name ?? metric.column?.columnName;
  if (!columnName || !metric.aggregate) {
    return undefined;
  }
  return `${columnName}::${metric.aggregate}`;
};

/**
 * Emits a `sort` post-processing step that reorders a categorical x-axis by
 * the query's own sort controls (`timeseries_limit_metric` +
 * `order_desc`), mirroring the `sortOperator` used by other categorical
 * charts. `sortOperator` only responds to the `x_axis_sort` /
 * `x_axis_sort_asc` pair (which most timeseries control panels do not even
 * expose), so a chart that sorts via "Sort query by" + "Sort Descending"
 * would fall back to the backend `pivot` step's default lexicographic
 * index order and appear to ignore the sort controls. This step bridges
 * that gap without touching the `x_axis_sort` path.
 *
 * Skipped when:
 * - `sortOperator` already emitted a sort step for `x_axis_sort`;
 * - the x-axis is temporal (legacy `__timestamp` or a generic-axes column
 *   marked temporal in `temporal_columns_lookup`): those must stay
 *   chronological, not metric-ordered;
 * - the query pivots over a series (groupby) dimension: with multiple series
 *   there is no single metric to order the rows by;
 * - a time comparison is active: its pivot output is shaped differently.
 *
 * The `by` label resolves to the query's sort metric when it is one of the
 * pivot's aggregate columns (the displayed metrics) — by label first, then by
 * column+aggregate identity for SIMPLE metrics with custom display labels —
 * falling back to the first displayed metric, matching the SQL `ORDER BY`
 * fallback that `normalizeOrderBy` applies.
 */
function getCategoricalXAxisSortOperator(
  fd: QueryFormData,
  queryObject: QueryObject,
): PostProcessingSort | undefined {
  const xAxisLabel = getXAxisLabel(fd);
  const temporalColumnsLookup = fd.temporal_columns_lookup as
    | Record<string, boolean>
    | undefined;
  if (
    !isXAxisSet(fd) ||
    !xAxisLabel ||
    xAxisLabel === DTTM_ALIAS ||
    temporalColumnsLookup?.[xAxisLabel] === true ||
    ensureIsArray(fd.groupby).length > 0 ||
    isTimeComparison(fd, queryObject)
  ) {
    return undefined;
  }

  const pivotMetrics = ensureIsArray(queryObject.metrics);
  const pivotMetricLabels = pivotMetrics.map(getMetricLabel);
  const sortMetrics = ensureIsArray(
    fd.timeseries_limit_metric ?? fd.series_limit_metric,
  );
  const sortByLabel =
    sortMetrics
      .map(getMetricLabel)
      .find(label => pivotMetricLabels.includes(label)) ??
    (() => {
      const sortIdentity = sortMetrics.map(getMetricIdentity).find(Boolean);
      if (!sortIdentity) {
        return undefined;
      }
      return pivotMetrics
        .filter(metric => getMetricIdentity(metric) === sortIdentity)
        .map(getMetricLabel)[0];
    })() ??
    // Mirror `normalizeOrderBy`: without a resolvable sort metric the SQL
    // still orders by the first displayed metric.
    pivotMetricLabels[0];
  if (!sortByLabel) {
    return undefined;
  }

  return {
    operation: 'sort',
    options: {
      by: sortByLabel,
      ascending: fd.order_desc === false,
    },
  };
}

export default function buildQuery(formData: QueryFormData) {
  const { groupby } = formData;
  return buildQueryContext(formData, baseQueryObject => {
    /* the `pivotOperatorInRuntime` determines how to pivot the dataframe returned from the raw query.
       1. If it's a time compared query, there will return a pivoted dataframe that append time compared metrics. for instance:

                            MAX(value) MAX(value)__1 year ago MIN(value) MIN(value)__1 year ago
          city               LA                     LA         LA                     LA
          __timestamp
          2015-01-01      568.0                  671.0        5.0                    6.0
          2015-02-01      407.0                  649.0        4.0                    3.0
          2015-03-01      318.0                  465.0        0.0                    3.0

       2. If it's a normal query, there will return a pivoted dataframe.

                     MAX(value)  MIN(value)
          city               LA          LA
          __timestamp
          2015-01-01      568.0         5.0
          2015-02-01      407.0         4.0
          2015-03-01      318.0         0.0

     */
    // only add series limit metric if it's explicitly needed e.g. for sorting
    const extra_metrics = extractExtraMetrics(formData);

    const pivotOperatorInRuntime: PostProcessingPivot = isTimeComparison(
      formData,
      baseQueryObject,
    )
      ? timeComparePivotOperator(formData, baseQueryObject)
      : pivotOperator(formData, baseQueryObject);

    const columns = [
      ...(isXAxisSet(formData) ? ensureIsArray(getXAxisColumn(formData)) : []),
      ...ensureIsArray(groupby),
    ];

    const time_offsets = isTimeComparison(formData, baseQueryObject)
      ? formData.time_compare
      : [];

    // When comparing against prior periods, optionally keep each shifted series at
    // its full time range instead of truncating it to the main series' range.
    const time_compare_full_range =
      time_offsets.length > 0 && Boolean(formData.time_compare_full_range);

    return [
      {
        ...baseQueryObject,
        metrics: [...(baseQueryObject.metrics || []), ...extra_metrics],
        columns,
        series_columns: groupby,
        ...(isXAxisSet(formData) ? {} : { is_timeseries: true }),
        // todo: move `normalizeOrderBy to extractQueryFields`
        orderby: normalizeOrderBy(baseQueryObject).orderby,
        time_offsets,
        time_compare_full_range,
        /* Note that:
          1. The resample, rolling, cum, timeCompare operators should be after pivot.
          2. Resample must come before rolling so that imputed values are
             included in the rolling window calculation.
          3. Contribution must come before rename because it relies on the
             `__<time offset>` suffix to compute each time shift separately,
             and rename strips that suffix.
          4. the flatOperator makes multiIndex Dataframe into flat Dataframe
        */
        post_processing: [
          pivotOperatorInRuntime,
          resampleOperator(formData, baseQueryObject),
          rollingWindowOperator(formData, baseQueryObject),
          timeCompareOperator(formData, baseQueryObject),
          contributionOperator(formData, baseQueryObject, time_offsets),
          renameOperator(formData, baseQueryObject),
          sortOperator(formData, baseQueryObject) ??
            getCategoricalXAxisSortOperator(formData, baseQueryObject),
          flattenOperator(formData, baseQueryObject),
          // todo: move prophet before flatten
          prophetOperator(formData, baseQueryObject),
        ],
      },
    ];
  });
}
