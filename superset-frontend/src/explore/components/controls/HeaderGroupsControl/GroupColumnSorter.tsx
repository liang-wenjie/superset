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
import { useMemo } from 'react';
import { t } from '@apache-superset/core/translation';
import { css, styled } from '@apache-superset/core/theme';
import { Button, Select } from '@superset-ui/core/components';
import { Icons } from '@superset-ui/core/components/Icons';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { Label, OptionControlContainer } from '../OptionControls';
import { HeaderGroupColumnOption } from './types';
import { normalizeSelectedColumns } from './utils';

/** Distinguishes this nested sortable context from the group list's context. */
export const GROUP_COLUMN_DND_ID = 'header-group-columns';

/** The picker is a controlled "add" input: a selection is cleared as soon as
 * the column moves into the list above, so it can be reused for the next one. */
const EMPTY_SELECTION: string[] = [];

const ColumnList = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-direction: column;
    gap: ${theme.sizeUnit}px;
    max-height: ${theme.sizeUnit * 55}px;
    overflow-y: auto;
    padding-right: ${theme.sizeUnit}px;
  `}
`;

const ColumnRow = styled(OptionControlContainer)`
  flex: 0 0 auto;
`;

const DragHandleSlot = styled.span`
  display: inline-flex;
  button {
    cursor: ns-resize;
    padding-inline: ${({ theme }) => theme.sizeUnit}px;
  }
`;

const RemoveButton = styled.button`
  ${({ theme }) => css`
    background: ${theme.colorBgLayout};
    color: ${theme.colorIcon};
    height: 100%;
    width: ${theme.sizeUnit * 6}px;
    border: none;
    border-right: solid 1px ${theme.colorBorder};
    padding: 0;
    outline: none;
    border-bottom-left-radius: ${theme.borderRadius}px;
    border-top-left-radius: ${theme.borderRadius}px;

    &:focus-visible {
      outline: 2px solid ${theme.colorPrimary};
      outline-offset: -2px;
    }

    &:disabled {
      color: ${theme.colorTextDisabled};
      cursor: not-allowed;
    }
  `}
`;

const EmptyHint = styled.span`
  ${({ theme }) => css`
    color: ${theme.colorTextTertiary};
    font-size: ${theme.fontSizeSM}px;
  `}
`;

const AddColumnWrapper = styled.div`
  ${({ theme }) => css`
    margin-top: ${theme.sizeUnit}px;

    .ant-select {
      width: 100%;
    }
  `}
`;

type SortableColumnRowProps = {
  column: string;
  label: string;
  disabled: boolean;
  onRemove: () => void;
};

function SortableColumnRow({
  column,
  label,
  disabled,
  onRemove,
}: SortableColumnRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id: column, disabled });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
      }}
    >
      <ColumnRow data-test="header-group-column-row">
        <DragHandleSlot ref={setActivatorNodeRef}>
          <Button
            buttonStyle="link"
            buttonSize="small"
            aria-label={t('Drag to reorder')}
            disabled={disabled}
            icon={<Icons.MenuOutlined aria-hidden className="text-primary" />}
            {...attributes}
            {...listeners}
          />
        </DragHandleSlot>
        <RemoveButton
          type="button"
          aria-label={t('Remove column %s', label)}
          disabled={disabled}
          onClick={onRemove}
        >
          <Icons.CloseOutlined iconSize="m" />
        </RemoveButton>
        <Label>{label}</Label>
      </ColumnRow>
    </div>
  );
}

export type GroupColumnSorterProps = {
  columns: string[];
  columnOptions: HeaderGroupColumnOption[];
  usedColumns: Set<string>;
  disabled?: boolean;
  onChange: (columns: string[]) => void;
};

/**
 * A vertical, drag-sortable list of the columns assigned to one header group.
 * The array order is significant: `orderColumnsByHeaderGroups` lays the table
 * columns out in the same order, so reordering here changes the chart itself.
 */
export default function GroupColumnSorter({
  columns,
  columnOptions,
  usedColumns,
  disabled = false,
  onChange,
}: GroupColumnSorterProps) {
  // Saved charts can contain duplicate keys (for example after a time
  // comparison column remap), but dnd-kit needs unique sortable ids.
  const uniqueColumns = useMemo(() => [...new Set(columns)], [columns]);

  const labels = useMemo(
    () => new Map(columnOptions.map(option => [option.value, option.label])),
    [columnOptions],
  );

  const addOptions = useMemo(
    () =>
      columnOptions.filter(
        option =>
          !uniqueColumns.includes(option.value) &&
          !usedColumns.has(option.value),
      ),
    [columnOptions, uniqueColumns, usedColumns],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const fromIndex = uniqueColumns.indexOf(String(active.id));
    const toIndex = uniqueColumns.indexOf(String(over.id));
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }
    onChange(arrayMove(uniqueColumns, fromIndex, toIndex));
  };

  return (
    <div data-test="header-group-column-sorter">
      <DndContext
        id={GROUP_COLUMN_DND_ID}
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={uniqueColumns}
          strategy={verticalListSortingStrategy}
        >
          <ColumnList>
            {uniqueColumns.length === 0 ? (
              <EmptyHint>{t('No columns selected')}</EmptyHint>
            ) : (
              uniqueColumns.map(column => (
                <SortableColumnRow
                  key={column}
                  column={column}
                  label={labels.get(column) ?? column}
                  disabled={disabled || uniqueColumns.length === 1}
                  onRemove={() =>
                    onChange(uniqueColumns.filter(item => item !== column))
                  }
                />
              ))
            )}
          </ColumnList>
        </SortableContext>
      </DndContext>
      <AddColumnWrapper>
        <Select
          ariaLabel={t('Group columns')}
          mode="multiple"
          showSearch
          allowClear={false}
          disabled={disabled}
          value={EMPTY_SELECTION}
          options={addOptions}
          placeholder={
            addOptions.length === 0
              ? t('No columns available')
              : t('Select columns')
          }
          onChange={values => {
            const selected = normalizeSelectedColumns(values);
            if (selected.length === 0) {
              return;
            }
            // Keep the picker's own order so picking several columns in one
            // pass appends them to the list in exactly that order.
            onChange([...new Set([...uniqueColumns, ...selected])]);
          }}
        />
      </AddColumnWrapper>
    </div>
  );
}
