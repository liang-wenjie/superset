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
import { ensureIsArray, getNumberFormatter } from '@superset-ui/core';
import type { EChartsCoreOption, EChartsType } from 'echarts/core';

export type DataTableColumn = {
  key: string;
  value: string | number;
};

export type DataTableRow = {
  name: string;
  // Undefined when the series has no explicit color; the component falls back
  // to a theme token so no literal colors live outside the theme.
  color?: string;
  isLine: boolean;
  cells: string[];
};

export type DataTable = {
  columns: DataTableColumn[];
  rows: DataTableRow[];
};

export type ColumnLayout = {
  // Pixel boundaries of the legend column and each visible category column.
  boundaries: number[];
  // Indexes into DataTable.columns for the visible columns.
  indexes: number[];
};

export const DATA_TABLE_ROW_HEIGHT = 28;
export const DATA_TABLE_MAX_ROWS = 8;

export const getDataTableHeight = (rowCount: number): number =>
  rowCount === 0
    ? 0
    : Math.min(rowCount, DATA_TABLE_MAX_ROWS) * DATA_TABLE_ROW_HEIGHT + 1;

export const DATA_TABLE_FONT_SIZE = 12;
const LEGEND_MARKER_WIDTH = 10;
const LEGEND_GAP = 6;
const LEGEND_PADDING = 12;
const LABEL_SAFETY_MARGIN = 8;
const MIN_GRID_LEFT = 24;
// A very long series name must not eat most of the plotting area.
const MAX_GRID_LEFT_RATIO = 0.4;

// Same per-character factors as BigNumberYoyMom's estimateTextWidth: CJK and
// other non-ASCII glyphs are roughly one em wide, ASCII about 0.62 em.
const estimateLabelWidth = (text: string, fontSizePx: number): number =>
  Math.ceil(
    Array.from(text).reduce(
      (width, char) => width + (char.charCodeAt(0) > 255 ? 1.1 : 0.62),
      0,
    ) * fontSizePx,
  );

/**
 * Minimum `grid.left` needed so the longest series name fits in the legend
 * column. The chart's Y axis (and thus the plot area) moves right by this
 * amount, and the table's first column then aligns to that new plot edge.
 */
export function getDataTableGridLeft(
  rows: DataTableRow[],
  fontSizePx = DATA_TABLE_FONT_SIZE,
  chartWidth = 0,
): number {
  const longestLabel = rows.reduce(
    (max, row) => Math.max(max, estimateLabelWidth(row.name, fontSizePx)),
    0,
  );
  const required = Math.ceil(
    longestLabel +
      LEGEND_MARKER_WIDTH +
      LEGEND_GAP +
      LEGEND_PADDING +
      LABEL_SAFETY_MARGIN,
  );
  const cap =
    chartWidth > 0
      ? Math.round(chartWidth * MAX_GRID_LEFT_RATIO)
      : Number.POSITIVE_INFINITY;
  return Math.max(MIN_GRID_LEFT, Math.min(required, cap));
}

const FORECAST_MARKERS = ['__yhat'];

type EchartsSeries = {
  name?: string;
  type?: string;
  data?: unknown[];
  yAxisIndex?: number;
  queryIndex?: number;
  itemStyle?: { color?: unknown };
  lineStyle?: { color?: unknown };
};

// Annotation and forecast helper series live in `series` too, but only the
// series produced by transformSeries() carry a queryIndex and represent data
// the user actually selected. Keeping them out of the table mirrors the legend.
const isDataSeries = (series: EchartsSeries): boolean =>
  (series.type === 'line' || series.type === 'bar') &&
  typeof series.name === 'string' &&
  series.name.length > 0 &&
  typeof series.queryIndex === 'number' &&
  !FORECAST_MARKERS.some(marker => series.name?.includes(marker)) &&
  Array.isArray(series.data);

const getDatum = (datum: unknown): unknown[] | undefined => {
  if (Array.isArray(datum)) {
    return datum;
  }
  // ECharts label layouts may wrap a datum as { value: [x, y], label: ... },
  // and some series use { name: category, value: number } data items.
  if (datum && typeof datum === 'object') {
    const item = datum as Record<string, unknown>;
    const { value } = item;
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'string') {
      const category = item.name ?? item.category ?? item.x;
      if (typeof category === 'string' || typeof category === 'number') {
        return [category, value];
      }
    }
  }
  return undefined;
};

const resolveColor = (series: EchartsSeries): string | undefined => {
  const color = series.itemStyle?.color ?? series.lineStyle?.color;
  return typeof color === 'string' ? color : undefined;
};

/**
 * Build a series-by-category table straight from the final ECharts options.
 * Each series keeps the number format of the value axis it is attached to, so
 * mixed charts with two differently formatted Y axes stay faithful to the
 * chart instead of being normalized to one format.
 */
