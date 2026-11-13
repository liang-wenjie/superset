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
import { getMetricLabel } from '@superset-ui/core';
import type { QueryFormMetric } from '@superset-ui/core';
import { D3_FORMAT_OPTIONS } from '@superset-ui/chart-controls';
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
import AdhocMetric from 'src/explore/components/controls/MetricControl/AdhocMetric';
import AdhocMetricPopoverTrigger from 'src/explore/components/controls/MetricControl/AdhocMetricPopoverTrigger';
import type { savedMetricType } from 'src/explore/components/controls/MetricControl/types';
import type { Datasource } from 'src/explore/types';
import type { ISaveableDatasource } from 'src/SqlLab/components/SaveDatasetModal';
import {
  DEFAULT_METRIC_SLOTS_PER_ROW,
  MAX_METRIC_SLOTS_PER_ROW,
} from 'src/explore/controlUtils/metricRowsTypes';
import type {
  BigNumberMetricColumn,
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

// A native-style metric pill: the very same look as the pills in the Metrics
// control, but without its drag/remove affordances (a slot owns exactly one
// metric). Clicking it opens the standard metric edit popover.
const MetricFieldWrapper = styled.div`
  flex: 1;
  min-width: 0;
`;

const MetricValuePill = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  height: ${({ theme }) => theme.sizeUnit * 6}px;
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  background-color: ${({ theme }) => theme.colorBgLayout};
  border-radius: ${({ theme }) => theme.borderRadiusSM}px;
  cursor: pointer;
  &:hover {
    background-color: ${({ theme }) => theme.colorPrimaryBgHover};
  }
`;

const MetricValueLabel = styled.span`
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  padding-left: ${({ theme }) => theme.sizeUnit}px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  svg {
    margin-right: ${({ theme }) => theme.sizeUnit}px;
    flex-shrink: 0;
  }
`;

const MetricCaret = styled.span`
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 ${({ theme }) => theme.sizeUnit}px;
  border-left: 1px solid ${({ theme }) => theme.colorSplit};
  color: ${({ theme }) => theme.colorIcon};
`;

const AddMetricLabel = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  height: ${({ theme }) => theme.sizeUnit * 6}px;
  padding-left: ${({ theme }) => theme.sizeUnit}px;
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme }) => theme.colorTextSecondary};
  border: dashed 1px ${({ theme }) => theme.colorSplit};
  border-radius: ${({ theme }) => theme.borderRadius}px;
  cursor: pointer;
  &:hover {
    background-color: ${({ theme }) => theme.colorFillSecondary};
  }
  svg {
    margin-right: ${({ theme }) => theme.sizeUnit}px;
  }
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

// Reuse the EXACT presets of the chart-level Number format (y_axis_format)
// control instead of asking the user to type a D3 format string.
const NUMBER_FORMAT_OPTIONS = D3_FORMAT_OPTIONS.map(([value, label]) => ({
  value,
  label,
}));

/**
 * Charts saved while this field was free text may carry a custom format such
 * as `,.2%` that is not a preset. Keep it visible and selectable as a one-off
 * option so opening + saving an old row never silently drops the format.
 */
const numberFormatOptions = (current: string) =>
  !current || NUMBER_FORMAT_OPTIONS.some(option => option.value === current)
    ? NUMBER_FORMAT_OPTIONS
    : [{ value: current, label: current }, ...NUMBER_FORMAT_OPTIONS];

type SlotDraft = {
  id?: string;
  show: boolean;
  label: string;
  mode: BigNumberMetricSlotMode;
  offset: string;
  /** Full QueryFormMetric: a saved metric name or an adhoc metric object. */
  metric?: BigNumberMetricColumn;
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
  columns?: { column_name: string; type: string }[];
  savedMetrics?: savedMetricType[];
  datasource?: Datasource & ISaveableDatasource;
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
  metric: undefined,
  numberFormat: '',
});

/**
 * The native metric popover returns either a saved metric object or an
 * `AdhocMetric` instance (plus the edited label). form_data must stay plain
 * JSON, so reduce both shapes to the `QueryFormMetric` the query layer reads:
 * a saved metric name string, or a SIMPLE/SQL adhoc metric object.
 */
const toStoredMetric = (metric: unknown): BigNumberMetricColumn | undefined => {
  if (!metric || typeof metric !== 'object') return undefined;
  const record = metric as Record<string, unknown>;
  if (typeof record.metric_name === 'string' && record.metric_name) {
    return record.metric_name;
  }
  const { expressionType } = record;
  if (expressionType !== 'SIMPLE' && expressionType !== 'SQL') {
    return undefined;
  }
  const stored: Record<string, unknown> = { expressionType };
  [
    'label',
    'sqlExpression',
    'column',
    'aggregate',
    'hasCustomLabel',
    'optionName',
  ].forEach(key => {
    if (record[key] !== undefined && record[key] !== null) {
      stored[key] = record[key];
    }
  });
  return stored as BigNumberMetricColumn;
};

/** Old charts may hold a bare `{ label }`/`{ sqlExpression }` object. */
const normalizeMetric = (
  metric: BigNumberMetricColumn | undefined,
): BigNumberMetricColumn | undefined => {
  if (!metric || typeof metric === 'string') return metric;
  if (metric.expressionType) return metric;
  const expression = metric.sqlExpression || metric.label;
  if (!expression) return undefined;
  return {
    expressionType: 'SQL',
    sqlExpression: expression,
    label: metric.label || expression,
    hasCustomLabel: true,
  };
};

/** The result column is named by the metric label, exactly as the backend does. */
const metricDisplayLabel = (metric: BigNumberMetricColumn): string => {
  if (typeof metric === 'string') return metric;
  const label = getMetricLabel(metric as unknown as QueryFormMetric);
  return (
    label ||
    String(metric.label ?? metric.sqlExpression ?? '') ||
    t('No metric')
  );
};

type MetricFieldProps = {
  metric?: BigNumberMetricColumn;
  columns: { column_name: string; type: string }[];
  savedMetrics: savedMetricType[];
  datasource?: Datasource & ISaveableDatasource;
  onChange: (metric?: BigNumberMetricColumn) => void;
};

/**
 * Reuse the Explore "Metric" configuration verbatim: the trigger owns the
 * Saved / Simple / Custom SQL popover, including column+aggregate selectors,
 * SQL validation and the custom label editor. Nothing here re-implements any
 * of that UI; only the resulting QueryFormMetric is stored on the slot.
 */
const MetricField: React.FC<MetricFieldProps> = ({
  metric,
  columns,
  savedMetrics,
  datasource,
  onChange,
}) => {
  const savedMetric = useMemo(
    () =>
      typeof metric === 'string'
        ? savedMetrics.find(item => item.metric_name === metric)
        : undefined,
    [metric, savedMetrics],
  );

  // A stable instance is important: the trigger resets its reducer whenever
  // `optionName` changes, so rebuilding it on every render would fight with
  // in-progress label edits.
  const adhocMetric = useMemo(() => {
    const source =
      metric && typeof metric === 'object' && !('metric_name' in metric)
        ? (metric as ConstructorParameters<typeof AdhocMetric>[0])
        : {};
    return new AdhocMetric(source);
  }, [metric]);

  const handleMetricEdit = useCallback(
    (newMetric: unknown) => onChange(toStoredMetric(newMetric)),
    [onChange],
  );

  const label = metric ? metricDisplayLabel(metric) : '';

  return (
    <MetricFieldWrapper>
      <AdhocMetricPopoverTrigger
        adhocMetric={adhocMetric}
        onMetricEdit={handleMetricEdit}
        columns={columns}
        savedMetricsOptions={savedMetrics}
        savedMetric={savedMetric ?? {}}
        datasource={datasource as Datasource & ISaveableDatasource}
        isNew={!metric}
      >
        {metric ? (
          <MetricValuePill
            aria-label={t('Edit metric')}
            data-test="metric-slot-value"
          >
            <MetricValueLabel>
              <Icons.FunctionOutlined iconSize="m" />
              {label}
            </MetricValueLabel>
            <MetricCaret>
              <Icons.RightOutlined iconSize="m" />
            </MetricCaret>
          </MetricValuePill>
        ) : (
          <AddMetricLabel aria-label={t('Add metric')}>
            <Icons.PlusOutlined iconSize="m" />
            {t('Add metric')}
          </AddMetricLabel>
        )}
      </AdhocMetricPopoverTrigger>
    </MetricFieldWrapper>
  );
};

/** Saved metrics are strings; adhoc metrics are QueryFormMetric objects. */
const toDraft = (slot: BigNumberMetricSlot): SlotDraft => {
  const base = emptyDraft();
  const metric = normalizeMetric(slot.column);
  return {
    ...base,
    id: slot.id,
    show: slot.show !== false,
    label: slot.label ?? '',
    mode: slot.mode ?? (metric ? 'metric' : 'time_shift'),
    offset: slot.offset ?? base.offset,
    metric:
      metric && (slot.mode === 'metric' || !slot.mode) ? metric : undefined,
    numberFormat: slot.numberFormat ?? '',
  };
};

const fromDraft = (draft: SlotDraft): BigNumberMetricSlot => ({
  id: draft.id ?? nextId(),
  show: draft.show,
  label: draft.label,
  mode: draft.mode,
  offset: draft.mode === 'time_shift' ? draft.offset : undefined,
  column: draft.mode === 'metric' ? draft.metric : undefined,
  numberFormat: draft.numberFormat.trim() || undefined,
});

const describeSlot = (slot: BigNumberMetricSlot): string => {
  if (slot.show === false) return t('Hidden');
  const { column } = slot;
  const source =
    slot.mode === 'metric'
      ? column
        ? metricDisplayLabel(column)
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
  columns = [],
  savedMetrics = [],
  datasource,
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
                    <MetricField
                      metric={slot.metric}
                      columns={columns}
                      savedMetrics={savedMetrics}
                      datasource={datasource}
                      onChange={(metric?: BigNumberMetricColumn) =>
                        patchSlot(slotIndex, { metric })
                      }
                    />
                  </Row>
                  <Hint>
                    {t(
                      'Pick a saved metric, build a simple aggregate or write custom SQL with the standard metric editor. This slot shows the metric value as-is, not a percentage change.',
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
                <StyledSelect
                  aria-label={t('Number format')}
                  placeholder={t('Use chart format')}
                  value={slot.numberFormat || undefined}
                  options={numberFormatOptions(slot.numberFormat)}
                  onChange={(format: string) =>
                    patchSlot(slotIndex, { numberFormat: format ?? '' })
                  }
                  allowClear
                  showSearch
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
