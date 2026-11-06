/*
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
  getTableStyleConfig,
  getTableStyleVariables,
  PIVOT_TABLE_STYLE_VARS,
  TABLE_STYLE_VARS,
} from '@superset-ui/chart-controls';
import config from '../../src/plugin/controlPanel';

interface ControlConfigLike {
  type?: string;
  default?: unknown;
  renderTrigger?: boolean;
  outputFormat?: string;
}

interface SectionLike {
  label?: string;
  controlSetRows: unknown[][];
}

interface NamedControlLike {
  name: string;
  config: ControlConfigLike;
}

const isNamedControl = (value: unknown): value is NamedControlLike =>
  typeof value === 'object' &&
  value !== null &&
  'name' in value &&
  'config' in value;

const sections = config.controlPanelSections as unknown as SectionLike[];

const findNamedControl = (name: string): ControlConfigLike | null => {
  for (const section of sections) {
    if (!section?.controlSetRows) continue;
    for (const row of section.controlSetRows) {
      for (const control of row ?? []) {
        if (isNamedControl(control) && control.name === name) {
          return control.config;
        }
      }
    }
  }
  return null;
};

const pivotVariables = (formData: Parameters<typeof getTableStyleConfig>[0]) =>
  getTableStyleVariables(getTableStyleConfig(formData), {
    variables: PIVOT_TABLE_STYLE_VARS,
    bodyLineFallback: '1px',
  });

test('pivot table exposes the shared header & border styling controls', () => {
  expect(
    sections.some(section => section?.label === 'Header & border styling'),
  ).toBe(true);

  const expected: Record<string, { type: string; default?: unknown }> = {
    header_text_bold: { type: 'CheckboxControl', default: false },
    header_font_size: { type: 'SelectControl', default: '' },
    header_text_color: { type: 'ColorPickerControl' },
    border_color: { type: 'ColorPickerControl' },
    header_vertical_line_only: { type: 'CheckboxControl', default: false },
    header_border_width: { type: 'SelectControl', default: '' },
    border_width: { type: 'SelectControl', default: '' },
  };

  Object.entries(expected).forEach(([name, { type, default: value }]) => {
    const control = findNamedControl(name);
    expect(control).not.toBeNull();
    expect(control?.type).toBe(type);
    expect(control?.renderTrigger).toBe(true);
    if (value !== undefined) {
      expect(control?.default).toBe(value);
    }
  });

  // Colors go straight into an inline CSS custom property, so the picker must
  // emit a hex literal rather than an rgba object or an arbitrary string.
  expect(findNamedControl('header_text_color')?.outputFormat).toBe('hex');
  expect(findNamedControl('border_color')?.outputFormat).toBe('hex');
});

test('defaults keep the original 1px theme grid', () => {
  // With no styling choices the controls hand back an empty config and no
  // custom property is emitted, so every var() in Styles.ts uses its fallback.
  expect(pivotVariables({})).toEqual({});

  // The bold checkbox defaults to false, which only writes `normal` -- exactly
  // the theme's default font weight for a pivot header.
  expect(pivotVariables({ header_text_bold: false })).toEqual({
    [PIVOT_TABLE_STYLE_VARS.headerFontWeight]: 'normal',
  });
});

test('uses pivot-prefixed variables and a 1px body line fallback', () => {
  expect(PIVOT_TABLE_STYLE_VARS.borderWidth).not.toBe(
    TABLE_STYLE_VARS.borderWidth,
  );

  expect(
    pivotVariables({
      header_text_bold: true,
      header_font_size: '16',
      header_text_color: '#123456',
      border_color: 'rgb(1, 2, 3)',
      border_width: '2',
      header_border_width: '4',
      header_vertical_line_only: true,
    }),
  ).toEqual({
    [PIVOT_TABLE_STYLE_VARS.headerFontWeight]: 'bold',
    [PIVOT_TABLE_STYLE_VARS.headerFontSize]: '16px',
    [PIVOT_TABLE_STYLE_VARS.headerTextColor]: '#123456',
    [PIVOT_TABLE_STYLE_VARS.borderColor]: 'rgb(1,2,3)',
    [PIVOT_TABLE_STYLE_VARS.borderWidth]: '2px',
    [PIVOT_TABLE_STYLE_VARS.headerBorderWidth]: '4px',
    [PIVOT_TABLE_STYLE_VARS.bodyEmphasisLineWidth]:
      'var(--pivot-border-width, 1px)',
  });
});

test('header-only toggle is off by default so lines extend into the data grid', () => {
  expect(
    pivotVariables({
      border_width: '2',
      header_border_width: '4',
    }),
  ).toEqual({
    [PIVOT_TABLE_STYLE_VARS.borderWidth]: '2px',
    [PIVOT_TABLE_STYLE_VARS.headerBorderWidth]: '4px',
  });
});

test('rejects values that could inject extra CSS declarations', () => {
  expect(
    getTableStyleConfig({
      border_color: 'red; background: url(evil)',
      header_text_color: 'var(--evil)',
      border_width: '1; color: red',
      header_border_width: '99',
      header_font_size: '2',
    }),
  ).toEqual({});
});
