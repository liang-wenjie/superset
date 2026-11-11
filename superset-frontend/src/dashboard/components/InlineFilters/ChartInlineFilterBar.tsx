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
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { styled } from '@apache-superset/core/theme';
import { Input, Select, Tooltip } from '@superset-ui/core/components';
import {
  JsonObject,
  QueryObjectFilterClause,
  SupersetClient,
} from '@superset-ui/core';
import { t } from '@apache-superset/core/translation';
import type {
  InlineFilterChangeValue,
  InlineFilterConfig,
  InlineFilterOption,
  InlineFilterSelection,
  InlineFilterSelectionValue,
  InlineFilterValue,
} from './types';
import {
  getInlineFilterDependencies,
  isEmptyInlineFilterValue,
  isInlineFilterInput,
  isInlineFilterInverse,
  isInlineFilterMulti,
  normalizeInlineFilterValue,
  resolveInlineFilterValue,
  sortInlineFilterOptions,
} from './types';
import { fetchInlineSortMetricOptions } from './sortMetricOptions';

const BAR_HEIGHT = 28;
const SEARCH_DEBOUNCE_MS = 250;

// Distinct values are usually much longer than the compact filter trigger.
// rc-select sizes the popup to the trigger by default, so every value was
// truncated to a few characters. A numeric width lets the popup grow with its
// content while keeping virtual scrolling enabled — `popupMatchSelectWidth={false}`
// would also auto-size it, but rc-select disables virtualization in that mode,
// which is expensive on high-cardinality columns (up to FILTER_SELECT_ROW_LIMIT).
// The estimate only needs to be approximate: antd renders a native `title` on
// each option, so values beyond the cap remain readable on hover.
const MIN_POPUP_WIDTH = 140;
const MAX_POPUP_WIDTH = 300;
const POPUP_CHROME_WIDTH = 48; // option padding, selected icon, scrollbar
const FULL_WIDTH_CHAR =
  /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;

const estimateLabelWidth = (label: string): number =>
  Array.from(label).reduce(
    (width, char) => width + (FULL_WIDTH_CHAR.test(char) ? 14 : 8),
    0,
  );

export const getInlineFilterPopupWidth = (
  options: { label?: string | number | null }[],
): number => {
  const longestLabel = options.reduce(
    (longest, option) =>
      Math.max(longest, estimateLabelWidth(String(option.label ?? ''))),
    0,
  );
  return Math.min(
    MAX_POPUP_WIDTH,
    Math.max(MIN_POPUP_WIDTH, longestLabel + POPUP_CHROME_WIDTH),
  );
};

/**
 * Sorted options for a filter. Mirrors the dashboard Select filter: sort the
 * values, then `options[0]` is the "first filter value" used by
 * `defaultToFirstItem` and by required-filter fallbacks. Values returned by
 * the sort-metric query are already ordered by the backend and must be kept
 * as-is, otherwise a plain value sort would discard the metric ordering.
 */
export const getInlineFilterOptions = (
  config: InlineFilterConfig,
  cached: { label: string; value: string }[] = [],
  alreadySorted = false,
): InlineFilterOption[] => {
  const raw =
    cached.length > 0
      ? cached
      : (config.options ?? []).map(option => ({
          label: option.label,
          value: option.value,
        }));
  return alreadySorted
    ? raw
    : sortInlineFilterOptions(raw, config.sortAscending !== false);
};

/**
 * Value a filter falls back to when it is cleared or has no selection yet.
 * `defaultToFirstItem` takes precedence over a concrete default (the two are
 * mutually exclusive in the config UI); otherwise use the default, and only
 * then the first sorted option.
 */
export const getInlineFilterFallbackValue = (
  config: InlineFilterConfig,
  options: InlineFilterOption[] = [],
): InlineFilterSelectionValue | null => {
  if (!config.defaultToFirstItem) {
    const fromDefault = normalizeInlineFilterValue(
      config.defaultValue,
      isInlineFilterMulti(config),
    );
    if (fromDefault !== null) return fromDefault;
  }
  const [first] = options;
  if (!first) return null;
  return isInlineFilterMulti(config) ? [first.value] : first.value;
};

