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
import type { SupersetTheme } from '@apache-superset/core/theme';
import type { RGBColor } from './types';

// WCAG 2.1 AA minimum contrast ratios: large/bold text needs 3:1, small text
// needs 4.5:1. The big number is bold and large; title and comparison rows
// are small, so they get the stricter ratio.
export const MIN_LARGE_TEXT_CONTRAST = 3;
export const MIN_TEXT_CONTRAST = 4.5;

// A tile counts as dark when its background is below the midpoint of the sRGB
// luminance range. The shipped color defaults are dark greys tuned for light
// dashboards, so only dark tiles need the readability fallback; light mode
// keeps rendering exactly as it did before.
const DARK_BACKGROUND_LUMINANCE = 0.5;
const BLACK: RGBColor = { r: 0, g: 0, b: 0 };

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_COLOR =
  /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i;

export const toCssColor = (color?: RGBColor, fallback = ''): string =>
  color ? `rgb(${color.r}, ${color.g}, ${color.b})` : fallback;

/** Parse the hex / rgb / rgba strings used by antd theme tokens. */
export const parseCssColor = (color?: string): RGBColor | null => {
  if (!color) return null;
  const value = color.trim();
  if (HEX_COLOR.test(value)) {
    let hex = value.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map(digit => `${digit}${digit}`)
        .join('');
    }
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  const match = RGB_COLOR.exec(value);
  return match
    ? { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) }
    : null;
};

const channelLuminance = (channel: number): number => {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

export const relativeLuminance = ({ r, g, b }: RGBColor): number =>
  0.2126 * channelLuminance(r) +
  0.7152 * channelLuminance(g) +
  0.0722 * channelLuminance(b);

/** WCAG contrast ratio: 1 means identical colors, 21 means black on white. */
export const contrastRatio = (first: RGBColor, second: RGBColor): number => {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

// Dashboard tiles use dashboardTileBg when configured, otherwise
// colorBgContainer (see DashboardBuilder's tile styles).
export const getTileBackgroundColor = (
  theme?: SupersetTheme,
): RGBColor | null =>
  parseCssColor(theme?.dashboardTileBg || theme?.colorBgContainer);

// The theme's primary text color is light in dark mode and dark in light mode,
// regardless of how a (possibly semi-transparent) tile background is spelled.
export const isDarkTheme = (theme?: SupersetTheme): boolean => {
  const text = parseCssColor(theme?.colorText);
  if (text) return relativeLuminance(text) >= DARK_BACKGROUND_LUMINANCE;
  const background = getTileBackgroundColor(theme);
  return (
    !!background && relativeLuminance(background) < DARK_BACKGROUND_LUMINANCE
  );
};

/**
 * Colors saved in form_data (including the light-mode defaults from the
 * control panel) are honored unless they would be unreadable on a dark tile.
 * ECharts graphic text is drawn on a canvas, so dark theme CSS cannot restyle
 * it; in that case the theme's own text token takes over. Custom colors that
 * clear the contrast threshold are kept on both light and dark dashboards.
 */
export const resolveTextColor = (
  configured: RGBColor | undefined,
  themeFallback: string,
  theme: SupersetTheme | undefined,
  minContrast: number,
): string => {
  if (!configured) return themeFallback;
  if (!isDarkTheme(theme)) return toCssColor(configured, themeFallback);
  const background = getTileBackgroundColor(theme);
  // A semi-transparent light token still sits on a dark tile; measure against
  // the dark base rather than the token's own (misleading) light channels.
  const effectiveBackground =
    background && relativeLuminance(background) < DARK_BACKGROUND_LUMINANCE
      ? background
      : BLACK;
  return contrastRatio(configured, effectiveBackground) >= minContrast
    ? toCssColor(configured, themeFallback)
    : themeFallback;
};
