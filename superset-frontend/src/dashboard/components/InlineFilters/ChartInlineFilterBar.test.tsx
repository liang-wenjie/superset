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
import { SupersetClient } from '@superset-ui/core';
import { render, screen, userEvent, waitFor } from '@superset-ui/core/spec';
import {
  ChartInlineFilterBar,
  getInlineFilterPopupWidth,
} from './ChartInlineFilterBar';

jest.mock('@superset-ui/core', () => ({
  ...jest.requireActual('@superset-ui/core'),
  SupersetClient: {
    get: jest.fn(),
  },
}));

const mockGet = SupersetClient.get as jest.Mock;
const filters = [{ id: 'filter-1', column: 'account', label: '' }];

beforeEach(() => {
  mockGet.mockReset();
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
