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
  ColorFormatters,
  getColorFormatters,
  Metric,
} from '@superset-ui/chart-controls';
import {
  getMetricLabel,
  extractTimegrain,
  getNumberFormatter,
  QueryFormData,
  getValueFormatter,
} from '@superset-ui/core';
import type { EChartsCoreOption } from 'echarts/core';
import { GenericDataType } from '@apache-superset/core/common';
import { BigNumberTotalChartProps, BigNumberVizProps } from '../types';
import { PROPORTION } from '../constants';
import { getDateFormatter, getOriginalLabel, parseMetricValue } from '../utils';
import { Refs } from '../../types';

export default function transformProps(
  chartProps: BigNumberTotalChartProps,
): BigNumberVizProps {
  const {
    width,
    height,
    queriesData,
    formData,
    rawFormData,
    hooks,
    datasource: {
      currencyFormats = {},
      columnFormats = {},
      currencyCodeColumn,
    },
    theme,
  } = chartProps;
  const {
    metricNameFontSize,
    headerFontSize,
    metric = 'value',
    subtitle,
    subtitleFontSize,
    forceTimestampFormatting,
    timeFormat,
    yAxisFormat,
    conditionalFormatting,
    currencyFormat,
    subheader,
    subheaderFontSize,
  } = formData;
  const refs: Refs = {};
  const {
    data = [],
    coltypes = [],
    detected_currency: detectedCurrency,
  } = queriesData[0] || {};
  const granularity = extractTimegrain(rawFormData as QueryFormData);
  const metrics = chartProps.datasource?.metrics || [];
  const originalLabel = getOriginalLabel(metric, metrics);
  const metricName = getMetricLabel(metric);
  const showMetricName = chartProps.rawFormData?.show_metric_name ?? false;
  const formattedSubtitle = subtitle?.trim() ? subtitle : subheader || '';
  const formattedSubtitleFontSize = subtitle?.trim()
    ? (subtitleFontSize ?? PROPORTION.SUBHEADER)
    : (subheaderFontSize ?? subtitleFontSize ?? PROPORTION.SUBHEADER);
  const rawValue = data.length === 0 ? null : data[0][metricName];
  const parsedValue = rawValue == null ? null : parseMetricValue(rawValue);

  const bigNumber =
    parsedValue === null &&
    typeof rawValue === 'string' &&
    rawValue.trim() !== ''
      ? rawValue
      : parsedValue;

  let metricEntry: Metric | undefined;
  if (chartProps.datasource?.metrics) {
    metricEntry = chartProps.datasource.metrics.find(
      metricItem => metricItem.metric_name === metric,
    );
  }

  const formatTime = getDateFormatter(
    timeFormat,
    granularity,
    metricEntry?.d3format,
  );

  const numberFormatter = getValueFormatter(
    metric,
    currencyFormats,
    columnFormats,
    metricEntry?.d3format || yAxisFormat,
    currencyFormat,
    undefined,
    data,
    currencyCodeColumn,
    detectedCurrency,
  );

  const headerFormatter =
    coltypes[0] === GenericDataType.Temporal ||
    coltypes[0] === GenericDataType.String ||
    forceTimestampFormatting
      ? formatTime
      : numberFormatter;

  const { onContextMenu } = hooks;

  const defaultColorFormatters = [] as ColorFormatters;

  const colorThresholdFormatters =
    getColorFormatters(conditionalFormatting, data, theme, false) ??
    defaultColorFormatters;

  const row = data[0] ?? {};
  const numericValue = (value: unknown): number => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const metricValue = numericValue(row[metricName]);
  const metricLabel = (formData.comparison_metric && getMetricLabel(formData.comparison_metric)) || '';
  const monthLabel = (formData.comparison_metric_month && getMetricLabel(formData.comparison_metric_month)) || metricLabel;
  const yearLabel = (formData.comparison_metric_year && getMetricLabel(formData.comparison_metric_year)) || metricLabel;
  const shiftKeys = Object.keys(row);
  const findValue = (label: string, matcher: RegExp) => {
    const key = shiftKeys.find(item => item.startsWith(`${label}__`) && matcher.test(item));
    return key ? numericValue(row[key]) : numericValue(row[label]);
  };
  const monthPrevious = formData.comparison_mode === 'manual'
    ? numericValue(row[monthLabel])
    : findValue(metricName, /month|个月|m(\s|$)/i);
  const yearPrevious = formData.comparison_mode === 'manual'
    ? numericValue(row[yearLabel])
    : findValue(metricName, /year|年|y(\s|$)/i);
  const change = (previous: number) => previous ? (metricValue - previous) / Math.abs(previous) : 0;
  const monthChangeNumber = change(monthPrevious);
  const yearChangeNumber = change(yearPrevious);
  const formatPercentChange = getNumberFormatter('.2%');
  const showMonthChange = Boolean(formData.comparison_mode && (monthLabel || shiftKeys.some(key => /month|个月|m(\s|$)/i.test(key))));
  const showYearChange = Boolean(formData.comparison_mode && (yearLabel || shiftKeys.some(key => /year|年|y(\s|$)/i.test(key))));
  const comparisonText = (label: string, value: number) => `${label} ${value >= 0 ? '↑' : '↓'}${formatPercentChange(value)}`;
  const graphicOptions: EChartsCoreOption = {
    backgroundColor: '#fff',
    animation: false,
    tooltip: { show: false },
    graphic: [
      { type: 'text', left: 20, top: 20, style: { text: originalLabel, fontSize: 14, fill: '#666' } },
      { type: 'text', left: 20, top: 50, style: { text: String(bigNumber ?? ''), fontSize: 32, fontWeight: 'bold', fill: '#333' } },
      ...(showMonthChange ? [{ type: 'text', left: 20, top: 95, style: { text: comparisonText('环比', monthChangeNumber), fontSize: 14, fill: monthChangeNumber >= 0 ? '#00b42a' : '#f53f3f' } }] : []),
      ...(showYearChange ? [{ type: 'text', left: showMonthChange ? 120 : 20, top: 95, style: { text: comparisonText('同比', yearChangeNumber), fontSize: 14, fill: yearChangeNumber >= 0 ? '#00b42a' : '#f53f3f' } }] : []),
    ],
    xAxis: { show: false },
    yAxis: { show: false },
    series: [],
  };
  return {
    width,
    height,
    bigNumber,
    headerFormatter,
    headerFontSize,
    subheaderFontSize,
    subtitleFontSize: formattedSubtitleFontSize,
    subtitle: formattedSubtitle,
    onContextMenu,
    refs,
    colorThresholdFormatters,
    metricName: originalLabel,
    showMetricName,
    metricNameFontSize,
    graphicOptions,
    monthChange: formatPercentChange(monthChangeNumber),
    yearChange: formatPercentChange(yearChangeNumber),
    monthChangeNumber,
    yearChangeNumber,
    showMonthChange,
    showYearChange,
  };
}
