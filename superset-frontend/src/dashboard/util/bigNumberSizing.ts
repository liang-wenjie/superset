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

const EMPTY_RESULT = new Map<string, string>();

const areaKey = (width: unknown, height: unknown): string =>
  `${width ?? 0}x${height ?? 0}`;

/**
 * The formatted big number a KPI chart renders, matching the plugin's
 * formatter as closely as the dashboard state allows: a metric level
 * d3format wins over the chart level number format. The raw value is used as
 * a fallback/lower bound so an unusual format cannot understate the length.
 */
function formattedNumberText(
  chart: JsonObject,
  datasources: RootState['datasources'],
): string {
  const formData = chart.form_data as JsonObject | undefined;
  const responses = chart.queriesResponse as JsonObject[] | undefined;
  const rows = responses?.[0]?.data as JsonObject[] | undefined;
  const row = rows?.[0];
  if (!formData || !row) return '';

  const { metric } = formData;
  const label =
    typeof metric === 'string'
      ? metric
      : metric
        ? getMetricLabel(metric)
        : undefined;
  const value = label ? row[label] : undefined;
  if (value === null || value === undefined) return '';

  const rawText = String(value);
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return rawText;

  const datasource = formData.datasource
    ? ((datasources ?? {}) as JsonObject)[formData.datasource as string]
    : undefined;
  const metricEntry = (datasource?.metrics as JsonObject[] | undefined)?.find(
    entry => entry.metric_name === metric,
  );
  const format =
    (metricEntry?.d3format as string | undefined) ||
    (formData.y_axis_format as string | undefined);
  if (!format) return rawText;
  try {
    const formatted = getNumberFormatter(format)(numeric);
    return Array.from(formatted).length >= Array.from(rawText).length
      ? formatted
      : rawText;
  } catch {
    return rawText;
  }
}

/**
 * The widest formatted big number for each KPI chart, grouped by tile area.
 * Tiles of the same grid width x height share one reference text, so they all
 * adapt to exactly the same font size instead of each shrinking against its
 * own value. Only Big Number with YoY & MoM charts are considered; every
 * other viz type is left untouched.
 */
// createSelector's inferred type references reselect internals and is not
// portable across project references, so the exported selector is annotated.
export const selectBigNumberReferenceTextByChartId: (
  state: RootState,
) => Map<string, string> = createSelector(
  [
    (state: RootState) =>
      (state.dashboardInfo?.metadata as JsonObject | undefined)
        ?.uniform_big_number_font_size,
    (state: RootState) => state.charts,
    (state: RootState) => state.dashboardLayout.present,
    (state: RootState) => state.datasources,
  ],
  (enabled, charts, layout, datasources): Map<string, string> => {
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

    const widestByArea = new Map<string, string>();
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
        const text = formattedNumberText(chart, datasources);
        if (text && text.length > (widestByArea.get(area) ?? '').length) {
          widestByArea.set(area, text);
        }
      },
    );

    const result = new Map<string, string>();
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
      const reference = widestByArea.get(area);
      if (reference) result.set(chartId, reference);
    });
    return result;
  },
);
