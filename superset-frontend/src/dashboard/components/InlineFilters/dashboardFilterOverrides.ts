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
import { JsonObject } from '@superset-ui/core';
import type { InlineFilterSelectionValue } from './types';

/**
 * A column already pinned by a dashboard-level (native or cross) filter for
 * this chart holder. Its value takes precedence over the chart's inline
 * filter: injecting a second WHERE clause on the same column would either be
 * redundant or contradict the dashboard filter and return no rows.
 *
 * `value` is absent when the dashboard clause cannot be mirrored in the
 * dropdown, e.g. a `valueTransform` target that compares a SQL expression
 * (`报告月份+100`) instead of the raw column.
 */
export interface DashboardFilterOverride {
  value?: InlineFilterSelectionValue;
}

export type DashboardFilterOverrides = Record<string, DashboardFilterOverride>;

/** Operators that pin a column to a specific set of values. */
const EQUALITY_OPS = new Set(['==', 'IN', '=', 'EQ']);

const isPrimitive = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

/**
 * Collect the columns that runtime dashboard filters already constrain for a
 * chart holder. Only equality-style clauses count: `!=`/`NOT IN`/ranges leave
 * room for an inline filter to narrow the result further and must not disable
 * it. Column names are compared verbatim against `InlineFilterConfig.column`.
 *
 * Values are stringified because the inline filter's distinct-value options
 * always come back from the endpoint as strings; a numeric dashboard value
 * would otherwise never match an option in the dropdown.
 */
export function getDashboardFilterOverrides(
  dashboardFilters: JsonObject[] | undefined,
): DashboardFilterOverrides {
  const overrides: DashboardFilterOverrides = {};
  if (!Array.isArray(dashboardFilters)) return overrides;

  dashboardFilters.forEach(filter => {
    const { col, op, val, valueTransform } = filter ?? {};
    if (typeof col !== 'string' || col.length === 0) return;
    if (typeof op !== 'string' || !EQUALITY_OPS.has(op.toUpperCase())) return;

    // An empty IN list is not emitted by native filters and constrains
    // nothing; treating it as an override would disable the inline filter.
    if (Array.isArray(val) && val.length === 0) return;

    const values = Array.isArray(val) ? val : [val];
    if (
      values.some(entry => !isPrimitive(entry)) ||
      (valueTransform !== undefined &&
        valueTransform !== null &&
        valueTransform !== '')
    ) {
      // Still an override: a transformed equality clause pins the column in
      // SQL, but its raw value cannot be shown as a dropdown value.
      if (!Object.prototype.hasOwnProperty.call(overrides, col)) {
        overrides[col] = {};
      }
      return;
    }

    const normalized = values.map(String);
    const override = overrides[col] ?? {};
    if (override.value === undefined) {
      override.value =
        normalized.length === 1 ? normalized[0] : (normalized as string[]);
    }
    overrides[col] = override;
  });

  return overrides;
}

/** Whether a column is controlled by a dashboard-level filter. */
export function hasDashboardFilterOverride(
  overrides: DashboardFilterOverrides,
  column: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(overrides, column);
}
