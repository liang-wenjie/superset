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
import { QueryFormMetric } from '@superset-ui/core';
import {
  DEFAULT_COMPARISON1_LABEL,
  DEFAULT_COMPARISON1_OFFSET,
  DEFAULT_COMPARISON2_LABEL,
  DEFAULT_COMPARISON2_OFFSET,
} from './constants';

/**
 * A new row (and a chart saved before `metric_rows` existed) starts with the
 * classic MoM/YoY pair. Rows are NOT padded to this length: the editor lets
 * each row hold any number of slots, e.g. three indicators side by side.
 */
export const DEFAULT_SLOTS_PER_ROW = 2;
/** Guard against malformed saved data; the Explore editor caps at the same. */
export const MAX_SLOTS_PER_ROW = 6;

export type BigNumberMetricSlotMode = 'time_shift' | 'metric';

/** RGB object, matching the chart-level ColorPickerControl output. */
export type SlotColor = { r: number; g: number; b: number };

/**
 * `default` inherits every chart-level comparison style; `no_color_change`
 * always paints the slot with plain text color (arrows still follow the
 * configured setting); `custom` overrides each style field individually,
 * with any omitted field falling back to the chart-level default.
 */
export type BigNumberSlotStyleMode = 'default' | 'no_color_change' | 'custom';

export type BigNumberMetricSlotStyle = {
  mode?: BigNumberSlotStyleMode;
  positiveColor?: SlotColor;
  negativeColor?: SlotColor;
  zeroColor?: SlotColor;
  showArrow?: boolean;
  threshold?: number;
};

/**
 * One cell of a metric row. Every cell is configured independently: it can
 * read a backend time-offset column (percentage difference) or a metric /
 * custom SQL expression (the value itself), with its own label, format and
 * color/trend styling.
 */
export type BigNumberMetricSlot = {
  id?: string;
  show?: boolean;
  label?: string;
  mode?: BigNumberMetricSlotMode;
  offset?: string;
  column?: QueryFormMetric;
  numberFormat?: string;
  style?: BigNumberMetricSlotStyle;
  /**
   * Legacy charts without an explicit offset still render a "—" placeholder;
   * the query builder must NOT send that implied offset to the backend.
   */
  implicitOffset?: boolean;
  /** Legacy absolute left position, only read for the first slot of row 1. */
  left?: number;
};

export type BigNumberMetricRow = {
  id?: string;
  slots: BigNumberMetricSlot[];
};

/** 'comparison1Left' -> 'comparison1_left'. */
export const camelToSnake = (key: string): string =>
  key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/** Read a form-data key written in either camelCase or snake_case. */
const pick = <T>(record: Record<string, unknown>, key: string): T | undefined =>
  (record[key] ?? record[camelToSnake(key)]) as T | undefined;

/**
 * A slot reads its value either from a configured comparison metric (saved
 * metric or custom SQL expression) or from the backend's time-offset column
 * `<metric label>__<offset>`. An unset mode falls back to the metric for
 * charts saved before the mode control existed.
 */
export const isMetricMode = (
  mode: BigNumberMetricSlotMode | undefined,
  column: QueryFormMetric | undefined,
): boolean => mode === 'metric' || (!mode && !!column);

const normalizeMode = (value: unknown): BigNumberMetricSlotMode | undefined =>
  value === 'time_shift' || value === 'metric' ? value : undefined;

const normalizeSlot = (value: unknown): BigNumberMetricSlot => {
  const slot = (
    value && typeof value === 'object' ? value : {}
  ) as BigNumberMetricSlot;
  return {
    ...slot,
    mode: normalizeMode(slot.mode),
  };
};

/**
 * Charts saved before metric rows existed keep their `comparison1_*` /
 * `comparison2_*` controls. Synthesize those two slots as row 1 so they join
 * the very same list instead of needing a data migration: opening an old
 * chart shows the MoM/YoY pair in the new editor and renders identically.
 * Once the editor saves, `metric_rows` becomes the single source of truth.
 */
const legacyRows = (
  formData: Record<string, unknown>,
): BigNumberMetricRow[] => {
  const legacySlot = (index: 1 | 2): BigNumberMetricSlot => {
    const column = pick<QueryFormMetric>(formData, `comparison${index}Column`);
    const defaultLabel =
      index === 1 ? DEFAULT_COMPARISON1_LABEL : DEFAULT_COMPARISON2_LABEL;
    const defaultOffset =
      index === 1 ? DEFAULT_COMPARISON1_OFFSET : DEFAULT_COMPARISON2_OFFSET;
    const configuredOffset = pick<string>(formData, `comparison${index}Offset`);
    return {
      id: `legacy_${index}`,
      show: pick<boolean>(formData, `showComparison${index}`) ?? true,
      label:
        pick<string>(formData, `comparison${index}Label`) ?? t(defaultLabel),
      mode:
        normalizeMode(pick(formData, `comparison${index}Mode`)) ??
        (column ? 'metric' : 'time_shift'),
      offset: configuredOffset ?? defaultOffset,
      implicitOffset: configuredOffset === undefined,
      column,
      numberFormat: pick<string>(
        formData,
        `comparison${index}PercentDifferenceFormat`,
      ),
      left: pick<number>(formData, `comparison${index}Left`),
    };
  };
  return [{ id: 'legacy_row_1', slots: [legacySlot(1), legacySlot(2)] }];
};

/**
 * The single entry point for the query builder, the renderer and the Explore
 * editor. An explicitly saved empty list stays empty (the user removed every
 * row); a missing list falls back to the legacy MoM/YoY pair.
 */
export function resolveMetricRows(
  formData: Record<string, unknown> | undefined | null,
): BigNumberMetricRow[] {
  const record = (formData ?? {}) as Record<string, unknown>;
  const rows = pick<unknown>(record, 'metricRows');
  if (!Array.isArray(rows)) return legacyRows(record);
  return rows
    .filter((row): row is Record<string, unknown> =>
      Boolean(row && typeof row === 'object' && !Array.isArray(row)),
    )
    .map((row, index) => {
      const slots = Array.isArray(row.slots) ? row.slots : [];
      return {
        id: typeof row.id === 'string' ? row.id : `row_${index}`,
        // Keep the exact number of slots the user configured. Padding every
        // row to two used to create empty, invisible columns; rows now flow
        // their own visible slots from the left edge independently.
        slots: slots.slice(0, MAX_SLOTS_PER_ROW).map(normalizeSlot),
      };
    });
}

/** Flat list of all configured slots, in row order. */
export const flattenMetricSlots = (
  rows: BigNumberMetricRow[],
): BigNumberMetricSlot[] => rows.flatMap(row => row.slots);
