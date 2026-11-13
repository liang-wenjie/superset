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
import type { EChartsCoreOption } from 'echarts/core';
import {
  ChartDataResponseResult,
  Currency,
  QueryFormColumn,
  QueryFormData,
  QueryFormMetric,
} from '@superset-ui/core';
import { BaseChartProps, Refs } from '../../types';
import type { BigNumberMetricRow } from './metricRows';

export type RGBColor = { r: number; g: number; b: number };

export type BigNumberYoyMomFormData = QueryFormData & {
  metric?: QueryFormMetric;
  granularity_sqla?: QueryFormColumn;
  timeGrainSqla?: string;
  yAxisFormat?: string;
  currencyFormat?: Currency;
  headerText?: string;
  titleFontSize?: number;
  titleColor?: RGBColor;
  titleLeft?: number;
  titleTop?: number;
  bigNumberFontSize?: number;
  bigNumberColor?: RGBColor;
  bigNumberLeft?: number;
  bigNumberTop?: number;
  uniformBigNumberFontSize?: boolean;
  uniformBigNumberFontSizePx?: number;
  /** Formatted big numbers of every KPI tile on the dashboard. */
  uniformBigNumberReferenceTexts?: string[];
  /**
   * Unified metric rows. Each row holds its OWN number of independently
   * configured slots (one to six; a new row starts with the classic two).
   * Charts saved before this field existed fall back to the legacy
   * `comparison1_*` / `comparison2_*` pair through `resolveMetricRows`.
   */
  metricRows?: BigNumberMetricRow[];
  showComparison1?: boolean;
  comparison1Label?: string;
  comparison1Mode?: 'time_shift' | 'metric';
  comparison1Offset?: string;
  comparison1Column?: QueryFormMetric;
  comparison1PercentDifferenceFormat?: string;
  /** @deprecated Use comparisonGap and swapComparisonOrder. */
  comparison1Left?: number;
  showComparison2?: boolean;
  comparison2Label?: string;
  comparison2Mode?: 'time_shift' | 'metric';
  comparison2Offset?: string;
  comparison2Column?: QueryFormMetric;
  comparison2PercentDifferenceFormat?: string;
  /** @deprecated Use comparisonGap and swapComparisonOrder. */
  comparison2Left?: number;
  /** Horizontal distance to the second comparison slot. */
  comparisonGap?: number;
  /**
   * Only changes the ANCHOR of comparisonGap: false (default) measures it
   * from the MoM text, true measures it from the tile's horizontal center
   * line. Both modes reuse the very same comparisonGap value; there is no
   * second gap control.
   */
  comparisonUseCenterGap?: boolean;
  swapComparisonOrder?: boolean;
  comparisonFontSize?: number;
  comparisonTop?: number;
  comparisonPositiveColor?: RGBColor;
  comparisonNegativeColor?: RGBColor;
  comparisonZeroColor?: RGBColor;
  comparisonShowArrow?: boolean;
  comparisonThreshold?: number;
  percentDifferenceFormat?: string;
};

export type BigNumberYoyMomDatum = {
  [key: string]: number | string | null;
};

export type BigNumberYoyMomChartDataResponseResult = ChartDataResponseResult & {
  data: BigNumberYoyMomDatum[];
};

export type BigNumberYoyMomChartProps =
  BaseChartProps<BigNumberYoyMomFormData> & {
    formData: BigNumberYoyMomFormData;
    queriesData: BigNumberYoyMomChartDataResponseResult[];
  };

export type BigNumberYoyMomProps = {
  width: number;
  height: number;
  echartOptions: EChartsCoreOption;
  refs: Refs;
  formData?: BigNumberYoyMomFormData;
};
