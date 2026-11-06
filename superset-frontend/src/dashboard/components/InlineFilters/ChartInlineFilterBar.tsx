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
import React, { useEffect, useState } from 'react';
import { styled } from '@apache-superset/core/theme';
import { Select } from '@superset-ui/core/components';
import { JsonObject, SupersetClient } from '@superset-ui/core';
import { t } from '@apache-superset/core/translation';
import type {
  InlineFilterConfig,
  InlineFilterSelection,
  InlineFilterSelectionValue,
  InlineFilterValue,
} from './types';

const BAR_HEIGHT = 28;

// Natural box height of antd's multiple selector at size="small" in this bar,
// measured from the rendered UI: 31px including its two 1px borders. The
// SINGLE variant is taller (43px) because it inherits the wrapper's 32px
// line-height and adds vertical padding, while the multiple selector keeps its
// content at line-height 1. Pin both to the multiple selector's ORIGINAL
// height and compact the single variant's metrics to fit that box.
export const INLINE_FILTER_SELECT_HEIGHT = 31;

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
// variants are pinned to the multiple selector's original height below, so
// the "Allow multiple values" switch never resizes the filter box.
const StyledSelect = styled(Select)`
  width: auto;
  min-width: 110px;
  max-width: 220px;
  flex-shrink: 0;

  /* In antd 6 the bordered box is the .ant-select root itself. Superset's
     Select gives that root flex: 0 inside a column flex container, so
     flex-basis 0 makes a plain height ineffective. min/max-height are hard
     constraints for flex items: pin both to the multiple selector's original
     height so the taller single variant shrinks to match. */
  && .ant-select {
    min-height: ${INLINE_FILTER_SELECT_HEIGHT}px;
    max-height: ${INLINE_FILTER_SELECT_HEIGHT}px;
  }

  /* The single variant is 43px by default: it inherits the wrapper's 32px
     line-height and adds vertical padding. Compact both so its value fits the
     31px multiple-height box without being clipped. */
  && .ant-select-single {
    line-height: 1;
    padding-block: 0;
  }

  /* Center the value row against the (already centered) arrow. */
  && .ant-select .ant-select-content {
    align-self: center;
  }
`;

interface DistinctCache {
  [column: string]: { label: string; value: string }[];
}

export interface ChartInlineFilterBarProps {
  /** Configured inline filters from chart formData. */
  filters: InlineFilterConfig[];
  /** Current selection state per filter id. */
  selection: InlineFilterSelection;
  /** Called when the user picks value(s) (or clears the filter). */
  onSelect: (
    filterId: string,
    value: InlineFilterSelectionValue | undefined,
  ) => void;
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
}) => {
  const [distinctCache, setDistinctCache] = useState<DistinctCache>({});

  // Build extra filters from sibling selections (excluding the current column)
  const buildExtraFilters = (excludeCol: string) =>
    filters
      .filter(f => f.column !== excludeCol && selection[f.id] !== undefined)
      .map(f => ({ col: f.column, val: selection[f.id] }));

  // Fetch distinct values for each configured column, re-fetching when
  // sibling selections change so options cascade.
  useEffect(() => {
    if (!datasourceId || !datasourceType) return;
    const columns = filters.map(f => f.column).filter(Boolean);
    if (columns.length === 0) return;

    let cancelled = false;
    Promise.all(
      columns.map(async col => {
        try {
          const extraFilters = buildExtraFilters(col);
          const params = new URLSearchParams();
          if (extraFilters.length > 0) {
            params.set('extra_filters', JSON.stringify(extraFilters));
          }
          // Inherit the chart's own WHERE filters so the suggested values match
          // the rows the chart renders (e.g. only the category a chart-level
          // filter already selected). Sibling inline selections stay in
          // extra_filters; the chart's own adhoc_filters never include them.
          const whereAdhoc = (chartAdhocFilters ?? []).filter(
            f => (f?.clause ?? 'WHERE') === 'WHERE',
          );
          if (whereAdhoc.length > 0 || (chartLegacyFilters?.length ?? 0) > 0) {
            params.set(
              'chart_filters',
              JSON.stringify({
                adhoc_filters: whereAdhoc,
                filters: chartLegacyFilters ?? [],
              }),
            );
          }
          const query = params.toString();
          const { json } = await SupersetClient.get({
            endpoint:
              `/api/v1/datasource/${datasourceType}/${datasourceId}` +
              `/column/${encodeURIComponent(col)}/values/${query ? `?${query}` : ''}`,
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
          return [col, options] as const;
        } catch {
          // Keep the same tuple shape as the success branch so the cached
          // options stay assignable to the mutable DistinctCache values.
          return [col, [] as { label: string; value: string }[]] as [
            string,
            { label: string; value: string }[],
          ];
        }
      }),
    ).then(entries => {
      if (cancelled) return;
      setDistinctCache(prev => {
        const next = { ...prev };
        entries.forEach(([col, opts]) => {
          next[col] = opts;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    JSON.stringify(filters),
    datasourceId,
    datasourceType,
    JSON.stringify(selection),
    JSON.stringify(chartAdhocFilters),
    JSON.stringify(chartLegacyFilters),
  ]);

  if (!filters || filters.length === 0) return null;

  return (
    <Container data-test="chart-inline-filter-bar">
      {filters.map(f => {
        const current = selection[f.id];
        const options = distinctCache[f.column] ?? [];
        const multi = Boolean(f.multi);
        // Selections saved before the multi toggle existed are scalars; wrap
        // them in an array so enabling multi never drops the current value.
        const currentValue = multi
          ? current === undefined
            ? []
            : Array.isArray(current)
              ? current
              : [current]
          : current;
        return (
          <React.Fragment key={f.id}>
            {f.label ? <FilterLabel>{f.label}:</FilterLabel> : null}
            <StyledSelect
              size="small"
              allowClear
              showSearch
              mode={multi ? 'multiple' : 'single'}
              oneLine={multi}
              placeholder={t('All')}
              value={currentValue as never}
              options={options as never}
              popupMatchSelectWidth={getInlineFilterPopupWidth(options)}
              onChange={(value: never) => {
                if (multi) {
                  const selected = Array.isArray(value)
                    ? (value as InlineFilterValue[])
                    : [];
                  // An empty IN list is invalid SQL; treat it as cleared.
                  onSelect(f.id, selected.length > 0 ? selected : undefined);
                } else {
                  onSelect(f.id, value as InlineFilterValue | undefined);
                }
              }}
            />
          </React.Fragment>
        );
      })}
    </Container>
  );
};

export const INLINE_FILTER_BAR_HEIGHT = BAR_HEIGHT;

export default ChartInlineFilterBar;
