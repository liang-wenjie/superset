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

import {
  render,
  screen,
  userEvent,
  createStore,
} from 'spec/helpers/testing-library';
import reducerIndex from 'spec/helpers/reducerIndex';

import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import DraggableNewComponent from 'src/dashboard/components/gridComponents/new/DraggableNewComponent';
import { CHART_TYPE, TABS_TYPE } from 'src/dashboard/util/componentTypes';
import {
  DASHBOARD_GRID_ID,
  DASHBOARD_ROOT_ID,
} from 'src/dashboard/util/constants';

// TODO: rewrite to rtl
// eslint-disable-next-line no-restricted-globals -- TODO: Migrate from describe blocks
describe('DraggableNewComponent', () => {
  const props = {
    id: 'id',
    type: CHART_TYPE,
    label: 'label!',
    className: 'a_class',
  };

  const initialState = {
    dashboardLayout: {
      past: [],
      present: {
        [DASHBOARD_ROOT_ID]: {
          id: DASHBOARD_ROOT_ID,
          type: 'ROOT',
          children: [DASHBOARD_GRID_ID],
          parents: [],
          meta: {},
        },
        [DASHBOARD_GRID_ID]: {
          id: DASHBOARD_GRID_ID,
          type: 'GRID',
          children: [],
          parents: [DASHBOARD_ROOT_ID],
          meta: {},
        },
      },
      future: [],
    },
    dashboardState: {
      directPathToChild: [DASHBOARD_ROOT_ID, DASHBOARD_GRID_ID],
    },
  };

  function setup(overrideProps: Record<string, unknown> = {}) {
    const store = createStore(initialState, reducerIndex);
    render(
      // @ts-expect-error react-dnd types not updated for React 18
      <DndProvider backend={HTML5Backend}>
        <DraggableNewComponent {...props} {...overrideProps} />
      </DndProvider>,
      { store },
    );
    return store;
  }

  test('should render a DragDroppable', () => {
    setup();
    expect(screen.getByTestId('dragdroppable-object')).toBeInTheDocument();
  });

  test('should pass component={ type, id } to DragDroppable', () => {
    setup();
    const dragComponent = screen.getByTestId('dragdroppable-object');
    expect(dragComponent).toHaveClass(
      'dragdroppable dragdroppable--edit-mode dragdroppable-row',
    );
  });

  test('should pass appropriate parent source and id to DragDroppable', () => {
    setup();
    const dragComponent = screen.getByTestId('new-component');
    expect(dragComponent).toHaveAttribute('draggable', 'true');
  });

  test('should render the passed label', () => {
    setup();
    expect(screen.getByText(props.label)).toBeInTheDocument();
  });

  test('should add the passed className', () => {
    setup();
    const component = screen
      .getByTestId('new-component')
      .querySelector('.new-component-placeholder');
    expect(component).toHaveClass(
      `new-component-placeholder ${props.className}`,
    );
  });

  test('should add the component to the focused container on click', async () => {
    const store = setup({ type: TABS_TYPE, meta: { tabMode: 'directory' } });
    await userEvent.click(screen.getByTestId('new-component'));

    const { present } = (
      store.getState() as unknown as {
        dashboardLayout: { present: Record<string, any> };
      }
    ).dashboardLayout;
    const gridChildren = present[DASHBOARD_GRID_ID].children;
    expect(gridChildren).toHaveLength(1);
    const newComponent = present[gridChildren[0]];
    expect(newComponent.type).toBe(TABS_TYPE);
    expect(newComponent.meta.tabMode).toBe('directory');
    // a TABS component always ships with one default tab
    expect(newComponent.children).toHaveLength(1);
    expect(present[newComponent.children[0]].type).toBe('TAB');
  });
});
