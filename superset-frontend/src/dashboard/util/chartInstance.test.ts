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
import { NativeFilterScope } from '@superset-ui/core';
import { Layout } from '../types';
import { CHART_TYPE, DASHBOARD_ROOT_TYPE } from './componentTypes';
import {
  countChartInstances,
  expandChartStateKeys,
  getChartInstanceCounts,
  getChartInstanceIds,
  getChartInstanceKeys,
  getChartStateKey,
  isInstanceExcluded,
  isInstanceScopedKey,
  parseChartIdFromStateKey,
  resolveFilterTarget,
  getMappedChartIds,
} from './chartInstance';

const layout = {
  ROOT_ID: {
    id: 'ROOT_ID',
    type: DASHBOARD_ROOT_TYPE,
    children: ['CHART-a', 'CHART-b', 'CHART-c', 'CHART-z'],
  },
  'CHART-a': {
    id: 'CHART-a',
    type: CHART_TYPE,
    meta: { chartId: 127 },
    parents: ['ROOT_ID'],
  },
  'CHART-b': {
    id: 'CHART-b',
    type: CHART_TYPE,
    meta: { chartId: 127 },
    parents: ['ROOT_ID'],
  },
  'CHART-c': {
    id: 'CHART-c',
    type: CHART_TYPE,
    meta: { chartId: 127 },
    parents: ['ROOT_ID'],
  },
  'CHART-z': {
    id: 'CHART-z',
    type: CHART_TYPE,
    meta: { chartId: 128 },
    parents: ['ROOT_ID'],
  },
  // position_json also carries non-layout entries (e.g. a version string)
  version: 'v1',
} as unknown as Layout;

test('counts instance-scoped targets as explicit chart mappings', () => {
  expect(
    getMappedChartIds(
      [{ chartIds: [128] }, { instanceIds: ['CHART-b'] }],
      layout,
    ),
  ).toEqual(new Set([128, 127]));
  expect(getMappedChartIds(undefined, layout)).toEqual(new Set());
  expect(getMappedChartIds([{ chartIds: [127] }], undefined)).toEqual(
    new Set([127]),
  );
  expect(
    getMappedChartIds([{ instanceIds: ['CHART-missing'] }], layout),
  ).toEqual(new Set());
});

test('counts duplicate holders per slice id', () => {
  expect(getChartInstanceCounts(layout)).toEqual({ 127: 3, 128: 1 });
  expect(countChartInstances(layout, 127)).toBe(3);
  expect(countChartInstances(undefined, 127)).toBe(0);
});

test('lists the layout ids of every holder of a slice', () => {
  expect(getChartInstanceIds(layout, 127)).toEqual([
    'CHART-a',
    'CHART-b',
    'CHART-c',
  ]);
});

test('keeps the numeric key for single-instance charts', () => {
  expect(getChartStateKey(128, 'CHART-z', 1)).toBe(128);
  expect(isInstanceScopedKey(128)).toBe(false);
  expect(parseChartIdFromStateKey(128)).toBe(128);
});

test('creates one state key per holder for duplicated slices', () => {
  const first = getChartStateKey(127, 'CHART-a', 3);
  const second = getChartStateKey(127, 'CHART-b', 3);
  expect(first).not.toBe(second);
  expect(isInstanceScopedKey(first)).toBe(true);
  expect(parseChartIdFromStateKey(first)).toBe(127);
  expect(parseChartIdFromStateKey(second)).toBe(127);
});

test('instance-scoped filter targets win over legacy chart targets', () => {
  const targets = [
    { chartIds: [127], valueTransform: 'legacy' },
    { instanceIds: ['CHART-b'], valueTransform: 'for-b' },
  ];
  expect(resolveFilterTarget(targets, 127, 'CHART-b')?.valueTransform).toBe(
    'for-b',
  );
  expect(resolveFilterTarget(targets, 127, 'CHART-a')?.valueTransform).toBe(
    'legacy',
  );
  expect(resolveFilterTarget(targets, 128, 'CHART-z')).toBeUndefined();
  expect(resolveFilterTarget(undefined, 127, 'CHART-b')).toBeUndefined();
});

test('excludes only the named holder from a filter scope', () => {
  const scope: NativeFilterScope = {
    rootPath: ['ROOT_ID'],
    excluded: [],
    excludedInstances: ['CHART-c'],
  };
  expect(isInstanceExcluded(scope, 'CHART-c')).toBe(true);
  expect(isInstanceExcluded(scope, 'CHART-a')).toBe(false);
  expect(isInstanceExcluded(scope, undefined)).toBe(false);
  expect(isInstanceExcluded(undefined, 'CHART-c')).toBe(false);
});

test('expands slice ids into every instance state key for refreshes', () => {
  expect(expandChartStateKeys(layout, [127, 128])).toEqual([
    '127::CHART-a',
    '127::CHART-b',
    '127::CHART-c',
    128,
  ]);
});

test('expands numeric-string slice ids coming from filter scopes', () => {
  // getAffectedOwnDataCharts returns Object.keys(...), i.e. strings like '127'.
  expect(expandChartStateKeys(layout, ['127', '128'])).toEqual([
    '127::CHART-a',
    '127::CHART-b',
    '127::CHART-c',
    '128',
  ]);
});

test('passes instance keys through without expanding twice', () => {
  expect(new Set(expandChartStateKeys(layout, ['127::CHART-b', 127]))).toEqual(
    new Set(['127::CHART-a', '127::CHART-b', '127::CHART-c']),
  );
});

test('leaves ids untouched when there is no layout', () => {
  expect(expandChartStateKeys(undefined, [127, '127'])).toEqual([127, '127']);
});

test('lists only duplicated holders as instance keys', () => {
  expect(getChartInstanceKeys(layout)).toEqual([
    { stateKey: '127::CHART-a', chartId: 127 },
    { stateKey: '127::CHART-b', chartId: 127 },
    { stateKey: '127::CHART-c', chartId: 127 },
  ]);
  expect(getChartInstanceKeys(undefined)).toEqual([]);
});

test('does not mistake numeric-string Redux keys for instance keys', () => {
  // Object.keys(charts) always returns strings, even for numeric chart ids.
  // Treating '127' as instance-scoped would delete every chart on layout sync.
  expect(isInstanceScopedKey('127')).toBe(false);
  expect(isInstanceScopedKey('128')).toBe(false);
  expect(isInstanceScopedKey('127::CHART-a')).toBe(true);
});
