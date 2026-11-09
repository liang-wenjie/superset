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
import { SupersetClient } from '@superset-ui/core';
import { expandControlConfig } from '@superset-ui/chart-controls';
import { controls } from 'src/explore/controls';
import { inlineFilters } from 'src/explore/controlPanels/sections';
import InlineFiltersControl from '.';

jest.mock('@superset-ui/core', () => ({
  ...jest.requireActual('@superset-ui/core'),
  SupersetClient: {
    get: jest.fn().mockResolvedValue({ json: { result: ['A', 'B'] } }),
  },
}));

jest.mock('@superset-ui/core/components', () => {
  const actual = jest.requireActual('@superset-ui/core/components');
  const ReactModule = jest.requireActual('react');
  const SelectProbe = (props: {
    'aria-label'?: string;
    popupMatchSelectWidth?: boolean | number;
    styles?: { popup?: { root?: { maxWidth?: number | string } } };
    options?: { label: string; value: string }[];
    value?: string | string[];
    mode?: string;
    allowNewOptions?: boolean;
    disabled?: boolean;
    placeholder?: string;
    notFoundContent?: unknown;
    onChange?: (value: string | string[] | undefined) => void;
  }) => {
    const isMulti = props.mode === 'multiple';
    return ReactModule.createElement(
      'select',
      {
        'data-test':
          props['aria-label'] === 'Column'
            ? 'inline-filter-column-select'
            : undefined,
        'aria-label': props['aria-label'],
        disabled: Boolean(props.disabled),
        placeholder: props.placeholder,
        'data-popup-match': String(props.popupMatchSelectWidth),
        'data-popup-max-width': String(
          props.styles?.popup?.root?.maxWidth ?? '',
        ),
        'data-allow-new-options': String(Boolean(props.allowNewOptions)),
        'data-not-found': String(props.notFoundContent ?? ''),
        multiple: isMulti,
        value: isMulti
          ? Array.isArray(props.value)
            ? props.value
            : []
          : (props.value ?? ''),
        onChange: (event: { target: HTMLSelectElement }) => {
          if (!props.onChange) return;
          if (isMulti) {
            props.onChange(
              Array.from(event.target.selectedOptions).map(
                option => option.value,
              ),
            );
          } else {
            props.onChange(
              event.target.value === '' ? undefined : event.target.value,
            );
          }
        },
      },
      ...(props.options ?? []).map(option =>
        ReactModule.createElement(
          'option',
          { key: option.value, value: option.value },
          option.label,
        ),
      ),
    );
  };
  const ModalProbe = (props: {
    show?: boolean;
    title?: string;
    primaryButtonName?: string;
    disablePrimaryButton?: boolean;
    onHandledPrimaryAction?: () => void;
    onHide?: () => void;
    centered?: boolean;
    styles?: { body?: { maxHeight?: string; overflowY?: string } };
    children?: ReactNode;
  }) => {
    if (!props.show) return null;
    return ReactModule.createElement(
      'div',
      {
        'data-test': 'inline-filter-modal',
        role: 'dialog',
        'data-centered': String(Boolean(props.centered)),
        'data-body-max-height': String(props.styles?.body?.maxHeight ?? ''),
        'data-body-overflow-y': String(props.styles?.body?.overflowY ?? ''),
      },
      ReactModule.createElement('h2', null, props.title),
      props.children,
      ReactModule.createElement(
        'button',
        {
          type: 'button',
          disabled: Boolean(props.disablePrimaryButton),
          onClick: props.onHandledPrimaryAction,
        },
        props.primaryButtonName ?? 'Save',
      ),
      ReactModule.createElement(
        'button',
        { type: 'button', onClick: props.onHide },
        'Cancel',
      ),
    );
  };
  // The module exports lazy getters and is mid-load here, so read through to
  // it rather than spreading it, which would resolve them all too early.
  return new Proxy(actual, {
    get: (target, name) => {
      if (name === 'Select') return SelectProbe;
      if (name === 'Modal') return ModalProbe;
      return target[name];
    },
  });
});