export interface InlineValuesQueryParams {
  extraFilters?: { col: string; val: InlineFilterSelectionValue }[];
  whereAdhoc?: JsonObject[];
  legacyFilters?: JsonObject[];
  /**
   * Runtime dashboard/cross filters already applied to the chart's query,
   * including per-holder `valueTransform` clauses. They travel in
   * `chart_filters.filters` so the values endpoint compiles them with the
   * same SQL rules as the chart query.
   */
  dashboardFilters?: JsonObject[];
  search?: string;
}

/**
 * Query string for the column-values endpoint. `q` enables server-side
 * substring search (essential on high-cardinality columns where only one page
 * of values is loaded), while `extra_filters` cascades sibling selections and
 * `chart_filters` inherits both the chart's own WHERE clauses and the runtime
 * dashboard filters already applied to this holder.
 */
export const buildInlineValuesQuery = ({
  extraFilters = [],
  whereAdhoc = [],
  legacyFilters = [],
  dashboardFilters = [],
  search = '',
}: InlineValuesQueryParams): string => {
  const params = new URLSearchParams();
  if (extraFilters.length > 0) {
    params.set('extra_filters', JSON.stringify(extraFilters));
  }
  const chartFilters = [...legacyFilters, ...dashboardFilters];
  if (whereAdhoc.length > 0 || chartFilters.length > 0) {
    params.set(
      'chart_filters',
      JSON.stringify({ adhoc_filters: whereAdhoc, filters: chartFilters }),
    );
  }
  if (search) {
    params.set('q', search);
  }
  return params.toString();
};

interface InlineExtraFilterEntry {
  col: string;
  val: InlineFilterSelectionValue;
  inverse: boolean;
}

/** Convert sibling selections into `/api/v1/chart/data` WHERE clauses. */
export const toInlineQueryFilters = (
  entries: InlineExtraFilterEntry[],
): QueryObjectFilterClause[] =>
  entries.map(({ col, val, inverse }) =>
    Array.isArray(val)
      ? {
          col,
          op: (inverse ? 'NOT IN' : 'IN') as 'IN' | 'NOT IN',
          val,
        }
      : {
          col,
          op: (inverse ? '!=' : '==') as '==' | '!=',
          val,
        },
  );

const Container = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  overflow-x: auto;
  white-space: nowrap;
`;

const FilterLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme }) => theme.colorTextSecondary};
  flex-shrink: 0;
`;

// Grow with the selected value instead of showing a fixed 100px box; the bar
// scrolls horizontally when several filters are configured. Both select
// variants match the table chart's "Entries per page" pagination selector,
// so the "Allow multiple values" switch never resizes the filter box.
const StyledSelect = styled(Select)`
  width: auto;
  min-width: 110px;
  max-width: 220px;
  flex-shrink: 0;

  /* In antd 6 the bordered box is the .ant-select root itself. The pagination
     page-size selector is a plain antd Select with size="small", which resolves
     to theme.controlHeightSM via --ant-select-height. Superset's Select wrapper
     otherwise forces a 32px line-height on that root and gives it flex: 0 inside
     a column flex container, where flex-basis 0 makes a plain height
     ineffective. Restore antd's own line-height and pin min/max-height to the
     same small-control token: those are hard constraints for flex items. */
  && .ant-select {
    line-height: ${({ theme }) => theme.lineHeight};
    min-height: ${({ theme }) => theme.controlHeightSM}px;
    max-height: ${({ theme }) => theme.controlHeightSM}px;
  }

  /* Center the value row against the (already centered) arrow. */
  && .ant-select .ant-select-content {
    align-self: center;
  }
`;

// Free-text filters use the same compact trigger as the dropdown variants.
const StyledInput = styled(Input)`
  width: 160px;
  min-width: 110px;
  max-width: 220px;
  flex-shrink: 0;
`;

interface OptionsCacheEntry {
  options: { label: string; value: string }[];
  /** True when the order came from a sort-metric query (do not re-sort). */
  byMetric: boolean;
}

