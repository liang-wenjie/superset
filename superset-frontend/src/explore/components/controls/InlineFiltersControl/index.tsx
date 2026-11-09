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
import React, { useCallback, useEffect, useState } from 'react';
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
import { SupersetClient } from '@superset-ui/core';
import ControlHeader from 'src/explore/components/ControlHeader';
import type {
  InlineFilterChangeValue,
  InlineFilterConfig,
  InlineFilterMatchMode,
  InlineFilterType,
  InlineFilterValue,
} from 'src/dashboard/components/InlineFilters/types';
import {
  getInlineFilterType,
  isInlineFilterInput,
  isInlineFilterInverse,
  isInlineFilterMulti,
  normalizeInlineFilterValue,
  sortInlineFilterOptions,
} from 'src/dashboard/components/InlineFilters/types';

let idCounter = 0;
const nextId = () => {
  idCounter += 1;
  return `inline_${Date.now()}_${idCounter}`;
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  font-size: ${({ theme }) => theme.fontSize}px;
  font-weight: ${({ theme }) => theme.fontWeightStrong};
  color: ${({ theme }) => theme.colorText};
  border-bottom: 1px solid ${({ theme }) => theme.colorBorderSecondary};
  padding-bottom: ${({ theme }) => theme.sizeUnit}px;
  margin: ${({ theme }) => theme.sizeUnit * 3}px 0
    ${({ theme }) => theme.sizeUnit * 2}px;
`;

const StyledSelect = styled(Select)`
  flex: 1;
  min-width: 0;
`;

const StyledInput = styled(Input)`
  flex: 1;
  min-width: 0;
`;

const SwitchLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme }) => theme.colorTextSecondary};
`;

const FieldLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme }) => theme.colorTextSecondary};
  flex-shrink: 0;
  min-width: 128px;
`;

const Hint = styled.div`
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme }) => theme.colorTextTertiary};
  line-height: ${({ theme }) => theme.lineHeight};
  margin: -4px 0 ${({ theme }) => theme.sizeUnit * 2}px;
`;

// Column names are frequently longer than the narrow control panel. Let the
// popup grow with its content instead of inheriting the trigger's width (which
// truncated every option to a couple of characters), and cap it so a single
// pathological name cannot push the dropdown off the screen. antd still puts a
// native `title` on every option for names that exceed the cap.
const POPUP_STYLES = {
  popup: { root: { maxWidth: 320 } },
};

// The editor has four sections and is easily taller than the viewport.
// Superset's Modal is not centered by default, so antd's fixed `top` offset
// pushes the footer below the screen edge. Center the dialog and cap the
// body height so only the form scrolls and Save/Cancel stay visible.
const EDITOR_BODY_MAX_HEIGHT = 'calc(100vh - 220px)';
const MODAL_STYLES: { body: CSSProperties } = {
  body: {
    maxHeight: EDITOR_BODY_MAX_HEIGHT,
    overflowY: 'auto',
  },
};

const EditorBody = styled.div`
  /* Keep the last hint from sitting flush against the scroll boundary. */
  padding-bottom: ${({ theme }) => theme.sizeUnit * 2}px;
`;

const AddButton = styled(Button)`
  align-self: flex-start;
