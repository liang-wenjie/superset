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
import { ComponentProps } from 'react';
import {
  render,
  screen,
  userEvent,
  within,
} from 'spec/helpers/testing-library';
import {
  DASHBOARD_GRID_ID,
  DASHBOARD_ROOT_ID,
  NEW_DIRECTORY_TABS_ID,
  NEW_TAB_ID,
} from 'src/dashboard/util/constants';
import {
  DASHBOARD_GRID_TYPE,
  DASHBOARD_ROOT_TYPE,
  TABS_TYPE,
  TAB_TYPE,
} from 'src/dashboard/util/componentTypes';
import type { Layout, LayoutItem } from 'src/dashboard/types';
import DirectoryTabsRenderer from './DirectoryTabsRenderer';

const makeComponent = (
  id: string,
  type: string,
  children: string[],
  meta: LayoutItem['meta'] = {},
  parents: string[] = [],
): LayoutItem => ({ id, type, children, meta, parents });

const layout: Layout = {
  [DASHBOARD_ROOT_ID]: makeComponent(
    DASHBOARD_ROOT_ID,
    DASHBOARD_ROOT_TYPE,
    [DASHBOARD_GRID_ID],
    {},
  ),
  [DASHBOARD_GRID_ID]: makeComponent(
    DASHBOARD_GRID_ID,
    DASHBOARD_GRID_TYPE,
    ['TABS-DIR'],
    {},
    [DASHBOARD_ROOT_ID],
  ),
  'TABS-DIR': makeComponent(
    'TABS-DIR',
    TABS_TYPE,
    ['TAB-1', 'TAB-2'],
    { tabMode: 'directory' },
    [DASHBOARD_ROOT_ID, DASHBOARD_GRID_ID],
  ),
  'TAB-1': makeComponent(
    'TAB-1',
    TAB_TYPE,
    ['TABS-NESTED'],
    { text: 'Chapter 1' },
    [DASHBOARD_ROOT_ID, DASHBOARD_GRID_ID, 'TABS-DIR'],
  ),
  'TABS-NESTED': makeComponent(
    'TABS-NESTED',
    TABS_TYPE,
    ['TAB-1-1', 'TAB-1-2'],
    {},
    [DASHBOARD_ROOT_ID, DASHBOARD_GRID_ID, 'TABS-DIR', 'TAB-1'],
  ),
  'TAB-1-1': makeComponent('TAB-1-1', TAB_TYPE, [], { text: 'Section 1.1' }, [
    DASHBOARD_ROOT_ID,
    DASHBOARD_GRID_ID,
    'TABS-DIR',
    'TAB-1',
    'TABS-NESTED',
  ]),
  'TAB-1-2': makeComponent('TAB-1-2', TAB_TYPE, [], { text: 'Section 1.2' }, [
    DASHBOARD_ROOT_ID,
    DASHBOARD_GRID_ID,
    'TABS-DIR',
    'TAB-1',
    'TABS-NESTED',
  ]),
  'TAB-2': makeComponent(
    'TAB-2',
    TAB_TYPE,
    ['TABS-NESTED-2'],
    { text: 'Chapter 2' },
    [DASHBOARD_ROOT_ID, DASHBOARD_GRID_ID, 'TABS-DIR'],
  ),
  'TABS-NESTED-2': makeComponent('TABS-NESTED-2', TABS_TYPE, ['TAB-2-1'], {}, [
    DASHBOARD_ROOT_ID,
    DASHBOARD_GRID_ID,
    'TABS-DIR',
    'TAB-2',
  ]),
  'TAB-2-1': makeComponent('TAB-2-1', TAB_TYPE, [], { text: 'Section 2.1' }, [
    DASHBOARD_ROOT_ID,
    DASHBOARD_GRID_ID,
    'TABS-DIR',
    'TAB-2',
    'TABS-NESTED-2',
  ]),
};

