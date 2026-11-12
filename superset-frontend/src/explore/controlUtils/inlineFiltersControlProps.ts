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
import { t } from '@apache-superset/core/translation';

export const INLINE_FILTERS_CONTROL_DESCRIPTION = t(
  'Add quick-filter dropdowns at the top-left of the chart. Click "+ Add ' +
    'inline filter" to configure a filter in a dialog: filter type ' +
    '(single / multiple / text input, with exact or fuzzy matching for ' +
    'text input), column, label, description, sort direction ' +
    '(ascending / descending), "Select first filter value by default" ' +
    '(otherwise pick a real column value as the default), sort metric, ' +
    'search box, required, an inverse selection switch and dependencies ' +
    'on the other filters. On charts with two queries, each filter can be ' +
    'bound to Query A or Query B so two buttons filter them independently ' +
    'for comparison. Changes are saved when the dialog is confirmed.',
);

export type InlineFilterMetricOption = { label: string; value: string };

export type InlineFiltersControlProps = {
  columns: unknown[];
  datasourceId?: string | number;
  datasourceType?: string;
  metrics: InlineFilterMetricOption[];
  /** True for charts that declare a second query section (`*_b`). */
  supportsMultipleQueries: boolean;
};

/**
 * The part of the Explore state a control's `mapStateToProps` receives.
 * Kept deliberately loose: upstream types this as `ControlPanelState`, but
 * the fields we need are plain JSON and differ slightly between the
 * initialization path (`getControlState.ts`) and the render path
 * (`ControlPanelsContainer.tsx`).
 */
type ControlPanelStateLike = {
  datasource?: {
    id?: number | string;
    type?: string;
    columns?: unknown[];
    metrics?: unknown[];
  } | null;
  form_data?: Record<string, unknown> | null;
  controls?: Record<string, { value?: unknown }> | null;
};

/**
 * Build every prop the InlineFiltersControl dialog needs.
 *
 * The shared control definition in @superset-ui/chart-controls only supplies
 * `columns`, which leaves the "Default value" picker unable to call the
 * column-values endpoint and the "Sort metric" picker without any option.
 * This is attached through an explicit override in `controlPanels/sections.tsx`
 * so it works regardless of which copy of the shared control is resolved.
 */
export function getInlineFiltersControlProps(
  state: unknown,
): InlineFiltersControlProps {
  const exploreState = (state ?? {}) as ControlPanelStateLike;
  const datasource = exploreState.datasource ?? undefined;
  const formData = exploreState.form_data ?? {};
  const datasourceKey = formData.datasource;
  const [keyId, keyType] =
    typeof datasourceKey === 'string' ? datasourceKey.split('__') : [];

  const metricOptions: InlineFilterMetricOption[] = [];
  const seen = new Set<string>();
  const addMetric = (value: unknown, label?: unknown) => {
    let name: string | undefined;
    if (typeof value === 'string' && value.trim()) {
      name = value.trim();
    } else if (value && typeof value === 'object') {
      const candidate = (value as Record<string, unknown>).metric_name;
      if (typeof candidate === 'string' && candidate.trim()) {
        name = candidate.trim();
      }
    }
    // Adhoc metrics are objects without a stable name and cannot be used by
    // the sort-metric query, so only named metrics are collected.
    if (!name || seen.has(name)) return;
    seen.add(name);
    metricOptions.push({
      label: typeof label === 'string' && label.trim() ? label.trim() : name,
      value: name,
    });
  };

  (datasource?.metrics ?? []).forEach(metric => {
    if (metric && typeof metric === 'object') {
      const record = metric as Record<string, unknown>;
      addMetric(record.metric_name, record.verbose_name);
    } else {
      addMetric(metric);
    }
  });

  // Saved metric names already used by the chart stay selectable even when
  // datasource metadata is late or the dataset defines no saved metrics.
  [
    exploreState.form_data?.metrics,
    exploreState.form_data?.metric,
    exploreState.controls?.metrics?.value,
  ].forEach(entry => {
    if (Array.isArray(entry)) entry.forEach(item => addMetric(item));
    else addMetric(entry);
  });

  // `viz_type` is always present in formData, while the `_b` controls may not
  // have been written yet when the control panel is first initialized. Check
  // both so the query picker appears as soon as a mixed chart is opened.
  const hasQueryBControls = Object.keys(formData).some(key =>
    ['adhoc_filters_b', 'metrics_b', 'metric_b', 'groupby_b'].includes(key),
  );
  const supportsMultipleQueries =
    formData.viz_type === 'mixed_timeseries' || hasQueryBControls;

  return {
    columns: datasource?.columns ?? [],
    datasourceId: datasource?.id ?? keyId,
    datasourceType: datasource?.type ?? keyType,
    metrics: metricOptions,
    supportsMultipleQueries,
  };
}
