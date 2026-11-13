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
import React, { useCallback, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { css, styled, useTheme } from '@apache-superset/core/theme';
import { t } from '@apache-superset/core/translation';
import {
  Button,
  Input,
  Modal,
  Select,
  Switch,
} from '@superset-ui/core/components';
import { Icons } from '@superset-ui/core/components/Icons';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ControlHeader from 'src/explore/components/ControlHeader';
import {
  DEFAULT_METRIC_SLOTS_PER_ROW,
  MAX_METRIC_SLOTS_PER_ROW,
} from 'src/explore/controlUtils/metricRowsTypes';
import type {
  BigNumberMetricRow,
  BigNumberMetricSlot,
  BigNumberMetricSlotMode,
} from 'src/explore/controlUtils/metricRowsTypes';

let idCounter = 0;
const nextId = () => {
  idCounter += 1;
  return `metric_row_${Date.now()}_${idCounter}`;
};

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.sizeUnit}px;
  padding: ${({ theme }) => theme.sizeUnit}px 0;
`;

const ListRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.sizeUnit}px;
  border: 1px solid ${({ theme }) => theme.colorBorderSecondary};
  border-radius: ${({ theme }) => theme.borderRadius}px;
  padding: ${({ theme }) => theme.sizeUnit * 2}px;
  background: ${({ theme }) => theme.colorBgContainer};
  cursor: grab;
  &:active {
    cursor: grabbing;
  }
`;

// Same grip as the column/metric selection controls. The whole row is the
// drag activator; this is only the visible affordance.
const DragHandle = styled.span`
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  color: ${({ theme }) => theme.colorTextTertiary};
  cursor: inherit;
`;

const RowTitle = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const RowTitleText = styled.span`
  font-size: ${({ theme }) => theme.fontSize}px;
  color: ${({ theme }) => theme.colorText};
`;

const RowSubtitle = styled.span`
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme }) => theme.colorTextTertiary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Chip = styled.span`
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme }) => theme.colorTextSecondary};
  background: ${({ theme }) => theme.colorFillTertiary};
  border-radius: ${({ theme }) => theme.borderRadiusSM}px;
  padding: 0 ${({ theme }) => theme.sizeUnit}px;
  white-space: nowrap;
`;

const Row = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.sizeUnit}px;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.sizeUnit * 2}px;
`;

const SectionTitle = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.sizeUnit * 2}px;
  font-size: ${({ theme }) => theme.fontSize}px;
  font-weight: ${({ theme }) => theme.fontWeightStrong};
  color: ${({ theme }) => theme.colorText};
  border-bottom: 1px solid ${({ theme }) => theme.colorBorderSecondary};
  padding-bottom: ${({ theme }) => theme.sizeUnit}px;
  margin: ${({ theme }) => theme.sizeUnit * 3}px 0
    ${({ theme }) => theme.sizeUnit * 2}px;
`;

const SlotActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.sizeUnit * 2}px;
  margin-top: ${({ theme }) => theme.sizeUnit * 2}px;
`;

const StyledSelect = styled(Select)`
  flex: 1;
  min-width: 0;
`;

const StyledInput = styled(Input)`
  flex: 1;
  min-width: 0;
`;

const FieldLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme }) => theme.colorTextSecondary};
  flex-shrink: 0;
  min-width: 118px;
`;

const Hint = styled.div`
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme }) => theme.colorTextTertiary};
  line-height: ${({ theme }) => theme.lineHeight};
  margin: -4px 0 ${({ theme }) => theme.sizeUnit * 2}px;
`;

const AddButton = styled(Button)`
  align-self: flex-start;