const tabsComponent = layout['TABS-DIR'];

const makeTabItems = (
  keys: string[],
): ComponentProps<typeof DirectoryTabsRenderer>['tabItems'] =>
  keys.map(key => ({
    key,
    label: <div />,
    closeIcon: <div />,
    children: <div data-test="tab-content">{`content-of-${key}`}</div>,
  }));

type DirectoryProps = ComponentProps<typeof DirectoryTabsRenderer>;

const createProps = (
  overrides: Partial<DirectoryProps> = {},
): DirectoryProps => ({
  tabItems: makeTabItems(['TAB-1', 'TAB-2']),
  editMode: false,
  renderHoverMenu: true,
  tabsDragSourceRef: { current: null },
  handleDeleteComponent: jest.fn(),
  deleteComponent: jest.fn(),
  tabsComponent,
  activeKey: 'TAB-1',
  tabIds: ['TAB-1', 'TAB-2'],
  handleClickTab: jest.fn(),
  handleEdit: jest.fn(),
  createComponent: jest.fn() as DirectoryProps['createComponent'],
  onChangeTab: jest.fn(),
  updateComponents: jest.fn(),
  ...overrides,
});

const directPathToTab1 = [
  DASHBOARD_ROOT_ID,
  DASHBOARD_GRID_ID,
  'TABS-DIR',
  'TAB-1',
];

const directPathToSection11 = [
  DASHBOARD_ROOT_ID,
  DASHBOARD_GRID_ID,
  'TABS-DIR',
  'TAB-1',
  'TABS-NESTED',
  'TAB-1-1',
];

