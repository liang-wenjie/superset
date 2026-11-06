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
import {
  TABLE_STYLE_VARS,
  getTableStyleConfig,
  getTableStyleVariables,
  normalizeColor,
  normalizePixels,
} from '../../src/utils/tableStyle';

describe('normalizeColor', () => {
  test('accepts hex colors from the hex-output color picker', () => {
    expect(normalizeColor('#1a2b3c')).toBe('#1a2b3c');
    expect(normalizeColor(' #fff ')).toBe('#fff');
    expect(normalizeColor('#1a2b3c80')).toBe('#1a2b3c80');
  });

  test('accepts literal rgb() strings', () => {
    expect(normalizeColor('rgb(10, 20, 30)')).toBe('rgb(10,20,30)');
    expect(normalizeColor('rgba(10, 20, 30, 0.5)')).toBe('rgba(10,20,30,0.5)');
  });

  test('converts the legacy rgb-object color picker output', () => {
    expect(normalizeColor({ r: 10, g: 20, b: 30 })).toBe('rgb(10, 20, 30)');
    expect(normalizeColor({ r: 10, g: 20, b: 30, a: 0.5 })).toBe(
      'rgba(10, 20, 30, 0.5)',
    );
  });

  test('rejects empty, malformed and injection-prone values', () => {
    expect(normalizeColor(undefined)).toBeUndefined();
    expect(normalizeColor('')).toBeUndefined();
    expect(normalizeColor('red; background: url(evil)')).toBeUndefined();
    expect(normalizeColor('var(--evil)')).toBeUndefined();
    expect(normalizeColor('rgb(300, 0, 0)')).toBeUndefined();
    expect(normalizeColor({ r: 300, g: 0, b: 0 })).toBeUndefined();
    expect(normalizeColor({ r: 0, g: 0, b: 0, a: 2 })).toBeUndefined();
  });
});

describe('normalizePixels', () => {
  test('parses string and number values inside the allowed range', () => {
    expect(normalizePixels('2', { min: 0, max: 8 })).toBe(2);
    expect(normalizePixels(3, { min: 0, max: 8 })).toBe(3);
    expect(normalizePixels('0', { min: 0, max: 8 })).toBe(0);
  });

  test('ignores empty, out-of-range and non-numeric values', () => {
    expect(normalizePixels('', { min: 0, max: 8 })).toBeUndefined();
    expect(normalizePixels(null, { min: 0, max: 8 })).toBeUndefined();
    expect(normalizePixels('-1', { min: 0, max: 8 })).toBeUndefined();
    expect(normalizePixels('99', { min: 0, max: 8 })).toBeUndefined();
    expect(normalizePixels('12px', { min: 0, max: 8 })).toBeUndefined();
  });
});

describe('getTableStyleConfig', () => {
  test('keeps the theme defaults when no styling controls are saved', () => {
    expect(getTableStyleConfig({})).toEqual({});
    expect(getTableStyleConfig(undefined)).toEqual({});
  });

  test('resolves all header and border controls', () => {
    expect(
      getTableStyleConfig({
        header_text_bold: true,
        header_text_color: '#123456',
        header_font_size: '18',
        border_color: '#abcdef',
        border_width: '3',
        header_border_width: '4',
      }),
    ).toEqual({
      headerFontWeight: 'bold',
      headerTextColor: '#123456',
      headerFontSize: 18,
      borderColor: '#abcdef',
      borderWidth: 3,
      headerBorderWidth: 4,
    });
  });

  test('supports un-bolding the header and legacy rgba objects', () => {
    expect(
      getTableStyleConfig({
        header_text_bold: false,
        header_text_color: { r: 1, g: 2, b: 3, a: 1 },
      }),
    ).toEqual({
      headerFontWeight: 'normal',
      headerTextColor: 'rgb(1, 2, 3)',
    });
  });

  test('reads the header-only vertical line toggle', () => {
    expect(getTableStyleConfig({ header_vertical_line_only: true })).toEqual({
      headerVerticalLineOnly: true,
    });
    expect(getTableStyleConfig({ header_vertical_line_only: false })).toEqual(
      {},
    );
  });

  test('keeps the header underline width when no toggle is saved', () => {
    // There is no show/hide control for the underline: it is always rendered.
    expect(
      getTableStyleConfig({ header_border_width: '4', border_width: '3' }),
    ).toEqual({ headerBorderWidth: 4, borderWidth: 3 });
  });

  test('drops unsafe values instead of passing them to CSS', () => {
    expect(
      getTableStyleConfig({
        border_color: '#fff; color: red',
        border_width: '99',
        header_font_size: '8px',
      }),
    ).toEqual({});
  });
});

describe('getTableStyleVariables', () => {
  test('emits only defined values, with px units on sizes', () => {
    const variables = getTableStyleVariables({
      headerTextColor: '#123456',
      headerFontWeight: 'normal',
      headerFontSize: 16,
      borderColor: '#abcdef',
      borderWidth: 0,
      headerBorderWidth: 3,
    }) as Record<string, string>;

    expect(variables).toEqual({
      [TABLE_STYLE_VARS.headerTextColor]: '#123456',
      [TABLE_STYLE_VARS.headerFontWeight]: 'normal',
      [TABLE_STYLE_VARS.headerFontSize]: '16px',
      [TABLE_STYLE_VARS.borderColor]: '#abcdef',
      [TABLE_STYLE_VARS.borderWidth]: '0px',
      [TABLE_STYLE_VARS.headerBorderWidth]: '3px',
    });
  });

  test('emits nothing when the chart uses theme defaults', () => {
    expect(getTableStyleVariables({})).toEqual({});
    expect(getTableStyleVariables(undefined)).toEqual({});
  });

  test('header-only vertical lines emit a body-specific emphasis variable', () => {
    const variables = getTableStyleVariables({
      headerVerticalLineOnly: true,
      headerBorderWidth: 4,
      borderWidth: 1,
    }) as Record<string, string>;

    expect(variables).toEqual({
      [TABLE_STYLE_VARS.headerBorderWidth]: '4px',
      [TABLE_STYLE_VARS.borderWidth]: '1px',
      [TABLE_STYLE_VARS.bodyEmphasisLineWidth]:
        'var(--table-border-width, 2px)',
    });
  });

  test('the default mode lets the body follow the header width', () => {
    const variables = getTableStyleVariables({
      headerBorderWidth: 4,
      borderWidth: 1,
    }) as Record<string, string>;
    expect(variables).not.toHaveProperty(
      TABLE_STYLE_VARS.bodyEmphasisLineWidth,
    );
    expect(variables[TABLE_STYLE_VARS.headerBorderWidth]).toBe('4px');
  });
});
