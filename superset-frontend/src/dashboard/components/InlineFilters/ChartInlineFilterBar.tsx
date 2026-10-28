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
import { SupersetClient } from '@superset-ui/core';
import { t } from '@apache-superset/core/translation';
import type { InlineFilterConfig, InlineFilterSelection } from './types';

const BAR_HEIGHT = 28;

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

const StyledSelect = styled(Select)`
  width: 100px;
  flex-shrink: 0;
`;

interface DistinctCache {
  [column: string]: { label: string; value: string }[];
}

export interface ChartInlineFilterBarProps {
  /** Configured inline filters from chart formData. */
  filters: InlineFilterConfig[];
  /** Current selection state per filter id. */
  selection: InlineFilterSelection;
  /** Called when the user picks a value (or clears the filter). */
  onSelect: (filterId: string, value: string | number | boolean | undefined) => void;
  /** Datasource info for fetching distinct column values. */
  datasourceId?: string | number;
  datasourceType?: string;
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
}) => {
  const [distinctCache, setDistinctCache] = useState<DistinctCache>({});

  // Build extra filters from sibling selections (excluding the current column)
  const buildExtraFilters = (excludeCol: string) => {
    return filters
      .filter(f => f.column !== excludeCol && selection[f.id] !== undefined)
      .map(f => ({ col: f.column, val: selection[f.id] }));
  };

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
          return [col, []] as const;
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
  }, [filters, datasourceId, datasourceType, JSON.stringify(selection)]);

  if (!filters || filters.length === 0) return null;

  return (
    <Container data-test="chart-inline-filter-bar">
      {filters.map(f => {
        const current = selection[f.id];
        const options = distinctCache[f.column] ?? [];
        return (
          <React.Fragment key={f.id}>
            {f.label ? <FilterLabel>{f.label}:</FilterLabel> : null}
            <StyledSelect
              size="small"
              allowClear
              showSearch
              placeholder={t('All')}
              value={current as never}
              options={options as never}
              onChange={(value: never) =>
                onSelect(f.id, value as string | number | boolean | undefined)
              }
            />
          </React.Fragment>
        );
      })}
    </Container>
  );
};

export const INLINE_FILTER_BAR_HEIGHT = BAR_HEIGHT;

export default ChartInlineFilterBar;
