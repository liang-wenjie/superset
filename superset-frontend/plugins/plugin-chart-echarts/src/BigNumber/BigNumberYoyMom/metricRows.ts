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

/** Number of metric slots rendered side by side in every row. */
export const SLOTS_PER_ROW = 2;

export type BigNumberMetricSlotMode = 'time_shift' | 'metric';

/**
 * One cell of a metric row. Every cell is configured independently: it can
 * read a backend time-offset column (percentage difference) or a metric /
 * custom SQL expression (the value itself), with its own label and format.
 */
export type BigNumberMetricSlot = {
  id?: string;
  show?: boolean;
  label?: string;
  mode?: BigNumberMetricSlotMode;
  offset?: string;
  column?: QueryFormMetric;
  numberFormat?: string;
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
      const normalized = Array.from({ length: SLOTS_PER_ROW }, (_, slotIndex) =>
        normalizeSlot(slots[slotIndex]),
      );
      return {
        id: typeof row.id === 'string' ? row.id : `row_${index}`,
        slots: normalized,
      };
    });
}

/** Flat list of all configured slots, in row order. */
export const flattenMetricSlots = (
  rows: BigNumberMetricRow[],
): BigNumberMetricSlot[] => rows.flatMap(row => row.slots);
