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
import type { ReactNode } from 'react';
import { render, screen, userEvent } from '@superset-ui/core/spec';
import { useSortable } from '@dnd-kit/sortable';
import {
  type CapturedSortables,
  captureSortableData,
  simulateReorder,
} from 'src/explore/components/controls/DndColumnSelectControl/dndTestUtils';
import type { BigNumberMetricRow } from 'src/explore/controlUtils/metricRowsTypes';
import MetricRowsControl from '.';

jest.mock('@dnd-kit/sortable', () => ({
  ...jest.requireActual('@dnd-kit/sortable'),
  useSortable: jest.fn(),
}));

const sortables: CapturedSortables = { items: [] };
const mockMetricTriggerProps: Record<string, any>[] = [];

// Stand in for the native Saved / Simple / Custom SQL popover. Saving the
// popover calls onMetricEdit with either a saved metric object or a plain
// adhoc metric, exactly like AdhocMetricEditPopover#onSave does.
jest.mock(
  'src/explore/components/controls/MetricControl/AdhocMetricPopoverTrigger',
  () => {
    const ReactModule = jest.requireActual('react');
    return {
      __esModule: true,
      default: (props: Record<string, any>) => {
        mockMetricTriggerProps.push(props);
        return ReactModule.createElement(
          'button',
          {
            type: 'button',
            'data-test': 'native-metric-trigger',
            'aria-label': props.isNew ? 'Native metric (new)' : 'Native metric',
            onClick: () =>
              props.onMetricEdit(
                props.isNew
                  ? {
                      metric_name: 'saved_headcount',
                      expression: 'SUM(headcount)',
                      label: 'saved_headcount',
                    }
                  : {
                      expressionType: 'SIMPLE',
                      column: { column_name: 'headcount' },
                      aggregate: 'SUM',
                      sqlExpression: null,
                      label: 'SUM(headcount)',
                      hasCustomLabel: false,
                      optionName: 'metric_test',
                    },
              ),
          },
          props.children,
        );
      },
    };
  },
);

beforeEach(() => {
  sortables.items = [];
  mockMetricTriggerProps.length = 0;
  (useSortable as jest.Mock).mockImplementation(captureSortableData(sortables));
});

jest.mock('@apache-superset/core/translation', () => ({
  t: (text: string, ...args: unknown[]) => {
    let index = 0;
    return text.replace(/%s/g, () => {
      const value = String(args[index]);
      index += 1;
      return value;
    });
  },
}));

jest.mock('@superset-ui/core/components', () => {
  const actual = jest.requireActual('@superset-ui/core/components');
  const ReactModule = jest.requireActual('react');
  const SelectProbe = (props: {
    'aria-label'?: string;
    value?: string;
    options?: { label: string; value: string }[];
    onChange?: (value: string) => void;
  }) =>
    ReactModule.createElement(
      'select',
      {
        'aria-label': props['aria-label'],
        value: props.value ?? '',
        onChange: (event: { target: { value: string } }) =>
          props.onChange?.(event.target.value),
      },
      ...(props.options ?? []).map(option =>
        ReactModule.createElement(
          'option',
          { key: option.value, value: option.value },
          option.label,
        ),
      ),
    );
  const ModalProbe = (props: {
    show?: boolean;
    title?: string;
    primaryButtonName?: string;
    onHandledPrimaryAction?: () => void;
    children?: ReactNode;
  }) => {
    if (!props.show) return null;
    return ReactModule.createElement(
      'div',
      { role: 'dialog' },
      ReactModule.createElement('h2', null, props.title),
      props.children,
      ReactModule.createElement(
        'button',
        { type: 'button', onClick: props.onHandledPrimaryAction },
        props.primaryButtonName ?? 'Save',
      ),
    );
  };
  return new Proxy(actual, {
    get: (target, name) => {
      if (name === 'Select') return SelectProbe;
      if (name === 'Modal') return ModalProbe;
      return target[name];
    },
  });
});

