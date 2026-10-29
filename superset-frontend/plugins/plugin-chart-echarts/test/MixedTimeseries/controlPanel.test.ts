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
import { ControlPanelsContainerProps } from '@superset-ui/chart-controls/types';
import controlPanel from '../../src/MixedTimeseries/controlPanel';

// Narrow shape of the controls under test: enough to exercise `visibility`
// without reaching for `any`.
type VisibilityControl = {
  name: string;
  config: { visibility: (props: ControlPanelsContainerProps) => boolean };
};

const config = controlPanel;

const getControl = (controlName: string) => {
  for (const section of config.controlPanelSections) {
    if (section && section.controlSetRows) {
      for (const row of section.controlSetRows) {
        for (const control of row) {
          if (
            typeof control === 'object' &&
            control !== null &&
            'name' in control &&
            control.name === controlName
          ) {
            return control;
          }
        }
      }
    }
  }
  return null;
};

// Mock getStandardizedControls
jest.mock('@superset-ui/chart-controls', () => {
  const actual = jest.requireActual('@superset-ui/chart-controls');
  return {
    ...actual,
    getStandardizedControls: jest.fn(() => ({
      popAllMetrics: jest.fn(() => []),
      popAllColumns: jest.fn(() => []),
    })),
  };
});

test('should have correct visibility for label_position', () => {
  const labelPositionCtrl = getControl(
    'label_position',
  ) as unknown as VisibilityControl;
  expect(labelPositionCtrl).toBeDefined();
  expect(labelPositionCtrl.config.visibility).toBeDefined();

  expect(
    labelPositionCtrl.config.visibility({
      controls: {
        show_value: { value: true },
      },
    } as unknown as ControlPanelsContainerProps),
  ).toBe(true);

  expect(
    labelPositionCtrl.config.visibility({
      controls: {
        show_value: { value: false },
      },
    } as unknown as ControlPanelsContainerProps),
  ).toBe(false);
});

test('should have correct visibility for label_positionB', () => {
  const labelPositionBCtrl = getControl(
    'label_positionB',
  ) as unknown as VisibilityControl;
  expect(labelPositionBCtrl).toBeDefined();
  expect(labelPositionBCtrl.config.visibility).toBeDefined();

  expect(
    labelPositionBCtrl.config.visibility({
      controls: {
        show_valueB: { value: true },
      },
    } as unknown as ControlPanelsContainerProps),
  ).toBe(true);

  expect(
    labelPositionBCtrl.config.visibility({
      controls: {
        show_valueB: { value: false },
      },
    } as unknown as ControlPanelsContainerProps),
  ).toBe(false);
});

test('should expose show empty columns for both query A and query B', () => {
  const showEmptyColumnsA = getControl('show_empty_columns') as {
    config: { type: string; default: boolean; label: string };
  } | null;
  expect(showEmptyColumnsA).toBeDefined();
  expect(showEmptyColumnsA?.config.type).toBe('CheckboxControl');
  expect(showEmptyColumnsA?.config.default).toBe(true);

  const showEmptyColumnsB = getControl('show_empty_columns_b') as {
    config: { type: string; default: boolean; label: string };
  } | null;
  expect(showEmptyColumnsB).toBeDefined();
  expect(showEmptyColumnsB?.config.type).toBe('CheckboxControl');
  expect(showEmptyColumnsB?.config.default).toBe(true);
});

test('should expose the share settings control with Query A enabled by default', () => {
  const shareSettings = getControl('share_query_settings') as {
    config: { type: string; default: boolean };
  } | null;
  expect(shareSettings).toBeDefined();
  expect(shareSettings?.config.type).toBe('CheckboxControl');
  expect(shareSettings?.config.default).toBe(true);
});

test('Query B query controls hide when settings are shared with Query A', () => {
  // Query B's sort metric, direction, row limit, empty columns and metric
  // truncation follow Query A while sharing is on; its own controls are hidden.
  const hiddenWhileSharing = [
    'timeseries_limit_metric_b',
    'order_desc_b',
    'show_empty_columns_b',
    'row_limit_b',
    'truncate_metric_b',
  ];
  for (const name of hiddenWhileSharing) {
    const ctrl = getControl(name) as unknown as VisibilityControl;
    expect(ctrl).toBeDefined();
    expect(ctrl.config.visibility).toBeDefined();
    expect(
      ctrl.config.visibility({
        controls: { share_query_settings: { value: true } },
      } as unknown as ControlPanelsContainerProps),
    ).toBe(false);
    expect(
      ctrl.config.visibility({
        controls: { share_query_settings: { value: false } },
      } as unknown as ControlPanelsContainerProps),
    ).toBe(true);
  }

  // Query A's own controls are never hidden.
  const queryAOrderDesc = getControl(
    'order_desc',
  ) as unknown as VisibilityControl;
  expect(
    queryAOrderDesc.config.visibility({
      controls: { share_query_settings: { value: true } },
    } as unknown as ControlPanelsContainerProps),
  ).toBe(true);
});
