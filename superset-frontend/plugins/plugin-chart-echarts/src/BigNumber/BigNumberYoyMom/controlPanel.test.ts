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
import { applyMapStateToPropsToControl } from 'src/explore/controlUtils/getControlState';
import config from './controlPanel';
import { resolveMetricRows } from './metricRows';

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

  test('materializes legacy comparison settings into a real control value', () => {
    const rowsControl = findConfig('metric_rows');
    const resolveDefault = rowsControl?.default as (
      controlState: unknown,
      controlPanelState?: { form_data?: Record<string, unknown> } | null,
    ) => { slots: Record<string, unknown>[] }[] | undefined;
    expect(typeof resolveDefault).toBe('function');
    const column = {
      expressionType: 'SQL',
      sqlExpression: 'SUM(a)/SUM(b)',
      label: 'SUM(a)/SUM(b)',
    };
    const rows = resolveDefault(
      {},
      {
        form_data: {
          viz_type: 'big_number_yoy_mom',
          show_comparison1: true,
          comparison1_label: '同比',
          comparison1_mode: 'metric',
          comparison1_column: column,
          comparison2_label: '环比',
          comparison2_mode: 'metric',
          comparison2_column: {
            ...column,
            sqlExpression: 'SUM(a)/SUM(c)',
          },
        },
      },
    );
    expect(rows).toHaveLength(1);
    expect(rows?.[0].slots).toHaveLength(2);
    expect(rows?.[0].slots[0]).toMatchObject({
      label: '同比',
      mode: 'metric',
      column,
    });
    expect(rows?.[0].slots[1]).toMatchObject({
      label: '环比',
      mode: 'metric',
    });
    // `getFormDataFromControls()` only keeps control values. The resolved
    // default must survive that round trip, otherwise the renderer falls back
    // to empty "MoM —" / "YoY —" placeholders.
    const derivedFormData = { metric_rows: rows };
    expect(resolveMetricRows(derivedFormData)[0].slots[0]).toMatchObject({
      label: '同比',
      mode: 'metric',
      column,
    });
    // Dashboard hydration passes null: do not fabricate rows there, saved
    // legacy keys must stay untouched.
    expect(resolveDefault({}, null)).toBeUndefined();
  });

  test('Explore hydration keeps legacy rows in controls-derived form data', () => {
    const rowsControl = findConfig('metric_rows');
    const controlState = { ...rowsControl, value: undefined } as any;
    const exploreState = {
      controls: { metric_rows: controlState },
      datasource: { metrics: [] },
      form_data: {
        datasource: '2__table',
        viz_type: 'big_number_yoy_mom',
        comparison1_label: '同比',
        comparison1_mode: 'metric',
        comparison1_column: {
          expressionType: 'SQL',
          sqlExpression: 'SUM(a)/SUM(b)',
          label: 'SUM(a)/SUM(b)',
        },
        comparison2_label: '环比',
      },
    } as any;
    // `hydrateExplore` and `getControlsState` both run this helper. The
    // chart's stale render uses `getFormDataFromControls()` output, so the
    // hydrated value must already be the resolved rows.
    const hydrated = applyMapStateToPropsToControl(controlState, exploreState);
    const rows = resolveMetricRows({ metric_rows: hydrated.value });
    expect(rows).toHaveLength(1);
    expect(rows[0].slots[0]).toMatchObject({ label: '同比', mode: 'metric' });
    expect(rows[0].slots[1]).toMatchObject({ label: '环比' });
  });

  test('viz-type switch keeps the resolved rows in the saved form data', () => {
    const overrides = config.formDataOverrides as (
      formData: Record<string, unknown>,
    ) => Record<string, unknown>;
    const emptyRows = overrides({
      viz_type: 'big_number_yoy_mom',
      metric_rows: [],
    });
    expect(emptyRows.metric_rows).toEqual([]);
    const legacyRows = overrides({
      viz_type: 'big_number_yoy_mom',
      comparison1_label: '同比',
    });
    const rows = legacyRows.metric_rows as {
      slots: { label: string }[];
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].slots[0].label).toBe('同比');
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
    // The deprecated center anchor is kept registered for charts that saved
    // the flag, but is hidden from the editor and no longer read by the
    // renderer (all rows now use equal-width columns).
    expect(typeof checkbox?.visibility).toBe('function');
    expect(checkbox?.visibility()).toBe(false);
    // No visibility tied to the removed show_comparison* controls.
    expect(spacing?.visibility).toBeUndefined();
    expect(swap?.visibility).toBeUndefined();
    expect(findConfig('comparison_yoy_axis_gap')).toBeUndefined();
  });
});
