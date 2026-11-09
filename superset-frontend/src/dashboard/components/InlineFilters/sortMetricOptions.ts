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
  JsonObject,
  QueryFormData,
  QueryObject,
  QueryObjectFilterClause,
  SupersetClient,
} from '@superset-ui/core';

// Same ceiling the native Select filter uses for its value query.
const SORT_METRIC_ROW_LIMIT = 10000;

export interface InlineSortMetricQuery {
  datasourceId: string | number;
  datasourceType: string;
  column: string;
  sortMetric: string;
  sortAscending: boolean;
  filters?: QueryObjectFilterClause[];
}

export type InlineSortMetricOption = { label: string; value: string };

/**
 * The column-values endpoint can only sort by the value itself. Ordering by an
 * aggregate metric (e.g. "top products by revenue") needs a real query, so we
 * build the same query shape the native Select filter's buildQuery produces:
 * group by the filter column, add the metric, and order by that metric.
 */
export function buildInlineSortMetricPayload({
  datasourceId,
  datasourceType,
  column,
  sortMetric,
  sortAscending,
  filters = [],
}: InlineSortMetricQuery): ReturnType<typeof buildQueryContext> {
  const formData = {
    datasource: `${datasourceId}__${datasourceType}`,
    viz_type: 'filter_select',
    groupby: [column],
    row_limit: SORT_METRIC_ROW_LIMIT,
    result_format: 'json',
    result_type: 'results',
  } as unknown as QueryFormData;
  return buildQueryContext(formData, baseQueryObject => [
    {
      ...baseQueryObject,
      columns: [column],
      metrics: [sortMetric],
      orderby: [[sortMetric, sortAscending]] as QueryObject['orderby'],
      row_limit: SORT_METRIC_ROW_LIMIT,
      series_limit: 0,
      filters,
    },
  ]);
}

/**
 * Fetch the available values already ordered by the configured metric. The
 * caller is responsible for falling back to plain value ordering on failure.
 */
export async function fetchInlineSortMetricOptions(
  params: InlineSortMetricQuery,
): Promise<InlineSortMetricOption[]> {
  const payload = buildInlineSortMetricPayload(params);
  const { json } = await SupersetClient.post({
    endpoint: '/api/v1/chart/data',
    jsonPayload: payload as unknown as JsonObject,
  });
  const rows: Record<string, unknown>[] = json?.result?.[0]?.data ?? [];
  const seen = new Set<string>();
  return rows
    .map(row => {
      const raw = row[params.column] ?? Object.values(row)[0];
      if (raw === null || raw === undefined) return null;
      const value = String(raw);
      if (seen.has(value)) return null;
      seen.add(value);
      return { label: value, value };
    })
    .filter((option): option is InlineSortMetricOption => option !== null);
}
