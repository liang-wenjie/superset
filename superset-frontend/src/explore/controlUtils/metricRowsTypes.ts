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

/**
 * Explore-side mirror of the BigNumberYoyMom metric-row shape. The plugin
 * package owns the runtime types; this copy keeps the control component
 * independent of a plugin source path while matching the JSON stored in
 * `form_data.metric_rows` exactly.
 */
export type BigNumberMetricSlotMode = 'time_shift' | 'metric';

export type BigNumberMetricColumn =
  | string
  | {
      expressionType?: string;
      sqlExpression?: string;
      label?: string;
      [key: string]: unknown;
    };

/** Mirror of the plugin's BigNumberSlotStyleMode. Keep both in sync. */
export type BigNumberSlotStyleMode = 'default' | 'no_color_change' | 'custom';

export type SlotColor = { r: number; g: number; b: number };

export type BigNumberMetricSlotStyle = {
  mode?: BigNumberSlotStyleMode;
  positiveColor?: SlotColor;
  negativeColor?: SlotColor;
  zeroColor?: SlotColor;
  showArrow?: boolean;
  threshold?: number;
};

export type BigNumberMetricSlot = {
  id?: string;
  show?: boolean;
  label?: string;
  mode?: BigNumberMetricSlotMode;
  offset?: string;
  column?: BigNumberMetricColumn;
  numberFormat?: string;
  style?: BigNumberMetricSlotStyle;
  implicitOffset?: boolean;
  left?: number;
};

export type BigNumberMetricRow = {
  id?: string;
  slots: BigNumberMetricSlot[];
};

/**
 * Mirrors `DEFAULT_SLOTS_PER_ROW` / `MAX_SLOTS_PER_ROW` in the plugin's
 * `metricRows.ts`. Keep the two values in sync: the plugin source cannot be
 * imported from `src/explore`.
 */
export const DEFAULT_METRIC_SLOTS_PER_ROW = 2;
export const MAX_METRIC_SLOTS_PER_ROW = 6;
