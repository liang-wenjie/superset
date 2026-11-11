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
import type { AnyAction } from 'redux';
import dashboardStateReducer from './dashboardState';
import {
  REMOVE_SLICE,
  SET_CHART_INLINE_FILTER,
  setChartInlineFilter,
} from '../actions/dashboardState';
import type { DashboardState } from '../types';

type Reducer = (
  state: Partial<DashboardState> | undefined,
  action: AnyAction,
) => Partial<DashboardState>;
const reducer = dashboardStateReducer as Reducer;

describe('inline filters on duplicated chart holders', () => {
  test('uses the chart state key instead of a slice id in the action', () => {
    expect(setChartInlineFilter('7::CHART-a', 'f1', 'CN')).toEqual({
      type: SET_CHART_INLINE_FILTER,
      chartKey: '7::CHART-a',
      filterId: 'f1',
      value: 'CN',
    });
  });

  test('keeps one independent selection per holder', () => {
    const first = reducer({}, setChartInlineFilter('7::CHART-a', 'f1', 'CN'));
    const second = reducer(
      first,
      setChartInlineFilter('7::CHART-b', 'f1', 'US'),
    );
    const third = reducer(second, setChartInlineFilter(7, 'f1', 'legacy'));

    expect(third.chartInlineFilters).toEqual({
      '7::CHART-a': { f1: 'CN' },
      '7::CHART-b': { f1: 'US' },
      7: { f1: 'legacy' },
    });
  });

  test('keeps an explicit clear on an instance key', () => {
    const selected = reducer(
      { chartInlineFilters: { '7::CHART-a': { f1: 'CN' } } },
      setChartInlineFilter('7::CHART-a', 'f1', null),
    );
    expect(selected.chartInlineFilters?.['7::CHART-a']).toEqual({ f1: null });
    // Clearing one holder must not erase the sibling's selection.
    expect(selected.chartInlineFilters?.['7::CHART-b']).toBeUndefined();
  });

  test('single-instance charts still use the numeric slice id', () => {
    const result = reducer({}, setChartInlineFilter(7, 'f1', ['A', 'B']));
    expect(result.chartInlineFilters?.[7]).toEqual({ f1: ['A', 'B'] });
  });

  test('REMOVE_SLICE clears the numeric key and every instance key', () => {
    const state = {
      sliceIds: [7, 8],
      chartInlineFilters: {
        7: { f1: 'legacy' },
        '7::CHART-a': { f1: 'CN' },
        '7::CHART-b': { f1: 'US' },
        8: { f1: 'other' },
        '8::CHART-c': { f1: 'other instance' },
        '17::CHART-d': { f1: 'similar prefix' },
      },
    } as unknown as Partial<DashboardState>;

    const result = reducer(state, { type: REMOVE_SLICE, sliceId: 7 });

    expect(result.chartInlineFilters).toEqual({
      8: { f1: 'other' },
      '8::CHART-c': { f1: 'other instance' },
      '17::CHART-d': { f1: 'similar prefix' },
    });
  });
});
