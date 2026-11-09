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

const EMPTY_RESULT = new Map<string, number>();

const areaKey = (width: unknown, height: unknown): string =>
  `${width ?? 0}x${height ?? 0}`;

/**
 * Character count of the formatted big number shown by a KPI chart. Matches
 * the plugin's formatter as closely as the dashboard state allows: a metric
 * level d3format wins over the chart level number format, and the raw value is
 * kept as a lower bound so an unusual format cannot understate the length.
 */
function formattedNumberLength(
  chart: JsonObject,
  datasources: RootState['datasources'],
): number {
  const formData = chart.form_data as JsonObject | undefined;
  const responses = chart.queriesResponse as JsonObject[] | undefined;
  const rows = responses?.[0]?.data as JsonObject[] | undefined;
  const row = rows?.[0];
  if (!formData || !row) return 0;

  const { metric } = formData;
  const label =
    typeof metric === 'string'
      ? metric
      : metric
        ? getMetricLabel(metric)
        : undefined;
  const value = label ? row[label] : undefined;
  if (value === null || value === undefined) return 0;

  const rawText = String(value);
  const numeric = typeof value === 'number' ? value : Number(value);
  let text = rawText;
  if (Number.isFinite(numeric)) {
    const datasource = formData.datasource
      ? ((datasources ?? {}) as JsonObject)[formData.datasource as string]
      : undefined;
    const metricEntry = (datasource?.metrics as JsonObject[] | undefined)?.find(
      entry => entry.metric_name === metric,
    );
    const format =
      (metricEntry?.d3format as string | undefined) ||
      (formData.y_axis_format as string | undefined);
    if (format) {
      try {
        text = getNumberFormatter(format)(numeric);
      } catch {
        text = rawText;
      }
    }
  }
  return Math.max(Array.from(text).length, Array.from(rawText).length);
}

/**
 * Longest formatted big number for each KPI chart, grouped by the tile area.
 * Tiles with the same grid width x height share one scale, so a dashboard can
 * mix KPI tiles of different sizes without forcing the smaller ones down to
 * the scale of the largest tiles. Only Big Number with YoY & MoM charts are
 * considered; every other viz type is left untouched.
 */
// Annotate the exported selector explicitly: createSelector's inferred type
// references reselect internals and is not portable across project references.
export const selectBigNumberFitCharsByChartId: (
  state: RootState,
) => Map<string, number> = createSelector(
  [
    (state: RootState) =>
      (state.dashboardInfo?.metadata as JsonObject | undefined)
        ?.uniform_big_number_font_size,
    (state: RootState) => state.charts,
    (state: RootState) => state.dashboardLayout.present,
    (state: RootState) => state.datasources,
  ],
  (enabled, charts, layout, datasources): Map<string, number> => {
    if (!enabled) return EMPTY_RESULT;

    const areaByChartId = new Map<string, string>();
    Object.values((layout ?? {}) as JsonObject).forEach(component => {
      const item = component as JsonObject;
      const meta = item.meta as JsonObject | undefined;
      if (item.type === CHART_TYPE && meta?.chartId !== undefined) {
        areaByChartId.set(
          String(meta.chartId),
          areaKey(meta.width, meta.height),
        );
      }
    });

    const maxByArea = new Map<string, number>();
    Object.entries((charts ?? {}) as JsonObject).forEach(
      ([chartId, chartValue]) => {
        const chart = chartValue as JsonObject;
        if (
          (chart.form_data as JsonObject | undefined)?.viz_type !==
          VizType.BigNumberYoyMom
        ) {
          return;
        }
        const area = areaByChartId.get(chartId);
        if (!area) return;
        const length = formattedNumberLength(chart, datasources);
        if (length > 0) {
          maxByArea.set(area, Math.max(maxByArea.get(area) ?? 0, length));
        }
      },
    );

    const result = new Map<string, number>();
    areaByChartId.forEach((area, chartId) => {
      const chart = ((charts ?? {}) as JsonObject)[chartId] as
        | JsonObject
        | undefined;
      if (
        (chart?.form_data as JsonObject | undefined)?.viz_type !==
        VizType.BigNumberYoyMom
      ) {
        return;
      }
      const max = maxByArea.get(area);
      if (max !== undefined) result.set(chartId, max);
    });
    return result;
  },
);