const legacyRows: BigNumberMetricRow[] = [
  {
    id: 'legacy_row_1',
    slots: [
      { label: 'MoM', mode: 'time_shift', offset: '1 month ago' },
      { label: 'YoY', mode: 'time_shift', offset: '1 year ago' },
    ],
  },
];

const lastEmitted = (onChange: jest.Mock) =>
  onChange.mock.calls[onChange.mock.calls.length - 1][0];

test('shows the legacy MoM/YoY pair until metric_rows has been saved', () => {
  render(
    <MetricRowsControl
      name="metric_rows"
      label="Metric rows"
      defaultRows={legacyRows}
    />,
  );
  expect(screen.getAllByTestId('metric-row')).toHaveLength(1);
  expect(screen.getByText(/MoM/)).toBeInTheDocument();
  expect(screen.getByText(/YoY/)).toBeInTheDocument();
});

test('adds a row with two independently configurable slots', async () => {
  const onChange = jest.fn();
  render(
    <MetricRowsControl
      name="metric_rows"
      label="Metric rows"
      value={legacyRows}
      defaultRows={legacyRows}
      onChange={onChange}
    />,
  );
  await userEvent.click(screen.getByText('+ Add metric row'));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('Slot 1')).toBeInTheDocument();
  expect(screen.getByText('Slot 2')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  const rows = lastEmitted(onChange);
  expect(rows).toHaveLength(2);
  expect(rows[0].slots).toHaveLength(2);
  expect(rows[1].slots).toHaveLength(2);
  expect(rows[1].slots[0].mode).toBe('metric');
});

