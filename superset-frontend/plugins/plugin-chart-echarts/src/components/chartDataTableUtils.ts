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
// Shared with ChartDataTable so the reserved width always matches the DOM
// instead of drifting when the legend column padding is tuned.
export const LEGEND_MARKER_WIDTH = 8;
export const LEGEND_GAP = 4;
export const LEGEND_PADDING = 4;
// Covers the legend column's 1px right border, canvas/DOM font differences
// and sub-pixel rounding. Without it the last glyph gets ellipsized even when
// the measured text width appears sufficient.
export const LABEL_SAFETY_MARGIN = 4;
export const MIN_GRID_LEFT = 8;
// A very long series name must not eat most of the plotting area.
const MAX_GRID_LEFT_RATIO = 0.4;

export type LabelWidthMeasure = (text: string, fontSizePx: number) => number;

// Same per-character factors as BigNumberYoyMom's estimateTextWidth: CJK and
// other non-ASCII glyphs are roughly one em wide, ASCII about 0.62 em.
const estimateLabelWidth: LabelWidthMeasure = (text, fontSizePx) =>
  Math.ceil(
    Array.from(text).reduce(
      (width, char) => width + (char.charCodeAt(0) > 255 ? 1.1 : 0.62),
      0,
    ) * fontSizePx,
  );

let cachedFontFamily: string | undefined;

const resolveFontFamily = (): string => {
  if (cachedFontFamily !== undefined) {
    return cachedFontFamily;
  }
  if (
    typeof window === 'undefined' ||
    !window.getComputedStyle ||
    !document.body
  ) {
    cachedFontFamily = 'sans-serif';
  } else {
    cachedFontFamily =
      window.getComputedStyle(document.body).fontFamily || 'sans-serif';
  }
  return cachedFontFamily;
};

/**
 * Measure series names with the browser's own font metrics instead of a
 * per-character approximation. Returns undefined when canvas is unavailable
 * (SSR, jsdom, hardened browsers) so callers can fall back to the estimate.
 */
export function createLabelWidthMeasure(
  fontSizePx: number,
): LabelWidthMeasure | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }
  try {
    const context = document.createElement('canvas').getContext('2d');
    if (!context) {
      return undefined;
    }
    context.font = `${fontSizePx}px ${resolveFontFamily()}`;
    return (text: string) => {
      const { width } = context.measureText(text);
      return Number.isFinite(width) && width > 0
        ? Math.ceil(width)
        : estimateLabelWidth(text, fontSizePx);
    };
  } catch {
    return undefined;
  }
}

/**
 * Read the user-configured minimum width of the series-name column. The
 * control is saved under a camelCase key, but plugins can be handed formData
 * that still uses the snake_case spelling, so accept both and ignore values
 * that cannot be used as a pixel width.
 */
