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
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { t } from '@apache-superset/core/translation';
import { css, styled } from '@apache-superset/core/theme';
import {
  buildHeaderGroupAnchor,
  encodeHeaderGroupAnchor,
  getHeaderGroupAnchor,
  getHeaderGroupAnchorSide,
  getHeaderGroupAnchorTarget,
  HEADER_GROUP_ANCHOR_TABLE,
} from '@superset-ui/chart-controls';
import { Button, Input, Popover, Select } from '@superset-ui/core/components';
import { Radio } from '@superset-ui/core/components/Radio';
import { Icons } from '@superset-ui/core/components/Icons';
import {
  HeaderGroupAnchorSide,
  HeaderGroupColumnOption,
  HeaderGroupConfig,
  HeaderGroupLabelAlign,
  MAX_HEADER_GROUP_DEPTH,
} from './types';
import {
  canSaveHeaderGroup,
  collectUsedHeaderGroupColumns,
  createHeaderGroup,
  moveHeaderGroupAt,
  normalizeSelectedColumns,
  removeHeaderGroupAt,
  updateHeaderGroupAt,
} from './utils';
import GroupColumnSorter from './GroupColumnSorter';

export type HeaderGroupEditorProps = {
  group?: HeaderGroupConfig;
  path: number[];
  /** All top-level groups, so a group can be anchored after a sibling. */
  groups?: HeaderGroupConfig[];
  columnOptions: HeaderGroupColumnOption[];
  usedColumns: Set<string>;
  onChange?: (path: number[], next: HeaderGroupConfig) => void;
  onAddChild?: (path: number[]) => void;
  onRemove?: (path: number[]) => void;
  onSave?: (group: HeaderGroupConfig) => void;
  mode?: 'add' | 'edit';
  children?: ReactNode;
};

export type HeaderGroupAnchorOption = { label: string; value: string };
export type HeaderGroupAnchorOptionGroup = {
  label: string;
  options: HeaderGroupAnchorOption[];
};

const FormStack = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-direction: column;
    gap: ${theme.sizeUnit * 3}px;
    min-width: ${theme.sizeUnit * 92}px;
  `}
`;

const FieldRow = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-direction: column;
    gap: ${theme.sizeUnit}px;
  `}
`;

const InlineFields = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-wrap: nowrap;
    align-items: flex-start;
    gap: ${theme.sizeUnit * 3}px;

    & > * {
      min-width: 0;
    }

    & > *:first-of-type {
      flex: 1.4 1 auto;
    }

    & > *:last-of-type {
      flex: 1 1 auto;
    }
  `}
`;

const AnchorSelectWrapper = styled.div`
  ${({ theme }) => css`
    min-width: 0;
    font-size: ${theme.fontSizeSM}px;

    .ant-select {
      width: 100%;
    }
  `}
`;

const CompactRadioGroup = styled.div`
  ${({ theme }) => css`
    .ant-radio-group {
      display: flex;
      flex-wrap: nowrap;
      width: 100%;
    }

    .ant-radio-button-wrapper {
      flex: 1 1 auto;
      height: ${theme.sizeUnit * 6}px;
      line-height: ${theme.sizeUnit * 6 - 2}px;
      padding-inline: ${theme.sizeUnit}px;
      font-size: ${theme.fontSizeSM}px;
      text-align: center;
    }
  `}
`;

const FieldLabel = styled.span`
  ${({ theme }) => css`
    color: ${theme.colorTextSecondary};
    font-size: ${theme.fontSizeSM}px;
  `}
`;

const FieldError = styled.span`
  ${({ theme }) => css`
    color: ${theme.colorError};
    font-size: ${theme.fontSizeSM}px;
  `}
`;

const NestedCard = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-direction: column;
    gap: ${theme.sizeUnit * 2}px;
    padding: ${theme.sizeUnit * 2}px;
    border: 1px solid ${theme.colorBorder};
    border-radius: ${theme.borderRadius}px;
  `}
`;

const NestedHeader = styled.div`
  ${({ theme }) => css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: ${theme.sizeUnit}px;
    font-weight: ${theme.fontWeightStrong};
  `}
`;

const NestedHeaderActions = styled.div`
  display: inline-flex;
  align-items: center;
`;

const PopoverTitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.sizeUnit}px;
`;

const ApplyRow = styled.div`
  display: flex;
  justify-content: flex-end;
`;

function SettingsToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      buttonStyle="link"
      buttonSize="small"
      aria-label={collapsed ? t('Expand settings') : t('Collapse settings')}
      onClick={event => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      icon={
        collapsed ? (
          <Icons.DownOutlined iconSize="s" />
        ) : (
          <Icons.UpOutlined iconSize="s" />
        )
      }
    />
  );
}

const LABEL_ALIGN_OPTIONS: { label: string; value: HeaderGroupLabelAlign }[] = [
  { label: t('Left'), value: 'left' },
  { label: t('Center'), value: 'center' },
  { label: t('Right'), value: 'right' },
];

/** All column identifiers claimed by a group and its nested subgroups. */
function collectSubtreeColumns(group: HeaderGroupConfig): string[] {
  return [
    ...(group.columns ?? []),
    ...(group.children ?? []).flatMap(collectSubtreeColumns),
  ];
}

function getGroupAtPath(
  groups: HeaderGroupConfig[],
  path: number[],
): HeaderGroupConfig | undefined {
  let level = groups;
  let current: HeaderGroupConfig | undefined;
  path.forEach(index => {
    current = level[index];
    level = current?.children ?? [];
  });
  return current;
}

const ANCHOR_SIDE_OPTIONS: {
  label: string;
  value: HeaderGroupAnchorSide;
}[] = [
  { label: t('Before'), value: 'before' },
  { label: t('After'), value: 'after' },
];

/** The first control only picks a target (whole table, a column, or a group).
 * Labels stay plain so the list reads like the chart itself; the separate
 * side control decides which side of that target the group lands on.
 * Options are scoped to the current level: a subgroup can only anchor to a
 * sibling group or to a column that lives under its own parent.
 * Columns already owned by a group in this scope are addressed through the
 * Groups section instead, so they are not offered twice as column targets.
 * The one exception is a column that is the currently saved anchor: keeping
 * it visible avoids silently resetting an existing chart's insert position. */
export function buildHeaderGroupAnchorTargetOptions({
  scope,
  candidateGroups,
  columnOptions,
  groupedColumnKeys = new Set<string>(),
  pinnedColumnKeys = new Set<string>(),
}: {
  scope: 'table' | 'group';
  candidateGroups: HeaderGroupConfig[];
  columnOptions: HeaderGroupColumnOption[];
  groupedColumnKeys?: Set<string>;
  pinnedColumnKeys?: Set<string>;
}): HeaderGroupAnchorOptionGroup[] {
  const isTable = scope === 'table';
  return [
    {
      label: t('Position'),
      options: [
        {
          label: isTable ? t('Whole table') : t('Whole group'),
          value: HEADER_GROUP_ANCHOR_TABLE,
        },
      ],
    },
    {
      label: t('Columns'),
      options: columnOptions
        .filter(
          option =>
            !groupedColumnKeys.has(option.value) ||
            pinnedColumnKeys.has(option.value),
        )
        .map(option => ({
          label: option.label,
          value: encodeHeaderGroupAnchor({ type: 'column', key: option.value }),
        })),
    },
    {
      label: t('Groups'),
      options: candidateGroups.map(group => ({
        label: group.label?.trim() || t('Untitled group'),
        value: encodeHeaderGroupAnchor({ type: 'group', id: group.id }),
      })),
    },
  ].filter(section => section.options.length > 0);
}

export function getGroupTitle(path: number[]): string {
  const numberedPath = path.map(index => index + 1).join('.');
  return path.length === 1
    ? t('Group %s', numberedPath)
    : t('Subgroup %s', numberedPath);
}

/** Show the configured name in list rows, falling back to a numbered title. */
export function getGroupDisplayTitle(
  group: HeaderGroupConfig,
  path: number[],
): string {
  return group.label?.trim() || getGroupTitle(path);
}

