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
import type { ControlPanelConfig } from '@superset-ui/chart-controls/types';
import { OrientationType } from '../../src/Timeseries/types';
import { dataTableSection } from '../../src/controls';
import areaPanel from '../../src/Timeseries/Area/controlPanel';
import barPanel from '../../src/Timeseries/Regular/Bar/controlPanel';
import linePanel from '../../src/Timeseries/Regular/Line/controlPanel';
import scatterPanel from '../../src/Timeseries/Regular/Scatter/controlPanel';
import smoothLinePanel from '../../src/Timeseries/Regular/SmoothLine/controlPanel';
import stepPanel from '../../src/Timeseries/Step/controlPanel';

type NamedControl = { name: string; config: Record<string, unknown> };

const findControl = (
  panel: ControlPanelConfig,
  name: string,
): NamedControl | undefined => {
  for (const section of panel.controlPanelSections ?? []) {
    for (const row of section?.controlSetRows ?? []) {
      for (const control of row) {
        if (
          control &&
          typeof control === 'object' &&
          'name' in control &&
          (control as NamedControl).name === name
        ) {
          return control as NamedControl;
        }
      }
    }
  }
  return undefined;
};

// The Generic Chart plugin reuses the Line control panel, so these six
// panels cover all seven Timeseries-family viz types.
const panels: [string, ControlPanelConfig][] = [
  ['Area', areaPanel],
  ['Bar', barPanel],
  ['Line / Generic', linePanel],
  ['Scatter', scatterPanel],
  ['SmoothLine', smoothLinePanel],
  ['Step', stepPanel],
];

test.each(panels)('%s exposes the showDataTable control', (_label, panel) => {
  const control = findControl(panel, 'showDataTable');
  expect(control).toBeDefined();
  expect(control?.config.default).toBe(false);
  expect(control?.config.renderTrigger).toBe(true);
});

test('the control is hidden for horizontal charts', () => {
  const control = dataTableSection[0][0] as NamedControl;
  const visibility = control.config.visibility as (props: {
    controls: { orientation?: { value: OrientationType } };
  }) => boolean;
  expect(
    visibility({
      controls: { orientation: { value: OrientationType.Horizontal } },
    }),
  ).toBe(false);
  expect(visibility({ controls: {} })).toBe(true);
});

test.each(panels)(
  '%s exposes the minimum label column width control',
  (_label, panel) => {
    const control = findControl(panel, 'dataTableMinLegendWidth');
    expect(control).toBeDefined();
    expect(control?.config.default).toBe(0);
    expect(control?.config.renderTrigger).toBe(true);
  },
);

test('the minimum width control only appears with the data table enabled', () => {
  const control = dataTableSection[1][0] as NamedControl;
  const visibility = control.config.visibility as (props: {
    controls: {
      showDataTable?: { value: boolean };
      orientation?: { value: OrientationType };
    };
  }) => boolean;
  expect(visibility({ controls: {} })).toBe(false);
  expect(visibility({ controls: { showDataTable: { value: false } } })).toBe(
    false,
  );
  expect(visibility({ controls: { showDataTable: { value: true } } })).toBe(
    true,
  );
  expect(
    visibility({
      controls: {
        showDataTable: { value: true },
        orientation: { value: OrientationType.Horizontal },
      },
    }),
  ).toBe(false);
});
