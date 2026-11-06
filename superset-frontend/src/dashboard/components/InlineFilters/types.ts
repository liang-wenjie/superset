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

/** A single inline filter value as returned by the column values endpoint. */
export type InlineFilterValue = string | number | boolean;

/** A selection is either one value or (for multi-select filters) several. */
export type InlineFilterSelectionValue =
  | InlineFilterValue
  | InlineFilterValue[];

/**
 * One inline filter, bound to a single datasource column.
 * Saved on the chart's formData under `inline_filters`.
 *
 * At render time each configured column shows a dropdown selector; picking a
 * value injects a WHERE clause and re-queries the chart.
 */
export interface InlineFilterConfig {
  /** Stable key used to track the selected value across renders. */
  id: string;
  /** Datasource column name to filter on. */
  column: string;
  /** Optional label shown before the dropdown, e.g. "分类". */
  label?: string;
  /**
   * When true the dropdown accepts several values and the injected WHERE
   * clause uses `IN` instead of `==`. Defaults to single-select.
   */
  multi?: boolean;
  /**
   * Optional preset options shown in the dropdown. If omitted the dropdown
   * falls back to a free-text combobox mode.
   */
  options?: Array<{ label: string; value: InlineFilterValue }>;
  /** Default selected value(s) when the chart first loads. */
  defaultValue?: InlineFilterSelectionValue;
}

/**
 * Runtime selection state: filter id -> selected value(s).
 * `undefined` (and an empty array) means the filter is cleared, so no WHERE
 * clause is injected.
 */
export type InlineFilterSelection = Record<
  string,
  InlineFilterSelectionValue | undefined
>;

/**
 * Build the adhoc_filter object injected into the query for a selected value.
 * Multi-value selections become an `IN` filter; single values keep `==`.
 * `isExtra: true` keeps it out of the visible adhoc_filters editor list.
 */
export function buildInlineAdhocFilter(
  config: InlineFilterConfig,
  value: InlineFilterSelectionValue,
) {
  return {
    clause: 'WHERE' as const,
    expressionType: 'SIMPLE' as const,
    subject: config.column,
    operator: Array.isArray(value) ? 'IN' : '==',
    comparator: value,
    isExtra: true,
    filterOptionName: `inline_${config.id}`,
  };
}
