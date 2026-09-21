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
import { TABS_TYPE, TAB_TYPE } from 'src/dashboard/util/componentTypes';
import type { Layout, LayoutItem } from 'src/dashboard/types';
import { getDirectoryTree } from './getDirectoryTree';

const makeTab = (id: string, children: string[] = []): LayoutItem => ({
  id,
  type: TAB_TYPE,
  children,
  parents: [],
  meta: { text: id },
});

const makeTabs = (id: string, children: string[] = []): LayoutItem => ({
  id,
  type: TABS_TYPE,
  children,
  parents: [],
  meta: {},
});

const makeChart = (id: string): LayoutItem => ({
  id,
  type: 'CHART',
  children: [],
  parents: [],
  meta: { chartId: 1 },
});

test('flattens direct children as root nodes at depth 0', () => {
  const tab1 = makeTab('TAB-1');
  const tab2 = makeTab('TAB-2');
  const directory = makeTabs('TABS-DIR', ['TAB-1', 'TAB-2']);
  const layout: Layout = {
    'TABS-DIR': directory,
    'TAB-1': tab1,
    'TAB-2': tab2,
  };

  const tree = getDirectoryTree(directory, layout);
  expect(tree).toEqual([
    { id: 'TAB-1', depth: 0, children: [] },
    { id: 'TAB-2', depth: 0, children: [] },
  ]);
});

test('nests tabs owned by a descendant TABS component level by level', () => {
  const subTab1 = makeTab('TAB-1-1');
  const subTab2 = makeTab('TAB-1-2');
  const nestedTabs = makeTabs('TABS-NESTED', ['TAB-1-1', 'TAB-1-2']);
  const tab1 = makeTab('TAB-1', ['TABS-NESTED']);
  const tab2 = makeTab('TAB-2');
  const directory = makeTabs('TABS-DIR', ['TAB-1', 'TAB-2']);
  const layout: Layout = {
    'TABS-DIR': directory,
    'TAB-1': tab1,
    'TAB-2': tab2,
    'TABS-NESTED': nestedTabs,
    'TAB-1-1': subTab1,
    'TAB-1-2': subTab2,
  };

  const tree = getDirectoryTree(directory, layout);
  expect(tree).toEqual([
    {
      id: 'TAB-1',
      depth: 0,
      children: [
        { id: 'TAB-1-1', depth: 1, children: [] },
        { id: 'TAB-1-2', depth: 1, children: [] },
      ],
    },
    { id: 'TAB-2', depth: 0, children: [] },
  ]);
});

test('supports arbitrarily deep nesting', () => {
  const leaf = makeTab('TAB-1-1-1');
  const innerTabs = makeTabs('TABS-INNER', ['TAB-1-1-1']);
  const section = makeTab('TAB-1-1', ['TABS-INNER']);
  const nestedTabs = makeTabs('TABS-NESTED', ['TAB-1-1']);
  const chapter = makeTab('TAB-1', ['TABS-NESTED']);
  const directory = makeTabs('TABS-DIR', ['TAB-1']);
  const layout: Layout = {
    'TABS-DIR': directory,
    'TAB-1': chapter,
    'TABS-NESTED': nestedTabs,
    'TAB-1-1': section,
    'TABS-INNER': innerTabs,
    'TAB-1-1-1': leaf,
  };

  const tree = getDirectoryTree(directory, layout);
  expect(tree).toEqual([
    {
      id: 'TAB-1',
      depth: 0,
      children: [
        {
          id: 'TAB-1-1',
          depth: 1,
          children: [{ id: 'TAB-1-1-1', depth: 2, children: [] }],
        },
      ],
    },
  ]);
});

test('merges tabs from multiple TABS components inside one tab', () => {
  const leftTabs = makeTabs('TABS-LEFT', ['TAB-A', 'TAB-B']);
  const rightTabs = makeTabs('TABS-RIGHT', ['TAB-C']);
  const tab1 = makeTab('TAB-1', ['TABS-LEFT', 'TABS-RIGHT']);
  const directory = makeTabs('TABS-DIR', ['TAB-1']);
  const layout: Layout = {
    'TABS-DIR': directory,
    'TAB-1': tab1,
    'TABS-LEFT': leftTabs,
    'TABS-RIGHT': rightTabs,
    'TAB-A': makeTab('TAB-A'),
    'TAB-B': makeTab('TAB-B'),
    'TAB-C': makeTab('TAB-C'),
  };

  const tree = getDirectoryTree(directory, layout);
  expect(tree).toEqual([
    {
      id: 'TAB-1',
      depth: 0,
      children: [
        { id: 'TAB-A', depth: 1, children: [] },
        { id: 'TAB-B', depth: 1, children: [] },
        { id: 'TAB-C', depth: 1, children: [] },
      ],
    },
  ]);
});

test('ignores non-tab children when building the tree', () => {
  const chart = makeChart('CHART-1');
  const tab1 = makeTab('TAB-1', ['CHART-1']);
  const directory = makeTabs('TABS-DIR', ['TAB-1']);
  const layout: Layout = {
    'TABS-DIR': directory,
    'TAB-1': tab1,
    'CHART-1': chart,
  };

  const tree = getDirectoryTree(directory, layout);
  expect(tree).toEqual([{ id: 'TAB-1', depth: 0, children: [] }]);
});

test('skips tabs whose layout entries are missing', () => {
  const tab1 = makeTab('TAB-1');
  const directory = makeTabs('TABS-DIR', ['TAB-MISSING', 'TAB-1']);
  const layout: Layout = {
    'TABS-DIR': directory,
    'TAB-1': tab1,
  };

  const tree = getDirectoryTree(directory, layout);
  expect(tree).toEqual([{ id: 'TAB-1', depth: 0, children: [] }]);
});