const props = {
  name: 'inline_filters',
  label: 'Chart inline filters',
  value: [{ id: 'group-1', column: '上年度销售额同比', label: '' }],
  columns: [
    { column_name: '上年度销售额同比' },
    { column_name: '本年度销售额' },
  ],
  metrics: [
    { label: 'Total sales', value: 'sum__sales' },
    { label: 'Count', value: 'count' },
  ],
  onChange: jest.fn(),
};

const editFirst = async () => {
  await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
  await screen.findByTestId('inline-filter-editor');
};

const save = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
};

const lastEmitted = (onChange: jest.Mock) =>
  onChange.mock.calls[onChange.mock.calls.length - 1][0];

interface InlineFiltersControlConfig {
  shouldMapStateToProps?: () => boolean;
  mapStateToProps: (state: unknown) => {
    columns: unknown[];
    datasourceId?: string | number;
    datasourceType?: string;
    metrics: { label: string; value: string }[];
  };
}

const inlineFiltersConfig =
  controls.inline_filters as unknown as InlineFiltersControlConfig;

test('recalculates mapStateToProps when datasource metadata arrives late', () => {
  // Without this, Explore freezes the props computed at control creation,
  // where the datasource is often still loading: both the Default value
  // and Sort metric dropdowns then stay empty forever.
  expect(inlineFiltersConfig.shouldMapStateToProps?.()).toBe(true);
});

test('collects saved metrics and metric names already used by the chart', () => {
  const result = inlineFiltersConfig.mapStateToProps({
    datasource: {
      id: 7,
      type: 'table',
      columns: [{ column_name: 'region' }],
      metrics: [
        { metric_name: 'sum__sales', verbose_name: 'Total sales' },
        { metric_name: 'count' },
      ],
    },
    form_data: {
      datasource: '7__table',
      metrics: ['avg__price', { label: 'Adhoc metric' }],
    },
    controls: { metrics: { value: ['sum__sales'] } },
  });
  expect(result.datasourceId).toBe(7);
  expect(result.datasourceType).toBe('table');
  expect(result.metrics).toEqual([
    { label: 'Total sales', value: 'sum__sales' },
    { label: 'count', value: 'count' },
    { label: 'avg__price', value: 'avg__price' },
  ]);
});

test('falls back to the form_data datasource key before metadata loads', () => {
  const result = inlineFiltersConfig.mapStateToProps({
    form_data: { datasource: '9__table', metrics: 'count' },
  });
  expect(result.datasourceId).toBe('9');
  expect(result.datasourceType).toBe('table');
  expect(result.metrics).toEqual([{ label: 'count', value: 'count' }]);
});

test('the config actually rendered by Explore supplies datasource and metrics', () => {
  // Regression: the plain 'inline_filters' string shortcut resolves through
  // sharedControls, whose mapStateToProps only returns `columns`. That left
  // both the Default value and Sort metric dropdowns permanently empty.
  const item = inlineFilters.controlSetRows[0][0] as Parameters<
    typeof expandControlConfig
  >[0];
  const expanded = expandControlConfig(item) as unknown as {
    config: {
      shouldMapStateToProps?: () => boolean;
      mapStateToProps: (state: unknown) => {
        columns: unknown[];
        datasourceId?: string | number;
        datasourceType?: string;
        metrics: { label: string; value: string }[];
      };
    };
  };
  expect(expanded.config.shouldMapStateToProps?.()).toBe(true);
  const mapped = expanded.config.mapStateToProps({
    datasource: {
      id: 7,
      type: 'table',
      columns: [{ column_name: 'region' }],
      metrics: [{ metric_name: 'sum__sales' }],
    },
    form_data: { datasource: '7__table' },
  });
  expect(mapped.datasourceId).toBe(7);
  expect(mapped.datasourceType).toBe('table');
  expect(mapped.columns).toEqual([{ column_name: 'region' }]);
  expect(mapped.metrics).toEqual([
    { label: 'sum__sales', value: 'sum__sales' },
  ]);
});

beforeEach(() => {
  (SupersetClient.get as jest.Mock)
    .mockReset()
    .mockResolvedValue({ json: { result: ['A', 'B'] } });
});

