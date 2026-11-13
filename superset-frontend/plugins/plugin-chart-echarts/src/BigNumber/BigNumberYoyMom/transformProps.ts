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
import {
  getMetricLabel,
  getNumberFormatter,
  getValueFormatter,
  Metric,
  NumberFormats,
  QueryFormMetric,
} from '@superset-ui/core';
import type { EChartsCoreOption } from 'echarts/core';
import type { GraphicComponentOption } from 'echarts/components';
import {
  DEFAULT_BIG_NUMBER_COLOR,
  DEFAULT_BIG_NUMBER_FONT_SIZE,
  DEFAULT_BIG_NUMBER_LEFT,
  DEFAULT_COMPARISON_GAP,
  DEFAULT_COMPARISON_FONT_SIZE,
  DEFAULT_COMPARISON_NEGATIVE_COLOR,
  DEFAULT_COMPARISON_POSITIVE_COLOR,
  DEFAULT_COMPARISON_SHOW_ARROW,
  DEFAULT_COMPARISON_THRESHOLD,
  DEFAULT_COMPARISON_ZERO_COLOR,
  DEFAULT_TITLE_COLOR,
  DEFAULT_TITLE_FONT_SIZE,
  DEFAULT_TITLE_LEFT,
  DEFAULT_UNIFORM_BIG_NUMBER_FONT_SIZE,
} from './constants';
import {
  BigNumberYoyMomChartProps,
  BigNumberYoyMomProps,
  RGBColor,
} from './types';
import {
  MIN_LARGE_TEXT_CONTRAST,
  MIN_TEXT_CONTRAST,
  resolveTextColor,
  toCssColor,
} from './themeColors';
import {
  alignToTimeGrain,
  parseTimePointValue,
  shiftPointToOffset,
} from './timeRange';
import {
  BigNumberMetricSlot,
  BigNumberMetricSlotMode,
  BigNumberMetricSlotStyle,
  SlotColor,
  camelToSnake,
  isMetricMode,
  resolveMetricRows,
} from './metricRows';

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return Number(value);
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

/**
 * Normalize a position/gap control value. Any non-numeric input (blank
 * string, null, NaN) is treated as 0, so clearing the control or typing
 * invalid characters produces the same layout as an explicit 0.
 */
const normalizePosition = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Estimate the rendered width of a string at a given font size. Full-width
 * characters (labels, arrows) are wider than ASCII digits and separators.
 * The big number renders bold, which is a touch wider than regular weight,
 * so callers can pass `bold` to use a slightly larger per-character factor.
 * Used both to lay comparison slots out side by side and to auto-shrink the
 * big number when it would overflow the tile.
 */
const estimateTextWidth = (
  text: string,
  fontSizePx: number,
  bold = false,
): number =>
  Math.ceil(
    Array.from(text).reduce(
      (width, char) =>
        width + (char.charCodeAt(0) > 255 ? 1.1 : bold ? 0.68 : 0.62),
      0,
    ) * fontSizePx,
  );

/**
 * Comparison labels are mostly digits, Latin letters and a percent sign, which
 * render much narrower than the generic 0.62em ASCII estimate above. On the
 * reported dashboard that estimate overstated a "同比 ↑104.79%" slot by about
 * 60%, shrinking the text and leaving a wide empty gap on the right. Full-width
 * glyphs (Chinese labels, arrows) stay at ~1em. Keep this separate from the
 * big-number estimate so the number's own auto-fit behaviour is unchanged.
 */
const estimateComparisonTextWidth = (
  text: string,
  fontSizePx: number,
): number =>
  Math.ceil(
    Array.from(text).reduce(
      (width, char) => width + (char.charCodeAt(0) > 255 ? 1 : 0.5),
      0,
    ) * fontSizePx,
  );

// Estimated widths are heuristic (fixed per-character factors), so the real
// render can differ by a few pixels depending on the actual font. Auto-shrink
// against a slightly reduced available width so text stays off the canvas edge.
const TEXT_FIT_SAFETY_MARGIN = 3;

/**
 * Width of a formatted number at 1px, in font-size units. The legacy estimate
 * above charges a flat 0.68 per ASCII character, which overstates digits by
 * ~20% and separators by ~2x. Adaptive sizing uses these finer factors so it
 * keeps the biggest font size that still fits the tile.
 */
const numericWidthPerPx = (text: string): number =>
  Array.from(text).reduce((width, char) => {
    const code = char.charCodeAt(0);
    if (code > 255) return width + 1;
    if (char >= '0' && char <= '9') return width + 0.58;
    if (char === ',' || char === '.' || char === '-' || char === ' ') {
      return width + 0.3;
    }
    return width + 0.62;
  }, 0);

// A KPI tile's font size comes from its pixel width (the eight-character
// design number below is its capacity) BUT is also capped by the widest
// formatted number of every KPI tile on the dashboard. The dashboard injects
// those texts so a long number makes all tiles shrink together: none is
// clipped, and none shrinks on its own and breaks the uniform sizing.
const TYPICAL_BIG_NUMBER_TEXT = '0,000.00';
// Only a small right padding is needed, plus the same safety margin the
// per-tile auto-fit uses to absorb the width-estimation error.
const UNIFORM_RIGHT_PADDING = 4;
// Uniform sizing must keep the YoY/MoM row inside the tile too. This
// data-independent text is a conservative stand-in for the widest
// "label + arrow + percentage" slot; every tile derives the same comparison
// size cap from it, so no tile shrinks its comparison text on its own and
// the whole dashboard keeps one comparison font size.
const UNIFORM_COMPARISON_DESIGN_TEXT = 'MMM ↓-000.00%';
const MIN_UNIFORM_COMPARISON_FONT_SIZE = 8;
// YoY/MoM glyphs are much narrower than the big number's, and the row has more
// horizontal room than the number, so give it a larger share of the tile than
// the title (0.15 / 0.4). This is data-independent: every tile gets one size,
// and the shared cap below still keeps the row inside the canvas.
const UNIFORM_COMPARISON_FONT_RATIO = 0.45;
// Uniform sizing pins the comparison row to ONE dashboard-wide size. Derive
// it from the dashboard's absolute pixel setting (or this fixed reference when
// that setting is blank), never from the tile's measured width/height, so
// dragging a tile cannot make the YoY/MoM text grow or shrink.
const DEFAULT_UNIFORM_BIG_NUMBER_REFERENCE_PX = 40;
// Readability floor for the free (non-uniform) layout. The hard canvas guard
// below may still go smaller when that is the only way to avoid clipping.
const MIN_COMPARISON_FONT_SIZE_PX = 10;
// Sizing splits the available width into EQUAL columns, one per visible
// indicator. The comparison_gap control is never read here: pulling the
// slider may move the columns but must NEVER change the font size. At the
// slider's default value each column is exactly 1/N of the available width.
// The YoY/MoM row is secondary information. Its Tiny..Huge ratios are
// converted against a FIXED reference height instead of the tile's real
// height: on a tall tile 0.15 * 190 = 29px made the comparison text as large
// as the title. 120px maps the default Small (0.15) to 18px, the same size
// the dashboard-wide uniform setting uses, and keeps dragging height-stable.
const DEFAULT_COMPARISON_FONT_REFERENCE_HEIGHT_PX = 120;
// Extra rows are stacked below the first one with a gap proportional to the
// shared comparison font size. No new control is introduced: all rows reuse
// the existing font size, colors and spacing settings.
const COMPARISON_ROW_GAP_RATIO = 0.35;

