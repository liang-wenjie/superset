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
import type { CSSProperties } from 'react';

/**
 * Shared, chart-agnostic helpers for the header/border styling controls used
 * by the Table and Pivot Table plugins. Form data is user-controlled and is
 * interpolated into inline CSS custom properties, so every value is sanitized
 * before it reaches the DOM.
 */

/** ColorPickerControl can emit a hex string or an rgba object. */
export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export type TableColorValue = string | RgbaColor | null | undefined;

/** Sanitized style values, ready to be turned into CSS custom properties. */
export interface TableStyleConfig {
  /** Keep the wider emphasis vertical lines in the header, not in tbody. */
  headerVerticalLineOnly?: boolean;
  headerTextColor?: string;
  headerFontWeight?: 'normal' | 'bold';
  headerFontSize?: number;
  borderColor?: string;
  borderWidth?: number;
  headerBorderWidth?: number;
}

/** Raw form_data fields understood by both table plugins. */
export interface TableStyleFormData {
  header_text_bold?: boolean;
  header_font_size?: string | number | null;
  header_text_color?: TableColorValue;
  border_color?: TableColorValue;
  border_width?: string | number;
  header_border_width?: string | number;
  header_vertical_line_only?: boolean;
}

export interface TableStyleVarNames {
  headerTextColor: string;
  headerFontWeight: string;
  headerFontSize: string;
  borderColor: string;
  borderWidth: string;
  headerBorderWidth: string;
  bodyEmphasisLineWidth: string;
}

export const TABLE_STYLE_VARS: TableStyleVarNames = {
  headerTextColor: '--table-header-text-color',
  headerFontWeight: '--table-header-font-weight',
  headerFontSize: '--table-header-font-size',
  borderColor: '--table-border-color',
  borderWidth: '--table-border-width',
  headerBorderWidth: '--table-header-border-width',
  bodyEmphasisLineWidth: '--table-body-emphasis-line-width',
};

/** Pivot Table uses its own prefix so the two charts never collide. */
export const PIVOT_TABLE_STYLE_VARS: TableStyleVarNames = {
  headerTextColor: '--pivot-header-text-color',
  headerFontWeight: '--pivot-header-font-weight',
  headerFontSize: '--pivot-header-font-size',
  borderColor: '--pivot-border-color',
  borderWidth: '--pivot-border-width',
  headerBorderWidth: '--pivot-header-border-width',
  bodyEmphasisLineWidth: '--pivot-body-emphasis-line-width',
};

// Only accept literal CSS colors. A form_data value is user-controlled and is
// interpolated into an inline custom property, so anything that could inject
// extra declarations (semicolons, url(), var(), ...) must be rejected.
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_COLOR_RE =
  /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i;

const isColorChannel = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 255;

const isAlpha = (value: unknown): boolean =>
  value === undefined ||
  (typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1);

/**
 * Convert a ColorPickerControl value into a safe CSS color string.
 * Returns undefined for empty or malformed values so the theme default wins.
 */
export function normalizeTableColor(
  value: TableColorValue,
): string | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value === 'string') {
    const color = value.trim();
    if (HEX_COLOR_RE.test(color)) {
      return color;
    }
    const match = RGB_COLOR_RE.exec(color);
    if (match && match.slice(1, 4).every(channel => Number(channel) <= 255)) {
      return color.replace(/\s+/g, '');
    }
    return undefined;
  }
  if (typeof value === 'object') {
    const { r, g, b, a } = value as RgbaColor;
    if (
      !isColorChannel(r) ||
      !isColorChannel(g) ||
      !isColorChannel(b) ||
      !isAlpha(a)
    ) {
      return undefined;
    }
    const alpha = a ?? 1;
    return alpha === 1
      ? `rgb(${r}, ${g}, ${b})`
      : `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return undefined;
}

/** Parse a pixel value from form_data, rejecting anything outside the range. */
export function normalizeTablePixels(
  value: unknown,
  { min, max }: { min: number; max: number },
): number | undefined {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }
  const numeric =
    typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    return undefined;
  }
  return Math.round(numeric * 10) / 10;
}

/** Resolve raw form_data into sanitized style values. */
export function getTableStyleConfig(
  formData: Partial<TableStyleFormData> | undefined,
): TableStyleConfig {
  if (!formData) {
    return {};
  }
  const config: TableStyleConfig = {};
  const headerTextColor = normalizeTableColor(formData.header_text_color);
  if (headerTextColor) {
    config.headerTextColor = headerTextColor;
  }
  const borderColor = normalizeTableColor(formData.border_color);
  if (borderColor) {
    config.borderColor = borderColor;
  }
  if (formData.header_text_bold === true) {
    config.headerFontWeight = 'bold';
  } else if (formData.header_text_bold === false) {
    config.headerFontWeight = 'normal';
  }
  const headerFontSize = normalizeTablePixels(formData.header_font_size, {
    min: 8,
    max: 48,
  });
  if (headerFontSize !== undefined) {
    config.headerFontSize = headerFontSize;
  }
  const borderWidth = normalizeTablePixels(formData.border_width, {
    min: 0,
    max: 8,
  });
  if (borderWidth !== undefined) {
    config.borderWidth = borderWidth;
  }
  const headerBorderWidth = normalizeTablePixels(formData.header_border_width, {
    min: 0,
    max: 8,
  });
  if (headerBorderWidth !== undefined) {
    config.headerBorderWidth = headerBorderWidth;
  }
  if (formData.header_vertical_line_only === true) {
    config.headerVerticalLineOnly = true;
  }
  return config;
}

export interface TableStyleVariableOptions {
  /** CSS custom property names for the chart being styled. */
  variables?: TableStyleVarNames;
  /**
   * Width used by the data-area emphasis lines when the header-only toggle is
   * on and no general line width was configured. This matches the theme's
   * original emphasis line width for that chart (2px for Table, 1px for
   * Pivot Table, whose grid is uniformly 1px).
   */
  bodyLineFallback?: string;
}

/**
 * Build the inline style object for the styled container. Only defined values
 * are emitted; every rule in the chart's stylesheet has a theme-based fallback.
 */
export function getTableStyleVariables(
  config: TableStyleConfig | undefined,
  {
    variables = TABLE_STYLE_VARS,
    bodyLineFallback = '2px',
  }: TableStyleVariableOptions = {},
): CSSProperties {
  const result: Record<string, string> = {};
  if (!config) {
    return result as CSSProperties;
  }
  const toPx = (value: number | undefined) =>
    value === undefined ? undefined : `${value}px`;
  const entries: [string, string | undefined][] = [
    [variables.headerTextColor, config.headerTextColor],
    [variables.headerFontWeight, config.headerFontWeight],
    [variables.headerFontSize, toPx(config.headerFontSize)],
    [variables.borderColor, config.borderColor],
    [variables.borderWidth, toPx(config.borderWidth)],
    [variables.headerBorderWidth, toPx(config.headerBorderWidth)],
  ];
  entries.forEach(([name, value]) => {
    if (value !== undefined) {
      result[name] = value;
    }
  });
  if (config.headerVerticalLineOnly) {
    // Only the tbody copies of the emphasis vertical lines read this variable.
    // They stop inheriting the header width and fall back to the general line
    // width, while the thead copies keep the thicker header width.
    result[variables.bodyEmphasisLineWidth] =
      `var(${variables.borderWidth}, ${bodyLineFallback})`;
  }
  return result as CSSProperties;
}