test('shows a compact list and keeps the editor closed until Edit is clicked', () => {
  render(<InlineFiltersControl {...props} />);
  expect(screen.getAllByTestId('inline-filter-row')).toHaveLength(1);
  expect(screen.getByText('上年度销售额同比')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  expect(screen.queryByTestId('inline-filter-editor')).not.toBeInTheDocument();
});

test('the editor dialog is centered and its body scrolls so the footer stays visible', async () => {
  render(<InlineFiltersControl {...props} />);
  await editFirst();
  const modal = screen.getByTestId('inline-filter-modal');
  // Without `centered`, antd's fixed top offset pushes the footer below the
  // viewport. The body cap keeps Save/Cancel on screen for both add and edit.
  expect(modal).toHaveAttribute('data-centered', 'true');
  expect(modal).toHaveAttribute('data-body-max-height', 'calc(100vh - 220px)');
  expect(modal).toHaveAttribute('data-body-overflow-y', 'auto');
  expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
});

test('opens the add dialog and only writes formData on Save', async () => {
  const onChange = jest.fn();
  render(<InlineFiltersControl {...props} value={[]} onChange={onChange} />);
  await userEvent.click(
    screen.getByRole('button', { name: '+ Add inline filter' }),
  );

  expect(screen.getByTestId('inline-filter-modal')).toBeInTheDocument();
  expect(screen.getByText('Add inline filter')).toBeInTheDocument();
  // Choosing a column in the draft must not re-trigger the chart query.
  await userEvent.selectOptions(
    screen.getByLabelText('Column'),
    '本年度销售额',
  );
  await userEvent.type(screen.getByLabelText('Label'), 'Category');
  expect(onChange).not.toHaveBeenCalled();

  await save();
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(lastEmitted(onChange)[0]).toMatchObject({
    column: '本年度销售额',
    label: 'Category',
  });
  expect(screen.queryByTestId('inline-filter-editor')).not.toBeInTheDocument();
});

test('Save stays disabled until a column is chosen', async () => {
  render(<InlineFiltersControl {...props} value={[]} />);
  await userEvent.click(
    screen.getByRole('button', { name: '+ Add inline filter' }),
  );
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  await userEvent.selectOptions(
    screen.getByLabelText('Column'),
    '本年度销售额',
  );
  expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
});

test('Cancel discards the draft', async () => {
  const onChange = jest.fn();
  render(<InlineFiltersControl {...props} onChange={onChange} />);
  await editFirst();
  await userEvent.type(screen.getByLabelText('Label'), 'Draft label');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getAllByTestId('inline-filter-row')).toHaveLength(1);
});

test('editing an existing filter replaces just that row on Save', async () => {
  const onChange = jest.fn();
  render(
    <InlineFiltersControl
      {...props}
      value={[
        ...props.value,
        { id: 'group-2', column: '本年度销售额', label: 'Sales' },
      ]}
      onChange={onChange}
    />,
  );
  await editFirst();
  await userEvent.type(screen.getByLabelText('Label'), 'YoY');
  await save();
  const next = lastEmitted(onChange);
  expect(next).toHaveLength(2);
  expect(next[0]).toMatchObject({ id: 'group-1', label: 'YoY' });
  expect(next[1]).toMatchObject({ id: 'group-2', label: 'Sales' });
});

test('Remove deletes a row without opening the dialog', async () => {
  const onChange = jest.fn();
  render(<InlineFiltersControl {...props} onChange={onChange} />);
  await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
  expect(onChange).toHaveBeenCalledWith([]);
  expect(screen.queryByTestId('inline-filter-editor')).not.toBeInTheDocument();
});

test('the column popup sizes to its content instead of the trigger', async () => {
  render(<InlineFiltersControl {...props} />);
  await editFirst();
  const select = screen.getByTestId('inline-filter-column-select');
  expect(select).toHaveAttribute('data-popup-match', 'false');
  expect(select).toHaveAttribute('data-popup-max-width', '320');
});