`;

// The editor configures two independent slots and is taller than the
// viewport. Center the dialog and cap the body so Save/Cancel stay visible.
const MODAL_STYLES: { body: CSSProperties } = {
  body: {
    maxHeight: 'calc(100vh - 220px)',
    overflowY: 'auto',
  },
};

const MODE_OPTIONS: { label: string; value: BigNumberMetricSlotMode }[] = [
  { label: t('Time comparison (percentage)'), value: 'time_shift' },
  { label: t('Metric value'), value: 'metric' },
];

type SlotDraft = {
  id?: string;
  show: boolean;
  label: string;
  mode: BigNumberMetricSlotMode;
  offset: string;
  metricName: string;
  sqlExpression: string;
  numberFormat: string;
};

type EditorState = {
  /** `null` while creating a new row. */
  index: number | null;
  slots: SlotDraft[];
};

export interface MetricRowsControlProps {
  name: string;
  label: string;
  description?: string;
  value?: BigNumberMetricRow[];
  /** Legacy MoM/YoY pair, shown until the editor writes `metric_rows`. */
  defaultRows?: BigNumberMetricRow[];
  metrics?: { label: string; value: string }[];
  offsetChoices?: string[];
  onChange?: (value: BigNumberMetricRow[]) => void;
  renderTrigger?: boolean;
  hovered?: boolean;
  validationErrors?: string[];
}

const emptyDraft = (): SlotDraft => ({
  // A stable React key even before the row is saved.
  id: nextId(),
  show: true,
  label: '',
  mode: 'metric',
  offset: '1 month ago',
  metricName: '',
  sqlExpression: '',
  numberFormat: '',
});

/** Saved metrics are strings; adhoc metrics are objects with a SQL expression. */
const toDraft = (slot: BigNumberMetricSlot): SlotDraft => {
  const base = emptyDraft();
  let metricName = '';
  let sqlExpression = '';
  const { column } = slot;
  if (typeof column === 'string') {
    metricName = column;
  } else if (column && typeof column === 'object') {
    const record = column as Record<string, unknown>;
    sqlExpression =
      typeof record.sqlExpression === 'string' ? record.sqlExpression : '';
    if (!sqlExpression && typeof record.label === 'string') {
      metricName = record.label;
    }
  }
  return {
    ...base,
    id: slot.id,
    show: slot.show !== false,
    label: slot.label ?? '',
    mode: slot.mode ?? (metricName || sqlExpression ? 'metric' : 'time_shift'),
    offset: slot.offset ?? base.offset,
    metricName,
    sqlExpression,
    numberFormat: slot.numberFormat ?? '',
  };
};

const fromDraft = (draft: SlotDraft): BigNumberMetricSlot => {
  const expression = draft.sqlExpression.trim();
  const name = draft.metricName.trim();
  const column =
    draft.mode === 'metric'
      ? expression
        ? {
            expressionType: 'SQL',
            sqlExpression: expression,
            label: expression,
            hasCustomLabel: true,
          }
        : name || undefined
      : undefined;
  return {
    id: draft.id ?? nextId(),
    show: draft.show,
    label: draft.label,
    mode: draft.mode,
    offset: draft.mode === 'time_shift' ? draft.offset : undefined,
    column,
    numberFormat: draft.numberFormat.trim() || undefined,
  };
};

const describeSlot = (slot: BigNumberMetricSlot): string => {
  if (slot.show === false) return t('Hidden');
  const { column } = slot;
  const source =
    slot.mode === 'metric'
      ? typeof column === 'string'
        ? column
        : column && typeof column === 'object'
          ? String(
              (column as Record<string, unknown>).label ??
                (column as Record<string, unknown>).sqlExpression ??
                '',
            )
          : t('No metric')
      : (slot.offset ?? t('No time shift'));
  return `${slot.label || t('No label')} · ${source}`;
};

type SortableRowProps = {
  id: string;
  index: number;
  row: BigNumberMetricRow;
  reorderType: string;
  onShiftOptions: (from: number, to: number) => void;
  onEdit: () => void;
  onRemove: () => void;
};

// Reuse the SAME drag pipeline as the column/metric selection pills: the
// whole row is the sortable activator, and ExploreDndContext resolves the
// drop by calling the `onShiftOptions` callback registered on its data.
const SortableMetricRow: React.FC<SortableRowProps> = ({
  id,
  index,
  row,
  reorderType,
  onShiftOptions,
  onEdit,
  onRemove,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    // Avoid the springy settle animation on drop; full-width rows sliding
    // into place already make the reorder obvious.
    animateLayoutChanges: () => false,
    data: {
      type: reorderType,
      dragIndex: index,
      onShiftOptions,
    },
  });
  const style = {
    // These rows are full width, so ignore the horizontal part of the drag
    // translation: only up/down movement should be visible.
    transform: CSS.Translate.toString(
      transform ? { ...transform, x: 0 } : null,
    ),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const slots = Array.isArray(row.slots) ? row.slots : [];

  return (
    <ListRow
      // Register the row as its own activator: the keyboard sensor then
      // ignores Space/Enter pressed on the nested Edit/Remove buttons.
      ref={node => {
        setNodeRef(node);
        setActivatorNodeRef(node);
      }}
      style={style}
      data-test="metric-row"
      {...attributes}
      {...listeners}
    >
      <DragHandle
        aria-hidden
        data-test="metric-row-drag-handle"
        title={t('Drag to reorder')}
      >
        <Icons.MenuOutlined />
      </DragHandle>
      <RowTitle>
        <RowTitleText>{t('Row %s', index + 1)}</RowTitleText>
        <RowSubtitle>{slots.map(describeSlot).join(' · ')}</RowSubtitle>
      </RowTitle>
      <Chip>{t('%s slots', slots.length)}</Chip>
      <Button size="small" onClick={onEdit}>
        {t('Edit')}
      </Button>
      <Button size="small" danger onClick={onRemove}>
        {t('Remove')}
      </Button>
    </ListRow>
  );
};

const MetricRowsControl: React.FC<MetricRowsControlProps> = ({
  name,
  label,
  description,
  value,
  defaultRows = [],
  metrics = [],
  offsetChoices = [],
  onChange,
  renderTrigger,
  hovered,
  validationErrors,
}) => {
  const theme = useTheme();
  // An undefined value means the chart was saved before `metric_rows` existed:
  // show the synthesized MoM/YoY pair. An explicit empty array means the user
  // removed every row and must stay empty.
  const rows: BigNumberMetricRow[] =
    value === undefined || value === null
      ? defaultRows
      : Array.isArray(value)
        ? value
        : [];
  const [editor, setEditor] = useState<EditorState | null>(null);

  const emit = (next: BigNumberMetricRow[]) => onChange?.(next);

  const patchSlot = (slotIndex: number, patch: Partial<SlotDraft>) => {
    setEditor(prev =>
      prev
        ? {
            ...prev,
            slots: prev.slots.map((slot, index) =>
              index === slotIndex ? { ...slot, ...patch } : slot,
            ),
          }
        : prev,
    );
  };

  const openNew = () =>
    setEditor({
      index: null,
      slots: Array.from({ length: DEFAULT_METRIC_SLOTS_PER_ROW }, emptyDraft),
    });

  const openEdit = (index: number) => {
    const slots = Array.isArray(rows[index]?.slots) ? rows[index].slots : [];
    // Keep the row's own slot count; never pad or trim it to two.
    const drafts = slots.slice(0, MAX_METRIC_SLOTS_PER_ROW).map(toDraft);
    setEditor({
      index,
      slots: drafts.length > 0 ? drafts : [emptyDraft()],
    });
  };

  const addSlot = () =>
    setEditor(prev =>
      prev && prev.slots.length < MAX_METRIC_SLOTS_PER_ROW
        ? { ...prev, slots: [...prev.slots, emptyDraft()] }
        : prev,
    );

  const removeSlot = (slotIndex: number) =>
    setEditor(prev =>
      prev && prev.slots.length > 1
        ? {
            ...prev,
            slots: prev.slots.filter((_, index) => index !== slotIndex),
          }
        : prev,
    );

  const saveDraft = () => {
    if (!editor) return;
    const row: BigNumberMetricRow = {
      id:
        editor.index === null ? nextId() : (rows[editor.index]?.id ?? nextId()),
      slots: editor.slots.slice(0, MAX_METRIC_SLOTS_PER_ROW).map(fromDraft),
    };
    const next =
      editor.index === null
        ? [...rows, row]
        : rows.map((item, index) => (index === editor.index ? row : item));
    emit(next);
    setEditor(null);
  };

  const removeRow = (index: number) =>
    emit(rows.filter((_, rowIndex) => rowIndex !== index));

  // Scope the sortable type to this control so a reorder can never be
  // confused with the column/metric pills of another control on the page.
  const reorderType = `MetricRowsRow_${name}`;
  const sortableItemIds = useMemo(
    () =>
      Array.from(
        { length: rows.length },
        (_, index) => `sortable-${reorderType}-${index}`,
      ),
    [rows.length, reorderType],
  );
  // ExploreDndContext calls this with the dragged row's index and the index
  // it was dropped over. `arrayMove` keeps the row objects (and their ids)
  // intact, so only the order reaches `onChange`.
  const reorderRows = useCallback(
    (from: number, to: number) => {
      if (
        from === to ||
        from < 0 ||
        to < 0 ||
        from >= rows.length ||
        to >= rows.length
      ) {
        return;
      }
      onChange?.(arrayMove(rows, from, to));
    },
    [rows, onChange],
  );

  const draft = editor?.slots ?? [];
  const offsetOptions = offsetChoices.map(offset => ({
    label: offset,
    value: offset,
  }));

  return (
    <div>
      <ControlHeader
        name={name}
        label={label}
        description={description}
        renderTrigger={renderTrigger}
        validationErrors={validationErrors}
        hovered={hovered}
      />
      <Container data-test="metric-rows-control">
        {rows.length === 0 && (
          <div
            css={css`
              color: ${theme.colorTextTertiary};
              font-size: ${theme.fontSizeSM}px;
              padding: ${theme.sizeUnit}px 0;
            `}
          >
            {t('No metric rows configured.')}
          </div>
        )}
        <SortableContext
          items={sortableItemIds}
          strategy={verticalListSortingStrategy}
        >
          {rows.map((row, index) => (
            <SortableMetricRow
              key={row.id ?? index}
              id={sortableItemIds[index]}
              index={index}
              row={row}
              reorderType={reorderType}
              onShiftOptions={reorderRows}
              onEdit={() => openEdit(index)}
              onRemove={() => removeRow(index)}
            />
          ))}
        </SortableContext>
        <AddButton size="small" onClick={openNew}>
          {t('+ Add metric row')}
        </AddButton>
      </Container>

      <Modal
        show={Boolean(editor)}
        onHide={() => setEditor(null)}
        onHandledPrimaryAction={saveDraft}
        primaryButtonName={t('Save')}
        width="640px"
        centered
        styles={MODAL_STYLES}
        destroyOnHidden
        title={
          editor?.index === null ? t('Add metric row') : t('Edit metric row')
        }
      >
        <div data-test="metric-rows-editor">
          {draft.map((slot, slotIndex) => (
            <React.Fragment key={slot.id ?? slotIndex}>
              <SectionTitle>
                <span>{t('Slot %s', slotIndex + 1)}</span>
                <Button
                  size="small"
                  danger
                  disabled={draft.length <= 1}
                  onClick={() => removeSlot(slotIndex)}
                >
                  {t('Remove slot')}
                </Button>
              </SectionTitle>
              <Row>
                <FieldLabel>{t('Show')}</FieldLabel>
                <Switch
                  checked={slot.show}
                  onChange={(checked: boolean) =>
                    patchSlot(slotIndex, { show: checked })
                  }
                />
              </Row>
              <Row>
                <FieldLabel>{t('Label')}</FieldLabel>
                <StyledInput
                  aria-label={t('Label')}
                  placeholder={t('Label (e.g. Headcount)')}
                  value={slot.label}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    patchSlot(slotIndex, { label: event.target.value })
                  }
                />
              </Row>
              <Row>
                <FieldLabel>{t('Value source')}</FieldLabel>
                <StyledSelect
                  aria-label={t('Value source')}
                  value={slot.mode}
                  options={MODE_OPTIONS}
                  onChange={(mode: BigNumberMetricSlotMode) =>
                    patchSlot(slotIndex, { mode })
                  }
                  showSearch={false}
                />
              </Row>
              {slot.mode === 'metric' ? (
                <>
                  <Row>
                    <FieldLabel>{t('Metric')}</FieldLabel>
                    <StyledSelect
                      aria-label={t('Metric')}
                      placeholder={t('Select a saved metric')}
                      value={slot.metricName || undefined}
                      options={metrics}
                      onChange={(metric: string) =>
                        patchSlot(slotIndex, { metricName: metric ?? '' })
                      }
                      allowClear
                      allowNewOptions
                      showSearch
                      notFoundContent={t(
                        'No saved metrics. Type a metric name or use a custom SQL expression.',
                      )}
                      popupMatchSelectWidth={220}
                    />
                  </Row>
                  <Row>
                    <FieldLabel>{t('Custom SQL')}</FieldLabel>
                    <StyledInput
                      aria-label={t('Custom SQL')}
                      placeholder={t('e.g. SUM(headcount)')}
                      value={slot.sqlExpression}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        patchSlot(slotIndex, {
                          sqlExpression: event.target.value,
                        })
                      }
                    />
                  </Row>
                  <Hint>
                    {t(
                      'A custom SQL expression takes precedence over the saved metric. This slot shows the metric value as-is, not a percentage change.',
                    )}
                  </Hint>
                </>
              ) : (
                <Row>
                  <FieldLabel>{t('Time shift')}</FieldLabel>
                  <StyledSelect
                    aria-label={t('Time shift')}
                    value={slot.offset || undefined}
                    options={offsetOptions}
                    onChange={(offset: string) =>
                      patchSlot(slotIndex, { offset: offset ?? '' })
                    }
                    allowNewOptions
                    showSearch
                    popupMatchSelectWidth={220}
                  />
                </Row>
              )}
              <Row>
                <FieldLabel>{t('Number format')}</FieldLabel>
                <StyledInput
                  aria-label={t('Number format')}
                  placeholder={t('Number format (e.g. SMART_NUMBER)')}
                  value={slot.numberFormat}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    patchSlot(slotIndex, { numberFormat: event.target.value })
                  }
                />
              </Row>
            </React.Fragment>
          ))}
          <SlotActions>
            <AddButton
              size="small"
              disabled={draft.length >= MAX_METRIC_SLOTS_PER_ROW}
              onClick={addSlot}
            >
              {t('+ Add slot')}
            </AddButton>
          </SlotActions>
        </div>
      </Modal>
    </div>
  );
};

export default MetricRowsControl;