export interface ChartInlineFilterBarProps {
  /** Configured inline filters from chart formData. */
  filters: InlineFilterConfig[];
  /** Current selection state per filter id. */
  selection: InlineFilterSelection;
  /**
   * Called when the user picks value(s) or clears the filter. Clearing sends
   * `null`, which is distinct from a missing selection key.
   */
  onSelect: (filterId: string, value: InlineFilterChangeValue) => void;
  /** Datasource info for fetching distinct column values. */
  datasourceId?: string | number;
  datasourceType?: string;
  /**
   * The chart's own adhoc filters (``formData.adhoc_filters``). WHERE-clause
   * entries are sent to the values endpoint so the dropdown only suggests
   * values that survive the chart's own filters.
   */
  chartAdhocFilters?: JsonObject[];
  /** Legacy ``formData.filters`` (``{col, op, val}``), inherited the same way. */
  chartLegacyFilters?: JsonObject[];
  /**
   * Runtime dashboard/cross filters currently applied to this holder. Unlike
   * the saved chart filters these change with the user's filter selections
   * and can carry a per-instance SQL `valueTransform`.
   */
  dashboardFilters?: JsonObject[];
}

/**
 * Renders one dropdown selector per configured column at the top-left of a chart.
 * Controlled component — parent owns the selection state.
 */
