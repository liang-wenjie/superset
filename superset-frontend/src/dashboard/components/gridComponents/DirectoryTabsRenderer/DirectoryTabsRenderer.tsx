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
  CSSProperties,
  MouseEvent,
  ReactElement,
  RefObject,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { css, styled } from '@apache-superset/core/theme';
import { t } from '@apache-superset/core/translation';
import { useSelector } from 'react-redux';
import { Icons } from '@superset-ui/core/components/Icons';
import { EditableTitle } from '@superset-ui/core/components';
import type { TabsProps as AntdTabsProps } from '@superset-ui/core/components/Tabs';

import DeleteComponentButton from '../../DeleteComponentButton';
import DragHandle from '../../dnd/DragHandle';
import HoverMenu from '../../menu/HoverMenu';
import type { TabItem } from '../TabsRenderer';
import { TAB_TYPE, TABS_TYPE } from '../../../util/componentTypes';
import { NEW_DIRECTORY_TABS_ID, NEW_TAB_ID } from '../../../util/constants';
import type { DropResult } from 'src/dashboard/components/dnd/dragDroppableConfig';
import type { LayoutItem, RootState } from 'src/dashboard/types';
import { DirectoryTreeNode, getDirectoryTree } from './getDirectoryTree';

interface DirectoryTabsRendererProps {
  tabItems: TabItem[];
  editMode: boolean;
  renderHoverMenu?: boolean;
  tabsDragSourceRef?: RefObject<HTMLDivElement>;
  handleDeleteComponent: () => void;
  deleteComponent: (id: string, parentId: string | null) => void;
  tabsComponent: LayoutItem;
  activeKey: string;
  tabIds: string[];
  handleClickTab: (index: number) => void;
  handleEdit: AntdTabsProps['onEdit'];
  createComponent: (dropResult: DropResult) => void;
  onChangeTab: (params: { pathToTabIndex: string[] }) => void;
  updateComponents: (components: Record<string, LayoutItem>) => void;
}

const DirectoryContainer = styled.div`
  ${({ theme }) => css`
    width: 100%;
    display: flex;
    background-color: ${theme.colorBgContainer};

    & > .hover-menu:hover {
      opacity: 1;
    }
  `}
`;

const DirectoryNav = styled.nav`
  ${({ theme }) => css`
    /* Size the nav to its content (widest node) so it stays as narrow as the
       titles allow, and let the content pane hug its right edge. */
    flex: 0 0 auto;
    max-width: 45%;
    border-right: 1px solid ${theme.colorBorderSecondary};
    /* Keep the deepest tree-row actions clear of the content row's
       left-side hover menu, which extends into the navigation area. */
    padding: ${theme.sizeUnit * 2}px ${theme.sizeUnit * 6}px
      ${theme.sizeUnit * 2}px ${theme.sizeUnit * 2}px;
    background-color: ${theme.colorBgContainer};
    overflow: auto;
  `}
`;

const DirectoryToolbar = styled.div`
  ${({ theme }) => css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: ${theme.sizeUnit}px;
    min-height: ${theme.sizeUnit * 8}px;
    padding: 0 ${theme.sizeUnit}px ${theme.sizeUnit}px;
    margin-bottom: ${theme.sizeUnit}px;
    border-bottom: 1px solid ${theme.colorBorderSecondary};
  `}
`;

const DirectoryToolbarTitle = styled.div`
  ${({ theme }) => css`
    min-width: 0;
    overflow: hidden;
    color: ${theme.colorTextSecondary};
    font-size: ${theme.fontSizeSM}px;
    font-weight: ${theme.fontWeightStrong};
    text-overflow: ellipsis;
    white-space: nowrap;
  `}
