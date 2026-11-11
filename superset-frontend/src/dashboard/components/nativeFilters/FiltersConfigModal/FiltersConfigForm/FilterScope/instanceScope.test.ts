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
import { Layout } from 'src/dashboard/types';
import {
  CHART_TYPE,
  DASHBOARD_ROOT_TYPE,
} from 'src/dashboard/util/componentTypes';
import { DASHBOARD_ROOT_ID } from 'src/dashboard/util/constants';
import { findFilterScope, getTreeCheckedItems } from './utils';

const layout = {
  [DASHBOARD_ROOT_ID]: {
    id: DASHBOARD_ROOT_ID,
    type: DASHBOARD_ROOT_TYPE,
    children: ['CHART-a', 'CHART-b', 'CHART-c', 'CHART-z'],
  },
  'CHART-a': {
    id: 'CHART-a',
    type: CHART_TYPE,
    meta: { chartId: 127 },
    parents: [DASHBOARD_ROOT_ID],
  },
  'CHART-b': {
    id: 'CHART-b',
    type: CHART_TYPE,
    meta: { chartId: 127 },
    parents: [DASHBOARD_ROOT_ID],
  },
  'CHART-c': {
    id: 'CHART-c',
    type: CHART_TYPE,
    meta: { chartId: 127 },
    parents: [DASHBOARD_ROOT_ID],
  },
  'CHART-z': {
    id: 'CHART-z',
    type: CHART_TYPE,
    meta: { chartId: 128 },
    parents: [DASHBOARD_ROOT_ID],
  },
  version: 'v1',
} as unknown as Layout;

test('excludes a single holder without dropping the whole slice', () => {
  const scope = findFilterScope(['CHART-a', 'CHART-b', 'CHART-z'], layout);
  expect(scope.excluded).not.toContain(127);
  expect(scope.excludedInstances).toEqual(['CHART-c']);
});

test('keeps the legacy chart-id exclusion when every holder is unchecked', () => {
  const scope = findFilterScope(['CHART-z'], layout);
  expect(scope.excluded).toContain(127);
  expect(scope.excludedInstances).toBeUndefined();
});

test('does not emit instance exclusions when all holders are checked', () => {
  const scope = findFilterScope(
    ['CHART-a', 'CHART-b', 'CHART-c', 'CHART-z'],
    layout,
  );
  expect(scope.excluded).toEqual([]);
  expect(scope.excludedInstances).toBeUndefined();
});

test('restores per-instance checkboxes from the saved scope', () => {
  const scope: NativeFilterScope = {
    rootPath: [DASHBOARD_ROOT_ID],
    excluded: [],
    excludedInstances: ['CHART-c'],
  };
  const checked = getTreeCheckedItems(scope, layout);
  expect(checked).toContain('CHART-a');
  expect(checked).toContain('CHART-b');
  expect(checked).toContain('CHART-z');
  expect(checked).not.toContain('CHART-c');
});
