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
  DEFAULT_COMPARISON1_LABEL,
  DEFAULT_COMPARISON1_OFFSET,
  DEFAULT_COMPARISON2_LABEL,
  DEFAULT_COMPARISON_GAP,
  DEFAULT_COMPARISON2_OFFSET,
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

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return Number(value);
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

/**
 * 'comparison1Left' -> 'comparison1_left'. Form data keys follow the
 * snake_case control names Explore saves; callers sometimes pass camelCase.
 */
const camelToSnake = (key: string): string =>
  key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

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

/**
 * Read a comparison value column from a result row. Saved metrics are plain
 * column names; adhoc metrics are named by their label, or by the SQL
 * expression itself when no label is set. The backend may normalize
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
  const candidates = [column.label, sqlExpression].filter(
    (key): key is string => !!key,
  );
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
  mode?: 'time_shift' | 'metric';
  current: number | null;
  comparisonValue: number | string | null | undefined;
  formatter: (value: number) => string;
  valueFormatter: (value: number) => string;
};

// A comparison slot reads its value either from a configured comparison
// metric (dataset metric or custom SQL expression) or from the backend's
// time-offset column `<metric label>__<offset>`. The mode mirrors buildQuery:
// an unset mode falls back to the metric when a comparison column exists.
const isMetricMode = (
  mode: 'time_shift' | 'metric' | undefined,
  column: QueryFormMetric | undefined,
): boolean => mode === 'metric' || (!mode && !!column);

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
  const showComparison1 = pick<boolean>('showComparison1') ?? true;
  const comparison1Label =
    pick<string>('comparison1Label') ?? t(DEFAULT_COMPARISON1_LABEL);
  const comparison1Offset =
    pick<string>('comparison1Offset') ?? DEFAULT_COMPARISON1_OFFSET;
  const comparison1Column = pick<QueryFormMetric>('comparison1Column');
  const comparison1PercentDifferenceFormat = pick<string>(
    'comparison1PercentDifferenceFormat',
  );
  const legacyComparison1Left = pick<number>('comparison1Left');
  const comparison1Mode = pick<'time_shift' | 'metric'>('comparison1Mode');
  const showComparison2 = pick<boolean>('showComparison2') ?? true;
  const comparison2Label =
    pick<string>('comparison2Label') ?? t(DEFAULT_COMPARISON2_LABEL);
  const comparison2Offset =
    pick<string>('comparison2Offset') ?? DEFAULT_COMPARISON2_OFFSET;
  const comparison2Column = pick<QueryFormMetric>('comparison2Column');
  const comparison2PercentDifferenceFormat = pick<string>(
    'comparison2PercentDifferenceFormat',
  );
  const legacyComparison2Left = pick<number>('comparison2Left');
  const comparison2Mode = pick<'time_shift' | 'metric'>('comparison2Mode');
  const comparisonGap = pick<number>('comparisonGap') ?? DEFAULT_COMPARISON_GAP;
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
  // MoM and YoY each carry their own percent difference format, falling back
  // to the legacy global control for charts saved before the split.
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
  const percentFormatter1 = (value: number) =>
    formatPercentValue(comparison1PercentDifferenceFormat, value);
  const percentFormatter2 = (value: number) =>
    formatPercentValue(comparison2PercentDifferenceFormat, value);
  // Comparison value metrics render with the slot's configured number format
  // (the same control used for percent differences), falling back to the
  // default Smart Number format when unset.
  const valueFormatter1 = (value: number) =>
    getNumberFormatter(comparison1PercentDifferenceFormat)(value);
  const valueFormatter2 = (value: number) =>
    getNumberFormatter(comparison2PercentDifferenceFormat)(value);

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
  // flex-centered layout used by the other Big Number visualizations. Font
  // sizes follow the shared controls: ratios (<= 1, Tiny .. Huge) are
  // multiplied by the chart height; legacy numeric values > 1 are absolute
  // pixels. These are the unscaled design sizes.
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
  const baseComparisonFontSizePx =
    comparisonFontSizeValue <= 1
      ? Math.ceil(comparisonFontSizeValue * height)
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
  const uniformLabelFontSizePx = (defaultFontSize: number): number =>
    Math.max(
      10,
      Math.round(
        (effectiveBigNumberFontSizePx * defaultFontSize) /
          DEFAULT_BIG_NUMBER_FONT_SIZE,
      ),
    );
  const uniformTitleFontSizePx = uniformLabelFontSizePx(
    DEFAULT_TITLE_FONT_SIZE,
  );
  const uniformComparisonFontSizePx = uniformLabelFontSizePx(
    DEFAULT_COMPARISON_FONT_SIZE,
  );
  const titleFontSizePx = uniformBigNumberFontSize
    ? uniformTitleFontSizePx
    : scaleFontSize(baseTitleFontSizePx, 10);
  const requestedBigNumberFontSizePx = uniformBigNumberFontSize
    ? effectiveBigNumberFontSizePx
    : scaleFontSize(baseBigNumberFontSizePx);
  const requestedComparisonFontSizePx = uniformBigNumberFontSize
    ? uniformComparisonFontSizePx
    : scaleFontSize(baseComparisonFontSizePx, 10);

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
  const hasComparison =
    (showComparison1 && !!(comparison1Offset || comparison1Column)) ||
    (showComparison2 && !!(comparison2Offset || comparison2Column));

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
  // The comparison row aligns with the big number: it starts at the same
  // configured left offset (instead of a hard-coded 20) so changing
  // big_number_left keeps both rows in sync, and the available-width rule
  // stays symmetric with the big number.
  const comparisonLeft = bigNumberLeft;
  const comparisonGapPx = scaleGap(Math.max(0, Number(comparisonGap) || 0));

  const slotComparisonValue = (
    mode: 'time_shift' | 'metric' | undefined,
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
    mode: 'time_shift' | 'metric' | undefined,
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
  }: ComparisonSlot): { text: string; fill: string } | null => {
    if (!show) return null;
    if (!offset && !column) return null;
    const comparison = toNumber(comparisonValue);
    const missing = comparison === null;
    const labelPrefix = label ? `${label} ` : '';

    // A comparison value metric (dataset column or custom SQL) supplies the
    // value itself, so render it like the big number instead of computing a
    // percentage change. Time shifts keep the percentage-difference display.
    if (isMetricMode(mode, column)) {
      if (missing) {
        return { text: `${labelPrefix}—`, fill: zeroColor };
      }
      // At or below the no-change threshold (or exactly zero) the value is
      // rendered in the no-change color with no trend arrow.
      const withinThreshold = Math.abs(comparison) <= comparisonThreshold;
      const arrow =
        !comparisonShowArrow || withinThreshold
          ? ''
          : comparison > 0
            ? '↑'
            : '↓';
      return {
        text: `${labelPrefix}${arrow}${valueFormatter(comparison)}`,
        fill: withinThreshold
          ? zeroColor
          : comparison > 0
            ? positiveColor
            : negativeColor,
      };
    }

    const percent = computePercent(slotCurrent, comparison);
    if (missing || percent === null) {
      return { text: `${labelPrefix}—`, fill: zeroColor };
    }
    // At or below the no-change threshold (or exactly zero) the percent is
    // rendered in the no-change color with no trend arrow.
    const withinThreshold = Math.abs(percent) <= comparisonThreshold;
    const arrow =
      !comparisonShowArrow || withinThreshold ? '' : percent > 0 ? '↑' : '↓';
    return {
      text: `${labelPrefix}${arrow}${formatter(Math.abs(percent))}`,
      fill: withinThreshold
        ? zeroColor
        : percent > 0
          ? positiveColor
          : negativeColor,
    };
  };

  const comparison1Content = buildComparisonContent({
    show: showComparison1,
    label: comparison1Label,
    offset: comparison1Offset,
    column: comparison1Column,
    mode: comparison1Mode,
    current: slotCurrent(comparison1Mode, comparison1Column),
    comparisonValue: slotComparisonValue(
      comparison1Mode,
      comparison1Column,
      comparison1Offset,
    ),
    formatter: percentFormatter1,
    valueFormatter: valueFormatter1,
  });
  const comparison2Content = buildComparisonContent({
    show: showComparison2,
    label: comparison2Label,
    offset: comparison2Offset,
    column: comparison2Column,
    mode: comparison2Mode,
    current: slotCurrent(comparison2Mode, comparison2Column),
    comparisonValue: slotComparisonValue(
      comparison2Mode,
      comparison2Column,
      comparison2Offset,
    ),
    formatter: percentFormatter2,
    valueFormatter: valueFormatter2,
  });
  // Comparison slots render side by side (MoM / YoY) and, like the big
  // number, are clipped at the canvas edge when the tile is narrow. Both
  // slots start at comparisonLeft and align to the widest text, so the row
  // occupies `left + widest + gap + widest` at most. Shrink the font
  // proportionally when that exceeds the tile width, mirroring the big
  // number auto-size logic, while keeping a floor so the row stays readable.
  const comparison1TextWidth = comparison1Content
    ? estimateTextWidth(comparison1Content.text, requestedComparisonFontSizePx)
    : 0;
  const comparison2TextWidth = comparison2Content
    ? estimateTextWidth(comparison2Content.text, requestedComparisonFontSizePx)
    : 0;
  const widestComparisonTextWidth = Math.max(
    comparison1TextWidth,
    comparison2TextWidth,
  );
  const bothComparisonsShown = !!comparison1Content && !!comparison2Content;
  const estimatedComparisonRowWidth =
    comparisonLeft +
    (bothComparisonsShown
      ? widestComparisonTextWidth * 2 + comparisonGapPx
      : widestComparisonTextWidth);
  const comparisonAvailableWidth = Math.max(
    0,
    width - comparisonLeft - DEFAULT_BIG_NUMBER_LEFT - TEXT_FIT_SAFETY_MARGIN,
  );
  // The floor is an absolute pixel size like the big number's: a proportional
  // floor (e.g. 50%) would block the shrink on narrow tiles and let the row
  // overflow again. ceil() on each slot's estimated width can still leave the
  // row a few pixels over, so re-measure at the shrunk size and refine until
  // the row fits (bounded to a few passes).
  const minComparisonFontSizePx = 10;
  let comparisonFontSizePx = requestedComparisonFontSizePx;
  if (
    !uniformBigNumberFontSize &&
    comparisonAvailableWidth > 0 &&
    estimatedComparisonRowWidth > comparisonAvailableWidth
  ) {
    comparisonFontSizePx = Math.max(
      minComparisonFontSizePx,
      Math.floor(
        (requestedComparisonFontSizePx * comparisonAvailableWidth) /
          estimatedComparisonRowWidth,
      ),
    );
    for (let i = 0; i < 3; i += 1) {
      const shrunkWidestWidth = Math.max(
        comparison1Content
          ? estimateTextWidth(comparison1Content.text, comparisonFontSizePx)
          : 0,
        comparison2Content
          ? estimateTextWidth(comparison2Content.text, comparisonFontSizePx)
          : 0,
      );
      const shrunkRowWidth =
        comparisonLeft +
        (bothComparisonsShown
          ? shrunkWidestWidth * 2 + comparisonGapPx
          : shrunkWidestWidth);
      if (shrunkRowWidth <= comparisonAvailableWidth) break;
      const nextComparisonFontSizePx = Math.max(
        minComparisonFontSizePx,
        Math.floor(
          (comparisonFontSizePx * comparisonAvailableWidth) / shrunkRowWidth,
        ),
      );
      if (nextComparisonFontSizePx === comparisonFontSizePx) break;
      comparisonFontSizePx = nextComparisonFontSizePx;
    }
  }
  const comparisonWidth = Math.max(
    comparison1Content
      ? estimateTextWidth(comparison1Content.text, comparisonFontSizePx)
      : 0,
    comparison2Content
      ? estimateTextWidth(comparison2Content.text, comparisonFontSizePx)
      : 0,
  );
  const comparisonLefts =
    legacyComparison1Left !== undefined || legacyComparison2Left !== undefined
      ? [
          legacyComparison1Left ?? comparisonLeft,
          legacyComparison2Left ??
            comparisonLeft + comparisonWidth + comparisonGapPx,
        ]
      : swapComparisonOrder
        ? [comparisonLeft + comparisonWidth + comparisonGapPx, comparisonLeft]
        : [comparisonLeft, comparisonLeft + comparisonWidth + comparisonGapPx];

  // Match the Big Number family: the complete text stack is centered in the
  // tile. Heights use the post auto-size font sizes so the stack stays
  // centered with the final layout. The configured top values remain minimum
  // padding, while the gap controls preserve the spacing inside the stack.
  // When the content is taller than the tile (large title + number +
  // comparison), compress the internal gaps first so the comparison row is not
  // pushed out of the bottom before the stack just overflows the top.
  const comparisonRowHeight = comparisonFontSizePx * 1.2;
  const requestedContentHeight =
    (hasTitle ? titleRowHeight + bigNumberTopValue : 0) +
    bigNumberRowHeight +
    (hasComparison ? comparisonTopValue + comparisonRowHeight : 0);
  const maxContentHeight = Math.max(0, height - titleTopValue);
  let effectiveBigNumberTopValue = bigNumberTopValue;
  let effectiveComparisonTopValue = comparisonTopValue;
  if (requestedContentHeight > maxContentHeight) {
    let overflow = requestedContentHeight - maxContentHeight;
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
  const contentHeight =
    (hasTitle ? titleRowHeight + effectiveBigNumberTopValue : 0) +
    bigNumberRowHeight +
    (hasComparison ? effectiveComparisonTopValue + comparisonRowHeight : 0);
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
    content: { text: string; fill: string } | null,
    left: number,
  ) => {
    if (!content) return;
    graphic.push({
      type: 'text',
      left,
      top: effectiveComparisonTop,
      style: {
        text: content.text,
        fontSize: comparisonFontSizePx,
        fill: content.fill,
      },
    });
  };
  pushComparison(comparison1Content, comparisonLefts[0]);
  pushComparison(comparison2Content, comparisonLefts[1]);

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
