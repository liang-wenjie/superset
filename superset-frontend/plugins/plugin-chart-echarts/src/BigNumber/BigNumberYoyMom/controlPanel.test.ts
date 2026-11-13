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

describe('BigNumberYoyMom metric rows controls', () => {
  test('replaces the per-slot MoM/YoY controls with ONE row editor', () => {
    const rowsControl = findConfig('metric_rows');
    expect(rowsControl?.type).toBe('MetricRowsControl');
    expect(rowsControl?.renderTrigger).toBe(true);
    [
      'show_comparison1',
      'show_comparison2',
      'comparison1_label',
      'comparison2_label',
      'comparison1_mode',
      'comparison2_mode',
      'comparison1_column',
      'comparison2_column',
      'comparison1_offset',
      'comparison2_offset',
      'comparison1_percent_difference_format',
      'comparison2_percent_difference_format',
    ].forEach(name => expect(findConfig(name)).toBeUndefined());
  });

  test('rebuilds its props and offers the legacy pair as row 1', () => {
    const rowsControl = findConfig('metric_rows');
    const shouldMapStateToProps = rowsControl?.shouldMapStateToProps as
      | (() => boolean)
      | undefined;
    expect(shouldMapStateToProps?.()).toBe(true);
    const mapState = rowsControl?.mapStateToProps as (
      state: unknown,
    ) => Record<string, unknown>;
    const props = mapState({
      datasource: {
        metrics: [
          { metric_name: 'count', verbose_name: 'Count' },
          { metric_name: 'count' },
          null,
        ],
      },
      form_data: { viz_type: 'big_number_yoy_mom' },
    });
    expect(props.metrics).toEqual([{ label: 'Count', value: 'count' }]);
    expect(props.offsetChoices as string[]).toContain('1 month ago');
    const defaultRows = props.defaultRows as { slots: unknown[] }[];
    expect(defaultRows).toHaveLength(1);
    expect(defaultRows[0].slots).toHaveLength(2);
  });

  test('style controls stay shared by every row', () => {
    const checkbox = findConfig('comparison_use_center_gap');
    const spacing = findConfig('comparison_gap');
    const swap = findConfig('swap_comparison_order');
    expect(checkbox?.type).toBe('CheckboxControl');
    expect(spacing?.type).toBe('SliderControl');
    expect(checkbox?.default).toBe(false);
    expect(spacing?.default).toBe(24);
    expect(spacing?.renderTrigger).toBe(true);
    // No visibility tied to the removed show_comparison* controls.
    expect(checkbox?.visibility).toBeUndefined();
    expect(spacing?.visibility).toBeUndefined();
    expect(swap?.visibility).toBeUndefined();
    expect(findConfig('comparison_yoy_axis_gap')).toBeUndefined();
  });
});
