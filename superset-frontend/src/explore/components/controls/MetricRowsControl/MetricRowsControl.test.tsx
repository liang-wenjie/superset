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
import type { BigNumberMetricRow } from 'src/explore/controlUtils/metricRowsTypes';
import MetricRowsControl from '.';

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
