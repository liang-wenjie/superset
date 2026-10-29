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
  getXAxisLabel,
  isXAxisSet,
  normalizeOrderBy,
  PostProcessingPivot,
  PostProcessingSort,
  QueryFormData,
  QueryFormMetric,
  QueryObject,
  getXAxisColumn,
} from '@superset-ui/core';
import {
  pivotOperator,
  renameOperator,
  flattenOperator,
  isTimeComparison,
  timeComparePivotOperator,
  rollingWindowOperator,
  timeCompareOperator,
  resampleOperator,
} from '@superset-ui/chart-controls';
import {
  retainFormDataSuffix,
  removeFormDataSuffix,
} from '../utils/formDataSuffix';

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
 * charts. The backend `pivot` step runs `pivot_table` with its default
 * `sort=True`, which re-sorts the index lexicographically and silently
 * discards the SQL `ORDER BY` that `normalizeOrderBy` derives — so without
 * this step "Sort query by" / "Sort Descending" have no visible effect on a
 * mixed chart.
 *
 * Skipped when:
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
      // `order_desc` defaults to true (descending); only an explicit
      // `false` flips the sort to ascending.
      ascending: fd.order_desc === false,
    },
  };
}

export default function buildQuery(formData: QueryFormData) {
  const baseFormData = {
    ...formData,
  };

  const formData1 = removeFormDataSuffix(baseFormData, '_b');
  const formData2Raw = retainFormDataSuffix(baseFormData, '_b');
  // When "Share settings with Query A" is on, Query B must select the same
  // categories as Query A: inherit A's sort metric, sort direction, row limit,
  // metric truncation and empty-column handling, regardless of B's own saved
  // values. Otherwise B can run its own sort/limit and pick a disjoint set of
  // categories, leaving B empty on A's x-axis.
  const formData2 =
    baseFormData.share_query_settings === true
      ? {
          ...formData2Raw,
          timeseries_limit_metric: formData1.timeseries_limit_metric,
          order_desc: formData1.order_desc,
          row_limit: formData1.row_limit,
          truncate_metric: formData1.truncate_metric,
          show_empty_columns: formData1.show_empty_columns,
          // Query B filters itself independently in a mixed chart; when
          // sharing settings, B must be filtered the same way as A so B
          // cannot surface categories A's filters excluded (e.g. fee rows A
          // filtered away otherwise appear as empty columns on the shared
          // x-axis). B's own filters, when it defines any, take precedence.
          adhoc_filters:
            ensureIsArray(formData2Raw.adhoc_filters).length > 0
              ? formData2Raw.adhoc_filters
              : formData1.adhoc_filters,
        }
      : formData2Raw;

  const queryContexts = [formData1, formData2].map(fd =>
    buildQueryContext(fd, baseQueryObject => {
      const queryObject = {
        ...baseQueryObject,
        columns: [
          ...(isXAxisSet(formData)
            ? ensureIsArray(getXAxisColumn(formData))
            : []),
          ...ensureIsArray(fd.groupby),
        ],
        series_columns: fd.groupby,
        ...(isXAxisSet(formData) ? {} : { is_timeseries: true }),
      };

      const pivotOperatorInRuntime: PostProcessingPivot = isTimeComparison(
        fd,
        queryObject,
      )
        ? timeComparePivotOperator(fd, queryObject)
        : pivotOperator(fd, queryObject);

      const tmpQueryObject = {
        ...queryObject,
        time_offsets: isTimeComparison(fd, queryObject) ? fd.time_compare : [],
        post_processing: [
          pivotOperatorInRuntime,
          resampleOperator(fd, queryObject),
          rollingWindowOperator(fd, queryObject),
          timeCompareOperator(fd, queryObject),
          renameOperator(fd, queryObject),
          getCategoricalXAxisSortOperator(fd, queryObject),
          flattenOperator(fd, queryObject),
        ],
      } as QueryObject;
      // Preserve `order_desc` and `series_limit_metric` on the query object and
      // only normalize `orderby`. `normalizeOrderBy` strips those two fields from
      // its result, but the backend series-limit subquery reads `order_desc`
      // directly to pick the top-N series, so dropping it makes the sort
      // direction silently ignored for the displayed result. Mirrors the
      // single-query Timeseries chart's buildQuery.
      return [
        {
          ...tmpQueryObject,
          orderby: normalizeOrderBy(tmpQueryObject).orderby,
        },
      ];
    }),
  );

  return {
    ...queryContexts[0],
    queries: [...queryContexts[0].queries, ...queryContexts[1].queries],
  };
}
