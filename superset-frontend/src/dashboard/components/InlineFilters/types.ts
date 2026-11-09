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
 * Value handed to the selection setter. `null` means the user explicitly
 * cleared the filter; it is deliberately different from a missing key, which
 * means "never touched, apply the configured default value".
 */
export type InlineFilterChangeValue =
  | InlineFilterSelectionValue
  | null
  | undefined;

/** One selectable value in an inline filter dropdown. */
export type InlineFilterOption = {
  label: string;
  value: InlineFilterValue;
};

/**
 * Sort options the same way the dashboard Select filter sorts its values
 * (`SelectFilterPlugin`'s sortComparator): numeric values compare
 * numerically, everything else by label with numeric-aware locale ordering.
 */
export function sortInlineFilterOptions<T extends InlineFilterOption>(
  options: T[],
  ascending = true,
): T[] {
  const compare = (a: T, b: T): number => {
    const aValue = String(a.value);
    const bValue = String(b.value);
    const aNumber = Number(aValue);
    const bNumber = Number(bValue);
    const bothNumeric =
      aValue.trim() !== '' &&
      bValue.trim() !== '' &&
      !Number.isNaN(aNumber) &&
      !Number.isNaN(bNumber);
    const result = bothNumeric
      ? aNumber - bNumber
      : String(a.label ?? aValue).localeCompare(
          String(b.label ?? bValue),
          undefined,
          {
            numeric: true,
            sensitivity: 'base',
          },
        );
    return ascending ? result : -result;
  };
  return [...options].sort(compare);
}

/**
 * Interaction mode chosen in the "Filter type" picker. Excluding values is
 * NOT a type: `inverseSelection` is an independent switch that can be
 * combined with any of these modes.
 */
export type InlineFilterType = 'single' | 'multiple' | 'input';

/** How a free-text (`input`) filter matches the typed value. */
export type InlineFilterMatchMode = 'exact' | 'contains';

/**
 * One inline filter, bound to a single datasource column.
 * Saved on the chart's formData under `inline_filters`.
 *
 * At render time each configured column shows a dropdown selector (or a text
 * box for `input` filters); picking a value injects a WHERE clause and
 * re-queries the chart.
 */
export interface InlineFilterConfig {
  /** Stable key used to track the selected value across renders. */
  id: string;
  /** Datasource column name to filter on. */
  column: string;
  /** Optional label shown before the dropdown, e.g. "分类". */
  label?: string;
  /**
   * Interaction mode. `single`/`multiple` render a value dropdown, `input`
   * renders a free-text box. When absent, the legacy `multi` flag is used so
   * charts saved before this field existed keep working unchanged. Exclusion
   * is controlled independently by `inverseSelection`.
   */
  filterType?: InlineFilterType;
  /**
   * For `input` filters: `exact` uses `==`, `contains` uses `ILIKE '%value%'`.
   * Defaults to `exact`.
   */
  matchMode?: InlineFilterMatchMode;
  /**
   * Legacy flag, superseded by `filterType`. Kept in sync by the config UI so
   * older readers still see the right shape; runtime code derives from
   * `getInlineFilterType` instead.
   */
  multi?: boolean;
  /**
   * Optional preset options shown in the dropdown. If omitted the dropdown
   * falls back to a free-text combobox mode.
   */
  options?: Array<{ label: string; value: InlineFilterValue }>;
  /**
   * When true the filter always applies a value: the clear affordance is
   * hidden and clearing a multi-select falls back to the default value (or to
   * the first available value when no default is configured).
   */
  required?: boolean;
  /**
   * Value used until the user makes a selection. It is NOT reapplied after an
   * explicit clear (`null`), so "All" stays reachable on optional filters.
   */
  defaultValue?: InlineFilterSelectionValue;
  /**
   * Mirrors the dashboard native filter's "Select first filter value by
   * default". When true the first value of the sorted option list becomes the
   * default at runtime; it is mutually exclusive with `defaultValue` and is
   * not reapplied after the user explicitly clears the filter.
   */
  defaultToFirstItem?: boolean;
  /** Sort direction for the dropdown and for the first-value default. */
  sortAscending?: boolean;
  /**
   * Show a search box in the runtime dropdown. When enabled the typed text is
   * also forwarded to the column values endpoint as `q`, so high-cardinality
   * columns are searched server-side instead of only filtering the loaded page.
   * Defaults to true when undefined (matches the previous unconditional
   * `showSearch` behaviour).
   */
  showSearch?: boolean;
  /**
   * Independent "Inverse selection" switch, mirroring the native Select
   * filter. Turning it on negates the operator: `!=` / `NOT IN` / `NOT ILIKE`
   * instead of `==` / `IN` / `ILIKE`. It applies to every `filterType`,
   * including the free-text input mode.
   */
  inverseSelection?: boolean;
  /**
   * Ids of sibling inline filters whose selections narrow this filter's
   * available values. `undefined` (the default, for configs saved before this
   * field existed) means "all sibling filters"; an empty array explicitly
   * disables cascading.
   */
  dependsOn?: string[];
  /** Extra description shown as a tooltip next to the runtime filter. */
  description?: string;
  /**
   * Metric used to order the available values, mirroring the native Select
   * filter's "Sort metric". Unlike a plain value sort this needs a chart data
   * query, so the filter bar falls back to value sorting when it fails.
   */
  sortMetric?: string;
}

