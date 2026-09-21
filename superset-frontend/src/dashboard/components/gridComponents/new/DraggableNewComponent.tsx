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
import { memo, useCallback } from 'react';
import cx from 'classnames';
import { css, styled } from '@apache-superset/core/theme';
import { useDispatch, useSelector } from 'react-redux';
import { DragDroppable } from 'src/dashboard/components/dnd/DragDroppable';
import type { ConnectDragSource } from 'react-dnd';
import { handleComponentDrop } from 'src/dashboard/actions/dashboardLayout';
import {
  DASHBOARD_GRID_ID,
  DASHBOARD_ROOT_ID,
  NEW_COMPONENTS_SOURCE_ID,
} from 'src/dashboard/util/constants';
import {
  DASHBOARD_ROOT_TYPE,
  NEW_COMPONENT_SOURCE_TYPE,
} from 'src/dashboard/util/componentTypes';
import type { DropResult } from 'src/dashboard/components/dnd/dragDroppableConfig';
import type { RootState } from 'src/dashboard/types';

// Define types for component props
interface DraggableNewComponentProps {
  id: string;
  type: string;
  label: string;
  className?: string;
  meta?: Record<string, any>;
  IconComponent?: any;
}

const NewComponent = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    padding: ${theme.sizeUnit * 4}px;
    background: ${theme.colorBgContainer};
    cursor: move;
    &:not(.static):hover {
      background: ${theme.colorFillContentHover};
    }
  `}
`;

const NewComponentPlaceholder = styled.div`
  ${({ theme }) => css`
    position: relative;
    width: ${theme.sizeUnit * 10}px;
    height: ${theme.sizeUnit * 10}px;
    margin-right: ${theme.sizeUnit * 4}px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${theme.colorTextLabel};
  `}
`;

function DraggableNewComponent({
  label,
  id,
  type,
  className,
  meta,
  IconComponent,
}: DraggableNewComponentProps) {
  const dispatch = useDispatch();
  const directPathToChild = useSelector(
    (state: RootState) => state.dashboardState.directPathToChild,
  );
  const layout = useSelector(
    (state: RootState) => state.dashboardLayout.present,
  );

  // Clicking a palette component adds it to the currently focused container,
  // the same way dragging it there would. The drop result is routed through
  // handleComponentDrop so top-level tabs, row wrapping and width resolution
  // behave identically to a drag.
  const handleClick = useCallback(() => {
    const focusId = directPathToChild?.[directPathToChild.length - 1];
    const focusComponent = focusId ? layout[focusId] : undefined;
    const gridComponent = layout[DASHBOARD_GRID_ID];
    const destination = focusComponent
      ? {
          id: focusComponent.id,
          type: focusComponent.type,
          index: focusComponent.children?.length ?? 0,
        }
      : gridComponent
        ? {
            id: gridComponent.id,
            type: gridComponent.type,
            index: gridComponent.children?.length ?? 0,
          }
        : { id: DASHBOARD_ROOT_ID, type: DASHBOARD_ROOT_TYPE, index: 0 };

    dispatch(
      handleComponentDrop({
        source: {
          id: NEW_COMPONENTS_SOURCE_ID,
          type: NEW_COMPONENT_SOURCE_TYPE,
          index: 0,
        },
        dragging: { id, type, meta },
        destination,
      } as DropResult),
    );
  }, [dispatch, directPathToChild, layout, id, type, meta]);

  return (
    <DragDroppable
      component={{ type, id, meta }}
      parentComponent={{
        id: NEW_COMPONENTS_SOURCE_ID,
        type: NEW_COMPONENT_SOURCE_TYPE,
      }}
      index={0}
      depth={0}
      editMode
    >
      {({ dragSourceRef }: { dragSourceRef: ConnectDragSource }) => (
        <NewComponent
          ref={dragSourceRef}
          data-test="new-component"
          onClick={handleClick}
        >
          <NewComponentPlaceholder
            className={cx('new-component-placeholder', className)}
          >
            {IconComponent && <IconComponent iconSize="xl" />}
          </NewComponentPlaceholder>
          {label}
        </NewComponent>
      )}
    </DragDroppable>
  );
}

export default memo(DraggableNewComponent);
