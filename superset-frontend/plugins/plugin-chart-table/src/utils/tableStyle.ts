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
import type {
  RgbaColor,
  TableChartFormData,
  TableColorValue,
  TableStyleConfig,
} from '../types';

/**
 * CSS custom properties shared by `Styles.tsx` and the `css` blocks in
 * `TableChart.tsx`. `--table-header-border-width` drives the header underline,
 * the multi-level header separators and the emphasis vertical line
 * (`.right-border-only`) in both thead and tbody. The
 * `header_vertical_line_only` toggle scopes that last part to the header.
 */
export const TABLE_STYLE_VARS = {
  headerTextColor: '--table-header-text-color',
  headerFontWeight: '--table-header-font-weight',
  headerFontSize: '--table-header-font-size',
  borderColor: '--table-border-color',
  borderWidth: '--table-border-width',
  headerBorderWidth: '--table-header-border-width',
  bodyEmphasisLineWidth: '--table-body-emphasis-line-width',
} as const;

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
export function normalizeColor(value: TableColorValue): string | undefined {
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
export function normalizePixels(
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
  formData: Partial<TableChartFormData> | undefined,
): TableStyleConfig {
  if (!formData) {
    return {};
  }
  const config: TableStyleConfig = {};
  const headerTextColor = normalizeColor(formData.header_text_color);
  if (headerTextColor) {
    config.headerTextColor = headerTextColor;
  }
  const borderColor = normalizeColor(formData.border_color);
  if (borderColor) {
    config.borderColor = borderColor;
  }
  if (formData.header_text_bold === true) {
    config.headerFontWeight = 'bold';
  } else if (formData.header_text_bold === false) {
    config.headerFontWeight = 'normal';
  }
  const headerFontSize = normalizePixels(formData.header_font_size, {
    min: 8,
    max: 48,
  });
  if (headerFontSize !== undefined) {
    config.headerFontSize = headerFontSize;
  }
  const borderWidth = normalizePixels(formData.border_width, {
    min: 0,
    max: 8,
  });
  if (borderWidth !== undefined) {
    config.borderWidth = borderWidth;
  }
  const headerBorderWidth = normalizePixels(formData.header_border_width, {
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

/**
 * Build the inline style object for the styled container. Only defined values
 * are emitted; every rule in `Styles.tsx` has a theme-based fallback.
 */
export function getTableStyleVariables(
  config: TableStyleConfig | undefined,
): CSSProperties {
  const variables: Record<string, string> = {};
  if (!config) {
    return variables as CSSProperties;
  }
  const toPx = (value: number | undefined) =>
    value === undefined ? undefined : `${value}px`;
  const entries: [string, string | undefined][] = [
    [TABLE_STYLE_VARS.headerTextColor, config.headerTextColor],
    [TABLE_STYLE_VARS.headerFontWeight, config.headerFontWeight],
    [TABLE_STYLE_VARS.headerFontSize, toPx(config.headerFontSize)],
    [TABLE_STYLE_VARS.borderColor, config.borderColor],
    [TABLE_STYLE_VARS.borderWidth, toPx(config.borderWidth)],
    [TABLE_STYLE_VARS.headerBorderWidth, toPx(config.headerBorderWidth)],
  ];
  entries.forEach(([name, value]) => {
    if (value !== undefined) {
      variables[name] = value;
    }
  });
  if (config.headerVerticalLineOnly) {
    // Only the tbody copy of `.right-border-only` reads this variable. It stops
    // inheriting the header width and falls back to the general line width,
    // while the thead copy keeps the thicker header width.
    variables[TABLE_STYLE_VARS.bodyEmphasisLineWidth] =
      `var(${TABLE_STYLE_VARS.borderWidth}, 2px)`;
  }
  return variables as CSSProperties;
}