`;

const DirectoryTree = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const DirectoryTreeSub = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const DirectoryItem = styled.li``;

const DirectoryItemRow = styled.div<{
  active: boolean;
  inPath: boolean;
  depth: number;
}>`
  ${({ active, inPath, depth, theme }) => css`
    display: flex;
    align-items: center;
    /* Let the row size to its own content (indent + label + actions) so deep
       nodes are never squeezed/clipped, and the nav (flex-basis auto) hugs
       the widest row instead of being padded out to a fixed ratio. */
    width: max-content;
    gap: ${theme.sizeUnit}px;
    /* Cap the indent so very deep hierarchies cannot blow up the nav width
       and squeeze the content pane; the content pane stretches to fill the
       remaining width as the nav hugs its widest row. */
    padding-left: ${Math.min(depth, 6) * theme.sizeUnit * 2 + theme.sizeUnit}px;
    border-left: 3px solid ${active ? theme.colorPrimary : 'transparent'};
    background: ${
      active
        ? theme.colorPrimaryBg
        : inPath
          ? theme.colorFillTertiary
          : 'transparent'
    };
    color: ${active ? theme.colorPrimary : theme.colorText};
    border-radius: ${theme.borderRadius}px;
    margin-bottom: ${theme.sizeUnit / 2}px;
    min-height: ${theme.sizeUnit * 6}px;
  `}
`;

const DirectoryToggle = styled.button`
  ${({ theme }) => css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: ${theme.sizeUnit * 4}px;
    height: ${theme.sizeUnit * 4}px;
    border: 0;
    background: transparent;
    color: ${theme.colorTextTertiary};
    cursor: pointer;
    padding: 0;

    &:hover {
      color: ${theme.colorPrimary};
    }
  `}
`;

const DirectoryIconSpacer = styled.span`
  ${({ theme }) => css`
    flex-shrink: 0;
    width: ${theme.sizeUnit * 4}px;
  `}
`;

const DirectoryItemIcon = styled.span`
  ${({ theme }) => css`
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    color: ${theme.colorTextTertiary};
  `}
`;

const DirectoryItemButton = styled.button`
  ${({ theme }) => css`
    flex: 1;
    /* Never squeeze the label below its content width: the nav sizes to its
       widest row, and a button narrower than its text would leave a gap
       between the tree titles and the content pane in edit mode. */
    min-width: max-content;
    overflow: hidden;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
    text-align: left;
    padding: ${theme.sizeUnit}px ${theme.sizeUnit * 2}px ${theme.sizeUnit}px 0;

    &:hover {
      color: ${theme.colorPrimary};
    }
  `}
`;

const DirectoryDeleteButton = styled.button`
  ${({ theme }) => css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: ${theme.sizeUnit * 6}px;
    height: ${theme.sizeUnit * 6}px;
    border: 0;
    background: transparent;
    color: ${theme.colorTextTertiary};
    cursor: pointer;
    padding: 0;

    &:hover {
      color: ${theme.colorPrimary};
    }
  `}