export function getDataTableMinLegendWidth(formData: {
  dataTableMinLegendWidth?: unknown;
  data_table_min_legend_width?: unknown;
}): number {
  const raw =
    formData.dataTableMinLegendWidth ?? formData.data_table_min_legend_width;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Minimum `grid.left` needed so the longest series name fits in the legend
 * column. With `containLabel: true` ECharts already reserves the Y-axis label
 * gutter *on top of* `grid.left`, so that measured gutter is subtracted here —
 * otherwise it is paid for twice and the legend column ends up much wider than
 * its text. Names are measured with the browser's font metrics; the
 * per-character approximation is only a fallback. The safety margin is always
 * applied, and an explicit `minLegendWidth` can widen the column further.
 */
export function getDataTableGridLeft(
  rows: DataTableRow[],
  fontSizePx = DATA_TABLE_FONT_SIZE,
  chartWidth = 0,
  yAxisLabelGutter = 0,
  minLegendWidth = 0,
): number {
  if (rows.length === 0) {
    return 0;
  }
  const exactMeasure = createLabelWidthMeasure(fontSizePx);
  const measure: LabelWidthMeasure = exactMeasure ?? estimateLabelWidth;
  const longestLabel = rows.reduce(
    (max, row) => Math.max(max, measure(row.name, fontSizePx)),
    0,
  );
  const legendWidth = Math.ceil(
    longestLabel +
      LEGEND_MARKER_WIDTH +
      LEGEND_GAP +
      LEGEND_PADDING +
      LABEL_SAFETY_MARGIN,
  );
  const minimum = Number.isFinite(minLegendWidth)
    ? Math.max(0, minLegendWidth)
    : 0;
  const targetWidth = Math.max(legendWidth, minimum);
  const required = Math.max(0, targetWidth - Math.max(0, yAxisLabelGutter));
  const cap =
    chartWidth > 0
      ? Math.round(chartWidth * MAX_GRID_LEFT_RATIO)
      : Number.POSITIVE_INFINITY;
  return Math.max(MIN_GRID_LEFT, Math.min(required, cap));
}

/**
 * The width ECharts reserves for Y-axis labels under `containLabel: true`.
 * `computeColumnLayout` already measures the plot edge (`grid.rect.x`), and the
 * component records the `grid.left` it applied, so the gutter is simply the
 * difference — no dependency on ECharts' internal model options.
 * Returns 0 for unusable measurements, which keeps the conservative width.
 */
export function getGridLabelGutter(
  plotLeft: number,
  configuredGridLeft: number,
): number {
  if (!Number.isFinite(plotLeft) || !Number.isFinite(configuredGridLeft)) {
    return 0;
  }
  return Math.max(0, Math.round(plotLeft - configuredGridLeft));
}

/**
 * Apply the legend-column width to the chart's grid. Returns the `grid.left`
 * actually handed to ECharts so the render callback can measure the Y-axis
 * label gutter as `plotEdge - appliedGridLeft`. Keeping this a pure helper
 * makes the resize/width feedback loop testable without a chart instance.
 */
export function resolveDataTableGrid(
  echartOptions: EChartsCoreOption,
  requiredGridLeft: number,
): { chartOptions: EChartsCoreOption; appliedGridLeft: number } {
  const fallback = { chartOptions: echartOptions, appliedGridLeft: 0 };
  if (!requiredGridLeft) {
    return fallback;
  }
  const { grid } = echartOptions as { grid?: unknown };
  if (!grid || typeof grid !== 'object' || Array.isArray(grid)) {
    return fallback;
  }
  const gridObject = grid as Record<string, unknown>;
  const currentLeft = typeof gridObject.left === 'number' ? gridObject.left : 0;
  const nextLeft = Math.max(currentLeft, requiredGridLeft);
  return {
    appliedGridLeft: nextLeft,
    chartOptions:
      nextLeft === currentLeft
        ? echartOptions
        : ({
            ...echartOptions,
            grid: { ...gridObject, left: nextLeft },
          } as EChartsCoreOption),
  };
}

const FORECAST_MARKERS = ['__yhat'];

type EchartsAxis = {
  data?: unknown[];
};

// A category axis lists every category the chart renders, including ones
// where all series are null. Seeding the table from it keeps those columns
// (and their separators) visible instead of silently dropping them.
const getAxisCategories = (
  echartOptions: EChartsCoreOption,
): (string | number)[] => {
  const axes = ensureIsArray(
    (echartOptions as { xAxis?: unknown }).xAxis,
  ) as EchartsAxis[];
  const data = axes[0]?.data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map(item => {
      if (typeof item === 'string' || typeof item === 'number') {
        return item;
      }
      if (item && typeof item === 'object') {
        const { value } = item as Record<string, unknown>;
        if (typeof value === 'string' || typeof value === 'number') {
          return value;
        }
      }
      return undefined;
    })
    .filter(
      (item): item is string | number =>
        typeof item === 'string' || typeof item === 'number',
    );
};

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
  const axisCategories = getAxisCategories(echartOptions);

  // Seed from the axis first: a category whose values are all null may not
  // appear in any series data at all, but the table must still render it.
  axisCategories.forEach(category => {
    const key = String(category);
    if (!columnMap.has(key)) {
      columnMap.set(key, { key, value: category });
    }
  });

  dataSeries.forEach(entry => {
    (entry.data ?? []).forEach((datum, datumIndex) => {
      const pair = getDatum(datum);
      // On a category axis a series datum can be a bare value; its category
      // is then the axis entry at the same position.
      const category = pair ? pair[0] : axisCategories[datumIndex];
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
  // A time axis has no explicit category list, so sort numeric timestamps
  // chronologically. A category axis already defines the display order.
  if (
    axisCategories.length === 0 &&
    columns.every(column => typeof column.value === 'number')
  ) {
    columns.sort((a, b) => (a.value as number) - (b.value as number));
  }
  const columnIndex = new Map(
    columns.map((column, index) => [column.key, index]),
  );

  const rows = dataSeries.map(entry => {
    const cells: (string | undefined)[] = Array.from({
      length: columns.length,
    });
    (entry.data ?? []).forEach((datum, datumIndex) => {
      const pair = getDatum(datum);
      const category = pair ? pair[0] : axisCategories[datumIndex];
      if (typeof category !== 'string' && typeof category !== 'number') {
        return;
      }
      const index = columnIndex.get(String(category));
      if (index === undefined) {
        return;
      }
      const value = pair ? pair[1] : datum;
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