/**
 * Read a comparison value column from a result row. Saved metrics are plain
 * column names; adhoc metrics are named by their label, or by the SQL
 * expression itself when no label is set. `getMetricLabel` covers metrics
 * created by the native metric editor (a SIMPLE adhoc metric has no SQL
 * expression, so its label is `SUM(column)`). The backend may normalize
 * whitespace in expression column names, so fall back to a
 * whitespace-insensitive match before giving up.
 */
const readMetricValue = (
  row: Record<string, unknown>,
  column: QueryFormMetric,
): number | string | null | undefined => {
  const asScalar = (value: unknown): number | string | null | undefined =>
    typeof value === 'number' || typeof value === 'string'
      ? value
      : value == null
        ? null
        : undefined;
  if (typeof column === 'string') return asScalar(row[column]);
  const sqlExpression =
    column.expressionType === 'SQL' ? column.sqlExpression : undefined;
  const candidates = [
    column.label,
    getMetricLabel(column),
    sqlExpression,
  ].filter((key): key is string => !!key);
  for (const key of candidates) {
    if (row[key] !== undefined) return asScalar(row[key]);
  }
  if (sqlExpression) {
    const expression = sqlExpression.replace(/\s+/g, '');
    const match = Object.keys(row).find(
      key => key.replace(/\s+/g, '') === expression,
    );
    if (match) return asScalar(row[match]);
  }
  return undefined;
};

/**
 * Percentage change between the current value and a comparison value.
 * Mirrors the Big Number with Time Period Comparison behavior: no data on
 * either side yields null (rendered as "—"), both zero yields 0%, and a zero
 * denominator yields +/-100%.
 */
const computePercent = (
  current: number | null,
  previous: number | null,
): number | null => {
  if (current === null || previous === null) return null;
  if (!current && !previous) return 0;
  if (!previous) return current ? 1 : -1;
  return (current - previous) / Math.abs(previous);
};

type ComparisonSlot = {
  show: boolean;
  label: string;
  offset?: string;
  column?: QueryFormMetric;
  mode?: BigNumberMetricSlotMode;
  current: number | null;
  comparisonValue: number | string | null | undefined;
  formatter: (value: number) => string;
  valueFormatter: (value: number) => string;
  visual: SlotVisual;
};

/** The comparison styling that actually applies to one indicator slot. */
type SlotVisual = {
  positiveColor: string;
  negativeColor: string;
  zeroColor: string;
  showArrow: boolean;
  threshold: number;
  /** Plain text color for every state; no red/green change at all. */
  noColorChange: boolean;
};

type ComparisonContent = { text: string; fill: string } | null;