`;

const DirectoryAddSubtabButton = styled.button`
  ${({ theme }) => css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: ${theme.sizeUnit * 6}px;
    height: ${theme.sizeUnit * 6}px;
    border: 0;
    background: transparent;
    color: ${theme.colorTextTertiary};
    cursor: pointer;
    padding: 0;

    &:hover {
      color: ${theme.colorPrimary};
    }
  `}
`;

const DirectoryAddButton = styled.button`
  ${({ theme }) => css`
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: ${theme.sizeUnit}px;
    border: 1px dashed ${theme.colorBorder};
    background: transparent;
    color: ${theme.colorTextSecondary};
    cursor: pointer;
    margin-top: ${theme.sizeUnit * 2}px;
    padding: ${theme.sizeUnit * 2}px;
    border-radius: ${theme.borderRadius}px;

    &:hover {
      color: ${theme.colorPrimary};
      border-color: ${theme.colorPrimary};
    }
  `}
`;

const DirectoryContent = styled.div<{ editMode: boolean }>`
  flex: 1;
  align-self: flex-start;
  height: fit-content;
  min-height: 0;
  min-width: 0;
  position: relative;
  z-index: 1;
  /* The content pane mirrors a normal tab content area (TabsRenderer paints
     its container with the same background), so apart from the tree taking
     its own width the pane looks exactly like a tab's content region. */
  background-color: ${({ theme }) => theme.colorBgContainer};

  /* Directory content should follow the rendered rows instead of inheriting
     the full-height tab-pane rule. This prevents empty space below the last
     chart when the directory is shorter than its parent grid. */
  & .dashboard-component-tabs-content {
    height: auto;
  }

  /* A newly added nested directory owns an empty tab until the user drops a
     chart into it. Keep its edit-mode drop target compact instead of letting
     the global full-tab rule reserve the height of the whole dashboard. */
  & .dashboard-component-tabs-content--directory-empty {
    height: ${({ theme }) => theme.sizeUnit * 4}px !important;
    min-height: 0 !important;
  }

  &
    .dashboard-component-tabs-content--directory-empty
    > .directory-empty-droptarget {
    position: relative !important;
    top: auto !important;
    bottom: auto !important;
    height: ${({ theme }) => theme.sizeUnit * 4}px !important;
    min-height: ${({ theme }) => theme.sizeUnit * 4}px !important;
  }

  /* Keep an empty row as a usable edit-mode drop target without reserving a
     full chart-sized block beneath the directory content. The important flag
     wins over Row's default empty-row rule. */
  ${({ editMode, theme }) =>
    editMode &&
    css`
      & .dragdroppable-row .grid-row.grid-row--empty {
        min-height: ${theme.sizeUnit * 8}px !important;
      }
    `}

  /* Row/Column widths are computed from the full dashboard grid width
     (widthMultiple x columnWidth); inside the narrower directory content
     pane they would overflow to the right of the pane. Clamp every
     descendant so the whole content chain (including the dynamically
     classed wrapper components) stays inside the pane and never looks
     pushed off to the side. */
  & * {
    max-width: 100%;
  }

  /* Charts are sized in grid columns relative to the full dashboard width,
     so inside this narrower pane they would stick out past the right edge.
     Clamp them to the measured pane width (via a CSS variable) so content
     aligns to the left edge of the pane. */
  & .resizable-container,
  & .dashboard-component-chart-holder {
    max-width: min(var(--directory-content-width, 100%), 100%) !important;
  }
  /* A row's width is computed from the full dashboard grid (12 columns of
     the dashboard width), so every chart keeps the grid width the user set
     for it. Inside this narrower pane a row cannot hold as many charts as
     the full dashboard would, so when a new chart is dropped and there is
     no room left, only that last chart shrinks within its available space;
     the charts already placed keep their shape. */
  & .dragdroppable-row .grid-row {
    flex-wrap: nowrap;
  }
  /* Charts keep their configured grid width, so the 16px empty-droptarget
     gaps between them stay the same spacing a normal row has between its
     components. */
  & .dragdroppable-row :not(.empty-droptarget) {
    flex-shrink: 0;
  }
  /* The last chart of the row (the one most recently dropped at the row's
     end, where there is no room left) may shrink into whatever space remains,
     without changing any of the previously placed charts. It never goes
     below one grid column (the chart resizer's own minimum width) so it
     keeps a usable drop/resize area. */
  & .dragdroppable-row .grid-row > :not(.empty-droptarget):nth-last-child(2) {
    flex-shrink: 1;
    min-width: 82px;
  }

  /* The content pane reuses the base Tab pane component (tabItems[].children
     renders the RENDER_TAB_CONTENT Tab), so the empty state, drop strips and
     16px gutters are exactly those of a normal tab content area. The Row
     component's between-chart strips are natively 16px; pin them explicitly
     so the full-dashboard-grid width rule cannot stretch them inside this
     narrower pane. The row's trailing strip (:last-child) is intentionally
     left alone: when a row has free columns it fills the remaining width to
     the right of the charts, which is the normal drop area for adding
     another chart (same behaviour as a chart row on the base grid). Empty
     rows keep their full-pane drop target. */
  &
    .dashboard-component-tabs-content
    .dragdroppable-row:not(.grid-row--empty)
    .empty-droptarget:not(:last-child) {
    width: ${({ theme }) => theme.sizeUnit * 4}px;
    min-width: ${({ theme }) => theme.sizeUnit * 4}px;
    max-width: ${({ theme }) => theme.sizeUnit * 4}px;
  }
  /* The row's trailing drop zone (the free columns to the right of the last
     chart) uses width:100% from the global grid rules, which in a flex row
     resolves to flex-basis:100% and squeezes the charts while the strip
     itself starts inside the last chart, covering it. Make it grow from the
     chart's right edge instead: flex 1 1 auto with width auto keeps charts
     at their grid width and the strip fills exactly the remaining space -
     the same behaviour a chart row has on the base grid. */
  &
    .dashboard-component-tabs-content
    .dragdroppable-row:not(.grid-row--empty)
    .empty-droptarget:last-child {
    flex: 1 1 auto;
    width: auto;
    min-width: ${({ theme }) => theme.sizeUnit * 4}px;
    max-width: none;
  }
`;

function DirectoryTabsRenderer({
  tabItems,
  editMode,
  renderHoverMenu = true,
  tabsDragSourceRef,
  handleDeleteComponent,
  deleteComponent,
  tabsComponent,
  activeKey,
  tabIds,
  handleClickTab,
  handleEdit,
  createComponent,
  onChangeTab,
  updateComponents,
}: DirectoryTabsRendererProps): ReactElement {
  const layout = useSelector(
    (state: RootState) => state.dashboardLayout.present,
  );
  const directPathToChild = useSelector(
    (state: RootState) => state.dashboardState.directPathToChild,
  );

  const tree = useMemo(
    () => getDirectoryTree(tabsComponent, layout),
    [tabsComponent, layout],
  );

  // A nested directory (a TABS with tabMode 'directory' whose ancestors include
  // another directory) renders only its content pane: the hierarchy is already
  // expressed by the outer tree, so showing another tree/tab bar would be
  // redundant.
  const isNested = useMemo(() => {
    const parents = layout[tabsComponent.id]?.parents ?? [];
    return parents.some(parentId => {
      const parent = layout[parentId];
      return parent?.type === TABS_TYPE && parent.meta?.tabMode === 'directory';
    });
  }, [layout, tabsComponent.id]);

  // The active node is the deepest tab in the direct path; the tabs between
  // this directory and it form the active (ancestor) path used for
  // highlighting and auto-expansion.
  const { activeTabId, activePathIds } = useMemo(() => {
    const path = directPathToChild ?? [];
    const directIndex = tabIds.indexOf(activeKey);
    const directFallback = directIndex > -1 ? tabIds[directIndex] : tabIds[0];
    const directoryIndex = path.indexOf(tabsComponent.id);
    if (directoryIndex === -1) {
      return { activeTabId: directFallback, activePathIds: new Set<string>() };
    }
    const pathTabs = path
      .slice(directoryIndex + 1)
      .filter(tabId => layout[tabId]?.type === TAB_TYPE);
    const deepest = pathTabs[pathTabs.length - 1];
    return {
      activeTabId: deepest ?? directFallback,
      activePathIds: new Set(pathTabs.slice(0, -1)),
    };
  }, [tabIds, activeKey, directPathToChild, tabsComponent.id, layout]);

  // Nodes are expanded by default; collapsing is opt-in. Tabs on the active
  // path stay expanded so the current chapter/section is always reachable.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    () => new Set(),
  );
  // The tab currently being renamed in edit mode. While a tab is being
  // renamed, clicking its node edits the title instead of navigating.
  const [renamingId, setRenamingId] = useState<string | null>(null);

  useEffect(() => {
    if (!editMode) {
      setRenamingId(null);
    }
  }, [editMode]);

  useEffect(() => {
    if (!editMode || !renamingId) {
      return undefined;
    }

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      const titleInput = document.querySelector<HTMLTextAreaElement>(
        '[data-test="textarea-editable-title-input"]',
      );
      if (titleInput?.contains(target)) {
        return;
      }

      titleInput?.blur();
    };

    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () =>
      document.removeEventListener(
        'pointerdown',
        handleOutsidePointerDown,
        true,
      );
  }, [editMode, renamingId]);

  // Measured width of the content pane. Charts are sized in grid columns
  // relative to the full dashboard width, which is wider than this pane when
  // the directory nav takes space; clamp them via a CSS variable so content
  // starts at the pane's left edge instead of overflowing to the right.
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState<number>();
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return undefined;
    const update = () =>
      setContentWidth(Math.floor(el.getBoundingClientRect().width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const contentStyle = useMemo(
    () =>
      contentWidth
        ? ({
            '--directory-content-width': `${contentWidth}px`,
          } as CSSProperties)
        : undefined,
    [contentWidth],
  );
  const isExpanded = useCallback(
    (nodeId: string) => !collapsedIds.has(nodeId) || activePathIds.has(nodeId),
    [collapsedIds, activePathIds],
  );
  const toggleCollapsed = useCallback((nodeId: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleSelectNode = useCallback(
    (node: DirectoryTreeNode) => {
      if (node.id === activeTabId) {
        return;
      }
      if (node.depth === 0) {
        const tabIndex = tabIds.indexOf(node.id);
        if (tabIndex > -1) {
          handleClickTab(tabIndex);
        }
        return;
      }
      const parents = layout[node.id]?.parents ?? [];
      onChangeTab({ pathToTabIndex: [...parents, node.id] });
    },
    [activeTabId, tabIds, handleClickTab, layout, onChangeTab],
  );

  const handleRenameTab = useCallback(
    (tabId: string, nextText: string) => {
      const component = layout[tabId];
      if (!component || !nextText || nextText === component.meta.text) {
        return;
      }
      updateComponents({
        [tabId]: {
          ...component,
          meta: {
            ...component.meta,
            text: nextText,
          },
        },
      });
    },
    [layout, updateComponents],
  );

  const handleAddSubtab = useCallback(
    (nodeId: string) => {
      const component = layout[nodeId];
      if (!component) return;
      // If the node already contains a nested directory (TABS with tabMode
      // 'directory'), add a new chapter to it; otherwise create one.
      const subtabsId = component.children.find(childId => {
        const child = layout[childId];
        return child?.type === TABS_TYPE && child.meta?.tabMode === 'directory';
      });
      if (subtabsId) {
        const subtabs = layout[subtabsId];
        createComponent({
          destination: {
            id: subtabsId,
            type: TABS_TYPE,
            index: subtabs.children.length,
          },
          dragging: { id: NEW_TAB_ID, type: TAB_TYPE },
        } as unknown as DropResult);
      } else {
        createComponent({
          destination: {
            id: nodeId,
            type: TAB_TYPE,
            index: component.children.length,
          },
          dragging: {
            id: NEW_DIRECTORY_TABS_ID,
            type: TABS_TYPE,
            meta: { tabMode: 'directory' },
          },
        } as unknown as DropResult);
      }
    },
    [layout, createComponent],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      const component = layout[nodeId];
      if (!component) return;
      const parentId =
        component.parents?.[component.parents.length - 1] ?? null;
      deleteComponent(nodeId, parentId);
    },
    [layout, deleteComponent],
  );

  const startRenaming = useCallback(
    (event: MouseEvent<HTMLButtonElement>, nodeId: string) => {
      if (!editMode) {
        return;
      }
      event.stopPropagation();
      setRenamingId(nodeId);
    },
    [editMode],
  );

  const finishRenaming = useCallback(
    (nodeId: string, nextText: string) => {
      handleRenameTab(nodeId, nextText);
      setRenamingId(null);
    },
    [handleRenameTab],
  );

  const activeIndex = Math.max(
    0,
    tabIds.findIndex(tabId => tabId === activeKey),
  );
  const activeItem = tabItems[activeIndex] ?? tabItems[0];

  // The active pane reuses the base Tab content component: tabItems[].children
  // is a RENDER_TAB_CONTENT DashboardComponent (the Tab component's pane), so
  // the empty state, per-child drop strips and gutters are exactly those of a
  // normal tab content area. The only difference from base Tabs is the tree
  // navigation on the left.

  const renderNode = (node: DirectoryTreeNode): ReactElement => {
    const hasChildren = node.children.length > 0;
    const expanded = isExpanded(node.id);
    const isActive = node.id === activeTabId;
    const inPath = activePathIds.has(node.id);
    const component = layout[node.id];

    return (
      <DirectoryItem key={node.id}>
        <DirectoryItemRow
          active={isActive}
          inPath={inPath}
          depth={node.depth}
          data-depth={node.depth}
          data-active={isActive}
          data-in-path={inPath}
          data-test="directory-tree-item"
        >
          {hasChildren ? (
            <DirectoryToggle
              type="button"
              aria-label={expanded ? t('Collapse') : t('Expand')}
              aria-expanded={expanded}
              onClick={event => {
                event.stopPropagation();
                toggleCollapsed(node.id);
              }}
            >
              {expanded ? (
                <Icons.CaretDownOutlined iconSize="s" />
              ) : (
                <Icons.CaretRightOutlined iconSize="s" />
              )}
            </DirectoryToggle>
          ) : (
            <DirectoryIconSpacer />
          )}
          <DirectoryItemIcon>
            {hasChildren ? (
              expanded ? (
                <Icons.FolderOpenOutlined iconSize="s" />
              ) : (
                <Icons.FolderOutlined iconSize="s" />
              )
            ) : (
              <Icons.FileTextOutlined iconSize="s" />
            )}
          </DirectoryItemIcon>
          <DirectoryItemButton
            type="button"
            aria-current={isActive ? 'page' : undefined}
            onDoubleClick={
              editMode ? event => startRenaming(event, node.id) : undefined
            }
            onClick={() => {
              // While this node is being renamed, clicks land on its title
              // editor and should edit instead of navigating.
              if (renamingId === node.id) {
                return;
              }
              handleSelectNode(node);
            }}
          >
            <EditableTitle
              key={
                editMode && renamingId === node.id
                  ? `rename-${node.id}`
                  : `title-${node.id}`
              }
              title={component?.meta.text}
              defaultTitle={component?.meta.defaultText}
              placeholder={component?.meta.placeholder}
              canEdit={editMode && renamingId === node.id}
              showTooltip={false}
              editing={editMode && renamingId === node.id}
              onEditingChange={isEditing => {
                if (!isEditing) {
                  setRenamingId(currentId =>
                    currentId === node.id ? null : currentId,
                  );
                }
              }}
              onSaveTitle={nextText => finishRenaming(node.id, nextText)}
            />
          </DirectoryItemButton>
          {editMode && (
            <DirectoryDeleteButton
              type="button"
              aria-label={t('Remove tab')}
              onClick={event => {
                event.stopPropagation();
                handleDeleteNode(node.id);
              }}
            >
              <Icons.CloseOutlined iconSize="s" />
            </DirectoryDeleteButton>
          )}
          {editMode && (
            <DirectoryAddSubtabButton
              type="button"
              aria-label={t('Add subtab')}
              onClick={event => {
                event.stopPropagation();
                handleAddSubtab(node.id);
              }}
            >
              <Icons.PlusOutlined iconSize="s" />
            </DirectoryAddSubtabButton>
          )}
        </DirectoryItemRow>
        {hasChildren && expanded && (
          <DirectoryTreeSub>{node.children.map(renderNode)}</DirectoryTreeSub>
        )}
      </DirectoryItem>
    );
  };

  if (isNested) {
    return (
      <DirectoryContainer
        className="dashboard-component dashboard-component-tabs dashboard-component-directory"
        data-test="dashboard-component-directory"
      >
        <DirectoryContent
          ref={contentRef}
          style={contentStyle}
          editMode={editMode}
          id={`${tabsComponent.id}-directory-content`}
        >
          {activeItem?.children}
        </DirectoryContent>
      </DirectoryContainer>
    );
  }

  return (
    <DirectoryContainer
      className="dashboard-component dashboard-component-tabs dashboard-component-directory"
      data-test="dashboard-component-directory"
    >
      {editMode && renderHoverMenu && tabsDragSourceRef && (
        <HoverMenu innerRef={tabsDragSourceRef} position="left">
          <DragHandle position="left" />
          <DeleteComponentButton onDelete={handleDeleteComponent} />
        </HoverMenu>
      )}
      <DirectoryNav aria-label={t('Directory')}>
        {editMode && (
          <DirectoryToolbar data-test="directory-toolbar">
            <DirectoryToolbarTitle>{t('Directory')}</DirectoryToolbarTitle>
          </DirectoryToolbar>
        )}
        <DirectoryTree data-test="directory-tree">
          {tree.map(renderNode)}
        </DirectoryTree>
        {editMode && (
          <DirectoryAddButton
            type="button"
            aria-label={t('Add tab')}
            onClick={(event: MouseEvent<HTMLButtonElement>) =>
              handleEdit?.(event, 'add')
            }
          >
            <Icons.PlusOutlined iconSize="s" />
            {t('Add item')}
          </DirectoryAddButton>
        )}
      </DirectoryNav>
      <DirectoryContent
        ref={contentRef}
        style={contentStyle}
        editMode={editMode}
        id={`${tabsComponent.id}-directory-content`}
      >
        {activeItem?.children}
      </DirectoryContent>
    </DirectoryContainer>
  );
}

export default memo(DirectoryTabsRenderer);
