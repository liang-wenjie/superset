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
  ensureIsArray,
  getMetricLabel,
  QueryFormColumn,
  QueryFormData,
  QueryFormMetric,
} from '@superset-ui/core';
import { BigNumberYoyMomFormData } from './types';
import {
  flattenMetricSlots,
  isMetricMode,
  resolveMetricRows,
} from './metricRows';
import { offsetMaxRows, toEnclosedTimeRange } from './timeRange';

export default function buildQuery(formData: QueryFormData) {
  return buildQueryContext(formData, baseQueryObject => {
    // Every metric row holds two independently configured slots. A slot uses
    // either a server-side time shift (extra `<metric label>__<offset>`
    // columns) or an explicit comparison metric read from the result. Old
    // `comparison1_*` / `comparison2_*` charts resolve to row 1 of the same
    // list, so both shapes produce exactly the same query.
    const formDataYoyMom = formData as BigNumberYoyMomFormData;
    const timeRange = baseQueryObject.time_range;
    const hasTimeRange = !!timeRange && timeRange !== 'No filter';
    // Hidden slots keep their query shape so charts saved with
    // `show_comparison*` disabled behave exactly as before; the render layer
    // is the only place that decides whether a slot is visible.
    const slots = flattenMetricSlots(
      resolveMetricRows(formData as unknown as Record<string, unknown>),
    );
    const timeOffsets = Array.from(
      new Set(
        ensureIsArray(
          slots
            .filter(
              slot =>
                !isMetricMode(slot.mode, slot.column) &&
                // Legacy implied offsets only render a "—" placeholder.
                !slot.implicitOffset,
            )
            .map(slot => slot.offset),
        ).filter(Boolean) as string[],
      ),
    );

    // Comparison value metrics are requested alongside the main metric so the
    // query result carries their columns (useful for custom SQL datasets that
    // pre-aggregate the comparison values). Metrics sharing the main metric's
    // label are dropped: the backend rejects duplicate labels, and the render
    // path falls back to the main value for such slots.
    const mainMetrics = ensureIsArray(baseQueryObject.metrics);
    const metricLabel = (metric: QueryFormMetric): string =>
      getMetricLabel(metric);
    const mainLabels = new Set(mainMetrics.map(metricLabel));
    const comparisonMetrics = ensureIsArray(
      slots
        .filter(slot => isMetricMode(slot.mode, slot.column))
        .map(slot => slot.column),
    ).filter(Boolean) as QueryFormMetric[];
    const uniqueComparisonMetrics: QueryFormMetric[] = [];
    comparisonMetrics.forEach(metric => {
      const label = metricLabel(metric);
      if (
        !mainLabels.has(label) &&
        !uniqueComparisonMetrics.some(m => metricLabel(m) === label)
      ) {
        uniqueComparisonMetrics.push(metric);
      }
    });

    // The time column may be an adhoc SQL expression (e.g. a custom DATETIME
    // expression). The backend `granularity` field only accepts a plain column
    // name, so an adhoc expression is downgraded to a regular query column:
    // the value stays available in the result (like the x-axis of the
    // BigNumber with Trendline chart) and no time filtering is applied.
    const timeColumn = formDataYoyMom.granularity_sqla;
    const isAdhocTimeColumn = !!timeColumn && typeof timeColumn !== 'string';

    // Open-ended ranges ("No filter") have no current period to shift, so the
    // backend time offsets are unavailable. With a time column present, split
    // the query into a main value query plus a point series query (the metric
    // grouped by the time column, newest first); the render path matches each
    // comparison slot by shifting the newest point by its offset.
    const pointSeries = timeOffsets.length > 0 && !hasTimeRange && !!timeColumn;

    // A time comparison requires an enclosed (start and end) time range on
    // the backend. Expand open-ended ranges (e.g. "Previous week") into
    // explicit bounds; ranges the backend resolves on its own are untouched.
    // The point-series path keeps the original range (e.g. "No filter").
    const resolvedTimeRange =
      timeOffsets.length > 0 && !pointSeries
        ? toEnclosedTimeRange(timeRange)
        : timeRange;

    const mainQuery = {
      ...baseQueryObject,
      ...(isAdhocTimeColumn
        ? {
            granularity: undefined,
            columns: [
              ...ensureIsArray(baseQueryObject.columns),
              timeColumn as QueryFormColumn,
            ],
          }
        : {}),
      metrics: [...mainMetrics, ...uniqueComparisonMetrics],
      time_range: resolvedTimeRange,
      // Time offsets require an enclosed range on the backend; without one
      // they are only sent on the point-series path (which sends none).
      time_offsets: hasTimeRange && !pointSeries ? timeOffsets : [],
    };
    if (!pointSeries) {
      return [mainQuery];
    }
    return [
      mainQuery,
      {
        ...baseQueryObject,
        metrics: mainMetrics,
        columns: [],
        granularity: undefined,
        time_range: timeRange,
        time_offsets: [],
        groupby: [timeColumn as QueryFormColumn],
        orderby: [[timeColumn as QueryFormColumn, false]],
        row_limit: offsetMaxRows(timeOffsets),
      },
    ];
  });
}
