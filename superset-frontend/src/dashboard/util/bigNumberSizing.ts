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
import { createSelector } from '@reduxjs/toolkit';
import {
  getMetricLabel,
  getNumberFormatter,
  JsonObject,
  VizType,
} from '@superset-ui/core';
import type { RootState } from 'src/dashboard/types';
import { CHART_TYPE } from 'src/dashboard/util/componentTypes';

const EMPTY_RESULT = new Map<string, string[]>();

/**
 * Candidate texts a KPI chart can render as its big number. The plugin uses a
 * metric/column level d3format first, then the chart level number format, and
 * falls back to the raw value. Keep both the raw and the formatted spelling so
 * the plugin can pick the widest one with the very same width model it uses
 * for rendering; a currency symbol added by the plugin is covered by the
 * plugin's own text.
 */
function bigNumberTexts(
  chart: JsonObject,
  datasources: RootState['datasources'],
): string[] {
  const formData = chart.form_data as JsonObject | undefined;
  const responses = chart.queriesResponse as JsonObject[] | undefined;
  const rows = responses?.[0]?.data as JsonObject[] | undefined;
  const row = rows?.[0];
  if (!formData || !row) return [];

  const { metric } = formData;
  const label =
    typeof metric === 'string'
      ? metric
      : metric
        ? getMetricLabel(metric)
        : undefined;
  const value = label ? row[label] : undefined;
  if (value === null || value === undefined) return [];

  const rawText = String(value);
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return [rawText];

  const datasource = formData.datasource
    ? ((datasources ?? {}) as JsonObject)[formData.datasource as string]
    : undefined;
  const metricEntry = (datasource?.metrics as JsonObject[] | undefined)?.find(
    entry => entry.metric_name === label,
  );
  const format =
    (metricEntry?.d3format as string | undefined) ||
    (formData.y_axis_format as string | undefined);
  if (!format) return [rawText];
  try {
    return [rawText, getNumberFormatter(format)(numeric)];
  } catch {
    return [rawText];
  }
}

/**
 * Every formatted big number of the KPI tiles on this dashboard, keyed by
 * chart id. Every KPI chart receives the SAME array, so they all resolve to
 * one font size: when one tile has a long number the whole dashboard shrinks
 * together instead of that tile shrinking on its own (which would break the
 * uniform sizing) or being clipped. The width decision itself lives in the
 * plugin, which owns the width model used for the ECharts text.
 *
 * Do NOT group tiles by layout `meta.width x meta.height`: those numbers are
 * grid units relative to the tile's parent container, not pixels. A chart
 * placed directly under a COLUMN can be width=1 while an identically wide
 * chart nested one ROW deeper is width=2; grouping them separately leaves
 * the width=1 tiles with their own short numbers and a visibly larger font.
 * The plugin already clamps the shared size against each tile's real pixel
 * width, so one dashboard-wide reference list is both simpler and correct.
 *
 * Only Big Number with YoY & MoM charts are considered; every other viz type
 * is left untouched, and the whole computation is skipped unless the
 * dashboard-level uniform sizing setting is on.
 */
// createSelector's inferred type references reselect internals and is not
// portable across project references, so the exported selector is annotated.
export const selectBigNumberReferenceTextsByChartId: (
  state: RootState,
) => Map<string, string[]> = createSelector(
  [
    (state: RootState) =>
      (state.dashboardInfo?.metadata as JsonObject | undefined)
        ?.uniform_big_number_font_size,
    (state: RootState) => state.charts,
    (state: RootState) => state.dashboardLayout.present,
    (state: RootState) => state.datasources,
  ],
  (enabled, charts, layout, datasources): Map<string, string[]> => {
    if (!enabled) return EMPTY_RESULT;

    const chartIdsInLayout = new Set<string>();
    Object.values((layout ?? {}) as JsonObject).forEach(component => {
      const item = component as JsonObject;
      const meta = item.meta as JsonObject | undefined;
      if (item.type === CHART_TYPE && meta?.chartId !== undefined) {
        chartIdsInLayout.add(String(meta.chartId));
      }
    });

    const texts = new Set<string>();
    const kpiChartIds: string[] = [];
    Object.entries((charts ?? {}) as JsonObject).forEach(
      ([chartId, chartValue]) => {
        const chart = chartValue as JsonObject;
        if (
          !chartIdsInLayout.has(chartId) ||
          (chart.form_data as JsonObject | undefined)?.viz_type !==
            VizType.BigNumberYoyMom
        ) {
          return;
        }
        kpiChartIds.push(chartId);
        bigNumberTexts(chart, datasources).forEach(text => texts.add(text));
      },
    );

    if (!kpiChartIds.length) return EMPTY_RESULT;
    // One shared array reference keeps useSelector/formData memoization
    // stable for every KPI tile on the dashboard.
    const sharedTexts = Array.from(texts);
    const result = new Map<string, string[]>();
    kpiChartIds.forEach(id => result.set(id, sharedTexts));
    return result;
  },
);