/**
 * Runtime selection state: filter id -> selected value(s).
 *
 * - missing key / `undefined`: untouched, `config.defaultValue` applies;
 * - `null`: explicitly cleared by the user, no WHERE clause is injected and
 *   the default is not reapplied;
 * - `''` / `[]`: also treated as empty by `isEmptyInlineFilterValue`.
 */
export type InlineFilterSelection = Record<string, InlineFilterChangeValue>;

/**
 * Resolve the interaction mode, falling back to `multi` when `filterType` is
 * absent. This is the single source of truth for the value shape — never read
 * `config.multi` directly.
 */
export function getInlineFilterType(
  config: InlineFilterConfig,
): InlineFilterType {
  if (
    config.filterType === 'single' ||
    config.filterType === 'multiple' ||
    config.filterType === 'input'
  ) {
    return config.filterType;
  }
  return config.multi ? 'multiple' : 'single';
}

export function isInlineFilterMulti(config: InlineFilterConfig): boolean {
  return getInlineFilterType(config) === 'multiple';
}

/** Exclusion is an independent switch, not a filter type. */
export function isInlineFilterInverse(config: InlineFilterConfig): boolean {
  return Boolean(config.inverseSelection);
}

export function isInlineFilterInput(config: InlineFilterConfig): boolean {
  return getInlineFilterType(config) === 'input';
}

/** True for any value that must not be sent to the query. */
export function isEmptyInlineFilterValue(
  value: InlineFilterChangeValue,
): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * Coerce a raw value into the shape the current `multi` setting expects.
 * A stale scalar from before `multi` was enabled becomes a one-item array,
 * and an array left over from a disabled `multi` collapses to its first item.
 */
export function normalizeInlineFilterValue(
  value: InlineFilterChangeValue,
  multi: boolean,
): InlineFilterSelectionValue | null {
  if (isEmptyInlineFilterValue(value)) return null;
  if (multi) {
    return Array.isArray(value) ? value : [value as InlineFilterValue];
  }
  return Array.isArray(value)
    ? ((value[0] ?? null) as InlineFilterValue | null)
    : (value as InlineFilterValue);
}

/**
 * Effective value for a filter. A missing/undefined selection means the user
 * has not touched the filter yet, so the configured default applies. An
 * explicit clear (`null`) suppresses the default.
 *
 * `defaultToFirstItem` is resolved from `options` (already sorted). Query
 * injection has no option list, so the filter bar writes the resolved value
 * back into the selection as soon as the values load.
 */
export function resolveInlineFilterValue(
  config: InlineFilterConfig,
  selection: InlineFilterSelection,
  options: InlineFilterOption[] = [],
): InlineFilterSelectionValue | null {
  const multi = isInlineFilterMulti(config);
  const selected = selection[config.id];
  if (selected === undefined && config.defaultToFirstItem) {
    const [first] = options;
    return first ? normalizeInlineFilterValue(first.value, multi) : null;
  }
  const raw = selected === undefined ? config.defaultValue : selected;
  return normalizeInlineFilterValue(raw, multi);
}

/**
 * Sibling filters whose selections narrow this filter's option list.
 * `dependsOn === undefined` preserves the original cascading behaviour (all
 * siblings); an explicit empty array turns cascading off.
 */
export function getInlineFilterDependencies(
  config: InlineFilterConfig,
  all: InlineFilterConfig[],
): InlineFilterConfig[] {
  if (config.dependsOn === undefined) {
    return all.filter(f => f.id !== config.id && f.column !== config.column);
  }
  const ids = new Set(config.dependsOn);
  return all.filter(f => f.id !== config.id && ids.has(f.id));
}

/**
 * Build the adhoc_filter object injected into the query for a selected value.
 * Multi-value selections become `IN`; single values keep `==`. When the
 * independent `inverseSelection` switch is on they become `NOT IN` / `!=`.
 * A free-text `input` filter uses `==`, or `ILIKE '%value%'` / `NOT ILIKE`
 * when fuzzy matching is enabled.
 * `isExtra: true` keeps it out of the visible adhoc_filters editor list.
 */
export function buildInlineAdhocFilter(
  config: InlineFilterConfig,
  value: InlineFilterSelectionValue,
) {
  const isMulti = Array.isArray(value);
  const inverse = isInlineFilterInverse(config);
  const fuzzy = isInlineFilterInput(config) && config.matchMode === 'contains';
  let operator: string;
  let comparator: InlineFilterSelectionValue = value;
  if (fuzzy) {
    // Mirrors the native Select filter's wildcard handling: case-insensitive
    // substring match on the typed text.
    const raw = Array.isArray(value) ? (value[0] ?? '') : value;
    operator = inverse ? 'NOT ILIKE' : 'ILIKE';
    comparator = `%${String(raw)}%`;
  } else if (isMulti) {
    operator = inverse ? 'NOT IN' : 'IN';
  } else {
    operator = inverse ? '!=' : '==';
  }
  return {
    clause: 'WHERE' as const,
    expressionType: 'SIMPLE' as const,
    subject: config.column,
    operator,
    comparator,
    isExtra: true,
    filterOptionName: `inline_${config.id}`,
  };
}