function HeaderGroupForm({
  group,
  path,
  columnOptions,
  usedColumns,
  onChange,
  onAddChild,
  onRemove,
  onMove,
  onApply,
  showRemove = false,
  siblingCount = 1,
  settingsCollapsed: settingsCollapsedProp,
  onToggleSettings,
  showNameError = false,
  anchorOptionsForPath,
}: {
  group: HeaderGroupConfig;
  path: number[];
  columnOptions: HeaderGroupColumnOption[];
  usedColumns: Set<string>;
  onChange: (path: number[], next: HeaderGroupConfig) => void;
  onAddChild: (path: number[]) => void;
  onRemove: (path: number[]) => void;
  onMove: (path: number[], toIndex: number) => void;
  onApply?: () => void;
  showRemove?: boolean;
  siblingCount?: number;
  settingsCollapsed?: boolean;
  onToggleSettings?: () => void;
  showNameError?: boolean;
  anchorOptionsForPath: (
    path: number[],
    pinnedColumnKey?: string,
  ) => HeaderGroupAnchorOptionGroup[];
}) {
  const activeAnchor = getHeaderGroupAnchor(group);
  const anchorOptions = anchorOptionsForPath(
    path,
    activeAnchor.type === 'column' ? activeAnchor.key : undefined,
  );
  const anchorTarget = getHeaderGroupAnchorTarget(group);
  const availableTargets = new Set(
    anchorOptions.flatMap(section =>
      section.options.map(option => option.value),
    ),
  );
  const hasValidTarget = availableTargets.has(anchorTarget);
  const selectedTarget = hasValidTarget
    ? anchorTarget
    : HEADER_GROUP_ANCHOR_TABLE;
  const selectedSide = hasValidTarget
    ? getHeaderGroupAnchorSide(group)
    : group.placement === 'left'
      ? 'before'
      : 'after';
  const applyAnchor = (target: string, side: HeaderGroupAnchorSide) => {
    const anchor = buildHeaderGroupAnchor(target, side);
    if (anchor) {
      onChange(path, {
        ...group,
        anchor,
        placement: side === 'before' ? 'left' : 'right',
      });
    }
  };
  const [localCollapsed, setLocalCollapsed] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const hadNameOnOpen = useRef(Boolean(group.label?.trim()));
  const canSave = canSaveHeaderGroup(group);
  const nameError =
    showNameError &&
    !group.label?.trim() &&
    (hadNameOnOpen.current || nameTouched)
      ? t('Name is required')
      : undefined;
  const isTimeCompareGroup = group.source === 'time_compare';
  const hasSubgroups = (group.children ?? []).length > 0;
  const canCollapse = showRemove || hasSubgroups;
  const isCollapseControlled = settingsCollapsedProp !== undefined;
  const settingsCollapsed = isCollapseControlled
    ? Boolean(settingsCollapsedProp)
    : localCollapsed;
  const showSettings = !canCollapse || !settingsCollapsed;
  const toggleSettings =
    onToggleSettings ?? (() => setLocalCollapsed(collapsed => !collapsed));

  return (
    <FormStack data-test="header-group-editor">
      {showRemove && (
        <NestedHeader>
          <span>{getGroupTitle(path)}</span>
          <NestedHeaderActions>
            {canCollapse && (
              <SettingsToggle
                collapsed={settingsCollapsed}
                onToggle={toggleSettings}
              />
            )}
            <Button
              buttonStyle="link"
              buttonSize="small"
              aria-label={t('Move group left')}
              disabled={path[path.length - 1] === 0}
              onClick={() => onMove(path, path[path.length - 1] - 1)}
              icon={<Icons.LeftOutlined iconSize="s" />}
            />
            <Button
              buttonStyle="link"
              buttonSize="small"
              aria-label={t('Move group right')}
              disabled={path[path.length - 1] >= siblingCount - 1}
              onClick={() => onMove(path, path[path.length - 1] + 1)}
              icon={<Icons.RightOutlined iconSize="s" />}
            />
            <Button
              buttonStyle="link"
              buttonSize="small"
              aria-label={t('Remove group')}
              onClick={() => onRemove(path)}
              icon={<Icons.DeleteOutlined iconSize="s" />}
            />
          </NestedHeaderActions>
        </NestedHeader>
      )}
      {showSettings && (
        <>
          <FieldRow>
            <FieldLabel>{t('Name')}</FieldLabel>
            <Input
              aria-label={t('Group name')}
              value={group.label}
              placeholder={t('Enter group name')}
              status={nameError ? 'error' : undefined}
              disabled={isTimeCompareGroup}
              onChange={event => {
                setNameTouched(true);
                onChange(path, { ...group, label: event.target.value });
              }}
            />
            {nameError && <FieldError role="alert">{nameError}</FieldError>}
          </FieldRow>
          <FieldRow>
            <FieldLabel>{t('Columns')}</FieldLabel>
            <GroupColumnSorter
              columns={group.columns ?? []}
              columnOptions={columnOptions}
              usedColumns={usedColumns}
              disabled={isTimeCompareGroup}
              onChange={columns => onChange(path, { ...group, columns })}
            />
          </FieldRow>
          <FieldRow>
            <FieldLabel>{t('Label position')}</FieldLabel>
            <CompactRadioGroup>
              <Radio.Group
                size="small"
                optionType="button"
                value={group.labelAlign ?? 'center'}
                onChange={event =>
                  onChange(path, {
                    ...group,
                    labelAlign: event.target.value as HeaderGroupLabelAlign,
                  })
                }
              >
                {LABEL_ALIGN_OPTIONS.map(option => (
                  <Radio.Button key={option.value} value={option.value}>
                    {option.label}
                  </Radio.Button>
                ))}
              </Radio.Group>
            </CompactRadioGroup>
          </FieldRow>
          <InlineFields>
            <FieldRow>
              <FieldLabel>{t('Insert near')}</FieldLabel>
              <AnchorSelectWrapper>
                <Select
                  ariaLabel={t('Insert near')}
                  value={selectedTarget}
                  options={anchorOptions}
                  showSearch
                  allowClear={false}
                  placeholder={t('Select a column or group')}
                  onChange={selected => {
                    const [raw] = normalizeSelectedColumns([selected]);
                    applyAnchor(raw, selectedSide);
                  }}
                />
              </AnchorSelectWrapper>
            </FieldRow>
            <FieldRow>
              <FieldLabel>{t('Side')}</FieldLabel>
              <CompactRadioGroup>
                <Radio.Group
                  size="small"
                  optionType="button"
                  value={selectedSide}
                  onChange={event =>
                    applyAnchor(
                      selectedTarget,
                      event.target.value as HeaderGroupAnchorSide,
                    )
                  }
                >
                  {ANCHOR_SIDE_OPTIONS.map(option => (
                    <Radio.Button key={option.value} value={option.value}>
                      {option.label}
                    </Radio.Button>
                  ))}
                </Radio.Group>
              </CompactRadioGroup>
            </FieldRow>
          </InlineFields>
        </>
      )}
      {(group.children ?? []).length > 0 && (
        <FieldRow>
          {(group.children ?? []).map((child, index) => (
            <NestedCard key={child.id}>
              <HeaderGroupForm
                group={child}
                path={[...path, index]}
                columnOptions={columnOptions}
                usedColumns={usedColumns}
                onChange={onChange}
                onAddChild={onAddChild}
                onRemove={onRemove}
                onMove={onMove}
                showRemove
                siblingCount={(group.children ?? []).length}
                showNameError={showNameError}
                anchorOptionsForPath={anchorOptionsForPath}
              />
            </NestedCard>
          ))}
        </FieldRow>
      )}
      {path.length < MAX_HEADER_GROUP_DEPTH && !isTimeCompareGroup && (
        <Button
          buttonStyle="dashed"
          buttonSize="small"
          disabled={!canSave}
          icon={<Icons.PlusOutlined iconSize="s" />}
          onClick={() => {
            if (canSave) {
              onAddChild(path);
            }
          }}
        >
          {t('Add subgroup')}
        </Button>
      )}
      {onApply && (
        <ApplyRow>
          <Button buttonStyle="primary" disabled={!canSave} onClick={onApply}>
            {t('Apply')}
          </Button>
        </ApplyRow>
      )}
    </FormStack>
  );
}

