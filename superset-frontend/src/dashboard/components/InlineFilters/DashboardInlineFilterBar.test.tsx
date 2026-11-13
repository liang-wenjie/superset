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
import { useDispatch, useSelector } from 'react-redux';
import { render, screen, userEvent } from 'spec/helpers/testing-library';
import { triggerQuery } from 'src/components/Chart/chartAction';
import { setChartInlineFilter } from '../../actions/dashboardState';
import { DashboardInlineFilterBar } from './DashboardInlineFilterBar';

jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useSelector: jest.fn(),
  useDispatch: jest.fn(),
}));

jest.mock('./ChartInlineFilterBar', () => ({
  ChartInlineFilterBar: ({
    selection,
    onSelect,
    dashboardFilters,
    dashboardFilterOverrides,
  }: {
    selection: Record<string, unknown>;
    onSelect: (filterId: string, value: string) => void;
    dashboardFilters?: Record<string, unknown>[];
    dashboardFilterOverrides?: Record<string, unknown>;
  }) => (
    <div>
      <span data-test="selection">{JSON.stringify(selection)}</span>
      <span data-test="dashboard-filters">
        {JSON.stringify(dashboardFilters ?? [])}
      </span>
      <span data-test="dashboard-overrides">
        {JSON.stringify(dashboardFilterOverrides ?? {})}
      </span>
      <button type="button" onClick={() => onSelect('f1', 'C')}>
        pick
      </button>
    </div>
  ),
}));

const mockUseSelector = useSelector as jest.Mock;
const mockUseDispatch = useDispatch as jest.Mock;
const mockDispatch = jest.fn();
const config = [{ id: 'f1', column: 'country' }];
let state: Record<string, unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  state = {
    dashboardState: {
      chartInlineFilters: {
        7: { f1: 'legacy' },
        '7::CHART-a': { f1: 'CN' },
        '7::CHART-b': { f1: 'US' },
      },
    },
  };
  mockUseSelector.mockImplementation(selector => selector(state));
  mockUseDispatch.mockReturnValue(mockDispatch);
});

test('reads only the selection of its own chart instance', () => {
  render(<DashboardInlineFilterBar chartKey="7::CHART-a" rawConfig={config} />);

  expect(screen.getByTestId('selection')).toHaveTextContent('{"f1":"CN"}');
});

test('forwards the holder runtime filters to the option query', () => {
  const dashboardFilters = [
    { col: '年份', op: 'IN', val: ['2026'], valueTransform: '{col}+1' },
  ];
  render(
    <DashboardInlineFilterBar
      chartKey="7::CHART-a"
      rawConfig={config}
      dashboardFilters={dashboardFilters}
    />,
  );

  expect(screen.getByTestId('dashboard-filters')).toHaveTextContent(
    JSON.stringify(dashboardFilters),
  );
});

test('forwards dashboard filter overrides to the inline bar', () => {
  const dashboardFilterOverrides = { country: { value: 'CN' } };
  render(
    <DashboardInlineFilterBar
      chartKey="7::CHART-a"
      rawConfig={config}
      dashboardFilterOverrides={dashboardFilterOverrides}
    />,
  );

  expect(screen.getByTestId('dashboard-overrides')).toHaveTextContent(
    JSON.stringify(dashboardFilterOverrides),
  );
});

test('writes the selection and re-queries only its own chart instance', async () => {
  render(<DashboardInlineFilterBar chartKey="7::CHART-b" rawConfig={config} />);

  await userEvent.click(screen.getByRole('button', { name: 'pick' }));

  expect(mockDispatch).toHaveBeenCalledWith(
    setChartInlineFilter('7::CHART-b', 'f1', 'C'),
  );
  expect(mockDispatch).toHaveBeenCalledWith(triggerQuery(true, '7::CHART-b'));
  // A duplicated slice must not fall back to its numeric slice id: doing so
  // would re-query all holders and store one shared selection.
  const dispatched = mockDispatch.mock.calls.map(([action]) => action);
  expect(dispatched).not.toEqual(
    expect.arrayContaining([setChartInlineFilter(7, 'f1', 'C')]),
  );
  expect(dispatched).not.toEqual(
    expect.arrayContaining([triggerQuery(true, 7)]),
  );
});

test('single-instance charts keep using the numeric slice id', async () => {
  render(<DashboardInlineFilterBar chartKey={7} rawConfig={config} />);

  expect(screen.getByTestId('selection')).toHaveTextContent('{"f1":"legacy"}');
  await userEvent.click(screen.getByRole('button', { name: 'pick' }));

  expect(mockDispatch).toHaveBeenCalledWith(setChartInlineFilter(7, 'f1', 'C'));
  expect(mockDispatch).toHaveBeenCalledWith(triggerQuery(true, 7));
});