test('the filter type picker offers three modes; exclusion is a switch', async () => {
  render(<InlineFiltersControl {...props} />);
  await editFirst();
  const picker = screen.getByLabelText('Filter type');
  expect(picker).toHaveValue('single');
  ['Single select', 'Multiple select', 'Text input'].forEach(option => {
    expect(screen.getByRole('option', { name: option })).toBeInTheDocument();
  });
  expect(
    screen.queryByRole('option', { name: 'Inverse selection' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('switch', { name: 'Inverse selection' }),
  ).toBeInTheDocument();
});

test('choosing multiple select writes filterType and the legacy multi flag', async () => {
  const onChange = jest.fn();
  render(<InlineFiltersControl {...props} onChange={onChange} />);
  await editFirst();
  await userEvent.selectOptions(
    screen.getByLabelText('Filter type'),
    'multiple',
  );
  await save();
  expect(lastEmitted(onChange)[0]).toMatchObject({
    id: 'group-1',
    filterType: 'multiple',
    multi: true,
    inverseSelection: false,
  });
});

test('the required toggle writes the required flag', async () => {
  const onChange = jest.fn();
  render(<InlineFiltersControl {...props} onChange={onChange} />);
  await editFirst();
  await userEvent.click(screen.getByRole('switch', { name: 'Required' }));
  expect(
    screen.getByText(/Users cannot clear a required filter/),
  ).toBeInTheDocument();
  await save();
  expect(lastEmitted(onChange)[0]).toMatchObject({ required: true });
});

test('the search box switch writes showSearch and defaults to on', async () => {
  const onChange = jest.fn();
  render(<InlineFiltersControl {...props} onChange={onChange} />);
  await editFirst();
  const toggle = screen.getByRole('switch', { name: 'Show search box' });
  expect(toggle).toHaveAttribute('aria-checked', 'true');
  await userEvent.click(toggle);
  await save();
  expect(lastEmitted(onChange)[0]).toMatchObject({ showSearch: false });
});

test('the inverse switch writes the flag without changing the filter type', async () => {
  const onChange = jest.fn();
  render(<InlineFiltersControl {...props} onChange={onChange} />);
  await editFirst();
  const toggle = screen.getByRole('switch', { name: 'Inverse selection' });
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByText(/NOT ILIKE/)).toBeInTheDocument();
  await userEvent.click(toggle);
  await save();
  expect(lastEmitted(onChange)[0]).toMatchObject({
    filterType: 'single',
    inverseSelection: true,
    multi: false,
  });
});

test('the inverse switch can be turned off again', async () => {
  const onChange = jest.fn();
  render(
    <InlineFiltersControl
      {...props}
      value={[
        {
          ...props.value[0],
          filterType: 'multiple',
          inverseSelection: true,
        },
      ]}
      onChange={onChange}
    />,
  );
  await editFirst();
  const toggle = screen.getByRole('switch', { name: 'Inverse selection' });
  expect(toggle).toHaveAttribute('aria-checked', 'true');
  await userEvent.click(toggle);
  await save();
  expect(lastEmitted(onChange)[0]).toMatchObject({
    filterType: 'multiple',
    inverseSelection: false,
  });
});

test('text input reveals the match mode and hides dropdown-only settings', async () => {
  const onChange = jest.fn();
  render(<InlineFiltersControl {...props} onChange={onChange} />);
  await editFirst();
  await userEvent.selectOptions(screen.getByLabelText('Filter type'), 'input');

  const matchMode = screen.getByLabelText('Match mode');
  expect(matchMode).toHaveValue('exact');
  expect(
    screen.getByRole('option', { name: 'Fuzzy match (contains)' }),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText('Sort filter values')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Sort metric')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('switch', { name: 'Show search box' }),
  ).not.toBeInTheDocument();
  // Exclusion is orthogonal to the type and stays available for text input.
  expect(
    screen.getByRole('switch', { name: 'Inverse selection' }),
  ).toBeInTheDocument();

  await userEvent.selectOptions(matchMode, 'contains');
  await save();
  expect(lastEmitted(onChange)[0]).toMatchObject({
    filterType: 'input',
    multi: false,
    inverseSelection: false,
    matchMode: 'contains',
  });
});

test('a non-input filter never persists a match mode', async () => {
  const onChange = jest.fn();
  render(
    <InlineFiltersControl
      {...props}
      value={[
        {
          ...props.value[0],
          filterType: 'single',
          matchMode: 'contains',
        },
      ]}
      onChange={onChange}
    />,
  );
  await editFirst();
  expect(screen.queryByLabelText('Match mode')).not.toBeInTheDocument();
  await save();
  expect(lastEmitted(onChange)[0].matchMode).toBeUndefined();
});

test('the sort direction picker writes sortAscending', async () => {
  const onChange = jest.fn();
  render(<InlineFiltersControl {...props} onChange={onChange} />);
  await editFirst();
  const picker = screen.getByLabelText('Sort filter values');
  expect(picker).toHaveValue('asc');
  await userEvent.selectOptions(picker, 'desc');
  await save();
  expect(lastEmitted(onChange)[0]).toMatchObject({ sortAscending: false });
});

test('the sort metric picker offers datasource metrics', async () => {
  const onChange = jest.fn();
  render(<InlineFiltersControl {...props} onChange={onChange} />);
  await editFirst();
  const picker = screen.getByLabelText('Sort metric');
  expect(
    screen.getByRole('option', { name: 'Total sales' }),
  ).toBeInTheDocument();
  await userEvent.selectOptions(picker, 'sum__sales');
  await save();
  expect(lastEmitted(onChange)[0]).toMatchObject({
    sortMetric: 'sum__sales',
  });
});

test('the description field writes a tooltip description', async () => {
  const onChange = jest.fn();
  render(<InlineFiltersControl {...props} onChange={onChange} />);
  await editFirst();
  await userEvent.type(
    screen.getByLabelText('Description'),
    'Only applies to mainland',
  );
  await save();
  expect(lastEmitted(onChange)[0]).toMatchObject({
    description: 'Only applies to mainland',
  });
});

test('turning off dependencies writes an empty dependsOn list', async () => {
  const onChange = jest.fn();
  render(<InlineFiltersControl {...props} onChange={onChange} />);
  await editFirst();
  const toggle = screen.getByRole('switch', {
    name: 'These values depend on other filters',
  });
  expect(toggle).toHaveAttribute('aria-checked', 'true');
  await userEvent.click(toggle);
  expect(screen.queryByLabelText('Depends on')).not.toBeInTheDocument();
  await save();
  expect(lastEmitted(onChange)[0]).toMatchObject({ dependsOn: [] });
});

test('choosing explicit dependencies writes their filter ids', async () => {
  const onChange = jest.fn();
  render(
    <InlineFiltersControl
      {...props}
      value={[
        ...props.value,
        { id: 'group-2', column: '本年度销售额', label: 'Sales' },
      ]}
      onChange={onChange}
    />,
  );
  await editFirst();
  await userEvent.selectOptions(screen.getByLabelText('Depends on'), [
    'group-2',
  ]);
  await save();
  expect(lastEmitted(onChange)[0]).toMatchObject({
    dependsOn: ['group-2'],
  });
});

test('the default value picker writes the chosen column value', async () => {
  const onChange = jest.fn();
  render(
    <InlineFiltersControl
      {...props}
      value={[
        {
          id: 'group-1',
          column: '上年度销售额同比',
          label: '',
          options: [
            { label: 'A', value: 'A' },
            { label: 'B', value: 'B' },
          ],
        },
      ]}
      onChange={onChange}
    />,
  );
  await editFirst();
  await userEvent.selectOptions(screen.getByLabelText('Default value'), 'B');
  await save();
  expect(lastEmitted(onChange)[0]).toMatchObject({ defaultValue: 'B' });
});

test('switching multiple values normalizes a saved default', async () => {
  const onChange = jest.fn();
  render(
    <InlineFiltersControl
      {...props}
      value={[{ id: 'group-1', column: '上年度销售额同比', defaultValue: 'A' }]}
      onChange={onChange}
    />,
  );
  await editFirst();
  await userEvent.selectOptions(
    screen.getByLabelText('Filter type'),
    'multiple',
  );
  await save();
  expect(lastEmitted(onChange)[0]).toMatchObject({
    filterType: 'multiple',
    multi: true,
    defaultValue: ['A'],
  });
});

test('changing the column drops a default value from the old column', async () => {
  const onChange = jest.fn();
  render(
    <InlineFiltersControl
      {...props}
      value={[{ id: 'group-1', column: '上年度销售额同比', defaultValue: 'A' }]}
      onChange={onChange}
    />,
  );
  await editFirst();
  await userEvent.selectOptions(
    screen.getByLabelText('Column'),
    '本年度销售额',
  );
  await save();
  expect(lastEmitted(onChange)[0]).toMatchObject({
    column: '本年度销售额',
    defaultValue: undefined,
  });
});

test('the default picker never shows a bare No data empty state', async () => {
  render(<InlineFiltersControl {...props} />);
  await editFirst();
  const picker = screen.getByLabelText('Default value');
  expect(picker).toHaveAttribute('data-allow-new-options', 'true');
  expect(picker.getAttribute('data-not-found')).toContain(
    'No column values loaded',
  );
  // "First value" is a switch now, not an option that could leak into
  // `defaultValue` and end up in a WHERE clause.
  expect(
    screen.queryByRole('option', { name: 'First value (ascending)' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('option', { name: 'First value (descending)' }),
  ).not.toBeInTheDocument();
});

test('column values from the datasource are offered as defaults', async () => {
  render(
    <InlineFiltersControl {...props} datasourceId={1} datasourceType="table" />,
  );
  await editFirst();
  expect(await screen.findByRole('option', { name: 'A' })).toBeInTheDocument();
  expect(await screen.findByRole('option', { name: 'B' })).toBeInTheDocument();
  expect(
    screen.getByText(/Pick a real value of this column/),
  ).toBeInTheDocument();
});

test('a new filter without a column explains the empty default picker', async () => {
  render(<InlineFiltersControl {...props} value={[]} />);
  await userEvent.click(
    screen.getByRole('button', { name: '+ Add inline filter' }),
  );
  await screen.findByTestId('inline-filter-editor');
  const picker = screen.getByLabelText('Default value');
  expect(picker).toBeDisabled();
  expect(picker).toHaveAttribute('placeholder', 'Select a column first');
  expect(
    screen.getByText(/Select a column first, then pick/),
  ).toBeInTheDocument();
});

test('an empty column-values response explains that manual entry still works', async () => {
  (SupersetClient.get as jest.Mock).mockResolvedValueOnce({
    json: { result: [] },
  });
  render(
    <InlineFiltersControl {...props} datasourceId={1} datasourceType="table" />,
  );
  await editFirst();
  expect(
    await screen.findByText(/No values were returned for this column/),
  ).toBeInTheDocument();
  expect(screen.getByLabelText('Default value')).toHaveAttribute(
    'data-allow-new-options',
    'true',
  );
});

test('a failed column-values request explains the failure', async () => {
  (SupersetClient.get as jest.Mock).mockRejectedValueOnce(new Error('403'));
  render(
    <InlineFiltersControl {...props} datasourceId={1} datasourceType="table" />,
  );
  await editFirst();
  expect(
    await screen.findByText(/Could not load this column/),
  ).toBeInTheDocument();
});

test('an empty sort metric list explains what can be typed', async () => {
  render(<InlineFiltersControl {...props} metrics={[]} />);
  await editFirst();
  expect(
    screen.getByLabelText('Sort metric').getAttribute('data-not-found'),
  ).toContain('No saved metrics');
});

test('enabling the first-value switch clears a custom default', async () => {
  const onChange = jest.fn();
  render(
    <InlineFiltersControl
      {...props}
      value={[{ id: 'group-1', column: '上年度销售额同比', defaultValue: 'A' }]}
      onChange={onChange}
    />,
  );
  await editFirst();
  const toggle = screen.getByRole('switch', {
    name: 'Select first filter value by default',
  });
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  await userEvent.click(toggle);
  expect(screen.queryByLabelText('Default value')).not.toBeInTheDocument();
  await save();
  expect(lastEmitted(onChange)[0]).toMatchObject({
    defaultToFirstItem: true,
    defaultValue: undefined,
  });
});

test('descending sorting decides which value is first', async () => {
  const onChange = jest.fn();
  render(<InlineFiltersControl {...props} onChange={onChange} />);
  await editFirst();
  await userEvent.selectOptions(
    screen.getByLabelText('Sort filter values'),
    'desc',
  );
  await userEvent.click(
    screen.getByRole('switch', {
      name: 'Select first filter value by default',
    }),
  );
  await save();
  expect(lastEmitted(onChange)[0]).toMatchObject({
    defaultToFirstItem: true,
    sortAscending: false,
    defaultValue: undefined,
  });
});

test('switching off first-value exposes the column-value picker', async () => {
  const onChange = jest.fn();
  render(
    <InlineFiltersControl
      {...props}
      value={[
        {
          id: 'group-1',
          column: '上年度销售额同比',
          defaultToFirstItem: true,
          sortAscending: false,
          options: [{ label: 'B', value: 'B' }],
        },
      ]}
      onChange={onChange}
    />,
  );
  await editFirst();
  const toggle = screen.getByRole('switch', {
    name: 'Select first filter value by default',
  });
  expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(screen.queryByLabelText('Default value')).not.toBeInTheDocument();
  await userEvent.click(toggle);
  await userEvent.selectOptions(screen.getByLabelText('Default value'), 'B');
  await save();
  expect(lastEmitted(onChange)[0]).toMatchObject({
    defaultToFirstItem: false,
    defaultValue: 'B',
  });
});

test('a multi-select first-value default stores no sentinel value', async () => {
  const onChange = jest.fn();
  render(
    <InlineFiltersControl
      {...props}
      value={[
        {
          id: 'group-1',
          column: '上年度销售额同比',
          filterType: 'multiple',
          options: [{ label: 'B', value: 'B' }],
        },
      ]}
      onChange={onChange}
    />,
  );
  await editFirst();
  await userEvent.click(
    screen.getByRole('switch', {
      name: 'Select first filter value by default',
    }),
  );
  await save();
  const [next] = lastEmitted(onChange);
  expect(next.defaultToFirstItem).toBe(true);
  expect(next.defaultValue).toBeUndefined();
  expect(JSON.stringify(next)).not.toContain('inline_filter_first');
});

test('a saved first-value default reopens with the switch on', async () => {
  render(
    <InlineFiltersControl
      {...props}
      value={[
        {
          id: 'group-1',
          column: '上年度销售额同比',
          defaultToFirstItem: true,
          sortAscending: false,
        },
      ]}
    />,
  );
  await editFirst();
  expect(
    screen.getByRole('switch', {
      name: 'Select first filter value by default',
    }),
  ).toHaveAttribute('aria-checked', 'true');
  expect(screen.queryByLabelText('Default value')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Sort filter values')).toHaveValue('desc');
  expect(screen.getAllByTestId('inline-filter-row')[0]).toHaveTextContent(
    'First value (descending)',
  );
});

test('list rows show only the filter type chip', () => {
  render(
    <InlineFiltersControl
      {...props}
      value={[
        {
          ...props.value[0],
          label: 'Category',
          required: true,
          filterType: 'multiple',
          inverseSelection: true,
          showSearch: false,
          sortMetric: 'sum__sales',
          defaultValue: 'A',
        },
      ]}
    />,
  );
  const row = screen.getByTestId('inline-filter-row');
  expect(row).toHaveTextContent('Multi');
  expect(row.querySelectorAll('[data-test="inline-filter-chip"]')).toHaveLength(
    1,
  );
  ['Exclude', 'Required', 'No search', 'By metric', 'Input'].forEach(chip => {
    expect(row).not.toHaveTextContent(chip);
  });
});

test('a fuzzy text-input filter also shows only its type chip', () => {
  render(
    <InlineFiltersControl
      {...props}
      value={[
        {
          ...props.value[0],
          filterType: 'input',
          matchMode: 'contains',
          required: true,
        },
      ]}
    />,
  );
  const row = screen.getByTestId('inline-filter-row');
  expect(row).toHaveTextContent('Input');
  expect(row).not.toHaveTextContent('Contains');
  expect(row).not.toHaveTextContent('Required');
  expect(row.querySelectorAll('[data-test="inline-filter-chip"]')).toHaveLength(
    1,
  );
});
