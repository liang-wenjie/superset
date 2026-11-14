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
import { ensureIsArray, QueryFormData } from '@superset-ui/core';

/**
 * A mixed timeseries chart runs one independent QueryObject per configured
 * query. Query A and Query B are always emitted: every chart saved before C/D
 * existed has exactly those two, so keeping them unconditional preserves the
 * old payload shape and the `queriesData` indexes of existing charts.
 *
 * Query C is emitted only when `metrics_c` is non-empty, and Query D only
 * when both `metrics_c` and `metrics_d` are non-empty. Enabling them strictly
 * in order guarantees that `queriesData[i]` always corresponds to
 * `QUERY_SUFFIXES[i]`; there is no sparse mapping to keep in sync between
 * `buildQuery` and `transformProps`.
 */
export const QUERY_LABELS = ['A', 'B', 'C', 'D'] as const;
export type QueryLabel = (typeof QUERY_LABELS)[number];

/**
 * Query controls use snake_case keys with an underscore suffix.
 * eg. `metrics_b`, `groupby_c`, `adhoc_filters_d`.
 */
export const QUERY_SUFFIXES = ['', '_b', '_c', '_d'] as const;

/**
 * Customize-section controls use camelCase keys with a letter suffix. They are
 * also the spelling `ChartProps.formData` exposes after its top-level
 * `convertKeysToCamelCase` pass, which is why `transformProps` reads
 * `groupbyB`/`seriesTypeC` rather than `groupby_b`/`seriesType_c`.
 * eg. `seriesTypeB`, `areaC`, `yAxisIndexD`.
 */
export const DISPLAY_SUFFIXES = ['', 'B', 'C', 'D'] as const;

export const MAX_QUERY_COUNT = QUERY_SUFFIXES.length;
export const MIN_QUERY_COUNT = 2;

export const queryKey = (base: string, index: number): string =>
  `${base}${QUERY_SUFFIXES[index]}`;

export const displayKey = (base: string, index: number): string =>
  `${base}${DISPLAY_SUFFIXES[index]}`;

const readFormData = (formData: QueryFormData): Record<string, unknown> =>
  formData as Record<string, unknown>;

/**
 * Number of queries this chart will actually run (2, 3 or 4). A and B always
 * run; C/D require their own metrics and must be enabled in order.
 */
export const getEnabledQueryCount = (formData: QueryFormData): number => {
  const values = readFormData(formData);
  let count = MIN_QUERY_COUNT;
  for (let index = MIN_QUERY_COUNT; index < MAX_QUERY_COUNT; index += 1) {
    if (ensureIsArray(values[queryKey('metrics', index)]).length === 0) {
      break;
    }
    count += 1;
  }
  return count;
};

export const getEnabledQueryIndexes = (formData: QueryFormData): number[] =>
  Array.from({ length: getEnabledQueryCount(formData) }, (_, index) => index);

/**
 * Remove every query-specific key so Query A (and the shared query context)
 * only sees unsuffixed controls. Calling the old `removeFormDataSuffix(fd,
 * '_b')` once is no longer enough: with C/D present, A's query object would
 * otherwise retain `metrics_c` / `adhoc_filters_d` and friends.
 */
export const stripQuerySuffixes = (formData: QueryFormData): QueryFormData => {
  const suffixes = QUERY_SUFFIXES.filter(Boolean);
  const result: Record<string, unknown> = {};
  Object.entries(formData).forEach(([key, value]) => {
    if (!suffixes.some(suffix => key.endsWith(suffix))) {
      result[key] = value;
    }
  });
  return result as QueryFormData;
};

/**
 * Build the form data for one non-A query: promote its own suffixed keys to
 * unsuffixed ones, then drop any *other* query's leftovers. The result has the
 * same shape as Query A's form data, so `buildQueryContext` needs no changes.
 */
export const retainQuerySuffix = (
  formData: QueryFormData,
  index: number,
): QueryFormData => {
  if (index === 0) {
    return stripQuerySuffixes(formData);
  }
  const suffix = QUERY_SUFFIXES[index];
  const promoted: Record<string, unknown> = {};
  const entries = Object.entries(formData);
  // Suffixed entries come first so they win over the unsuffixed shared value,
  // mirroring `retainFormDataSuffix`.
  entries
    .filter(([key]) => key.endsWith(suffix))
    .forEach(([key, value]) => {
      promoted[key.slice(0, -suffix.length)] = value;
    });
  entries
    .filter(([key]) => !key.endsWith(suffix))
    .forEach(([key, value]) => {
      if (!(key in promoted)) {
        promoted[key] = value;
      }
    });
  return stripQuerySuffixes(promoted as QueryFormData);
};
