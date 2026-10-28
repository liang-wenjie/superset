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
import ChartInlineFilterBar from './ChartInlineFilterBar';
import type { InlineFilterConfig } from './types';
import type { RootState } from '../../types';
import { setChartInlineFilter } from '../../actions/dashboardState';
import { triggerQuery } from 'src/components/Chart/chartAction';

interface DashboardInlineFilterBarProps {
  chartId: number;
  /** Raw inline_filters from the chart formData. */
  rawConfig: JsonObject | InlineFilterConfig[] | undefined;
  datasourceId?: string | number;
  datasourceType?: string;
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
 */
export const DashboardInlineFilterBar: React.FC<
  DashboardInlineFilterBarProps
> = ({ chartId, rawConfig, datasourceId, datasourceType }) => {
  const dispatch = useDispatch();
  const selection = useSelector(
    (state: RootState) => state.dashboardState.chartInlineFilters?.[chartId] ?? {},
  );

  const handleSelect = useCallback(
    (filterId: string, value: string | number | boolean | undefined) => {
      dispatch(setChartInlineFilter(chartId, filterId, value));
      dispatch(triggerQuery(true, chartId));
    },
    [dispatch, chartId],
  );

  return (
    <ChartInlineFilterBar
      filters={normalizeConfig(rawConfig)}
      selection={selection}
      onSelect={handleSelect}
      datasourceId={datasourceId}
      datasourceType={datasourceType}
    />
  );
};

export default DashboardInlineFilterBar;