test('adds a third indicator to an existing row', async () => {
  const onChange = jest.fn();
  render(
    <MetricRowsControl
      name="metric_rows"
      label="Metric rows"
      value={legacyRows}
      onChange={onChange}
    />,
  );
  expect(screen.getByText('2 slots')).toBeInTheDocument();
  await userEvent.click(screen.getByText('Edit'));
  expect(screen.getByText('Slot 1')).toBeInTheDocument();
  expect(screen.getByText('Slot 2')).toBeInTheDocument();
  expect(screen.queryByText('Slot 3')).not.toBeInTheDocument();
  await userEvent.click(screen.getByText('+ Add slot'));
  expect(screen.getByText('Slot 3')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  const rows = lastEmitted(onChange);
  expect(rows).toHaveLength(1);
  expect(rows[0].slots).toHaveLength(3);
  expect(rows[0].slots[0]).toMatchObject({
    label: 'MoM',
    offset: '1 month ago',
  });
});

test('removes one indicator from a three-slot row', async () => {
  const onChange = jest.fn();
  const threeSlotRow: BigNumberMetricRow[] = [
    {
      id: 'row_3',
      slots: [
        { label: 'A', mode: 'metric', column: 'a' },
        { label: 'B', mode: 'metric', column: 'b' },
        { label: 'C', mode: 'metric', column: 'c' },
      ],
    },
  ];
  render(
    <MetricRowsControl
      name="metric_rows"
      label="Metric rows"
      value={threeSlotRow}
      onChange={onChange}
    />,
  );
  expect(screen.getByText('3 slots')).toBeInTheDocument();
  await userEvent.click(screen.getByText('Edit'));
  const removeButtons = screen.getAllByText('Remove slot');
  expect(removeButtons).toHaveLength(3);
  await userEvent.click(removeButtons[2]);
  expect(screen.queryByText('Slot 3')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(lastEmitted(onChange)[0].slots).toHaveLength(2);
});

test('caps a row at six indicators', async () => {
  render(
    <MetricRowsControl
      name="metric_rows"
      label="Metric rows"
      value={legacyRows}
    />,
  );
  await userEvent.click(screen.getByText('+ Add metric row'));
  const addSlot = () => screen.getByText('+ Add slot');
  for (let index = 2; index < 6; index += 1) {
    await userEvent.click(addSlot());
  }
  expect(screen.getByText('Slot 6')).toBeInTheDocument();
  expect(screen.queryByText('Slot 7')).not.toBeInTheDocument();
  expect(addSlot().closest('button')).toBeDisabled();
});

test('an explicit empty list is not replaced by the legacy pair', () => {
  const onChange = jest.fn();
  render(
    <MetricRowsControl
      name="metric_rows"
      label="Metric rows"
      value={[]}
      defaultRows={legacyRows}
      onChange={onChange}
    />,
  );
  expect(screen.queryAllByTestId('metric-row')).toHaveLength(0);
  expect(screen.getByText('No metric rows configured.')).toBeInTheDocument();
});

test('removing a row emits the remaining rows', async () => {
  const onChange = jest.fn();
  render(
    <MetricRowsControl
      name="metric_rows"
      label="Metric rows"
      value={legacyRows}
      onChange={onChange}
    />,
  );
  await userEvent.click(screen.getByText('Remove'));
  expect(lastEmitted(onChange)).toEqual([]);
});

test('rows are dragged to reorder instead of using Up/Down buttons', () => {
  const onChange = jest.fn();
  const rows: BigNumberMetricRow[] = [
    { id: 'row_a', slots: [{ label: 'A', mode: 'metric', column: 'a' }] },
    { id: 'row_b', slots: [{ label: 'B', mode: 'metric', column: 'b' }] },
    { id: 'row_c', slots: [{ label: 'C', mode: 'metric', column: 'c' }] },
  ];
  render(
    <MetricRowsControl
      name="metric_rows"
      label="Metric rows"
      value={rows}
      onChange={onChange}
    />,
  );
  expect(screen.getAllByTestId('metric-row')).toHaveLength(3);
  // Every row exposes the same grip as the column selection pills.
  expect(screen.getAllByTestId('metric-row-drag-handle')).toHaveLength(3);
  expect(screen.queryByText('Up')).not.toBeInTheDocument();
  expect(screen.queryByText('Down')).not.toBeInTheDocument();
  expect(sortables.items.map(item => item.dragIndex)).toEqual([0, 1, 2]);
  expect(sortables.items[0].type).toBe('MetricRowsRow_metric_rows');

  // Drag the first row onto the third one. The Explore-wide dispatcher
  // resolves this through the onShiftOptions callback registered above.
  simulateReorder(sortables, 0, 2);
  expect(
    lastEmitted(onChange).map((row: BigNumberMetricRow) => row.id),
  ).toEqual(['row_b', 'row_c', 'row_a']);
});

test('renders with the real sortable hook even without a DndContext', () => {
  // The Explore page supplies ExploreDndContextProvider. This guards the
  // control itself (storybooks, isolated renders) against a missing one.
  (useSortable as jest.Mock).mockImplementation(
    jest.requireActual('@dnd-kit/sortable').useSortable,
  );
  render(
    <MetricRowsControl
      name="metric_rows"
      label="Metric rows"
      value={legacyRows}
    />,
  );
  expect(screen.getAllByTestId('metric-row')).toHaveLength(1);
  expect(screen.getAllByTestId('metric-row-drag-handle')).toHaveLength(1);
});

test('dragging a row back up keeps the other rows in order', () => {
  const onChange = jest.fn();
  const rows: BigNumberMetricRow[] = [
    { id: 'row_a', slots: [] },
    { id: 'row_b', slots: [] },
    { id: 'row_c', slots: [] },
  ];
  render(
    <MetricRowsControl
      name="metric_rows"
      label="Metric rows"
      value={rows}
      onChange={onChange}
    />,
  );
  simulateReorder(sortables, 2, 0);
  expect(
    lastEmitted(onChange).map((row: BigNumberMetricRow) => row.id),
  ).toEqual(['row_c', 'row_a', 'row_b']);
});

const datasetProps = {
  columns: [{ column_name: 'headcount', type: 'BIGINT' }],
  savedMetrics: [
    {
      metric_name: 'saved_headcount',
      expression: 'SUM(headcount)',
      verbose_name: 'Headcount',
    },
  ],
  datasource: { id: 2, type: 'table' },
} as any;

test('the slot editor reuses the native metric popover, not two custom fields', async () => {
  const onChange = jest.fn();
  const rows: BigNumberMetricRow[] = [
    {
      id: 'row_sql',
      slots: [
        {
          label: '同比',
          mode: 'metric',
          column: {
            expressionType: 'SQL',
            sqlExpression: 'SUM(a)/SUM(b)',
            label: 'SUM(a)/SUM(b)',
          },
        },
      ],
    },
  ];
  render(
    <MetricRowsControl
      name="metric_rows"
      label="Metric rows"
      value={rows}
      onChange={onChange}
      {...datasetProps}
    />,
  );
  expect(screen.getByText(/SUM\(a\)\/SUM\(b\)/)).toBeInTheDocument();
  await userEvent.click(screen.getByText('Edit'));
  // The old simplified "saved metric select + custom SQL input" is gone.
  expect(screen.queryByLabelText('Metric')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Custom SQL')).not.toBeInTheDocument();
  expect(screen.getByText('Metric')).toBeInTheDocument();
  const trigger = screen.getByTestId('native-metric-trigger');
  expect(trigger).toBeInTheDocument();
  // The popover receives the same datasource metadata as MetricsControl.
  expect(mockMetricTriggerProps[0].columns).toEqual(datasetProps.columns);
  expect(mockMetricTriggerProps[0].savedMetricsOptions).toEqual(
    datasetProps.savedMetrics,
  );
  expect(mockMetricTriggerProps[0].datasource).toEqual(datasetProps.datasource);
  expect(mockMetricTriggerProps[0].isNew).toBe(false);
  // A legacy SQL metric opens the popover on the Custom SQL tab.
  expect(mockMetricTriggerProps[0].adhocMetric.expressionType).toBe('SQL');
  expect(mockMetricTriggerProps[0].adhocMetric.sqlExpression).toBe(
    'SUM(a)/SUM(b)',
  );

  // A "Simple" tab save writes a complete QueryFormMetric object.
  await userEvent.click(trigger);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(lastEmitted(onChange)[0].slots[0].column).toMatchObject({
    expressionType: 'SIMPLE',
    aggregate: 'SUM',
    label: 'SUM(headcount)',
    column: { column_name: 'headcount' },
  });
});

test('a new slot stores a saved metric name from the native popover', async () => {
  const onChange = jest.fn();
  render(
    <MetricRowsControl
      name="metric_rows"
      label="Metric rows"
      value={[]}
      onChange={onChange}
      {...datasetProps}
    />,
  );
  await userEvent.click(screen.getByText('+ Add metric row'));
  const triggers = screen.getAllByTestId('native-metric-trigger');
  expect(triggers).toHaveLength(2);
  expect(screen.getAllByText('Add metric')).toHaveLength(2);
  expect(mockMetricTriggerProps[0].isNew).toBe(true);
  await userEvent.click(triggers[0]);
  expect(screen.getByText('saved_headcount')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  const rows = lastEmitted(onChange);
  expect(rows[0].slots[0].column).toBe('saved_headcount');
  expect(rows[0].slots[1].column).toBeUndefined();
});

test('a saved metric string selects the matching Saved tab entry', async () => {
  const row: BigNumberMetricRow[] = [
    {
      id: 'row_saved',
      slots: [{ label: 'Count', mode: 'metric', column: 'saved_headcount' }],
    },
  ];
  render(
    <MetricRowsControl
      name="metric_rows"
      label="Metric rows"
      value={row}
      {...datasetProps}
    />,
  );
  await userEvent.click(screen.getByText('Edit'));
  expect(mockMetricTriggerProps[0].savedMetric.metric_name).toBe(
    'saved_headcount',
  );
  expect(mockMetricTriggerProps[0].isNew).toBe(false);
  expect(screen.getByTestId('metric-slot-value')).toBeInTheDocument();
});