export default function transformProps(
  chartProps: BigNumberYoyMomChartProps,
): BigNumberYoyMomProps {
  const {
    width,
    height,
    queriesData,
    formData,
    theme,
    datasource: {
      currencyFormats = {},
      columnFormats = {},
      currencyCodeColumn,
    },
  } = chartProps;
  // Form data keys follow the snake_case control names that Explore saves.
  // Tolerate camelCase too (older form data / direct callers) by falling
  // back to the snake_case spelling when the camelCase key is absent.
  const formDataRecord = formData as unknown as Record<string, unknown>;
  const pick = <T>(key: string): T | undefined =>
    (formDataRecord[key] ?? formDataRecord[camelToSnake(key)]) as T | undefined;
  const metric = pick<string>('metric') ?? 'value';
  const yAxisFormat = pick<string>('yAxisFormat');
  const currencyFormat =
    pick<Parameters<typeof getValueFormatter>[4]>('currencyFormat');
  const headerText = pick<string>('headerText') ?? '';
  const titleFontSize =
    pick<number>('titleFontSize') ?? DEFAULT_TITLE_FONT_SIZE;
  const titleColor = pick<RGBColor>('titleColor');
  const titleLeft = pick<number>('titleLeft') ?? DEFAULT_TITLE_LEFT;
  const titleTop = pick<number>('titleTop');
  const bigNumberFontSize =
    pick<number>('bigNumberFontSize') ?? DEFAULT_BIG_NUMBER_FONT_SIZE;
  const bigNumberColor = pick<RGBColor>('bigNumberColor');
  const bigNumberLeft =
    pick<number>('bigNumberLeft') ?? DEFAULT_BIG_NUMBER_LEFT;
  const bigNumberTop = pick<number>('bigNumberTop');
  // Dashboard-level styling: the dashboard injects these into every chart's
  // form data from its json_metadata, so no per-chart control is needed.
  const uniformBigNumberFontSize =
    pick<boolean>('uniformBigNumberFontSize') ??
    DEFAULT_UNIFORM_BIG_NUMBER_FONT_SIZE;
  const uniformBigNumberFontSizePx = pick<number>('uniformBigNumberFontSizePx');
  // All formatted big numbers of every KPI tile on the dashboard. The
  // dashboard injects the very same list into each one, so they all resolve
  // to one size and shrink together when a number is long.
  const uniformBigNumberReferenceTexts = pick<string[]>(
    'uniformBigNumberReferenceTexts',
  );
  // Unified metric rows: MoM/YoY are simply the two slots of row 1. Charts
  // saved before `metric_rows` existed resolve to that same legacy pair.
  const metricRows = resolveMetricRows(formDataRecord);
  const comparisonGap = pick<number>('comparisonGap') ?? DEFAULT_COMPARISON_GAP;
  // The old `comparison_use_center_gap` checkbox is intentionally NOT read:
  // every row now splits its width into equal columns instead of pinning the
  // second indicator to the tile center line. The control stays registered
  // (hidden) so charts saved with that flag keep their form data intact.
  const swapComparisonOrder = pick<boolean>('swapComparisonOrder') ?? false;
  const comparisonFontSize =
    pick<number>('comparisonFontSize') ?? DEFAULT_COMPARISON_FONT_SIZE;
  const comparisonTop = pick<number>('comparisonTop');
  const comparisonPositiveColor = pick<RGBColor>('comparisonPositiveColor');
  const comparisonNegativeColor = pick<RGBColor>('comparisonNegativeColor');
  const comparisonZeroColor = pick<RGBColor>('comparisonZeroColor');
  const comparisonShowArrow =
    pick<boolean>('comparisonShowArrow') ?? DEFAULT_COMPARISON_SHOW_ARROW;
  const comparisonThresholdValue = pick<number>('comparisonThreshold');
  const comparisonThreshold =
    typeof comparisonThresholdValue === 'number' &&
    !Number.isNaN(comparisonThresholdValue) &&
    comparisonThresholdValue > 0
      ? comparisonThresholdValue
      : DEFAULT_COMPARISON_THRESHOLD;
  const percentDifferenceFormat =
    pick<string>('percentDifferenceFormat') ?? NumberFormats.PERCENT_2_POINT;
  const timeGrainSqla = pick<string>('timeGrainSqla');

  const defaultTitleColor =
    theme?.colorTextSecondary ?? toCssColor(DEFAULT_TITLE_COLOR);
  const defaultBigNumberColor =
    theme?.colorText ?? toCssColor(DEFAULT_BIG_NUMBER_COLOR);
  const defaultComparisonPositiveColor =
    theme?.colorSuccess ?? toCssColor(DEFAULT_COMPARISON_POSITIVE_COLOR);
  const defaultComparisonNegativeColor =
    theme?.colorError ?? toCssColor(DEFAULT_COMPARISON_NEGATIVE_COLOR);
  const defaultComparisonZeroColor =
    theme?.colorTextTertiary ?? toCssColor(DEFAULT_COMPARISON_ZERO_COLOR);

  // The control panel saves its light-mode color defaults into form_data, so
  // on a dark dashboard the big number would be near-black text on a
  // near-black tile. ECharts graphic text is painted on a canvas, which dark
  // theme CSS cannot restyle, so fall back to the theme's text tokens when a
  // configured color has too little contrast against the tile background.
  // Readable custom colors are kept, and light dashboards are untouched.
  const resolveColor = (
    configured: RGBColor | undefined,
    themeFallback: string,
    minContrast: number,
  ): string => resolveTextColor(configured, themeFallback, theme, minContrast);

  const { data = [], detected_currency: detectedCurrency } =
    queriesData[0] || {};
  const hasData = data.length > 0;
  const metricName = getMetricLabel(metric);

  // Point-to-point comparison: buildQuery returns a second query with the
  // metric grouped by the time column (newest first) when a time shift is
  // configured without an enclosed time range ("No filter"). The comparison
  // value for an offset is the series point that matches the newest point
  // shifted by that offset; points that do not exist render as "—".
  const seriesQuery = queriesData[1];
  const seriesData = seriesQuery?.data ?? [];
  const seriesTimeColumn = seriesQuery?.colnames?.[0];
  const pointSeries = hasData && seriesData.length > 0 ? seriesData : null;
  const seriesPoints = pointSeries
    ? (pointSeries
        .map(row => {
          const time = seriesTimeColumn
            ? parseTimePointValue(row[seriesTimeColumn])
            : null;
          return time ? { time, value: toNumber(row[metricName]) } : null;
        })
        .filter(
          (point): point is { time: Date; value: number | null } =>
            point !== null,
        ) ?? [])
    : [];
  const latestPoint = seriesPoints.reduce(
    (latest, point) =>
      latest === null || point.time.getTime() > latest.time.getTime()
        ? point
        : latest,
    null as { time: Date; value: number | null } | null,
  );
  const matchPointOffset = (offset: string | undefined): number | null => {
    if (!offset || !latestPoint) return null;
    const target = alignToTimeGrain(
      shiftPointToOffset(latestPoint.time, offset),
      timeGrainSqla,
    );
    const hit = seriesPoints.find(
      point =>
        alignToTimeGrain(point.time, timeGrainSqla).getTime() ===
        target.getTime(),
    );
    return hit ? hit.value : null;
  };

  const metricEntry: Metric | undefined = chartProps.datasource?.metrics?.find(
    metricItem => metricItem.metric_name === metric,
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
  // Each slot carries its own percent difference format, falling back to the
  // legacy global control for charts saved before the split.
  // d3 percentage formats (e.g. ",.2%") scale the value by 100 and append the
  // "%" sign themselves; plain number formats (",.2f", Smart Number) expect
  // the already-scaled percentage value, so multiply by 100 before formatting.
  const formatPercentValue = (
    format: string | undefined,
    percent: number,
  ): string => {
    const d3Format = format || percentDifferenceFormat;
    const formatter = getNumberFormatter(d3Format);
    return formatter(d3Format.includes('%') ? percent : percent * 100);
  };
  const createPercentFormatter =
    (slot: BigNumberMetricSlot) => (value: number) =>
      formatPercentValue(slot.numberFormat, value);
  // Comparison value metrics render with the slot's configured number format
  // (the same control used for percent differences), falling back to the
  // default Smart Number format when unset.
  const createValueFormatter = (slot: BigNumberMetricSlot) => (value: number) =>
    getNumberFormatter(slot.numberFormat)(value);

  const row = data[0] || {};
  const rawBigNumber = hasData ? row[metricName] : null;
  const current = toNumber(rawBigNumber);

  // Resolve the formatted big number up front so its rendered width can drive
  // the auto font-size shrink below.
  let bigNumberText = t('No data');
  if (hasData && rawBigNumber !== null && rawBigNumber !== undefined) {
    bigNumberText =
      typeof rawBigNumber === 'number'
        ? numberFormatter(rawBigNumber)
        : String(rawBigNumber);
  }

  const graphic: GraphicComponentOption[] = [];

  // Auto-positioning keeps the text stack compact and centered, matching the
  // flex-centered layout used by the other Big Number visualizations. Title
  // and big number ratios (<= 1, Tiny .. Huge) scale with the chart height;
  // the comparison row uses a fixed reference height instead (see below).
  // Legacy numeric values > 1 are absolute pixels. These are the unscaled
  // design sizes.
  const hasTitle = !!headerText;
  const titleFontSizeValue =
    typeof titleFontSize === 'number'
      ? titleFontSize
      : Number(titleFontSize) || DEFAULT_TITLE_FONT_SIZE;
  const baseTitleFontSizePx =
    titleFontSizeValue <= 1
      ? Math.ceil(titleFontSizeValue * height)
      : Math.ceil(titleFontSizeValue);
  const bigNumberFontSizeValue =
    typeof bigNumberFontSize === 'number'
      ? bigNumberFontSize
      : Number(bigNumberFontSize) || DEFAULT_BIG_NUMBER_FONT_SIZE;
  const baseBigNumberFontSizePx =
    bigNumberFontSizeValue <= 1
      ? Math.ceil(bigNumberFontSizeValue * height)
      : Math.ceil(bigNumberFontSizeValue);
  const comparisonFontSizeValue =
    typeof comparisonFontSize === 'number'
      ? comparisonFontSize
      : Number(comparisonFontSize) || DEFAULT_COMPARISON_FONT_SIZE;
  // Unlike the title and the big number, comparison labels do NOT scale with
  // the tile height: see DEFAULT_COMPARISON_FONT_REFERENCE_HEIGHT_PX. A tall
  // tile must not turn "Tiny" into a 24px label.
  const baseComparisonFontSizePx =
    comparisonFontSizeValue <= 1
      ? Math.ceil(
          comparisonFontSizeValue * DEFAULT_COMPARISON_FONT_REFERENCE_HEIGHT_PX,
        )
      : Math.ceil(comparisonFontSizeValue);

  // ECharts graphic text does not wrap or auto-scale, so a long formatted
  // value (e.g. "15,145,470") gets clipped on the right when the tile is
  // narrow. The configured left offset and a symmetric right padding bound
  // the available width, and a small safety margin absorbs the heuristic
  // width estimation error.
  const bigNumberAvailableWidth = Math.max(
    0,
    width - bigNumberLeft - DEFAULT_BIG_NUMBER_LEFT - TEXT_FIT_SAFETY_MARGIN,
  );
  // Uniform sizing keeps the configured font size as an UPPER BOUND: the
  // dashboard may set one absolute pixel size, and when it is unset the
  // chart's own big_number_font_size (or the plugin default) wins. The tile
  // width sets the design capacity; the widest formatted number of all KPI
  // tiles then caps it so no tile can clip a value. Every KPI tile receives
  // the same reference texts, so they all resolve to exactly one size -- a
  // long number makes the WHOLE dashboard shrink together.
  // ONE ratio derived from that size is applied to every text size and
  // internal gap. With uniform sizing off, each element keeps its own
  // auto-fit behaviour.
  const configuredBigNumberFontSizePx =
    typeof uniformBigNumberFontSizePx === 'number' &&
    Number.isFinite(uniformBigNumberFontSizePx) &&
    uniformBigNumberFontSizePx > 0
      ? Math.ceil(uniformBigNumberFontSizePx)
      : baseBigNumberFontSizePx;
  const uniformAvailableWidth = Math.max(
    0,
    width - bigNumberLeft - UNIFORM_RIGHT_PADDING - TEXT_FIT_SAFETY_MARGIN,
  );
  const referenceTexts = Array.isArray(uniformBigNumberReferenceTexts)
    ? uniformBigNumberReferenceTexts.filter(
        (text): text is string => typeof text === 'string' && text.length > 0,
      )
    : [];
  // The tile's own text is a safety net: the dashboard derives its texts from
  // the saved number format, while the plugin may add a currency symbol or a
  // column-level format. On a dashboard this tile's text is already part of
  // the group list, so including it never changes the shared size.
  // (The list covers the whole dashboard, not just tiles of one grid size.)
  const textsToFit = uniformBigNumberFontSize
    ? [TYPICAL_BIG_NUMBER_TEXT, ...referenceTexts, bigNumberText]
    : [];
  const widestWidthPerPx = textsToFit.reduce(
    (widest, text) => Math.max(widest, numericWidthPerPx(text)),
    0,
  );
  const adaptiveBigNumberFontSizePx =
    uniformAvailableWidth > 0 && widestWidthPerPx > 0
      ? Math.floor(uniformAvailableWidth / widestWidthPerPx)
      : configuredBigNumberFontSizePx;
  const effectiveBigNumberFontSizePx = Math.max(
    8,
    Math.min(configuredBigNumberFontSizePx, adaptiveBigNumberFontSizePx),
  );
  // Use the plugin default ratio, not each chart's saved control value, as
  // the base of the shared scale: two tiles that saved different font sizes
  // still scale their gaps by exactly the same ratio.
  const uniformBaseFontSizePx = Math.max(
    1,
    Math.ceil(DEFAULT_BIG_NUMBER_FONT_SIZE * height),
  );
  const uniformScale = uniformBigNumberFontSize
    ? effectiveBigNumberFontSizePx / uniformBaseFontSizePx
    : 1;
  // Keep the smaller labels readable on very narrow tiles; the big number
  // itself has no artificial floor so it can always fit the dashboard's
  // widest number.
  const scaleFontSize = (size: number, minSize = 1) =>
    Math.max(minSize, Math.floor(size * uniformScale));
  const scaleGap = (gap: number) =>
    uniformBigNumberFontSize
      ? Math.max(0, Math.floor(gap * uniformScale))
      : gap;
  // Label sizes come from the one shared big-number size. Reading each
  // chart's saved title/comparison size here is what made the YoY/MoM rows
  // look different across tiles of the same size.
  const uniformTitleFontSizePx = Math.max(
    10,
    Math.round(
      (effectiveBigNumberFontSizePx * DEFAULT_TITLE_FONT_SIZE) /
        DEFAULT_BIG_NUMBER_FONT_SIZE,
    ),
  );
  // The comparison row takes a larger share than the title (see
  // UNIFORM_COMPARISON_FONT_RATIO). Unlike the title, this size must NOT be
  // derived from effectiveBigNumberFontSizePx: that value follows the tile's
  // pixel width, which made the YoY/MoM text change size while a tile was
  // being dragged. Use the dashboard's absolute pixel setting (or a fixed
  // reference) so the whole dashboard keeps one stable comparison size.
  const uniformComparisonReferencePx =
    typeof uniformBigNumberFontSizePx === 'number' &&
    Number.isFinite(uniformBigNumberFontSizePx) &&
    uniformBigNumberFontSizePx > 0
      ? uniformBigNumberFontSizePx
      : DEFAULT_UNIFORM_BIG_NUMBER_REFERENCE_PX;
  const uniformComparisonFontSizePx = Math.max(
    MIN_UNIFORM_COMPARISON_FONT_SIZE,
    Math.round(uniformComparisonReferencePx * UNIFORM_COMPARISON_FONT_RATIO),
  );
  const titleFontSizePx = uniformBigNumberFontSize
    ? uniformTitleFontSizePx
    : scaleFontSize(baseTitleFontSizePx, 10);
  const requestedBigNumberFontSizePx = uniformBigNumberFontSize
    ? effectiveBigNumberFontSizePx
    : scaleFontSize(baseBigNumberFontSizePx);
  // With uniform sizing off, the chart's own "Comparison font size" control is
  // the one and only source. The auto-fit below only ever subtracts from it
  // when the row would actually leave the canvas.
  const requestedComparisonFontSizePx = uniformBigNumberFontSize
    ? uniformComparisonFontSizePx
    : Math.max(MIN_COMPARISON_FONT_SIZE_PX, baseComparisonFontSizePx);

  const estimatedBigNumberWidth = estimateTextWidth(
    bigNumberText,
    requestedBigNumberFontSizePx,
    true,
  );
  const minBigNumberFontSizePx = Math.max(
    12,
    Math.floor(requestedBigNumberFontSizePx * 0.3),
  );
  const bigNumberFontSizePx =
    !uniformBigNumberFontSize &&
    bigNumberAvailableWidth > 0 &&
    estimatedBigNumberWidth > bigNumberAvailableWidth
      ? Math.max(
          minBigNumberFontSizePx,
          Math.floor(
            (requestedBigNumberFontSizePx * bigNumberAvailableWidth) /
              estimatedBigNumberWidth,
          ),
        )
      : requestedBigNumberFontSizePx;
  // The title is rendered as ECharts graphic text too, so a long title gets
  // clipped on the right on narrow tiles just like the big number and the
  // comparison row. Shrink it against the same available-width rule (the
  // configured left offset plus a symmetric right padding and the safety
  // margin), with an absolute floor so it stays legible.
  const titleAvailableWidth = Math.max(
    0,
    width - titleLeft - DEFAULT_TITLE_LEFT - TEXT_FIT_SAFETY_MARGIN,
  );
  const minTitleFontSizePx = 12;
  let effectiveTitleFontSizePx = titleFontSizePx;
  // In uniform mode no element shrinks against its own text: every KPI tile
  // uses the one dashboard-derived size computed above, which already
  // accounts for the longest number on the dashboard.
  if (!uniformBigNumberFontSize && titleAvailableWidth > 0 && headerText) {
    const estimatedTitleWidth = estimateTextWidth(headerText, titleFontSizePx);
    if (estimatedTitleWidth > titleAvailableWidth) {
      effectiveTitleFontSizePx = Math.max(
        minTitleFontSizePx,
        Math.floor(
          (titleFontSizePx * titleAvailableWidth) / estimatedTitleWidth,
        ),
      );
      // Re-check the shrunk width and shrink again if needed; the per-character
      // ceil rounding can still overshoot by a few pixels after one pass.
      for (let i = 0; i < 3; i += 1) {
        const shrunkTitleWidth = estimateTextWidth(
          headerText,
          effectiveTitleFontSizePx,
        );
        if (shrunkTitleWidth <= titleAvailableWidth) break;
        const nextTitleFontSizePx = Math.max(
          minTitleFontSizePx,
          Math.floor(
            (effectiveTitleFontSizePx * titleAvailableWidth) / shrunkTitleWidth,
          ),
        );
        if (nextTitleFontSizePx === effectiveTitleFontSizePx) break;
        effectiveTitleFontSizePx = nextTitleFontSizePx;
      }
    }
  }
  const titleRowHeight = effectiveTitleFontSizePx * 1.2;
  const bigNumberRowHeight = bigNumberFontSizePx * 1.2;
  // Row heights already follow the scaled font sizes. Scale the configured
  // internal gaps by the same ratio so spacing stays proportional too.
  const titleTopValue = scaleGap(normalizePosition(titleTop));
  const bigNumberTopValue = scaleGap(normalizePosition(bigNumberTop));
  const comparisonTopValue = scaleGap(normalizePosition(comparisonTop));

  const positiveColor = resolveColor(
    comparisonPositiveColor,
    defaultComparisonPositiveColor,
    MIN_TEXT_CONTRAST,
  );
  const negativeColor = resolveColor(
    comparisonNegativeColor,
    defaultComparisonNegativeColor,
    MIN_TEXT_CONTRAST,
  );
  const zeroColor = resolveColor(
    comparisonZeroColor,
    defaultComparisonZeroColor,
    MIN_TEXT_CONTRAST,
  );

  // The chart-level controls are the DEFAULTS for every indicator. A slot can
  // inherit them, opt out of all color changes, or override each field. An
  // omitted custom field still inherits, so "use default" works field by field.
  const slotVisual = (
    style: BigNumberMetricSlotStyle | undefined,
  ): SlotVisual => {
    const mode = style?.mode;
    const custom = mode === 'custom';
    const slotColor = (
      override: SlotColor | undefined,
      themeFallback: string,
      inherited: string,
    ): string =>
      custom && override
        ? resolveColor(override, themeFallback, MIN_TEXT_CONTRAST)
        : inherited;
    const customThreshold = custom ? style?.threshold : undefined;
    return {
      positiveColor: slotColor(
        style?.positiveColor,
        defaultComparisonPositiveColor,
        positiveColor,
      ),
      negativeColor: slotColor(
        style?.negativeColor,
        defaultComparisonNegativeColor,
        negativeColor,
      ),
      zeroColor: slotColor(
        style?.zeroColor,
        defaultComparisonZeroColor,
        zeroColor,
      ),
      showArrow:
        custom && typeof style?.showArrow === 'boolean'
          ? style.showArrow
          : comparisonShowArrow,
      // Zero is a valid override: it means "treat only exact zero as no
      // change", even when the chart-level default is a larger threshold.
      threshold:
        typeof customThreshold === 'number' &&
        Number.isFinite(customThreshold) &&
        customThreshold >= 0
          ? customThreshold
          : comparisonThreshold,
      noColorChange: mode === 'no_color_change',
    };
  };
  // Plain text color for slots that opted out of red/green coloring. It
  // follows the theme (light/dark) just like the big number itself.
  const neutralTextColor = defaultBigNumberColor;

  // The comparison row aligns with the big number: it starts at the same
  // configured left offset (instead of a hard-coded 20) so changing
  // big_number_left keeps both rows in sync, and the available-width rule
  // stays symmetric with the big number.
  const comparisonLeft = bigNumberLeft;
  const comparisonGapPx = scaleGap(Math.max(0, Number(comparisonGap) || 0));
  // The slider's DEFAULT is the exact equal split; dragging it away from the
  // default pulls the columns apart (larger) or together (smaller) by the
  // delta. Keeping the slider centred on the default means saved charts keep
  // their old value while every row still starts from a clean 1/N layout.
  const gapPullPx = comparisonGapPx - scaleGap(DEFAULT_COMPARISON_GAP);

  const slotComparisonValue = (
    mode: BigNumberMetricSlotMode | undefined,
    column: QueryFormMetric | undefined,
    offset: string | undefined,
  ): number | string | null | undefined => {
    if (!hasData) return null;
    if (isMetricMode(mode, column)) {
      return column ? readMetricValue(row, column) : null;
    }
    if (pointSeries && offset) return matchPointOffset(offset);
    return offset ? row[`${metricName}__${offset}`] : null;
  };

  // For point-to-point time shifts the percentage compares the newest series
  // point against the shifted point (e.g. latest month vs previous month),
  // not the overall main value. Other slots compare against the main value.
  const slotCurrent = (
    mode: BigNumberMetricSlotMode | undefined,
    column: QueryFormMetric | undefined,
  ): number | null => {
    if (pointSeries && !isMetricMode(mode, column)) {
      return latestPoint ? latestPoint.value : null;
    }
    return current;
  };

  const buildComparisonContent = ({
    show,
    label,
    offset,
    column,
    mode,
    current: slotCurrent,
    comparisonValue,
    formatter,
    valueFormatter,
    visual,
  }: ComparisonSlot): ComparisonContent => {
    if (!show) return null;
    if (!offset && !column) return null;
    const {
      positiveColor: slotPositiveColor,
      negativeColor: slotNegativeColor,
      zeroColor: slotZeroColor,
      showArrow,
      threshold,
      noColorChange,
    } = visual;
    const comparison = toNumber(comparisonValue);
    const missing = comparison === null;
    const labelPrefix = label ? `${label} ` : '';
    // `no_color_change` keeps the arrow and numeric formatting untouched;
    // only the fill stops following the increase/decrease direction.
    const fillFor = (value: number, withinThreshold: boolean): string =>
      noColorChange
        ? neutralTextColor
        : withinThreshold
          ? slotZeroColor
          : value > 0
            ? slotPositiveColor
            : slotNegativeColor;
    const missingFill = noColorChange ? neutralTextColor : slotZeroColor;

    // A comparison value metric (dataset column or custom SQL) supplies the
    // value itself, so render it like the big number instead of computing a
    // percentage change. Time shifts keep the percentage-difference display.
    if (isMetricMode(mode, column)) {
      if (missing) {
        return { text: `${labelPrefix}—`, fill: missingFill };
      }
      // At or below the no-change threshold (or exactly zero) the value is
      // rendered in the no-change color with no trend arrow.
      const withinThreshold = Math.abs(comparison) <= threshold;
      const arrow =
        !showArrow || withinThreshold ? '' : comparison > 0 ? '↑' : '↓';
      return {
        text: `${labelPrefix}${arrow}${valueFormatter(comparison)}`,
        fill: fillFor(comparison, withinThreshold),
      };
    }

    const percent = computePercent(slotCurrent, comparison);
    if (missing || percent === null) {
      return { text: `${labelPrefix}—`, fill: missingFill };
    }
    // At or below the no-change threshold (or exactly zero) the percent is
    // rendered in the no-change color with no trend arrow.
    const withinThreshold = Math.abs(percent) <= threshold;
    const arrow = !showArrow || withinThreshold ? '' : percent > 0 ? '↑' : '↓';
    return {
      text: `${labelPrefix}${arrow}${formatter(Math.abs(percent))}`,
      fill: fillFor(percent, withinThreshold),
    };
  };

  // Every row keeps its OWN number of slots and its original slot order. A
  // row with no visible slot is dropped so it never reserves vertical space;
  // hidden slots inside a row are skipped and never reserve a column.
  const comparisonContents: ComparisonContent[][] = metricRows.map(row =>
    row.slots.map(slot =>
      buildComparisonContent({
        show: slot.show !== false,
        label: slot.label ?? '',
        offset: slot.offset,
        column: slot.column,
        mode: slot.mode,
        current: slotCurrent(slot.mode, slot.column),
        comparisonValue: slotComparisonValue(
          slot.mode,
          slot.column,
          slot.offset,
        ),
        formatter: createPercentFormatter(slot),
        valueFormatter: createValueFormatter(slot),
        visual: slotVisual(slot.style),
      }),
    ),
  );
  const visibleRows = comparisonContents.filter(contents =>
    contents.some(Boolean),
  );
  const hasComparison = visibleRows.length > 0;
  // ONE column grid for the whole chart, sized by the row with the MOST
  // indicators. A two-indicator row must line up with the first two columns
  // of a three-indicator row instead of getting its own wider 1/2 columns.
  const maxSlotCount = Math.max(
    1,
    ...visibleRows.map(contents => contents.filter(Boolean).length),
  );
  // All rows measure with estimateComparisonTextWidth (0.5em ASCII / 1em
  // full-width): the generic estimator overstated a "同比 ↑104.79%" slot by
  // ~60% and flattened every configured font size to the same tiny value.
  // Uniform sizing measures a data-independent design text for EVERY slot so
  // equal-width tiles share ONE size even with different row/slot counts.
  const comparisonFitTexts = visibleRows.map(contents =>
    contents.map(content =>
      uniformBigNumberFontSize
        ? UNIFORM_COMPARISON_DESIGN_TEXT
        : (content?.text ?? ''),
    ),
  );
  // Widths stay aligned with the row's original slot indexes; a hidden slot
  // has width 0 and is filtered out while flowing the row.
  const comparisonSlotWidthsAt = (size: number): number[][] =>
    visibleRows.map((contents, rowIndex) =>
      contents.map((content, slotIndex) =>
        content
          ? estimateComparisonTextWidth(
              comparisonFitTexts[rowIndex][slotIndex],
              size,
            )
          : 0,
      ),
    );
  const activeWidthsOf = (widths: number[], rowIndex: number): number[] =>
    widths.filter((_, slotIndex) => visibleRows[rowIndex][slotIndex] !== null);
  // FONT SIZE IS INDEPENDENT OF THE SPACING CONTROL. Every visible indicator
  // owns one of the SHARED 1/maxSlotCount columns, so adding an indicator to
  // any row narrows the columns for ALL rows. Shrink the ONE shared font size
  // until the widest indicator of EVERY row fits inside one shared column;
  // all rows keep the same size, so row/slot counts cannot make one drift.
  const comparisonRowFits = (size: number, bound: number): boolean =>
    comparisonSlotWidthsAt(size).every((widths, rowIndex) => {
      const active = activeWidthsOf(widths, rowIndex);
      if (active.length === 0) return true;
      const columnWidth = Math.max(0, bound - comparisonLeft) / maxSlotCount;
      return active.every(slotWidth => slotWidth <= columnWidth);
    });
  const minComparisonFontSizePx = uniformBigNumberFontSize
    ? MIN_UNIFORM_COMPARISON_FONT_SIZE
    : MIN_COMPARISON_FONT_SIZE_PX;
  let comparisonFontSizePx = requestedComparisonFontSizePx;
  // Leave a little air on the right when there is room, but never let that
  // preference win over legibility. This is the only "soft" fit: it stops at
  // the readability floor.
  const preferredComparisonWidth = Math.max(0, width - TEXT_FIT_SAFETY_MARGIN);
  while (
    comparisonFontSizePx > minComparisonFontSizePx &&
    !comparisonRowFits(comparisonFontSizePx, preferredComparisonWidth)
  ) {
    comparisonFontSizePx -= 1;
  }
  // Clipping is never acceptable, in BOTH modes. The floor above is only a
  // readability preference; on a very narrow tile the row must be allowed to
  // go smaller than that to stay on the canvas. Uniform sizing still measures
  // the shared design text, so this guard cannot reintroduce per-tile drift.
  const canvasComparisonWidth = Math.max(0, width);
  while (
    comparisonFontSizePx > 1 &&
    !comparisonRowFits(comparisonFontSizePx, canvasComparisonWidth)
  ) {
    comparisonFontSizePx -= 1;
  }

  // LAYOUT ONLY. ALL rows share ONE column grid sized by maxSlotCount: with a
  // three-indicator row and a two-indicator row, both use 1/3 columns and the
  // shorter row fills the first two, so its indicators line up exactly with
  // the longer row's. The spacing slider pulls this ONE shared grid apart or
  // together. Nothing above reads the slider, so it can never change the font
  // size or make one row drift away from another.
  const slotWidths = comparisonSlotWidthsAt(comparisonFontSizePx);
  // Never let a pulled column push its text off the canvas.
  const clampLeft = (left: number, textWidth: number): number =>
    Math.min(Math.max(0, left), Math.max(0, width - textWidth));
  // Absolute positions saved by very old charts only apply to row 1's first
  // two slots, and only while the whole chart still uses a two-column grid.
  // Adding a third indicator to any row switches on the shared grid instead.
  const legacyLefts = metricRows[0]?.slots.map(slot => slot.left) ?? [];
  const hasLegacyComparisonLefts = legacyLefts.some(left => left !== undefined);
  const availableWidth = Math.max(0, width - comparisonLeft);
  const columnWidth = availableWidth / maxSlotCount;
  const rowLayouts = visibleRows.map((contents, rowIndex) => {
    const widths = slotWidths[rowIndex] ?? [];
    const activeIndexes = contents
      .map((content, slotIndex) => (content ? slotIndex : -1))
      .filter(slotIndex => slotIndex >= 0);
    // Reversing BEFORE placing preserves the legacy "swap the two columns"
    // behaviour and extends naturally to three or more indicators: the whole
    // row is reversed while still filling the same shared columns.
    const reverse =
      swapComparisonOrder && !(rowIndex === 0 && hasLegacyComparisonLefts);
    const displayIndexes = reverse
      ? [...activeIndexes].reverse()
      : activeIndexes;
    return {
      contents,
      widths,
      displayIndexes,
      displayWidths: displayIndexes.map(slotIndex => widths[slotIndex] ?? 0),
    };
  });
  // ONE step for every row. The floor keeps ANY row's adjacent indicators
  // from overlapping when columns are pulled together; the cap keeps ANY
  // row's last indicator on the canvas when they are pulled apart. At the
  // default slider value this is exactly the shared columnWidth.
  const minStep = Math.max(
    0,
    ...rowLayouts.flatMap(layout => layout.displayWidths.slice(0, -1)),
  );
  const maxStep = Math.min(
    availableWidth,
    ...rowLayouts
      .filter(layout => layout.displayIndexes.length > 1)
      .map(layout => {
        const count = layout.displayIndexes.length;
        return Math.max(
          0,
          (availableWidth - layout.displayWidths[count - 1]) / (count - 1),
        );
      }),
  );
  const step = Math.max(minStep, Math.min(columnWidth + gapPullPx, maxStep));
  const comparisonLeftsForRow = (rowIndex: number): (number | null)[] => {
    const { contents, widths, displayIndexes, displayWidths } =
      rowLayouts[rowIndex];
    const lefts: (number | null)[] = contents.map(() => null);
    displayIndexes.forEach((slotIndex, positionIndex) => {
      const desired = comparisonLeft + positionIndex * step;
      lefts[slotIndex] = clampLeft(desired, displayWidths[positionIndex]);
    });
    if (rowIndex === 0 && hasLegacyComparisonLefts && maxSlotCount <= 2) {
      [0, 1].forEach(slotIndex => {
        if (slotIndex >= lefts.length) return;
        const saved = legacyLefts[slotIndex];
        lefts[slotIndex] = clampLeft(
          saved ?? lefts[slotIndex] ?? comparisonLeft,
          widths[slotIndex] ?? 0,
        );
      });
    }
    return lefts;
  };

  // Match the Big Number family: the complete text stack is centered in the
  // tile. Heights use the post auto-size font sizes so the stack stays
  // centered with the final layout. The configured top values remain minimum
  // padding, while the gap controls preserve the spacing inside the stack.
  // When the content is taller than the tile (large title + number +
  // comparison), compress the internal gaps first so the comparison row is not
  // pushed out of the bottom before the stack just overflows the top.
  const comparisonRowHeight = comparisonFontSizePx * 1.2;
  const requestedComparisonRowGapPx = Math.max(
    0,
    Math.round(comparisonFontSizePx * COMPARISON_ROW_GAP_RATIO),
  );
  const rowCount = visibleRows.length;
  const rowsHeightAt = (gapPx: number): number =>
    hasComparison ? rowCount * comparisonRowHeight + (rowCount - 1) * gapPx : 0;
  let effectiveComparisonRowGapPx = requestedComparisonRowGapPx;
  const requestedContentHeight =
    (hasTitle ? titleRowHeight + bigNumberTopValue : 0) +
    bigNumberRowHeight +
    (hasComparison
      ? comparisonTopValue + rowsHeightAt(requestedComparisonRowGapPx)
      : 0);
  const maxContentHeight = Math.max(0, height - titleTopValue);
  let effectiveBigNumberTopValue = bigNumberTopValue;
  let effectiveComparisonTopValue = comparisonTopValue;
  if (requestedContentHeight > maxContentHeight) {
    let overflow = requestedContentHeight - maxContentHeight;
    // Extra rows are the first thing to give: squeeze the gaps BETWEEN rows
    // down to zero before touching the configured title / comparison gaps.
    if (hasComparison && rowCount > 1) {
      const gapCount = rowCount - 1;
      const totalGap = gapCount * effectiveComparisonRowGapPx;
      const shrink = Math.min(totalGap, overflow);
      effectiveComparisonRowGapPx = Math.max(
        0,
        Math.floor((totalGap - shrink) / gapCount),
      );
      overflow -= Math.max(
        0,
        gapCount * (requestedComparisonRowGapPx - effectiveComparisonRowGapPx),
      );
      overflow = Math.max(0, overflow);
    }
    if (hasComparison) {
      const comparisonShrink = Math.min(effectiveComparisonTopValue, overflow);
      effectiveComparisonTopValue -= comparisonShrink;
      overflow -= comparisonShrink;
    }
    if (hasTitle) {
      const bigNumberShrink = Math.min(effectiveBigNumberTopValue, overflow);
      effectiveBigNumberTopValue -= bigNumberShrink;
    }
  }
  const comparisonRowsHeight = rowsHeightAt(effectiveComparisonRowGapPx);
  const contentHeight =
    (hasTitle ? titleRowHeight + effectiveBigNumberTopValue : 0) +
    bigNumberRowHeight +
    (hasComparison ? effectiveComparisonTopValue + comparisonRowsHeight : 0);
  const contentTop = Math.max(titleTopValue, (height - contentHeight) / 2);
  const effectiveTitleTop = hasTitle ? contentTop : titleTopValue;
  const effectiveBigNumberTop = hasTitle
    ? contentTop + titleRowHeight + effectiveBigNumberTopValue
    : contentTop;
  const effectiveComparisonTop =
    effectiveBigNumberTop + bigNumberRowHeight + effectiveComparisonTopValue;

  if (headerText) {
    graphic.push({
      type: 'text',
      left: titleLeft,
      top: effectiveTitleTop,
      style: {
        text: headerText,
        fontSize: effectiveTitleFontSizePx,
        fill: resolveColor(titleColor, defaultTitleColor, MIN_TEXT_CONTRAST),
      },
    });
  }

  graphic.push({
    type: 'text',
    left: bigNumberLeft,
    top: effectiveBigNumberTop,
    style: {
      text: bigNumberText,
      fontSize: bigNumberFontSizePx,
      fontWeight: 'bold',
      fill: resolveColor(
        bigNumberColor,
        defaultBigNumberColor,
        MIN_LARGE_TEXT_CONTRAST,
      ),
    },
  });

  const pushComparison = (
    content: ComparisonContent,
    left: number,
    top: number,
  ) => {
    if (!content) return;
    graphic.push({
      type: 'text',
      left,
      top,
      style: {
        text: content.text,
        fontSize: comparisonFontSizePx,
        fill: content.fill,
      },
    });
  };
  visibleRows.forEach((contents, rowIndex) => {
    const lefts = comparisonLeftsForRow(rowIndex);
    const rowTop =
      effectiveComparisonTop +
      rowIndex * (comparisonRowHeight + effectiveComparisonRowGapPx);
    contents.forEach((content, slotIndex) => {
      const left = lefts[slotIndex];
      if (content && left !== null) {
        pushComparison(content, left, rowTop);
      }
    });
  });

  const echartOptions: EChartsCoreOption = {
    tooltip: { show: false },
    graphic,
    xAxis: { show: false },
    yAxis: { show: false },
    series: [],
  };

  return {
    width,
    height,
    echartOptions,
    refs: {},
    formData,
  };
}