export function buildDataTable(
  echartOptions: EChartsCoreOption,
  primaryFormat?: string,
  secondaryFormat?: string,
): DataTable {
  const series = ensureIsArray(
    (echartOptions as { series?: unknown }).series,
  ) as EchartsSeries[];
  const primaryFormatter = getNumberFormatter(primaryFormat);
  const secondaryFormatter = getNumberFormatter(secondaryFormat);
  const columnMap = new Map<string, DataTableColumn>();
  const dataSeries = series.filter(isDataSeries);

  dataSeries.forEach(entry => {
    (entry.data ?? []).forEach(datum => {
      const pair = getDatum(datum);
      if (!pair || pair.length < 2) {
        return;
      }
      const [category] = pair;
      if (typeof category !== 'string' && typeof category !== 'number') {
        return;
      }
      const key = String(category);
      if (!columnMap.has(key)) {
        columnMap.set(key, { key, value: category });
      }
    });
  });

  const columns = Array.from(columnMap.values());
  // A time axis stores numeric timestamps; sorting them keeps the table in
  // chronological order regardless of the order series were concatenated in.
  if (columns.every(column => typeof column.value === 'number')) {
    columns.sort((a, b) => (a.value as number) - (b.value as number));
  }
  const columnIndex = new Map(
    columns.map((column, index) => [column.key, index]),
  );

  const rows = dataSeries.map(entry => {
    const cells: (string | undefined)[] = Array.from({
      length: columns.length,
    });
    (entry.data ?? []).forEach(datum => {
      const pair = getDatum(datum);
      if (!pair || pair.length < 2) {
        return;
      }
      const [category, value] = pair;
      const index = columnIndex.get(String(category));
      if (index === undefined) {
        return;
      }
      if (value === null || value === undefined || value === '') {
        cells[index] = '';
        return;
      }
      const numericValue = typeof value === 'number' ? value : Number(value);
      const formatter =
        entry.yAxisIndex === 1 ? secondaryFormatter : primaryFormatter;
      cells[index] = Number.isNaN(numericValue)
        ? String(value)
        : formatter(numericValue);
    });
    return {
      name: entry.name as string,
      color: resolveColor(entry),
      isLine: entry.type === 'line',
      cells: cells.map(cell => cell ?? ''),
    };
  });

  return { columns, rows };
}

/**
 * Map categories to pixel columns that share the chart's X axis coordinates.
 * The legend column occupies the space reserved for the Y axis labels, and
 * each category column spans from the midpoint to the next category center.
 * Recomputing on every `finished` event keeps the table aligned after resize
 * and dataZoom interactions.
 */
// `finished` fires on every repaint. Returning the previous object when the
// geometry is unchanged prevents an endless render -> setOption -> finished
// loop, since the parent re-renders whenever this state changes.
export function areColumnLayoutsEqual(
  previous: ColumnLayout,
  next: ColumnLayout,
): boolean {
  if (
    previous.indexes.length !== next.indexes.length ||
    previous.boundaries.length !== next.boundaries.length
  ) {
    return false;
  }
  return (
    previous.indexes.every((value, index) => value === next.indexes[index]) &&
    previous.boundaries.every(
      (value, index) => Math.abs(value - next.boundaries[index]) < 0.5,
    )
  );
}

export function computeColumnLayout(
  chart: EChartsType,
  columns: DataTableColumn[],
  containerWidth?: number,
): ColumnLayout {
  const count = columns.length;
  if (!count) {
    return { boundaries: [], indexes: [] };
  }

  const chartWidth = chart.getWidth() || containerWidth || 0;
  let left = 0;
  let right = chartWidth;
  let gridResolved = false;
  try {
    const rect = (
      chart as unknown as {
        getModel: () => {
          getComponent: (
            type: string,
            index: number,
          ) => {
            coordinateSystem: {
              getRect: () => { x: number; width: number };
            };
          };
        };
      }
    )
      .getModel()
      .getComponent('grid', 0)
      .coordinateSystem.getRect();
    if (
      Number.isFinite(rect.x) &&
      Number.isFinite(rect.width) &&
      rect.width > 1
    ) {
      left = rect.x;
      right = rect.x + rect.width;
      gridResolved = true;
    }
  } catch {
    // Fall back to a layout derived from the container width below.
  }
  if (!gridResolved || !(right > left)) {
    // Reserve a gutter roughly as wide as the Y axis labels so the legend
    // column starts at the same horizontal position as the plot.
    left = Math.round(chartWidth * 0.1);
    right = Math.round(chartWidth * 0.95);
  }
  if (!(right > left)) {
    left = 0;
    right = chartWidth;
  }

  const centers = columns.map((column, index) => {
    // Category axes accept either the category value or its index; time axes
    // accept the raw value. Superset emits both numeric YYYYMM categories and
    // timestamps, so try every representation before giving up.
    const candidates: (string | number)[] = [
      column.value,
      String(column.value),
      index,
    ];
    for (const candidate of candidates) {
      try {
        const px = chart.convertToPixel({ xAxisIndex: 0 }, candidate);
        const resolved = Array.isArray(px) ? px[0] : px;
        if (typeof resolved === 'number' && Number.isFinite(resolved)) {
          return resolved;
        }
      } catch {
        // Try the next representation.
      }
    }
    return Number.NaN;
  });

  // A finite coordinate can still be wrong: on a time axis, a category like
  // 202607 is parsed as a 1970 timestamp and maps far outside the grid. In
  // that case fall back to evenly spaced bands, which is how ECharts lays out
  // a category axis anyway. Never drop columns -- an empty layout renders a
  // table with no data at all.
  const usable = centers.every(
    px => Number.isFinite(px) && px >= left - 1 && px <= right + 1,
  );
  const resolvedCenters = usable
    ? centers
    : columns.map(
        (_, index) => left + ((right - left) * (index + 0.5)) / count,
      );

  const boundaries = [left];
  for (let index = 0; index < count - 1; index += 1) {
    const midpoint = (resolvedCenters[index] + resolvedCenters[index + 1]) / 2;
    const clamped = Math.min(Math.max(midpoint, left), right);
    boundaries.push(Math.max(clamped, boundaries[boundaries.length - 1]));
  }
  boundaries.push(Math.max(right, boundaries[boundaries.length - 1]));

  return {
    boundaries,
    indexes: columns.map((_, index) => index),
  };
}
