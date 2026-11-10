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
import {
  MIN_LARGE_TEXT_CONTRAST,
  MIN_TEXT_CONTRAST,
  contrastRatio,
  getTileBackgroundColor,
  isDarkTheme,
  parseCssColor,
  resolveTextColor,
  toCssColor,
} from './themeColors';

const DARK_TILE = { r: 20, g: 20, b: 20 }; // #141414
const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };
const LEGACY_BIG_NUMBER = { r: 51, g: 51, b: 51 }; // #333
const LEGACY_TITLE = { r: 102, g: 102, b: 102 }; // #666
const THEME_TEXT = 'rgba(255, 255, 255, 0.88)';

const asTheme = (tokens: Record<string, unknown>): SupersetTheme =>
  tokens as unknown as SupersetTheme;

const DARK_THEME = asTheme({
  colorBgContainer: '#141414',
  colorText: THEME_TEXT,
});
const LIGHT_THEME = asTheme({
  colorBgContainer: '#ffffff',
  colorText: '#000000',
});

test('parseCssColor handles hex and rgb theme tokens', () => {
  expect(parseCssColor('#fff')).toEqual(WHITE);
  expect(parseCssColor('#141414')).toEqual(DARK_TILE);
  expect(parseCssColor('#141414cc')).toEqual(DARK_TILE);
  expect(parseCssColor('rgb(20, 20, 20)')).toEqual(DARK_TILE);
  expect(parseCssColor('rgba(255, 255, 255, 0.88)')).toEqual(WHITE);
  expect(parseCssColor(undefined)).toBeNull();
  expect(parseCssColor('transparent')).toBeNull();
});

test('contrastRatio follows WCAG values', () => {
  expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21);
  // The shipped dark-grey defaults are invisible on a dark tile.
  expect(contrastRatio(LEGACY_BIG_NUMBER, DARK_TILE)).toBeLessThan(
    MIN_LARGE_TEXT_CONTRAST,
  );
  expect(contrastRatio(LEGACY_TITLE, DARK_TILE)).toBeLessThan(
    MIN_TEXT_CONTRAST,
  );
  // Trend colors stay readable and keep their hue.
  expect(contrastRatio({ r: 0, g: 180, b: 42 }, DARK_TILE)).toBeGreaterThan(
    MIN_TEXT_CONTRAST,
  );
  expect(contrastRatio({ r: 245, g: 63, b: 63 }, DARK_TILE)).toBeGreaterThan(
    MIN_TEXT_CONTRAST,
  );
});

test('getTileBackgroundColor prefers the dashboard tile token', () => {
  expect(
    getTileBackgroundColor(
      asTheme({ colorBgContainer: '#141414', dashboardTileBg: '#000000' }),
    ),
  ).toEqual(BLACK);
  expect(getTileBackgroundColor(DARK_THEME)).toEqual(DARK_TILE);
  expect(getTileBackgroundColor(undefined)).toBeNull();
});

test('isDarkTheme reads the text token even for transparent tiles', () => {
  expect(isDarkTheme(DARK_THEME)).toBe(true);
  expect(isDarkTheme(LIGHT_THEME)).toBe(false);
  expect(
    isDarkTheme(
      asTheme({
        colorText: THEME_TEXT,
        dashboardTileBg: 'rgba(255, 255, 255, 0.04)',
      }),
    ),
  ).toBe(true);
  expect(isDarkTheme(undefined)).toBe(false);
});

test('resolveTextColor falls back to the theme token on dark tiles', () => {
  expect(
    resolveTextColor(
      LEGACY_BIG_NUMBER,
      THEME_TEXT,
      DARK_THEME,
      MIN_LARGE_TEXT_CONTRAST,
    ),
  ).toBe(THEME_TEXT);
  expect(
    resolveTextColor(LEGACY_TITLE, THEME_TEXT, DARK_THEME, MIN_TEXT_CONTRAST),
  ).toBe(THEME_TEXT);
  // A semi-transparent light tile token still sits on a dark background.
  expect(
    resolveTextColor(
      LEGACY_BIG_NUMBER,
      THEME_TEXT,
      asTheme({
        colorText: THEME_TEXT,
        dashboardTileBg: 'rgba(255, 255, 255, 0.04)',
      }),
      MIN_LARGE_TEXT_CONTRAST,
    ),
  ).toBe(THEME_TEXT);
});

test('resolveTextColor keeps colors that are readable or on light tiles', () => {
  // Custom bright color on a dark tile.
  expect(
    resolveTextColor(
      { r: 255, g: 220, b: 0 },
      THEME_TEXT,
      DARK_THEME,
      MIN_LARGE_TEXT_CONTRAST,
    ),
  ).toBe(toCssColor({ r: 255, g: 220, b: 0 }));
  // Legacy default on a light tile: unchanged light-mode rendering.
  expect(
    resolveTextColor(
      LEGACY_BIG_NUMBER,
      THEME_TEXT,
      LIGHT_THEME,
      MIN_LARGE_TEXT_CONTRAST,
    ),
  ).toBe(toCssColor(LEGACY_BIG_NUMBER));
  // No saved color: the theme token always wins.
  expect(
    resolveTextColor(undefined, THEME_TEXT, DARK_THEME, MIN_TEXT_CONTRAST),
  ).toBe(THEME_TEXT);
  // No theme at all (e.g. tests / SSR): leave the configured color alone.
  expect(
    resolveTextColor(
      LEGACY_BIG_NUMBER,
      THEME_TEXT,
      undefined,
      MIN_LARGE_TEXT_CONTRAST,
    ),
  ).toBe(toCssColor(LEGACY_BIG_NUMBER));
});
