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
  QueryFormData,
  QueryFormMetric,
  TimeseriesDataRecord,
} from '@superset-ui/core';

export interface BigNumberYoyMomStylesProps {
  height: number;
  width: number;
  /** Big number font size, computed from the proportional control. */
  headerFontSize: number;
  /** Metric name font size, computed from the proportional control. */
  metricNameFontSize: number;
  /** Whether to render the metric name above the big number. */
  showMetricName: boolean;
  /** Whether to render the previous-period value badge. */
  showPrevValue: boolean;
  /** Whether to render the absolute difference badge. */
  showValueDifference: boolean;
  /** Whether to render the percent change badge. */
  showPercentChange: boolean;
  /** Whether to color the badges by the sign of the change. */
  comparisonColorEnabled: boolean;
}

export type BigNumberYoyMomQueryFormData = QueryFormData &
  BigNumberYoyMomStylesProps & {
    /** Comparison mode: 'auto' shifts the time range, 'manual' reads a previous-period metric from the same row. */
    comparison_mode?: string;
    /** In manual mode, the metric holding the previous-period value in the same row. */
    comparison_metric?: QueryFormMetric;
  };

export interface BigNumberYoyMomProps extends BigNumberYoyMomStylesProps {
  data: TimeseriesDataRecord[];
  /** Display name of the main metric. */
  metricName: string;
  /** Formatted current-period value. */
  bigNumber: string;
  /** Formatted comparison-period value. */
  prevNumber: string;
  /** Free-text subtitle rendered below the big number. */
  subtitle?: string;
  subtitleFontSize: number;
  /** Formatted absolute difference (current - comparison). */
  valueDifference: string;
  /** Formatted percent change. */
  percentDifferenceFormattedString: string;
  /** Numeric percent change, used for arrow direction and coloring. */
  percentDifferenceNumber: number;
  /** The time shift used for the comparison (e.g. `1 year ago`). */
  shift: string;
}
