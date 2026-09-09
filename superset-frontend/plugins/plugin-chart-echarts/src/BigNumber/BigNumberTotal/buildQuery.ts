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
import {
  buildQueryContext,
  getMetricLabel,
  QueryFormData,
  QueryFormMetric,
  ensureIsArray,
} from '@superset-ui/core';
import { isTimeComparison, timeCompareOperator } from '@superset-ui/chart-controls';

const addMetrics = (
  metrics: QueryFormMetric[],
  ...extra: Array<QueryFormMetric | undefined>
) => {
  const labels = new Set(metrics.map(metric => getMetricLabel(metric)));
  return metrics.concat(
    extra.filter((metric): metric is QueryFormMetric => {
      if (!metric) return false;
      const label = getMetricLabel(metric);
      if (labels.has(label)) return false;
      labels.add(label);
      return true;
    }),
  );
};

export default function buildQuery(formData: QueryFormData) {
  return buildQueryContext(formData, baseQueryObject => [{
    ...baseQueryObject,
    metrics: addMetrics(
      ensureIsArray(baseQueryObject.metrics),
      formData.comparison_metric,
      formData.comparison_metric_month,
      formData.comparison_metric_year,
    ),
    post_processing: formData.comparison_mode === 'auto'
      ? [timeCompareOperator(formData, baseQueryObject)]
      : [],
    time_offsets: formData.comparison_mode === 'auto' && isTimeComparison(formData, baseQueryObject)
      ? ensureIsArray(formData.time_compare)
      : [],
  }]);
}
