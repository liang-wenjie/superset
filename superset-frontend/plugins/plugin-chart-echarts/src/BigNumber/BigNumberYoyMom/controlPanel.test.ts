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
import config from './controlPanel';

jest.mock('@apache-superset/core/translation', () => ({
  t: (text: string) => text,
}));

type VisibilityFn = (args: {
  controls: Record<string, { value: unknown }>;
}) => boolean;

const findConfig = (name: string): Record<string, any> | undefined => {
  for (const section of config.controlPanelSections) {
    for (const row of (section?.controlSetRows ?? []) as unknown as any[][]) {
      for (const item of row) {
        if (
          item &&
          typeof item === 'object' &&
          !Array.isArray(item) &&
          item.name === name
        ) {
          return item.config as Record<string, any>;
        }
      }
    }
  }
  return undefined;
};

describe('BigNumberYoyMom comparison gap controls', () => {
  const bothShown = {
    show_comparison1: { value: true },
    show_comparison2: { value: true },
  };
  const checkbox = findConfig('comparison_use_center_gap');
  const checkboxVisible = checkbox?.visibility as VisibilityFn;
  const spacing = findConfig('comparison_gap');
  const spacingVisible = spacing?.visibility as VisibilityFn;

  test('exposes one checkbox and ONE shared spacing slider', () => {
    expect(checkbox?.type).toBe('CheckboxControl');
    expect(spacing?.type).toBe('SliderControl');
    expect(checkboxVisible).toBeInstanceOf(Function);
    expect(spacingVisible).toBeInstanceOf(Function);
    // There is no second numeric gap control: both modes reuse this slider.
    expect(findConfig('comparison_yoy_axis_gap')).toBeUndefined();
  });

  test('defaults to MoM-relative spacing', () => {
    expect(checkbox?.default).toBe(false);
    expect(checkboxVisible({ controls: bothShown })).toBe(true);
    expect(spacingVisible({ controls: bothShown })).toBe(true);
  });

  test('checking the box only switches the anchor, not the slider', () => {
    const controls = {
      ...bothShown,
      comparison_use_center_gap: { value: true },
    };
    expect(checkboxVisible({ controls })).toBe(true);
    // The very same slider stays visible and keeps its value/default.
    expect(spacingVisible({ controls })).toBe(true);
    expect(spacing?.renderTrigger).toBe(true);
    expect(spacing?.default).toBe(24);
  });

  test('clearing the box restores MoM-relative spacing', () => {
    const controls = {
      ...bothShown,
      comparison_use_center_gap: { value: false },
    };
    expect(spacingVisible({ controls })).toBe(true);
  });

  test('the spacing slider does not depend on the checkbox being present', () => {
    // Charts saved before the checkbox existed have no flag at all.
    expect(spacingVisible({ controls: bothShown })).toBe(true);
  });

  test('hides both controls when either comparison is hidden', () => {
    const oneHidden = {
      ...bothShown,
      show_comparison2: { value: false },
    };
    expect(checkboxVisible({ controls: oneHidden })).toBe(false);
    expect(spacingVisible({ controls: oneHidden })).toBe(false);
  });
});
