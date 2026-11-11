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
import { JsonObject } from '@superset-ui/core';

/**
 * Runtime filters already applied to a chart holder's query: native dashboard
 * filters, cross filters and per-instance `valueTransform` clauses. They live
 * in the `extra_form_data` that `getFormDataWithExtraFilters` injects, not in
 * the chart's saved `adhoc_filters`.
 *
 * Pass the form data **before** inline-filter injection. Using the injected
 * variant would feed a filter's own selection back into its option query and
 * make the currently selected value the only suggestion.
 */
export function getInlineDashboardFilters(
  formData: JsonObject | undefined,
): JsonObject[] {
  if (!formData) return [];
  // `ChartProps` converts top-level formData keys to camelCase, while the
  // dashboard's own form data keeps snake_case; accept both.
  const extra = (formData.extra_form_data ?? formData.extraFormData) as
    | { filters?: JsonObject[] }
    | undefined;
  const filters = extra?.filters;
  return Array.isArray(filters) ? filters : [];
}