export default function HeaderGroupEditor({
  children,
  group,
  path,
  groups = [],
  columnOptions,
  usedColumns,
  onChange,
  onSave,
  mode = 'edit',
}: HeaderGroupEditorProps) {
  const [visible, setVisible] = useState(false);
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);
  const [draft, setDraft] = useState<HeaderGroupConfig>(
    group ?? createHeaderGroup(),
  );

  const isAddMode = mode === 'add';
  const currentGroup = draft;
  const canCollapseRoot = (currentGroup.children ?? []).length > 0;
  const editorUsedColumns = useMemo(
    () =>
      new Set([
        ...usedColumns,
        ...collectUsedHeaderGroupColumns([draft], columnOptions),
      ]),
    [columnOptions, draft, usedColumns],
  );

  const toDraftPath = (nextPath: number[]) =>
    isAddMode ? nextPath : [0, ...nextPath.slice(path.length)];

  const anchorOptionsForPath = (
    nextPath: number[],
    pinnedColumnKey?: string,
  ): HeaderGroupAnchorOptionGroup[] => {
    const draftPath = toDraftPath(nextPath);
    const self = getGroupAtPath([draft], draftPath);
    const parent = getGroupAtPath([draft], draftPath.slice(0, -1));
    const isTableScope = draftPath.length === 1;
    const siblings = isTableScope ? groups : (parent?.children ?? []);
    const candidateGroups = siblings.filter(item => item.id !== self?.id);
    const scopedKeys = isTableScope
      ? undefined
      : new Set([
          ...(parent?.columns ?? []),
          ...candidateGroups.flatMap(collectSubtreeColumns),
        ]);
    // At the top level a grouped column already has its group name in the
    // list, so only loose columns need a column target. Inside a parent group
    // the parent's own columns are still the only way to anchor between two
    // columns; drop the columns claimed by sibling subgroups instead.
    const groupedColumnKeys = new Set(
      collectUsedHeaderGroupColumns(
        isTableScope
          ? [...candidateGroups, ...(self ? [self] : [])]
          : (parent?.children ?? []),
        columnOptions,
      ),
    );
    return buildHeaderGroupAnchorTargetOptions({
      scope: isTableScope ? 'table' : 'group',
      candidateGroups,
      columnOptions: scopedKeys
        ? columnOptions.filter(option => scopedKeys.has(option.value))
        : columnOptions,
      groupedColumnKeys,
      pinnedColumnKeys: new Set(pinnedColumnKey ? [pinnedColumnKey] : []),
    });
  };

  const handleOpenChange = (open: boolean) => {
    setVisible(open);
    if (open) {
      setDraft(
        isAddMode ? createHeaderGroup() : (group ?? createHeaderGroup()),
      );
      setSettingsCollapsed(false);
    }
  };

  const persistDraftIfValid = (nextDraft: HeaderGroupConfig) => {
    if (!isAddMode && canSaveHeaderGroup(nextDraft)) {
      onChange?.(path, nextDraft);
    }
  };

  const handleChange = (nextPath: number[], next: HeaderGroupConfig) => {
    const nextDraft = updateHeaderGroupAt(
      [draft],
      toDraftPath(nextPath),
      () => next,
    )[0]!;
    setDraft(nextDraft);
    persistDraftIfValid(nextDraft);
  };

  const handleAddChild = (nextPath: number[]) => {
    const nextDraft = updateHeaderGroupAt(
      [draft],
      toDraftPath(nextPath),
      current => ({
        ...current,
        children: [...(current.children ?? []), createHeaderGroup()],
      }),
    )[0]!;
    setDraft(nextDraft);
  };

  const handleRemove = (nextPath: number[]) => {
    const nextDraft = removeHeaderGroupAt([draft], toDraftPath(nextPath))[0]!;
    setDraft(nextDraft);
    persistDraftIfValid(nextDraft);
  };

  const handleMove = (nextPath: number[], toIndex: number) => {
    const nextDraft = moveHeaderGroupAt(
      [draft],
      toDraftPath(nextPath),
      toIndex,
    )[0]!;
    setDraft(nextDraft);
    persistDraftIfValid(nextDraft);
  };

  const handleApply = () => {
    if (!canSaveHeaderGroup(draft)) {
      return;
    }
    onSave?.(draft);
    setVisible(false);
    setDraft(createHeaderGroup());
  };

  return (
    <Popover
      title={
        <PopoverTitleRow>
          <span>{isAddMode ? t('Add group') : getGroupTitle(path)}</span>
          {canCollapseRoot && (
            <SettingsToggle
              collapsed={settingsCollapsed}
              onToggle={() => setSettingsCollapsed(collapsed => !collapsed)}
            />
          )}
        </PopoverTitleRow>
      }
      trigger={['click']}
      open={visible}
      onOpenChange={handleOpenChange}
      destroyOnHidden
      overlayStyle={{ maxWidth: 480 }}
      content={
        <HeaderGroupForm
          group={currentGroup}
          path={isAddMode ? [0] : path}
          columnOptions={columnOptions}
          usedColumns={editorUsedColumns}
          onChange={handleChange}
          onAddChild={handleAddChild}
          onRemove={handleRemove}
          onMove={handleMove}
          onApply={isAddMode ? handleApply : undefined}
          showNameError={!isAddMode}
          settingsCollapsed={settingsCollapsed}
          anchorOptionsForPath={anchorOptionsForPath}
        />
      }
    >
      {children}
    </Popover>
  );
}
