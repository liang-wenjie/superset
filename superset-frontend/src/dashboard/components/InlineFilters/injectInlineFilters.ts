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
import { ensureIsArray, JsonObject, QueryFormData } from '@superset-ui/core';
import type { InlineFilterConfig, InlineFilterSelection } from './types';
import {
  buildInlineAdhocFilter,
  getInlineFilterTargetKeys,
  INLINE_FILTER_ADHOC_KEY_A,
  INLINE_FILTER_ADHOC_KEY_B,
  isInlineFilterMulti,
  normalizeInlineFilterValue,
  resolveInlineFilterValue,
} from './types';

const isAdhocFiltersKey = (key: string): boolean =>
  key === INLINE_FILTER_ADHOC_KEY_A || key.startsWith('adhoc_filters_');

/**
 * Returns a new formData with the selected inline-filter values injected as
 * extra adhoc WHERE clauses. Existing adhoc_filters are preserved; inline
 * filters are keyed by `inline_<id>` so re-injection is idempotent.
 *
 * Each filter declares which query section it targets: `queryScope: 'A'` goes
 * only to `adhoc_filters`, `'B'` only to `adhoc_filters_b`, and an unscoped
 * filter (the shape saved before this field existed) goes to every query
 * section the chart declares. Mixed charts run A and B as separate queries,
 * so scoping is what makes two buttons produce a comparison instead of
 * filtering both series with the same value.
 *
 * A scoped filter also materializes both query keys when they are missing.
 * `retainFormDataSuffix` falls back to Query A's `adhoc_filters` whenever the
 * chart has no `adhoc_filters_b`, so leaving that key absent would apply a
 * Query A button to Query B through the buildQuery layer.
 *
 * A filter with no entry in `selection` uses its configured `defaultValue`;
 * an explicitly cleared filter (`null`) does not, so "All" stays reachable.
 * Required filters keep their default even when a stray clear arrives.
 */
export function injectInlineFilters(
  formData: QueryFormData,
  config: InlineFilterConfig[],
  selection: InlineFilterSelection,
): QueryFormData {
  if (!Array.isArray(config) || config.length === 0) return formData;

  const source = formData as unknown as Record<string, unknown>;
  const adhocKeys = new Set(Object.keys(source).filter(isAdhocFiltersKey));
  const hasScopedFilters = config.some(
    cfg => cfg.queryScope === 'A' || cfg.queryScope === 'B',
  );
  // A chart with a Query B section (any `*_b` control) always declares both
  // keys. Unscoped filters must reach both sections explicitly: relying on
  // filter sharing to copy them over would lose the clauses when the build
  // query strips inline filters from the shared list.
  const hasQueryBSection = Object.keys(source).some(key => key.endsWith('_b'));
  if (hasScopedFilters || hasQueryBSection) {
    adhocKeys.add(INLINE_FILTER_ADHOC_KEY_A);
    adhocKeys.add(INLINE_FILTER_ADHOC_KEY_B);
  }
  if (adhocKeys.size === 0) return formData;

  const keys = [...adhocKeys];
  const injectedByKey = new Map<string, JsonObject[]>();
  config.forEach(cfg => {
    let selected = resolveInlineFilterValue(cfg, selection);
    if (cfg.required && selected === null) {
      // A required filter must never query on "nothing". The filter bar
      // normally picks the first available value; fall back to the default
      // here too so the query stays consistent when the bar is not mounted
      // (e.g. dashboard edit mode). A dynamic "first item" default cannot be
      // resolved without the option list, so it is left to the bar.
      selected = cfg.defaultToFirstItem
        ? null
        : normalizeInlineFilterValue(
            cfg.defaultValue,
            isInlineFilterMulti(cfg),
          );
    }
    // `col IN ()` is invalid SQL and must not be injected.
    if (selected === null || !cfg.column) return;
    const clause = buildInlineAdhocFilter(
      cfg,
      selected,
    ) as unknown as JsonObject;
    getInlineFilterTargetKeys(cfg, keys).forEach(key => {
      const list = injectedByKey.get(key) ?? [];
      list.push(clause);
      injectedByKey.set(key, list);
    });
  });

  const stripInjected = (existing: JsonObject[]) =>
    existing.filter(
      f =>
        typeof f?.filterOptionName !== 'string' ||
        !f.filterOptionName.startsWith('inline_'),
    );

  const readExisting = (key: string): JsonObject[] =>
    ensureIsArray(source[key] as JsonObject[] | undefined);

  const entries = keys.map(
    key =>
      [
        key,
        [
          ...stripInjected(readExisting(key)),
          ...(injectedByKey.get(key) ?? []),
        ],
      ] as const,
  );

  // Keep the original object when nothing changed, so downstream memoization
  // does not see a fresh formData on every render. Materializing a missing
  // query key counts as a change even when it ends up empty.
  const changed = entries.some(([key, next]) => {
    if (!(key in source)) return true;
    const existing = readExisting(key);
    return (
      next.length !== existing.length ||
      next.some((filter, index) => filter !== existing[index])
    );
  });
  if (!changed) return formData;

  return {
    ...formData,
    ...Object.fromEntries(entries),
  } as QueryFormData;
}
