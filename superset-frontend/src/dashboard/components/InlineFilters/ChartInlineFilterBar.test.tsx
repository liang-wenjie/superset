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
import { supersetTheme } from '@apache-superset/core/theme';
import { SupersetClient } from '@superset-ui/core';
import { render, screen, userEvent, waitFor } from '@superset-ui/core/spec';
import {
  buildInlineValuesQuery,
  ChartInlineFilterBar,
  getInlineFilterFallbackValue,
  getInlineFilterOptions,
  getInlineFilterPopupWidth,
  toInlineQueryFilters,
} from './ChartInlineFilterBar';
import { resolveInlineFilterValue, sortInlineFilterOptions } from './types';

jest.mock('@superset-ui/core', () => ({
  ...jest.requireActual('@superset-ui/core'),
  SupersetClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const mockGet = SupersetClient.get as jest.Mock;
const mockPost = SupersetClient.post as jest.Mock;
const filters = [{ id: 'filter-1', column: 'account', label: '' }];

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

test('resolveInlineFilterValue distinguishes untouched from cleared', () => {
  const config = { id: 'f', column: 'c', defaultValue: 'A' };
  expect(resolveInlineFilterValue(config, {})).toBe('A');
  expect(resolveInlineFilterValue(config, { f: null })).toBeNull();
  expect(resolveInlineFilterValue(config, { f: 'B' })).toBe('B');
  expect(resolveInlineFilterValue({ ...config, multi: true }, {})).toEqual([
    'A',
  ]);
});

test('fallback prefers the default and otherwise the first sorted option', () => {
  expect(getInlineFilterFallbackValue({ id: 'f', column: 'c' }, [])).toBeNull();
  expect(
    getInlineFilterFallbackValue(
      { id: 'f', column: 'c', defaultValue: '默认' },
      [{ label: 'A', value: 'A' }],
    ),
  ).toBe('默认');
  expect(
    getInlineFilterFallbackValue({ id: 'f', column: 'c' }, [
      { label: 'A', value: 'A' },
      { label: 'B', value: 'B' },
    ]),
  ).toBe('A');
  expect(
    getInlineFilterFallbackValue({ id: 'f', column: 'c', multi: true }, [
      { label: 'A', value: 'A' },
    ]),
  ).toEqual(['A']);
  // "First item" mode ignores a stale concrete default, like the dashboard
  // filter's mutually exclusive defaultToFirstItem.
  expect(
    getInlineFilterFallbackValue(
      { id: 'f', column: 'c', defaultToFirstItem: true, defaultValue: '默认' },
      [{ label: 'A', value: 'A' }],
    ),
  ).toBe('A');
  expect(
    getInlineFilterOptions(
      {
        id: 'f',
        column: 'c',
        options: [{ label: 'Preset', value: 'p' }],
      },
      [],
    ),
  ).toEqual([{ label: 'Preset', value: 'p' }]);
});

test('options are sorted by label or numerically, in either direction', () => {
  const values = [
    { label: '10', value: '10' },
    { label: '2', value: '2' },
    { label: '100', value: '100' },
  ];
  expect(sortInlineFilterOptions(values, true).map(o => o.value)).toEqual([
    '2',
    '10',
    '100',
  ]);
  expect(sortInlineFilterOptions(values, false).map(o => o.value)).toEqual([
    '100',
    '10',
    '2',
  ]);
  const labels = [
    { label: 'zeta', value: 'z' },
    { label: 'Alpha', value: 'a' },
    { label: 'beta', value: 'b' },
  ];
  expect(sortInlineFilterOptions(labels).map(o => o.value)).toEqual([
    'a',
    'b',
    'z',
  ]);
  // The runtime bar sorts its cached values with the configured direction.
  expect(
    getInlineFilterOptions({ id: 'f', column: 'c', sortAscending: false }, [
      { label: 'A', value: 'A' },
      { label: 'B', value: 'B' },
    ]).map(o => o.value),
  ).toEqual(['B', 'A']);
});

test('a dynamic first-value default resolves from the sorted options', () => {
  const config = { id: 'f', column: 'c', defaultToFirstItem: true };
  const options = [
    { label: 'B', value: 'B' },
    { label: 'A', value: 'A' },
  ];
  expect(resolveInlineFilterValue(config, {})).toBeNull();
  expect(
    resolveInlineFilterValue(config, {}, sortInlineFilterOptions(options)),
  ).toBe('A');
  expect(resolveInlineFilterValue(config, { f: null }, options)).toBeNull();
  expect(resolveInlineFilterValue(config, { f: 'B' }, options)).toBe('B');
});

test('popup width grows with the longest value and stays within bounds', () => {
  expect(getInlineFilterPopupWidth([])).toBe(140);
  expect(getInlineFilterPopupWidth([{ label: 'a' }])).toBe(140);

  const short = getInlineFilterPopupWidth([{ label: '账号二' }]);
  const long = getInlineFilterPopupWidth([
    { label: '账号二-北京分公司销售汇总' },
  ]);
  expect(long).toBeGreaterThan(short);
  expect(long).toBeLessThanOrEqual(300);
  expect(getInlineFilterPopupWidth([{ label: '账号'.repeat(100) }])).toBe(300);
});

test('renders full distinct values in a popup wider than the compact trigger', async () => {
  const values = ['账号二-北京分公司', '账号三-上海分公司'];
  mockGet.mockResolvedValue({ json: { result: values } });

  render(
    <ChartInlineFilterBar
      filters={filters}
      selection={{}}
      onSelect={jest.fn()}
      datasourceId={1}
      datasourceType="table"
    />,
  );

  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
  await userEvent.click(screen.getByRole('combobox'));

  const popup = await waitFor(
    () =>
      document.querySelector(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden)',
      ) as HTMLElement,
  );

  // A numeric popup width keeps rc-select's virtual scrolling available for
  // high-cardinality columns, unlike `popupMatchSelectWidth={false}`.
  expect(Number.parseInt(popup.style.width, 10)).toBeGreaterThanOrEqual(140);
  values.forEach(value => {
    expect(screen.getByText(value)).toBeInTheDocument();
    expect(screen.getByTitle(value)).toBeInTheDocument();
  });
});

test('single and multi filter boxes match the pagination page-size height', async () => {
  mockGet.mockResolvedValue({ json: { result: ['账号二', '账号三'] } });

  render(
    <ChartInlineFilterBar
      filters={[
        { id: 'single', column: 'account', label: '账号' },
        { id: 'multi', column: 'region', label: '地区', multi: true },
      ]}
      selection={{}}
      onSelect={jest.fn()}
      datasourceId={1}
      datasourceType="table"
    />,
  );

  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  const single = document.querySelector('.ant-select-single') as HTMLElement;
  const multi = document.querySelector('.ant-select-multiple') as HTMLElement;

  expect(single).toBeInTheDocument();
  expect(multi).toBeInTheDocument();
  // The table chart's "Entries per page" selector is a plain antd Select with
  // size="small", whose height is theme.controlHeightSM. A plain height is
  // ignored here because Superset's Select gives the root flex: 0 inside a
  // column flex container (flex-basis: 0); min/max-height are the constraints
  // that actually apply.
  expect(supersetTheme.controlHeightSM).toBeGreaterThan(0);
  const controlHeight = `${supersetTheme.controlHeightSM}px`;
  [single, multi].forEach(box => {
    expect(getComputedStyle(box).minHeight).toBe(controlHeight);
    expect(getComputedStyle(box).maxHeight).toBe(controlHeight);
  });
  const singleContent = single.querySelector(
    '.ant-select-content',
  ) as HTMLElement;
  const multiContent = multi.querySelector(
    '.ant-select-content',
  ) as HTMLElement;
  expect(getComputedStyle(singleContent).alignSelf).toBe('center');
  expect(getComputedStyle(multiContent).alignSelf).toBe('center');

  // Superset's Select wrapper forces a 32px line-height on the antd root.
  // Resetting it to the theme's standard control line-height makes the value
  // text use the same metrics as the pagination selector.
  const ruleTexts = Array.from(document.styleSheets)
    .flatMap(sheet => {
      try {
        return Array.from(sheet.cssRules).map(rule => rule.cssText);
      } catch {
        return [];
      }
    })
    .map(rule => rule.replace(/\s/g, ''));
  expect(
    ruleTexts.some(
      rule =>
        rule.includes('.ant-select') &&
        rule.includes(`line-height:${supersetTheme.lineHeight}`),
    ),
  ).toBe(true);
});

test('a multi filter selects several values and reports them as an array', async () => {
  const values = ['账号二-北京分公司', '账号三-上海分公司'];
  mockGet.mockResolvedValue({ json: { result: values } });
  const onSelect = jest.fn();

  render(
    <ChartInlineFilterBar
      filters={[{ ...filters[0], multi: true }]}
      selection={{ 'filter-1': [values[0]] }}
      onSelect={onSelect}
      datasourceId={1}
      datasourceType="table"
    />,
  );

  expect(document.querySelector('.ant-select-multiple')).toBeInTheDocument();
  await waitFor(() => expect(mockGet).toHaveBeenCalled());
  await userEvent.click(screen.getByRole('combobox'));
  await userEvent.click(await screen.findByTitle(values[1]));

  await waitFor(() =>
    expect(onSelect).toHaveBeenCalledWith(
      'filter-1',
      expect.arrayContaining(values),
    ),
  );
});

test('shows the configured default value until the user picks something', async () => {
  mockGet.mockResolvedValue({ json: { result: ['账号二', '账号三'] } });

  render(
    <ChartInlineFilterBar
      filters={[{ ...filters[0], defaultValue: '账号二' }]}
      selection={{}}
      onSelect={jest.fn()}
      datasourceId={1}
      datasourceType="table"
    />,
  );

  expect(await screen.findByText('账号二')).toBeInTheDocument();
});

test('a required filter has no clear affordance', async () => {
  mockGet.mockResolvedValue({ json: { result: ['A', 'B'] } });

  const { rerender } = render(
    <ChartInlineFilterBar
      filters={[{ ...filters[0], required: true }]}
      selection={{ 'filter-1': 'A' }}
      onSelect={jest.fn()}
      datasourceId={1}
      datasourceType="table"
    />,
  );
  await waitFor(() => expect(mockGet).toHaveBeenCalled());
  expect(document.querySelector('.ant-select-clear')).not.toBeInTheDocument();

  rerender(
    <ChartInlineFilterBar
      filters={filters}
      selection={{ 'filter-1': 'A' }}
      onSelect={jest.fn()}
      datasourceId={1}
      datasourceType="table"
    />,
  );
  expect(document.querySelector('.ant-select-clear')).toBeInTheDocument();
});

test('a required filter without a default auto-selects the first value', async () => {
  mockGet.mockResolvedValue({ json: { result: ['A', 'B'] } });
  const onSelect = jest.fn();

  render(
    <ChartInlineFilterBar
      filters={[{ ...filters[0], required: true }]}
      selection={{}}
      onSelect={onSelect}
      datasourceId={1}
      datasourceType="table"
    />,
  );

  await waitFor(() => expect(onSelect).toHaveBeenCalledWith('filter-1', 'A'));
});

test('clearing an optional filter reports an explicit null', async () => {
  mockGet.mockResolvedValue({ json: { result: ['A', 'B'] } });
  const onSelect = jest.fn();

  render(
    <ChartInlineFilterBar
      filters={[{ ...filters[0], defaultValue: 'A' }]}
      selection={{ 'filter-1': 'B' }}
      onSelect={onSelect}
      datasourceId={1}
      datasourceType="table"
    />,
  );

  await waitFor(() => expect(mockGet).toHaveBeenCalled());
  const clear = document.querySelector('.ant-select-clear') as HTMLElement;
  expect(clear).toBeInTheDocument();
  await userEvent.click(clear);
  await waitFor(() => expect(onSelect).toHaveBeenCalledWith('filter-1', null));
});

test('a first-value default picks the first option after sorting', async () => {
  // The API returns B before A; the ascending default must still pick A.
  mockGet.mockResolvedValue({ json: { result: ['B', 'A'] } });
  const onSelect = jest.fn();

  render(
    <ChartInlineFilterBar
      filters={[{ ...filters[0], defaultToFirstItem: true }]}
      selection={{}}
      onSelect={onSelect}
      datasourceId={1}
      datasourceType="table"
    />,
  );

  await waitFor(() => expect(onSelect).toHaveBeenCalledWith('filter-1', 'A'));
});

test('a descending first-value default picks the last sorted option', async () => {
  mockGet.mockResolvedValue({ json: { result: ['A', 'B', 'C'] } });
  const onSelect = jest.fn();

  render(
    <ChartInlineFilterBar
      filters={[
        { ...filters[0], defaultToFirstItem: true, sortAscending: false },
      ]}
      selection={{}}
      onSelect={onSelect}
      datasourceId={1}
      datasourceType="table"
    />,
  );

  await waitFor(() => expect(onSelect).toHaveBeenCalledWith('filter-1', 'C'));
});

test('metric-ordered options keep the backend order instead of a value sort', () => {
  const byMetric = [
    { label: 'B', value: 'B' },
    { label: 'A', value: 'A' },
  ];
  expect(
    getInlineFilterOptions({ id: 'f', column: 'c' }, byMetric, true).map(
      o => o.value,
    ),
  ).toEqual(['B', 'A']);
  expect(
    getInlineFilterOptions({ id: 'f', column: 'c' }, byMetric).map(
      o => o.value,
    ),
  ).toEqual(['A', 'B']);
});

test('the values query carries server-side search and cascaded filters', () => {
  expect(buildInlineValuesQuery({})).toBe('');
  const params = new URLSearchParams(
    buildInlineValuesQuery({
      extraFilters: [{ col: 'region', val: 'CN' }],
      whereAdhoc: [{ clause: 'WHERE' }],
      search: '北',
    }),
  );
  expect(params.get('q')).toBe('北');
  expect(JSON.parse(params.get('extra_filters') ?? '[]')).toEqual([
    { col: 'region', val: 'CN' },
  ]);
  expect(
    JSON.parse(params.get('chart_filters') ?? '{}').adhoc_filters,
  ).toHaveLength(1);
});

test('cascaded query filters keep inverse selection semantics', () => {
  expect(
    toInlineQueryFilters([
      { col: 'region', val: ['CN', 'US'], inverse: true },
      { col: 'status', val: 'active', inverse: false },
    ]),
  ).toEqual([
    { col: 'region', op: 'NOT IN', val: ['CN', 'US'] },
    { col: 'status', op: '==', val: 'active' },
  ]);
});

test('dependsOn narrows which sibling selections cascade', async () => {
  mockGet.mockResolvedValue({ json: { result: ['A'] } });
  render(
    <ChartInlineFilterBar
      filters={[
        { id: 'f1', column: 'region' },
        { id: 'f2', column: 'country', dependsOn: ['f1'] },
        { id: 'f3', column: 'city', dependsOn: [] },
      ]}
      selection={{ f1: 'CN' }}
      onSelect={jest.fn()}
      datasourceId={1}
      datasourceType="table"
    />,
  );
  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(3));
  const endpointFor = (column: string) =>
    mockGet.mock.calls
      .map(call => call[0].endpoint as string)
      .find(endpoint => endpoint.includes(`/column/${column}/`)) ?? '';
  // country declares a dependency on region, whose value is selected.
  expect(decodeURIComponent(endpointFor('country'))).toContain(
    '"col":"region","val":"CN"',
  );
  // city explicitly depends on nothing, so it must not inherit region.
  expect(decodeURIComponent(endpointFor('city'))).not.toContain(
    'extra_filters',
  );
});

test('a sort metric orders values through a chart data query', async () => {
  mockPost.mockResolvedValue({
    json: {
      result: [
        {
          data: [
            { account: 'B', sum__sales: 100 },
            { account: 'A', sum__sales: 10 },
          ],
        },
      ],
    },
  });
  const onSelect = jest.fn();
  render(
    <ChartInlineFilterBar
      filters={[
        { ...filters[0], sortMetric: 'sum__sales', defaultToFirstItem: true },
      ]}
      selection={{}}
      onSelect={onSelect}
      datasourceId={1}
      datasourceType="table"
    />,
  );

  await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
  const payload = mockPost.mock.calls[0][0].jsonPayload;
  expect(payload.queries[0].metrics).toEqual(['sum__sales']);
  expect(payload.queries[0].orderby).toEqual([['sum__sales', true]]);
  // "First item" must follow the metric order (B before A), not the alphabet.
  await waitFor(() => expect(onSelect).toHaveBeenCalledWith('filter-1', 'B'));
  expect(mockGet).not.toHaveBeenCalled();
});

test('a failed sort metric query falls back to the values endpoint', async () => {
  mockPost.mockRejectedValue(new Error('metric unavailable'));
  mockGet.mockResolvedValue({ json: { result: ['A', 'B'] } });
  render(
    <ChartInlineFilterBar
      filters={[{ ...filters[0], sortMetric: 'sum__sales' }]}
      selection={{}}
      onSelect={jest.fn()}
      datasourceId={1}
      datasourceType="table"
    />,
  );
  await waitFor(() => expect(mockGet).toHaveBeenCalled());
});

test('turning off the search box removes the editable search input', async () => {
  mockGet.mockResolvedValue({ json: { result: ['A', 'B'] } });
  render(
    <ChartInlineFilterBar
      filters={[{ ...filters[0], showSearch: false }]}
      selection={{}}
      onSelect={jest.fn()}
      datasourceId={1}
      datasourceType="table"
    />,
  );
  await waitFor(() => expect(mockGet).toHaveBeenCalled());
  const input = document.querySelector(
    '.ant-select-selection-search-input',
  ) as HTMLInputElement | null;
  expect(input === null || input.readOnly).toBe(true);
});

test('a text-input filter renders a box and skips the values endpoint', async () => {
  const onSelect = jest.fn();
  render(
    <ChartInlineFilterBar
      filters={[{ ...filters[0], filterType: 'input' }]}
      selection={{}}
      onSelect={onSelect}
      datasourceId={1}
      datasourceType="table"
    />,
  );

  const input = screen.getByRole('textbox');
  expect(input).toHaveAttribute('placeholder', 'Type an exact value');
  expect(document.querySelector('.ant-select')).not.toBeInTheDocument();
  expect(mockGet).not.toHaveBeenCalled();
  expect(mockPost).not.toHaveBeenCalled();

  await userEvent.type(input, 'Beijing');
  await waitFor(() =>
    expect(onSelect).toHaveBeenCalledWith('filter-1', 'Beijing'),
  );
});

test('a fuzzy text-input filter advertises substring matching', async () => {
  render(
    <ChartInlineFilterBar
      filters={[{ ...filters[0], filterType: 'input', matchMode: 'contains' }]}
      selection={{}}
      onSelect={jest.fn()}
      datasourceId={1}
      datasourceType="table"
    />,
  );
  expect(screen.getByRole('textbox')).toHaveAttribute(
    'placeholder',
    'Type to search (contains)',
  );
});

test('a text-input filter shows the configured default as its initial text', () => {
  render(
    <ChartInlineFilterBar
      filters={[{ ...filters[0], filterType: 'input', defaultValue: 'CN' }]}
      selection={{}}
      onSelect={jest.fn()}
      datasourceId={1}
      datasourceType="table"
    />,
  );
  expect(screen.getByRole('textbox')).toHaveValue('CN');
});

test('clearing a text-input filter reports an explicit null', async () => {
  const onSelect = jest.fn();
  render(
    <ChartInlineFilterBar
      filters={[{ ...filters[0], filterType: 'input' }]}
      selection={{ 'filter-1': 'CN' }}
      onSelect={onSelect}
      datasourceId={1}
      datasourceType="table"
    />,
  );
  const input = screen.getByRole('textbox');
  expect(input).toHaveValue('CN');
  await userEvent.clear(input);
  await waitFor(() => expect(onSelect).toHaveBeenCalledWith('filter-1', null));
});

test('a required text-input filter can be emptied and retyped', async () => {
  const onSelect = jest.fn();
  render(
    <ChartInlineFilterBar
      filters={[{ ...filters[0], filterType: 'input', required: true }]}
      selection={{ 'filter-1': 'CN' }}
      onSelect={onSelect}
      datasourceId={1}
      datasourceType="table"
    />,
  );
  const input = screen.getByRole('textbox');
  expect(input).toHaveValue('CN');

  // Deleting the last character must not snap the draft back.
  await userEvent.clear(input);
  expect(input).toHaveValue('');

  // Typing a replacement still commits, and no empty value reaches the query.
  await userEvent.type(input, 'US');
  await waitFor(() => expect(onSelect).toHaveBeenCalledWith('filter-1', 'US'));
  expect(onSelect).not.toHaveBeenCalledWith('filter-1', null);
});

test('a required text-input filter restores the committed value on blur', async () => {
  const onSelect = jest.fn();
  render(
    <ChartInlineFilterBar
      filters={[{ ...filters[0], filterType: 'input', required: true }]}
      selection={{ 'filter-1': 'CN' }}
      onSelect={onSelect}
      datasourceId={1}
      datasourceType="table"
    />,
  );
  const input = screen.getByRole('textbox');
  await userEvent.clear(input);
  expect(input).toHaveValue('');
  await userEvent.tab();
  expect(input).toHaveValue('CN');
  expect(onSelect).not.toHaveBeenCalledWith('filter-1', null);
});

test('a cleared first-value default is not re-applied', async () => {
  mockGet.mockResolvedValue({ json: { result: ['A', 'B'] } });
  const onSelect = jest.fn();

  render(
    <ChartInlineFilterBar
      filters={[{ ...filters[0], defaultToFirstItem: true }]}
      selection={{ 'filter-1': null }}
      onSelect={onSelect}
      datasourceId={1}
      datasourceType="table"
    />,
  );

  await waitFor(() => expect(mockGet).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());
  expect(onSelect).not.toHaveBeenCalled();
});

const runtimeFilters = [
  { col: '年份', op: 'IN', val: ['2026'], valueTransform: '{col}+1' },
];

const chartFiltersFrom = (endpoint: string) => {
  const query = endpoint.split('?')[1] ?? '';
  return JSON.parse(
    new URLSearchParams(query).get('chart_filters') ?? '{}',
  ) as { filters?: Record<string, unknown>[] };
};

test('sends runtime dashboard filters alongside the saved chart filters', () => {
  const query = buildInlineValuesQuery({
    legacyFilters: [{ col: 'legacy', op: '==', val: 'x' }],
    dashboardFilters: runtimeFilters,
  });
  const params = new URLSearchParams(query);
  const chartFilters = JSON.parse(params.get('chart_filters') ?? '{}');
  expect(chartFilters.filters).toEqual([
    { col: 'legacy', op: '==', val: 'x' },
    ...runtimeFilters,
  ]);
  // Runtime filters must not be duplicated into extra_filters: that endpoint
  // only supports plain equality and would drop the valueTransform.
  expect(params.get('extra_filters')).toBeNull();
});

test('requests values with the holder runtime filters and refetches when they change', async () => {
  mockGet.mockResolvedValue({ json: { result: ['2026'] } });
  const baseProps = {
    filters,
    selection: {},
    onSelect: jest.fn(),
    datasourceId: 1,
    datasourceType: 'table',
  };
  const { rerender } = render(
    <ChartInlineFilterBar {...baseProps} dashboardFilters={runtimeFilters} />,
  );

  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
  const firstEndpoint = (mockGet.mock.calls[0][0] as { endpoint: string })
    .endpoint;
  expect(chartFiltersFrom(firstEndpoint).filters).toEqual(runtimeFilters);

  rerender(
    <ChartInlineFilterBar
      {...baseProps}
      dashboardFilters={[{ col: '年份', op: 'IN', val: ['2025'] }]}
    />,
  );

  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  const secondEndpoint = (mockGet.mock.calls[1][0] as { endpoint: string })
    .endpoint;
  expect(chartFiltersFrom(secondEndpoint).filters).toEqual([
    { col: '年份', op: 'IN', val: ['2025'] },
  ]);
});