`;

interface ColumnMeta {
  column_name: string;
  type?: string;
  type_generic?: string;
}

interface MetricOption {
  label: string;
  value: string;
}

export interface InlineFiltersControlProps {
  name: string;
  label: string;
  description?: string;
  value?: InlineFilterConfig[];
  columns?: ColumnMeta[];
  /** Datasource key parts, used to offer real column values as defaults. */
  datasourceId?: string | number;
  datasourceType?: string;
  /** Datasource metrics offered in the "Sort metric" picker. */
  metrics?: MetricOption[];
  onChange?: (value: InlineFilterConfig[]) => void;
  renderTrigger?: boolean;
  hovered?: boolean;
  validationErrors?: string[];
}

interface EditorState {
  /** `null` while creating a new filter. */
  index: number | null;
  draft: InlineFilterConfig;
}

const SORT_OPTIONS = [
  { label: t('Ascending'), value: 'asc' },
  { label: t('Descending'), value: 'desc' },
];

const FILTER_TYPE_OPTIONS: { label: string; value: InlineFilterType }[] = [
  { label: t('Single select'), value: 'single' },
  { label: t('Multiple select'), value: 'multiple' },
  { label: t('Text input'), value: 'input' },
];

const MATCH_MODE_OPTIONS: { label: string; value: InlineFilterMatchMode }[] = [
  { label: t('Exact match'), value: 'exact' },
  { label: t('Fuzzy match (contains)'), value: 'contains' },
];

const FILTER_TYPE_LABELS: Record<InlineFilterType, string> = {
  single: t('Single'),
  multiple: t('Multi'),
  input: t('Input'),
};

type ColumnValuesStatus = 'idle' | 'loading' | 'loaded' | 'empty' | 'error';

// An empty dropdown with no explanation looks broken. Tell the user exactly
// why there are no suggestions and that manual entry still works.
const getColumnValuesHint = (status: ColumnValuesStatus): string => {
  switch (status) {
    case 'idle':
      return t('Select a column first, then pick or type its default value.');
    case 'loading':
      return t('Loading the values of this column...');
    case 'empty':
      return t(
        'No values were returned for this column. Type a value to use as the default.',
      );
    case 'error':
      return t(
        "Could not load this column's values (check dataset permissions). You can still type a value.",
      );
    default:
      return t(
        'Pick a real value of this column. Applied only on first load; an explicit clear keeps the filter cleared.',
      );
  }
};

const describeDefault = (config: InlineFilterConfig): string => {
  if (config.defaultToFirstItem) {
    return config.sortAscending === false
      ? t('First value (descending)')
      : t('First value (ascending)');
  }
  if (Array.isArray(config.defaultValue)) {
    return config.defaultValue.map(String).join(', ');
  }
  return config.defaultValue === undefined || config.defaultValue === null
    ? ''
    : String(config.defaultValue);
};

const InlineFiltersControl: React.FC<InlineFiltersControlProps> = ({
  name,
  label,
  description,
  value,
  columns = [],
  datasourceId,
  datasourceType,
  metrics = [],
  onChange,
  renderTrigger,
  hovered,
  validationErrors,
}) => {
  const theme = useTheme();
  const groups: InlineFilterConfig[] = Array.isArray(value) ? value : [];
  const [editor, setEditor] = useState<EditorState | null>(null);

  const emit = useCallback(
    (next: InlineFilterConfig[]) => {
      onChange?.(next);
    },
    [onChange],
  );

  const patchDraft = (patch: Partial<InlineFilterConfig>) => {
    setEditor(prev =>
      prev ? { ...prev, draft: { ...prev.draft, ...patch } } : prev,
    );
  };

  const openNew = () =>
    setEditor({ index: null, draft: { id: nextId(), column: '', label: '' } });

  const openEdit = (idx: number) =>
    setEditor({ index: idx, draft: { ...groups[idx] } });

  const removeGroup = (idx: number) => {
    emit(groups.filter((_, i) => i !== idx));
  };

  // The modal edits a draft: nothing is written back to formData until Save,
  // so typing in a text field no longer re-triggers the chart query.
  const saveDraft = () => {
    if (!editor || !editor.draft.column) return;
    const draft: InlineFilterConfig = { ...editor.draft };
    if (draft.defaultToFirstItem) draft.defaultValue = undefined;
    if (!draft.sortMetric) draft.sortMetric = undefined;
    // `filterType` is the source of truth for the value shape; keep the
    // legacy flag in sync so older readers of formData still see it. The
    // inverse switch stays independent and is written as-is.
    draft.filterType = getInlineFilterType(draft);
    draft.multi = isInlineFilterMulti(draft);
    draft.inverseSelection = isInlineFilterInverse(draft);
    if (getInlineFilterType(draft) !== 'input') draft.matchMode = undefined;
    // A text-input filter has no option list, so a first-item default can
    // never be resolved; drop it so the custom default picker stays reachable.
    if (isInlineFilterInput(draft)) draft.defaultToFirstItem = false;
    emit(
      editor.index === null
        ? [...groups, draft]
        : groups.map((group, idx) => (idx === editor.index ? draft : group)),
    );
    setEditor(null);
  };

  const columnOptions = columns.map(c => ({
    value: c.column_name,
    label: c.column_name,
  }));

  // Offer the column's real distinct values as default choices. The same
  // endpoint feeds the runtime filter bar, so a configured default always
  // corresponds to a value that can actually be selected. Only the column
  // currently being edited needs to be fetched.
  const [valuesByColumn, setValuesByColumn] = useState<
    Record<
      string,
      {
        status: 'loaded' | 'error';
        options: { label: string; value: string }[];
      }
    >
  >({});
  const activeColumn = editor?.draft.column ?? '';
  const canLoadValues = Boolean(activeColumn && datasourceId && datasourceType);
  // Keyed by column so switching the dialog's column immediately shows a
  // loading state instead of briefly offering values from the previous column.
  // A missing entry means the request is still in flight; deriving the status
  // avoids a synchronous setState inside the effect.
  const entry = valuesByColumn[activeColumn];
  const columnValues = entry?.options ?? [];
  const columnValuesStatus: ColumnValuesStatus = !canLoadValues
    ? 'idle'
    : !entry
      ? 'loading'
      : entry.status === 'error'
        ? 'error'
        : entry.options.length > 0
          ? 'loaded'
          : 'empty';

  useEffect(() => {
    if (!activeColumn || !datasourceId || !datasourceType) return undefined;
    let cancelled = false;
    SupersetClient.get({
      endpoint:
        `/api/v1/datasource/${datasourceType}/${datasourceId}` +
        `/column/${encodeURIComponent(activeColumn)}/values/`,
    })
      .then(({ json }) => {
        if (cancelled) return;
        const values: unknown[] = json?.result ?? [];
        const seen = new Set<string>();
        const options = values
          .filter(v => v !== null && v !== undefined)
          .map(v => ({ label: String(v), value: String(v) }))
          .filter(opt => {
            if (seen.has(opt.value)) return false;
            seen.add(opt.value);
            return true;
          });
        setValuesByColumn(prev => ({
          ...prev,
          [activeColumn]: { status: 'loaded', options },
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setValuesByColumn(prev => ({
          ...prev,
          [activeColumn]: { status: 'error', options: [] },
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [activeColumn, datasourceId, datasourceType]);

  // Only real column values: picking "first value" is an explicit switch, so
  // no config-time sentinel may leak into `defaultValue`. The saved default
  // and any static options stay visible even when the endpoint fails, and
  // `allowNewOptions` keeps manual entry available.
  const getDefaultOptions = (draft: InlineFilterConfig) => {
    const merged: { label: string; value: string }[] = [...columnValues];
    const add = (value: InlineFilterValue, label?: string) => {
      const stringValue = String(value);
      if (!merged.some(option => option.value === stringValue)) {
        merged.push({ label: label ?? stringValue, value: stringValue });
      }
    };
    (draft.options ?? []).forEach(option => add(option.value, option.label));
    const saved = draft.defaultValue;
    if (Array.isArray(saved)) {
      saved.forEach(value => add(value));
    } else if (saved !== undefined && saved !== null) {
      add(saved);
    }
    // Only real column values: picking "first value" is now an explicit
    // switch, so no config-time sentinel may leak into `defaultValue`.
    return sortInlineFilterOptions(merged, draft.sortAscending !== false);
  };

  const getDefaultPickerValue = (draft: InlineFilterConfig) =>
    normalizeInlineFilterValue(
      draft.defaultValue,
      isInlineFilterMulti(draft),
    ) ?? undefined;

  const draft = editor?.draft;
  const isInput = draft ? isInlineFilterInput(draft) : false;
  const dependencyOptions = groups
    .filter(group => group.id !== draft?.id)
    .map(group => ({
      label: group.label || group.column,
      value: group.id,
    }));
  const dependenciesEnabled =
    draft?.dependsOn === undefined || (draft?.dependsOn.length ?? 0) > 0;

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
      <Container data-test="inline-filters-control">
        {groups.length === 0 && (
          <div
            css={css`
              color: ${theme.colorTextTertiary};
              font-size: ${theme.fontSizeSM}px;
              padding: ${theme.sizeUnit}px 0;
            `}
          >
            {t('No inline filters configured.')}
          </div>
        )}
        {groups.map((group, idx) => {
          const defaultValueText = describeDefault(group);
          return (
            <ListRow key={group.id} data-test="inline-filter-row">
              <RowTitle>
                <RowTitleText>{group.label || group.column}</RowTitleText>
                <RowSubtitle>
                  {group.label ? group.column : defaultValueText || ''}
                </RowSubtitle>
              </RowTitle>
              <Chip data-test="inline-filter-chip">
                {FILTER_TYPE_LABELS[getInlineFilterType(group)]}
              </Chip>
              <Button size="small" onClick={() => openEdit(idx)}>
                {t('Edit')}
              </Button>
              <Button size="small" danger onClick={() => removeGroup(idx)}>
                {t('Remove')}
              </Button>
            </ListRow>
          );
        })}
        <AddButton size="small" onClick={openNew}>
          {t('+ Add inline filter')}
        </AddButton>
      </Container>

      <Modal
        show={Boolean(editor)}
        onHide={() => setEditor(null)}
        onHandledPrimaryAction={saveDraft}
        primaryButtonName={t('Save')}
        disablePrimaryButton={!draft?.column}
        width="640px"
        centered
        styles={MODAL_STYLES}
        destroyOnHidden
        title={
          editor?.index === null
            ? t('Add inline filter')
            : t('Edit inline filter')
        }
      >
        {draft && (
          <EditorBody data-test="inline-filter-editor">
            <SectionTitle>{t('Field')}</SectionTitle>
            <Row>
              <FieldLabel>{t('Column')}</FieldLabel>
              <StyledSelect
                aria-label={t('Column')}
                placeholder={t('Select column')}
                value={draft.column || undefined}
                options={columnOptions}
                onChange={(col: string) =>
                  patchDraft({
                    column: col ?? '',
                    // Values belong to a specific column; keep the saved
                    // default only when the column did not change.
                    defaultValue:
                      col === draft.column ? draft.defaultValue : undefined,
                  })
                }
                showSearch
                allowClear
                popupMatchSelectWidth={false}
                styles={POPUP_STYLES}
              />
            </Row>
            <Row>
              <FieldLabel>{t('Display label')}</FieldLabel>
              <StyledInput
                aria-label={t('Label')}
                placeholder={t('Label (e.g. Category)')}
                value={draft.label || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  patchDraft({ label: e.target.value })
                }
              />
            </Row>
            <Row>
              <FieldLabel>{t('Description')}</FieldLabel>
              <StyledInput
                aria-label={t('Description')}
                placeholder={t('Shown as a tooltip on the filter label')}
                value={draft.description || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  patchDraft({ description: e.target.value })
                }
              />
            </Row>

            <SectionTitle>{t('Default value & sorting')}</SectionTitle>
            {!isInput && (
              <>
                <Row>
                  <FieldLabel>{t('Sort filter values')}</FieldLabel>
                  <StyledSelect
                    aria-label={t('Sort filter values')}
                    value={draft.sortAscending === false ? 'desc' : 'asc'}
                    options={SORT_OPTIONS}
                    onChange={(direction: string) =>
                      patchDraft({ sortAscending: direction !== 'desc' })
                    }
                    showSearch={false}
                    popupMatchSelectWidth={220}
                  />
                </Row>
                <Hint>
                  {t(
                    'Ascending or descending order of the dropdown values. It also decides which value counts as "first" when the switch below is on.',
                  )}
                </Hint>
                <Row>
                  <FieldLabel>{t('Sort metric')}</FieldLabel>
                  <StyledSelect
                    aria-label={t('Sort metric')}
                    placeholder={t('Sort by the value itself')}
                    value={draft.sortMetric || undefined}
                    options={metrics}
                    onChange={(metric: string) =>
                      patchDraft({ sortMetric: metric || undefined })
                    }
                    allowClear
                    allowNewOptions
                    showSearch
                    notFoundContent={t(
                      'No saved metrics on this dataset. Type a saved metric name, or leave this empty to sort by value.',
                    )}
                    popupMatchSelectWidth={220}
                    styles={POPUP_STYLES}
                  />
                </Row>
                <Hint>
                  {t(
                    'Order the available values by a saved metric instead of by the value itself. This runs an extra query per filter. Leave empty to sort by value.',
                  )}
                </Hint>
                <Row>
                  <Switch
                    size="small"
                    aria-label={t('Select first filter value by default')}
                    checked={Boolean(draft.defaultToFirstItem)}
                    onChange={(checked: boolean) =>
                      patchDraft({
                        defaultToFirstItem: checked,
                        // Mirrors the native dashboard filter: first-item and
                        // a concrete default value are mutually exclusive.
                        defaultValue: checked ? undefined : draft.defaultValue,
                      })
                    }
                  />
                  <SwitchLabel>
                    {t('Select first filter value by default')}
                  </SwitchLabel>
                </Row>
                <Hint>
                  {t(
                    'When on, the first value after sorting is selected automatically and a custom default cannot be set. Switching it off lets you pick a value from the dropdown below.',
                  )}
                </Hint>
              </>
            )}
            {!draft.defaultToFirstItem && (
              <>
                <Row>
                  <FieldLabel>{t('Default value')}</FieldLabel>
                  <StyledSelect
                    aria-label={t('Default value')}
                    placeholder={
                      activeColumn
                        ? t('Select default value')
                        : t('Select a column first')
                    }
                    disabled={!activeColumn}
                    value={getDefaultPickerValue(draft) as never}
                    options={getDefaultOptions(draft) as never}
                    mode={isInlineFilterMulti(draft) ? 'multiple' : 'single'}
                    oneLine={isInlineFilterMulti(draft)}
                    allowClear
                    allowNewOptions
                    showSearch
                    notFoundContent={t(
                      'No column values loaded. Type a value to use as the default.',
                    )}
                    popupMatchSelectWidth={220}
                    styles={POPUP_STYLES}
                    onChange={(raw: never) =>
                      patchDraft({
                        defaultValue:
                          normalizeInlineFilterValue(
                            raw as InlineFilterChangeValue,
                            isInlineFilterMulti(draft),
                          ) ?? undefined,
                      })
                    }
                  />
                </Row>
                <Hint>{getColumnValuesHint(columnValuesStatus)}</Hint>
              </>
            )}

            <SectionTitle>{t('Filter settings')}</SectionTitle>
            <Row>
              <FieldLabel>{t('Filter type')}</FieldLabel>
              <StyledSelect
                aria-label={t('Filter type')}
                value={getInlineFilterType(draft)}
                options={FILTER_TYPE_OPTIONS}
                onChange={(type: string) => {
                  const filterType = type as InlineFilterType;
                  const next = { ...draft, filterType };
                  const nextMulti = isInlineFilterMulti(next);
                  patchDraft({
                    filterType,
                    // Keep the legacy flag in sync and normalize a saved
                    // default so scalar/array shape matches the new operator.
                    // Exclusion is an independent switch and is left alone.
                    multi: nextMulti,
                    defaultValue: draft.defaultToFirstItem
                      ? undefined
                      : (normalizeInlineFilterValue(
                          draft.defaultValue,
                          nextMulti,
                        ) ?? undefined),
                  });
                }}
                showSearch={false}
                popupMatchSelectWidth={220}
              />
            </Row>
            <Hint>
              {t(
                'Single and Multiple show a value dropdown; Text input lets users type a value instead of picking one. Use the Inverse selection switch below to exclude matches.',
              )}
            </Hint>
            {isInput && (
              <>
                <Row>
                  <FieldLabel>{t('Match mode')}</FieldLabel>
                  <StyledSelect
                    aria-label={t('Match mode')}
                    value={draft.matchMode ?? 'exact'}
                    options={MATCH_MODE_OPTIONS}
                    onChange={(mode: string) =>
                      patchDraft({
                        matchMode: mode as InlineFilterMatchMode,
                      })
                    }
                    showSearch={false}
                    popupMatchSelectWidth={220}
                  />
                </Row>
                <Hint>
                  {t(
                    'Exact match filters on equality; fuzzy match wraps the typed text in wildcards and uses a case-insensitive contains comparison.',
                  )}
                </Hint>
              </>
            )}
            <Row>
              <Switch
                size="small"
                aria-label={t('Inverse selection')}
                checked={isInlineFilterInverse(draft)}
                onChange={(checked: boolean) =>
                  patchDraft({ inverseSelection: checked })
                }
              />
              <SwitchLabel>{t('Inverse selection')}</SwitchLabel>
            </Row>
            <Hint>
              {t(
                'Exclude the selected values instead of including them: != / NOT IN, or NOT ILIKE for a fuzzy text input. Works with every filter type.',
              )}
            </Hint>
            <Row>
              <Switch
                size="small"
                aria-label={t('Required')}
                checked={Boolean(draft.required)}
                onChange={(checked: boolean) =>
                  patchDraft({ required: checked })
                }
              />
              <SwitchLabel>{t('Required')}</SwitchLabel>
            </Row>
            <Hint>
              {t(
                'Users cannot clear a required filter. Without a default value, the first available value is applied automatically.',
              )}
            </Hint>
            {!isInput && (
              <>
                <Row>
                  <Switch
                    size="small"
                    aria-label={t('Show search box')}
                    checked={draft.showSearch !== false}
                    onChange={(checked: boolean) =>
                      patchDraft({ showSearch: checked })
                    }
                  />
                  <SwitchLabel>{t('Show search box')}</SwitchLabel>
                </Row>
                <Hint>
                  {t(
                    'Let users type in the dropdown to search the available values. The search is sent to the server, so high-cardinality columns work too.',
                  )}
                </Hint>
              </>
            )}

            <SectionTitle>{t('Dependencies')}</SectionTitle>
            <Row>
              <Switch
                size="small"
                aria-label={t('These values depend on other filters')}
                checked={dependenciesEnabled}
                onChange={(checked: boolean) =>
                  patchDraft({ dependsOn: checked ? undefined : [] })
                }
              />
              <SwitchLabel>
                {t('These values depend on other filters')}
              </SwitchLabel>
            </Row>
            {dependenciesEnabled && (
              <>
                <Row>
                  <FieldLabel>{t('Depends on')}</FieldLabel>
                  <StyledSelect
                    aria-label={t('Depends on')}
                    mode="multiple"
                    placeholder={t('All sibling inline filters')}
                    value={(draft.dependsOn ?? []) as never}
                    options={dependencyOptions as never}
                    onChange={(ids: string[]) =>
                      patchDraft({
                        dependsOn: ids.length > 0 ? ids : undefined,
                      })
                    }
                    allowClear
                    showSearch
                    popupMatchSelectWidth={220}
                    styles={POPUP_STYLES}
                  />
                </Row>
                <Hint>
                  {t(
                    'Leave empty to follow every sibling inline filter. Turn the switch off to stop inheriting their values entirely.',
                  )}
                </Hint>
              </>
            )}
          </EditorBody>
        )}
      </Modal>
    </div>
  );
};

export default InlineFiltersControl;
