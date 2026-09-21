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
import { TABS_TYPE } from 'src/dashboard/util/componentTypes';
import type { Layout, LayoutItem } from 'src/dashboard/types';

export interface DirectoryTreeNode {
  /** Tab component id */
  id: string;
  /** Nesting depth: 0 for the direct children of the directory */
  depth: number;
  /** Tabs owned by descendant TABS components, level by level */
  children: DirectoryTreeNode[];
}

const buildNode = (
  tabId: string,
  layout: Layout,
  depth: number,
): DirectoryTreeNode | null => {
  const tab = layout[tabId];
  if (!tab) {
    return null;
  }

  // A tab's children can contain one or more TABS components; every tab
  // owned by those TABS components becomes a nested directory node.
  const nestedTabIds: string[] = [];
  tab.children.forEach(childId => {
    const child = layout[childId];
    if (child?.type === TABS_TYPE) {
      nestedTabIds.push(...child.children);
    }
  });

  const children = nestedTabIds
    .map(id => buildNode(id, layout, depth + 1))
    .filter((node): node is DirectoryTreeNode => node !== null);

  return { id: tabId, depth, children };
};

/**
 * Extract the nested TABS/TAB hierarchy of a directory tabs component as a
 * tree. Each direct child tab becomes a root node; tabs owned by descendant
 * TABS components (at any depth) become nested nodes, mirroring the
 * chapter/section structure of the dashboard.
 */
export const getDirectoryTree = (
  tabsComponent: LayoutItem,
  layout: Layout,
): DirectoryTreeNode[] =>
  tabsComponent.children
    .map(tabId => buildNode(tabId, layout, 0))
    .filter((node): node is DirectoryTreeNode => node !== null);