export const ChartInlineFilterBar: React.FC<ChartInlineFilterBarProps> = ({
  filters,
  selection,
  onSelect,
  datasourceId,
  datasourceType,
  chartAdhocFilters,
  chartLegacyFilters,
  dashboardFilters,
}) => {
  const [optionsCache, setOptionsCache] = useState<
    Record<string, OptionsCacheEntry>
  >({});
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
  const [inputDrafts, setInputDrafts] = useState<Record<string, string>>({});
  const searchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );
  const inputTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Stable string keys keep the effects below from re-running on every
  // render: the parent may hand us freshly built arrays each time.
  const filtersKey = JSON.stringify(filters);
  const selectionKey = JSON.stringify(selection);
  const chartAdhocFiltersKey = JSON.stringify(chartAdhocFilters);
  const chartLegacyFiltersKey = JSON.stringify(chartLegacyFilters);
  const dashboardFiltersKey = JSON.stringify(dashboardFilters);
  const searchTermsKey = JSON.stringify(searchTerms);

  const optionsFor = useCallback(
    (config: InlineFilterConfig): InlineFilterOption[] => {
      const entry = optionsCache[config.id];
      return getInlineFilterOptions(
        config,
        entry?.options ?? [],
        Boolean(entry?.byMetric),
      );
    },
    [optionsCache],
  );

  // Build extra filters from the configured dependencies (all siblings by
  // default, or only the ones named in `dependsOn`). Defaults count too,
  // otherwise a filter that has never been touched would not narrow the values
  // offered to its siblings.
  const buildExtraFilters = (
    config: InlineFilterConfig,
  ): InlineExtraFilterEntry[] =>
    getInlineFilterDependencies(config, filters)
      .filter(f => Boolean(f.column))
      .map(f => ({
        col: f.column,
        val: resolveInlineFilterValue(f, selection, optionsFor(f)),
        inverse: isInlineFilterInverse(f),
      }))
      .filter((entry): entry is InlineExtraFilterEntry => entry.val !== null);

  // Fetch distinct values for each configured filter, re-fetching when
  // sibling selections or the search box change so options cascade.
  useEffect(() => {
    if (!datasourceId || !datasourceType) return undefined;
    const active = filters.filter(f => f.column);
    if (active.length === 0) return undefined;

    let cancelled = false;
    const runtimeFilters = (dashboardFilters ??
      []) as QueryObjectFilterClause[];
    Promise.all(
      active.map(async (f): Promise<readonly [string, OptionsCacheEntry]> => {
        // A free-text filter has no option list, so skip both the values
        // endpoint and the sort-metric query entirely.
        if (isInlineFilterInput(f)) {
          return [f.id, { options: [], byMetric: false }] as const;
        }
        const extra = buildExtraFilters(f);
        const search = searchTerms[f.id] ?? '';
        if (f.sortMetric) {
          try {
            const metricOptions = await fetchInlineSortMetricOptions({
              datasourceId,
              datasourceType,
              column: f.column,
              sortMetric: f.sortMetric,
              sortAscending: f.sortAscending !== false,
              filters: [...toInlineQueryFilters(extra), ...runtimeFilters],
            });
            if (metricOptions.length > 0) {
              return [
                f.id,
                { options: metricOptions, byMetric: true },
              ] as const;
            }
          } catch {
            // The metric query is optional; fall back to plain values.
          }
        }
        try {
          const whereAdhoc = (chartAdhocFilters ?? []).filter(
            filter => (filter?.clause ?? 'WHERE') === 'WHERE',
          );
          const query = buildInlineValuesQuery({
            extraFilters: extra.map(({ col, val }) => ({ col, val })),
            whereAdhoc,
            legacyFilters: chartLegacyFilters ?? [],
            dashboardFilters: dashboardFilters ?? [],
            search,
          });
          const { json } = await SupersetClient.get({
            endpoint:
              `/api/v1/datasource/${datasourceType}/${datasourceId}` +
              `/column/${encodeURIComponent(f.column)}/values/${query ? `?${query}` : ''}`,
          });
          const values: unknown[] = json?.result ?? [];
          const seen = new Set<string>();
          const options = values
            .filter(v => v !== null && v !== undefined)
            .map(v => ({ label: String(v), value: String(v) }))
            .filter(opt => {
              if (seen.has(opt.value)) return false;
              seen.add(opt.value);
              return true;
            });
          return [f.id, { options, byMetric: false }] as const;
        } catch {
          return [f.id, { options: [], byMetric: false }] as const;
        }
      }),
    ).then(entries => {
      if (cancelled) return;
      setOptionsCache(prev => {
        const next = { ...prev };
        entries.forEach(([id, entry]) => {
          next[id] = entry;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filtersKey,
    datasourceId,
    datasourceType,
    selectionKey,
    chartAdhocFiltersKey,
    chartLegacyFiltersKey,
    dashboardFiltersKey,
    searchTermsKey,
  ]);

  // Resolve dynamic defaults once the (sorted) distinct options have loaded.
  // Like the dashboard Select filter's `defaultToFirstItem`, the first item is
  // only seeded while the selection has never been touched: an explicit clear
  // (`null`) is the equivalent of its `userClearedRef` and must stay cleared.
  // A required filter still gets a fallback value even after a stray clear.
  useEffect(() => {
    filters.forEach(f => {
      const options = optionsFor(f);
      const neverTouched = selection[f.id] === undefined;
      if (f.defaultToFirstItem && neverTouched) {
        const fallback = getInlineFilterFallbackValue(f, options);
        if (fallback !== null) onSelect(f.id, fallback);
        return;
      }
      if (
        f.required &&
        resolveInlineFilterValue(f, selection, options) === null
      ) {
        const fallback = getInlineFilterFallbackValue(f, options);
        if (fallback !== null) onSelect(f.id, fallback);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, selectionKey, optionsCache, onSelect]);

  // A free-text box keeps a local draft while typing, so an external reset
  // (e.g. "clear all filters") must drop that draft to show the new value.
  useEffect(() => {
    setInputDrafts(prev => {
      let changed = false;
      const next = { ...prev };
      Object.keys(next).forEach(id => {
        if (selection[id] === null) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);

  useEffect(
    () => () => {
      Object.values(searchTimers.current).forEach(timer => clearTimeout(timer));
      Object.values(inputTimers.current).forEach(timer => clearTimeout(timer));
    },
    [],
  );

  const handleSearch = (filterId: string, text: string) => {
    const pending = searchTimers.current[filterId];
    if (pending) clearTimeout(pending);
    searchTimers.current[filterId] = setTimeout(() => {
      setSearchTerms(prev =>
        (prev[filterId] ?? '') === text ? prev : { ...prev, [filterId]: text },
      );
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleInputChange = (config: InlineFilterConfig, text: string) => {
    setInputDrafts(prev => ({ ...prev, [config.id]: text }));
    const pending = inputTimers.current[config.id];
    if (pending) clearTimeout(pending);
    delete inputTimers.current[config.id];
    if (config.required && text.trim() === '') {
      // A required filter must keep a value in the query, but the box itself
      // has to stay editable: snapping the draft back on every keystroke made
      // the last character impossible to delete. Keep the last committed
      // value in the query and let onBlur restore the displayed text.
      return;
    }
    inputTimers.current[config.id] = setTimeout(() => {
      onSelect(config.id, text.trim() === '' ? null : text);
    }, SEARCH_DEBOUNCE_MS);
  };

  // Leaving a required box empty would show nothing while the chart is still
  // filtered by the last committed value. Restore that value on blur so the
  // box and the query agree, without interrupting editing mid-keystroke.
  const handleInputBlur = (
    config: InlineFilterConfig,
    committedText: string,
  ) => {
    if (!config.required) return;
    setInputDrafts(prev => {
      const draft = prev[config.id];
      return draft !== undefined && draft.trim() === ''
        ? { ...prev, [config.id]: committedText }
        : prev;
    });
  };

  if (!filters || filters.length === 0) return null;

  return (
    <Container data-test="chart-inline-filter-bar">
      {filters.map(f => {
        const options = optionsFor(f);
        const multi = isInlineFilterMulti(f);
        const inverse = isInlineFilterInverse(f);
        const isInput = isInlineFilterInput(f);
        const required = Boolean(f.required);
        const showSearch = !isInput && f.showSearch !== false;
        // A missing selection key applies the configured default (including a
        // dynamic "first sorted value"); an explicit `null` stays cleared.
        // `resolveInlineFilterValue` also normalizes stale scalar/array values
        // when the filter type changed.
        const effective = resolveInlineFilterValue(f, selection, options);
        const scalarText =
          effective === null
            ? ''
            : String(
                Array.isArray(effective) ? (effective[0] ?? '') : effective,
              );
        const currentValue = multi
          ? effective === null
            ? []
            : Array.isArray(effective)
              ? effective
              : [effective]
          : (effective ?? undefined);
        const labelNode = (
          <FilterLabel>
            {f.label}
            {inverse ? t(' (exclude)') : ''}
            {f.description ? ' ⓘ:' : ':'}
          </FilterLabel>
        );
        return (
          <React.Fragment key={f.id}>
            {f.label ? (
              f.description ? (
                <Tooltip title={f.description}>{labelNode}</Tooltip>
              ) : (
                labelNode
              )
            ) : null}
            {isInput ? (
              <StyledInput
                size="small"
                aria-label={f.label || f.column}
                placeholder={
                  f.matchMode === 'contains'
                    ? t('Type to search (contains)')
                    : t('Type an exact value')
                }
                value={inputDrafts[f.id] ?? scalarText}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleInputChange(f, e.target.value)
                }
                onBlur={() => handleInputBlur(f, scalarText)}
              />
            ) : (
              <StyledSelect
                size="small"
                allowClear={!required}
                showSearch={showSearch}
                onSearch={
                  showSearch ? text => handleSearch(f.id, text) : undefined
                }
                mode={multi ? 'multiple' : 'single'}
                oneLine={multi}
                placeholder={
                  required ? t('Required') : inverse ? t('Exclude') : t('All')
                }
                value={currentValue as never}
                options={options as never}
                popupMatchSelectWidth={getInlineFilterPopupWidth(options)}
                onChange={(value: never) => {
                  const next: InlineFilterChangeValue = multi
                    ? Array.isArray(value)
                      ? (value as InlineFilterValue[])
                      : []
                    : (value as InlineFilterValue | undefined);
                  if (required && isEmptyInlineFilterValue(next)) {
                    const fallback = getInlineFilterFallbackValue(f, options);
                    if (fallback !== null) {
                      onSelect(f.id, fallback);
                    }
                    // No fallback yet: leave the controlled value alone so the
                    // select snaps back instead of storing an empty selection.
                    return;
                  }
                  // An empty IN list is invalid SQL; `null` marks an explicit
                  // clear so the default value is not silently reapplied.
                  onSelect(f.id, isEmptyInlineFilterValue(next) ? null : next);
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </Container>
  );
};

export const INLINE_FILTER_BAR_HEIGHT = BAR_HEIGHT;

export default ChartInlineFilterBar;
