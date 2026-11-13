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
import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { JsonObject } from '@superset-ui/core';
import { ChartInlineFilterBar } from './ChartInlineFilterBar';
import type { InlineFilterChangeValue, InlineFilterConfig } from './types';
import type { RootState } from '../../types';
import { setChartInlineFilter } from '../../actions/dashboardState';
import { triggerQuery } from 'src/components/Chart/chartAction';

interface DashboardInlineFilterBarProps {
  /** Redux chart state key: numeric slice id, or `<chartId>::<componentId>`. */
  chartKey: number | string;
  /** Raw inline_filters from the chart formData. */
  rawConfig: JsonObject | InlineFilterConfig[] | undefined;
  datasourceId?: string | number;
  datasourceType?: string;
  /** The chart's own adhoc filters, inherited by the values endpoint. */
  chartAdhocFilters?: JsonObject[];
  /** Query B's saved adhoc filters for filters bound to Query B. */
  chartAdhocFiltersB?: JsonObject[];
  /** Legacy chart filters (``{col, op, val}``), inherited the same way. */
  chartLegacyFilters?: JsonObject[];
  /** Runtime dashboard/cross filters already applied to this holder's query. */
  dashboardFilters?: JsonObject[];
}

/** Coerce the loosely-typed formData value into InlineFilterConfig[]. */
function normalizeConfig(
  raw: JsonObject | InlineFilterConfig[] | undefined,
): InlineFilterConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (g): g is InlineFilterConfig =>
      !!g && typeof g === 'object' && 'column' in g && !!g.column,
  );
}

/**
 * Dashboard-connected version of the inline filter bar. Reads the current
 * selection from dashboardState.chartInlineFilters and dispatches updates.
 * Duplicated slices pass an instance-scoped chartKey so each holder owns its
 * own selection and re-queries only itself.
 */
export const DashboardInlineFilterBar: React.FC<
  DashboardInlineFilterBarProps
> = ({
  chartKey,
  rawConfig,
  datasourceId,
  datasourceType,
  chartAdhocFilters,
  chartAdhocFiltersB,
  chartLegacyFilters,
  dashboardFilters,
}) => {
  const dispatch = useDispatch();
  const selection = useSelector(
    (state: RootState) =>
      state.dashboardState.chartInlineFilters?.[chartKey] ?? {},
  );

  const handleSelect = useCallback(
    (filterId: string, value: InlineFilterChangeValue) => {
      dispatch(setChartInlineFilter(chartKey, filterId, value));
      // An inline filter belongs to one chart holder: selecting a value must
      // not re-query the sibling holders of the same slice.
      dispatch(triggerQuery(true, chartKey));
    },
    [dispatch, chartKey],
  );

  return (
    <ChartInlineFilterBar
      filters={normalizeConfig(rawConfig)}
      selection={selection}
      onSelect={handleSelect}
      datasourceId={datasourceId}
      datasourceType={datasourceType}
      chartAdhocFilters={chartAdhocFilters}
      chartAdhocFiltersB={chartAdhocFiltersB}
      chartLegacyFilters={chartLegacyFilters}
      dashboardFilters={dashboardFilters}
    />
  );
};

export default DashboardInlineFilterBar;
