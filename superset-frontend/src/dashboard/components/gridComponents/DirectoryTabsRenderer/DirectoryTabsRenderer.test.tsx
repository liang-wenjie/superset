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
  tabsComponent,
  activeKey: 'TAB-1',
  tabIds: ['TAB-1', 'TAB-2'],
  handleClickTab: jest.fn(),
  handleEdit: jest.fn(),
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
) => {
  const mergedProps = createProps(props);
  return {
    ...render(<DirectoryTabsRenderer {...mergedProps} />, {
      useRedux: true,
      initialState: {
        dashboardLayout: { present: layout, past: [], future: [] },
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

test('renames a node through EditableTitle', async () => {
  const { props } = renderDirectory({ editMode: true });

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

test('edit mode shows toolbar, add and remove controls', async () => {
  const { props } = renderDirectory({ editMode: true });

  expect(screen.getByTestId('directory-toolbar')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add tab' })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Remove tab' }),
  ).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Add tab' }));
  expect(props.handleEdit).toHaveBeenCalledWith(expect.anything(), 'add');

  await userEvent.click(screen.getByRole('button', { name: 'Remove tab' }));
  expect(props.handleEdit).toHaveBeenCalledWith('TAB-1', 'remove');
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
});