const renderDirectory = (
  props: Partial<DirectoryProps> = {},
  directPathToChild: string[] = directPathToTab1,
  layoutOverride: Record<string, LayoutItem> = {},
) => {
  const mergedProps = createProps(props);
  return {
    ...render(<DirectoryTabsRenderer {...mergedProps} />, {
      useRedux: true,
      initialState: {
        dashboardLayout: {
          present: { ...layout, ...layoutOverride },
          past: [],
          future: [],
        },
        dashboardState: { directPathToChild },
      },
    }),
    props: mergedProps,
  };
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('renders the nested hierarchy level by level', () => {
  renderDirectory();
  expect(screen.getByText('Chapter 1')).toBeInTheDocument();
  expect(screen.getByText('Section 1.1')).toBeInTheDocument();
  expect(screen.getByText('Section 1.2')).toBeInTheDocument();
  expect(screen.getByText('Chapter 2')).toBeInTheDocument();
  expect(screen.getByText('Section 2.1')).toBeInTheDocument();

  const chapter1Row = screen
    .getByText('Chapter 1')
    .closest('[data-test="directory-tree-item"]');
  const section11Row = screen
    .getByText('Section 1.1')
    .closest('[data-test="directory-tree-item"]');
  expect(chapter1Row).toHaveAttribute('data-depth', '0');
  expect(section11Row).toHaveAttribute('data-depth', '1');
});

test('highlights the active node and its ancestors', () => {
  renderDirectory({}, directPathToSection11);

  const chapter1Row = screen
    .getByText('Chapter 1')
    .closest('[data-test="directory-tree-item"]');
  const section11Row = screen
    .getByText('Section 1.1')
    .closest('[data-test="directory-tree-item"]');
  const section12Row = screen
    .getByText('Section 1.2')
    .closest('[data-test="directory-tree-item"]');

  expect(chapter1Row).toHaveAttribute('data-in-path', 'true');
  expect(section11Row).toHaveAttribute('data-active', 'true');
  expect(section12Row).toHaveAttribute('data-active', 'false');
  expect(screen.getByRole('button', { name: 'Section 1.1' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('collapses and expands a branch with children', async () => {
  renderDirectory();

  const chapter2Row = screen
    .getByText('Chapter 2')
    .closest('[data-test="directory-tree-item"]') as HTMLElement;
  expect(screen.getByText('Section 2.1')).toBeInTheDocument();

  await userEvent.click(
    within(chapter2Row).getByRole('button', { name: 'Collapse' }),
  );
  expect(screen.queryByText('Section 2.1')).not.toBeInTheDocument();

  await userEvent.click(
    within(chapter2Row).getByRole('button', { name: 'Expand' }),
  );
  expect(screen.getByText('Section 2.1')).toBeInTheDocument();
});

test('keeps the active path expanded even when collapsed', async () => {
  renderDirectory({}, directPathToSection11);

  const chapter1Row = screen
    .getByText('Chapter 1')
    .closest('[data-test="directory-tree-item"]') as HTMLElement;
  await userEvent.click(
    within(chapter1Row).getByRole('button', { name: 'Collapse' }),
  );
  // Section 1.1 is on the active path, so it stays visible
  expect(screen.getByText('Section 1.1')).toBeInTheDocument();
  expect(screen.getByText('Section 1.2')).toBeInTheDocument();
});

test('clicking a direct child selects it through handleClickTab', async () => {
  const { props } = renderDirectory();
  await userEvent.click(screen.getByRole('button', { name: 'Chapter 2' }));
  expect(props.handleClickTab).toHaveBeenCalledWith(1);
  expect(props.onChangeTab).not.toHaveBeenCalled();
});

test('clicking a nested node navigates with its full path', async () => {
  const { props } = renderDirectory();
  await userEvent.click(screen.getByRole('button', { name: 'Section 1.1' }));
  expect(props.handleClickTab).not.toHaveBeenCalled();
  expect(props.onChangeTab).toHaveBeenCalledWith({
    pathToTabIndex: [
      DASHBOARD_ROOT_ID,
      DASHBOARD_GRID_ID,
      'TABS-DIR',
      'TAB-1',
      'TABS-NESTED',
      'TAB-1-1',
    ],
  });
});

test('clicking the already-active node is a no-op', async () => {
  const { props } = renderDirectory();
  await userEvent.click(screen.getByRole('button', { name: 'Chapter 1' }));
  expect(props.handleClickTab).not.toHaveBeenCalled();
  expect(props.onChangeTab).not.toHaveBeenCalled();
});

test('clicking a node in edit mode still navigates', async () => {
  const { props } = renderDirectory({ editMode: true });
  await userEvent.click(screen.getByRole('button', { name: 'Chapter 2' }));
  expect(props.handleClickTab).toHaveBeenCalledWith(1);
});

test('renames a node by double-clicking its title', async () => {
  const { props } = renderDirectory({ editMode: true });

  await userEvent.dblClick(screen.getByRole('button', { name: 'Chapter 1' }));

  const titleInput = screen.getByDisplayValue('Chapter 1');
  await userEvent.clear(titleInput);
  await userEvent.type(titleInput, 'Renamed Chapter{enter}');

  expect(props.updateComponents).toHaveBeenCalledWith({
    'TAB-1': expect.objectContaining({
      id: 'TAB-1',
      meta: expect.objectContaining({ text: 'Renamed Chapter' }),
    }),
  });
});

test('renders the active tab content so charts can be mounted', () => {
  const { rerender } = renderDirectory();
  expect(screen.getByTestId('tab-content')).toHaveTextContent(
    'content-of-TAB-1',
  );

  rerender(<DirectoryTabsRenderer {...createProps({ activeKey: 'TAB-2' })} />);
  expect(screen.getByTestId('tab-content')).toHaveTextContent(
    'content-of-TAB-2',
  );
});

test('edit mode shows toolbar and add control; nodes expose remove buttons', async () => {
  const { props } = renderDirectory({ editMode: true });

  expect(screen.getByTestId('directory-toolbar')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add tab' })).toBeInTheDocument();
  // Each tree node carries its own remove (x) button; the toolbar no longer
  // needs an extra remove control.
  expect(screen.getAllByRole('button', { name: 'Remove tab' }).length).toBeGreaterThan(0);

  await userEvent.click(screen.getByRole('button', { name: 'Add tab' }));
  expect(props.handleEdit).toHaveBeenCalledWith(expect.anything(), 'add');
});

test('view mode hides editing controls', () => {
  renderDirectory({ editMode: false });

  expect(screen.queryByTestId('directory-toolbar')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Add tab' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Remove tab' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Remove tab' }),
  ).not.toBeInTheDocument();
});


test('Add subtab creates a nested directory when the node has none', async () => {
  const { props } = renderDirectory({ editMode: true });

  const chapter1Row = screen
    .getByText('Chapter 1')
    .closest('[data-test="directory-tree-item"]') as HTMLElement;
  await userEvent.click(
    within(chapter1Row).getByRole('button', { name: 'Add subtab' }),
  );

  expect(props.createComponent).toHaveBeenCalledWith({
    destination: { id: 'TAB-1', type: TAB_TYPE, index: 1 },
    dragging: {
      id: NEW_DIRECTORY_TABS_ID,
      type: TABS_TYPE,
      meta: { tabMode: 'directory' },
    },
  });
  // adding a subtab must not navigate or trigger a plain tab add
  expect(props.handleClickTab).not.toHaveBeenCalled();
  expect(props.handleEdit).not.toHaveBeenCalled();
});

test('Add subtab adds a chapter to an existing nested directory', async () => {
  // Give TAB-1 a real nested directory (tabMode directory) so the reuse path
  // is exercised.
  const layoutWithDirectoryNested = {
    ...layout,
    'TABS-NESTED': { ...layout['TABS-NESTED'], meta: { tabMode: 'directory' } },
  };
  const { props } = renderDirectory(
    { editMode: true },
    directPathToTab1,
    layoutWithDirectoryNested,
  );

  const chapter1Row = screen
    .getByText('Chapter 1')
    .closest('[data-test="directory-tree-item"]') as HTMLElement;
  await userEvent.click(
    within(chapter1Row).getByRole('button', { name: 'Add subtab' }),
  );

  expect(props.createComponent).toHaveBeenCalledWith({
    destination: { id: 'TABS-NESTED', type: TABS_TYPE, index: 2 },
    dragging: { id: NEW_TAB_ID, type: TAB_TYPE },
  });
});

test('deletes a direct node through its remove button', async () => {
  const { props } = renderDirectory({ editMode: true });

  const chapter2Row = screen
    .getByText('Chapter 2')
    .closest('[data-test="directory-tree-item"]') as HTMLElement;
  await userEvent.click(
    within(chapter2Row).getByRole('button', { name: 'Remove tab' }),
  );

  expect(props.deleteComponent).toHaveBeenCalledWith('TAB-2', 'TABS-DIR');
});

test('deletes a nested node with its nested parent', async () => {
  const { props } = renderDirectory({ editMode: true });

  const section11Row = screen
    .getByText('Section 1.1')
    .closest('[data-test="directory-tree-item"]') as HTMLElement;
  await userEvent.click(
    within(section11Row).getByRole('button', { name: 'Remove tab' }),
  );

  expect(props.deleteComponent).toHaveBeenCalledWith('TAB-1-1', 'TABS-NESTED');
});

test('renders a nested directory as a content pane only', () => {
  renderDirectory({
    tabsComponent: layout['TABS-NESTED'],
    tabIds: ['TAB-1-1', 'TAB-1-2'],
    activeKey: 'TAB-1-1',
    tabItems: makeTabItems(['TAB-1-1', 'TAB-1-2']),
  });

  // No redundant tree/tab bar inside the content area
  expect(screen.queryByTestId('directory-tree')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add tab' })).not.toBeInTheDocument();
  expect(screen.getByText('content-of-TAB-1-1')).toBeInTheDocument();
});
