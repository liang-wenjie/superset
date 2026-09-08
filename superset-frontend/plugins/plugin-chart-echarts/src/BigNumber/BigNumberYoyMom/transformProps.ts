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
// Type augmentation for dayjs plugins
import 'dayjs/plugin/utc';
import {
  ChartProps,
  getMetricLabel,
  getValueFormatter,
  getNumberFormatter,
  ensureIsArray,
} from '@superset-ui/core';
import { extendedDayjs as dayjs } from '@superset-ui/core/utils/dates';
import {
  getHeaderFontSize,
  getMetricNameFontSize,
} from '../BigNumberPeriodOverPeriod/utils';
import { getOriginalLabel } from '../utils';
import { BigNumberYoyMomQueryFormData } from './types';

export const parseMetricValue = (metricValue: number | string | null) => {
  if (typeof metricValue === 'string') {
    const dateObject = dayjs.utc(metricValue, undefined, true);
    if (dateObject.isValid()) {
      return dateObject.valueOf();
    }
    return 0;
  }
  return metricValue ?? 0;
};

export default function transformProps(chartProps: ChartProps) {
  /**
   * Called after a successful response from the chart data endpoint.
   *
   * The response contains the current-period metric (e.g. `SUM(sales)`) and,
   * when a time comparison is configured, the shifted metric column
   * (e.g. `SUM(sales)__1 year ago`). This function extracts both values and
   * computes the absolute difference and percent change that the component
   * renders as badges.
   */
  const {
    width,
    height,
    formData: formDataUntyped,
    queriesData,
    datasource: {
      currencyFormats = {},
      columnFormats = {},
      currencyCodeColumn,
    },
  } = chartProps;
  const formData = formDataUntyped as BigNumberYoyMomQueryFormData;
  const {
    metric,
    metricNameFontSize,
    headerFontSize,
    yAxisFormat,
    currencyFormat,
    subtitle = '',
    subtitleFontSize,
    comparisonColorEnabled,
  } = formData;
  const { data: dataA = [], detected_currency: detectedCurrency } =
    queriesData[0] || {};
  const data = dataA;
  const metricName = metric ? getMetricLabel(metric) : '';
  const metrics = chartProps.datasource?.metrics || [];
  const originalLabel = getOriginalLabel(metric, metrics);
  const showMetricName = chartProps.rawFormData?.show_metric_name ?? false;

  const timeComparison =
    ensureIsArray(chartProps.rawFormData?.time_compare)[0] ||
    ensureIsArray(formData?.extraFormData?.time_compare)[0];
  const startDateOffset = chartProps.rawFormData?.start_date_offset;

  const isCustomOrInherit =
    timeComparison === 'custom' || timeComparison === 'inherit';
  let dataOffset: string[] = [];
  if (isCustomOrInherit) {
    if (timeComparison && timeComparison === 'custom') {
      dataOffset = [startDateOffset];
    } else {
      dataOffset = ensureIsArray(timeComparison) || [];
    }
  }

  // Manual comparison mode: the previous-period value is a sibling metric in
  // the same row (e.g. a SQL-computed `prev_month` column), so no shifted
  // column is expected and the comparison works regardless of how much
  // history the dataset holds.
  const isManualMode = formData.comparison_mode === 'manual';
  const comparisonMetricLabel =
    isManualMode && formData.comparison_metric
      ? getMetricLabel(formData.comparison_metric)
      : '';

  // Comparison badges only make sense when a comparison is actually
  // configured (a time shift, or a manual previous-period metric). Without
  // one, the chart renders just the big number plus any additional metrics.
  const hasComparison =
    Boolean(timeComparison) ||
    (isManualMode && Boolean(formData.comparison_metric));

  const { value1, value2 } = data.reduce(
    (acc: { value1: number; value2: number }, curr: { [x: string]: any }) => {
      Object.keys(curr).forEach(key => {
        if (isManualMode) {
          // Exact column-name match: the main metric and the previous-period
          // metric are distinct sibling columns in the same row.
          if (key === comparisonMetricLabel) {
            acc.value2 += curr[key];
          } else if (key === metricName) {
            acc.value1 += curr[key];
          }
        } else if (
          key.includes(
            `${metricName}__${
              !isCustomOrInherit ? timeComparison : dataOffset[0]
            }`,
          )
        ) {
          acc.value2 += curr[key];
        } else if (key.includes(metricName)) {
          acc.value1 += curr[key];
        }
      });
      return acc;
    },
    { value1: 0, value2: 0 },
  );

  let bigNumber: number | string =
    data.length === 0 ? 0 : parseMetricValue(value1);
  let prevNumber: number | string =
    data.length === 0 ? 0 : parseMetricValue(value2);

  const numberFormatter = getValueFormatter(
    metric,
    currencyFormats,
    columnFormats,
    yAxisFormat,
    currencyFormat,
    undefined,
    data,
    currencyCodeColumn,
    detectedCurrency,
  );

  const formatPercentChange = getNumberFormatter(
    formData.percentDifferenceFormat,
  );

  let valueDifference: number | string = bigNumber - prevNumber;

  let percentDifferenceNum;

  if (!bigNumber && !prevNumber) {
    percentDifferenceNum = 0;
  } else if (!bigNumber || !prevNumber) {
    percentDifferenceNum = bigNumber ? 1 : -1;
  } else {
    percentDifferenceNum = (bigNumber - prevNumber) / Math.abs(prevNumber);
  }

  bigNumber = numberFormatter(bigNumber);
  prevNumber = numberFormatter(prevNumber);
  valueDifference = numberFormatter(valueDifference);
  const percentDifference: string = formatPercentChange(percentDifferenceNum);

  // Additional metrics: each one is rendered as a small title + value item
  // below the big number. Values come from the same query result row and are
  // formatted with the same number format as the main metric.
  const additionalMetrics = (
    formData.show_additional_metrics
      ? ensureIsArray(formData.additional_metrics)
      : []
  ).map(additionalMetric => {
    const additionalMetricKey = getMetricLabel(additionalMetric);
    const rawValue = data.reduce((acc: number, curr: { [x: string]: any }) => {
      if (additionalMetricKey in curr) {
        acc += curr[additionalMetricKey];
      }
      return acc;
    }, 0);
    const additionalFormatter = getValueFormatter(
      additionalMetric,
      currencyFormats,
      columnFormats,
      yAxisFormat,
      currencyFormat,
      undefined,
      data,
      currencyCodeColumn,
      detectedCurrency,
    );
    return {
      label: getOriginalLabel(additionalMetric, metrics),
      value: additionalFormatter(parseMetricValue(rawValue)),
    };
  });

  return {
    width,
    height,
    data,
    metricName: originalLabel,
    bigNumber,
    prevNumber,
    valueDifference,
    percentDifferenceFormattedString: percentDifference,
    percentDifferenceNumber: percentDifferenceNum,
    showMetricName,
    metricNameFontSize: getMetricNameFontSize(metricNameFontSize),
    headerFontSize: getHeaderFontSize(headerFontSize),
    subtitle,
    subtitleFontSize,
    comparisonColorEnabled,
    shift: isManualMode ? comparisonMetricLabel : timeComparison,
    // Extra props resolved from raw form data
    showPrevValue: (chartProps.rawFormData?.show_prev_value ?? true) && hasComparison,
    showValueDifference:
      (chartProps.rawFormData?.show_value_difference ?? true) && hasComparison,
    showPercentChange:
      (chartProps.rawFormData?.show_percent_change ?? true) && hasComparison,
    showAdditionalMetrics: Boolean(formData.show_additional_metrics),
    additionalMetrics,
    additionalMetricFontSize: formData.additional_metric_font_size ?? 0.15,
  };
}
