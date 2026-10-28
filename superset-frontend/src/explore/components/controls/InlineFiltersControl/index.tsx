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
import React, { useCallback } from 'react';
import { css, styled, useTheme } from '@apache-superset/core/theme';
import { t } from '@apache-superset/core/translation';
import { Button, Input, Select } from '@superset-ui/core/components';
import ControlHeader from 'src/explore/components/ControlHeader';
import type { InlineFilterConfig } from 'src/dashboard/components/InlineFilters/types';

let idCounter = 0;
const nextId = () => `inline_${Date.now()}_${idCounter++}`;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.sizeUnit}px;
  padding: ${({ theme }) => theme.sizeUnit}px 0;
`;

const GroupBlock = styled.div`
  border: 1px solid ${({ theme }) => theme.colorBorderSecondary};
  border-radius: ${({ theme }) => theme.borderRadius}px;
  padding: ${({ theme }) => theme.sizeUnit * 2}px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.sizeUnit}px;
`;

const Row = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.sizeUnit}px;
  align-items: center;
`;

const StyledSelect = styled(Select)`
  flex: 1;
  min-width: 0;
`;

const StyledInput = styled(Input)`
  flex: 1;
`;

const AddButton = styled(Button)`
  align-self: flex-start;
`;

interface ColumnMeta {
  column_name: string;
  type?: string;
  type_generic?: string;
}

export interface InlineFiltersControlProps {
  name: string;
  label: string;
  description?: string;
  value?: InlineFilterConfig[];
  columns?: ColumnMeta[];
  onChange?: (value: InlineFilterConfig[]) => void;
  renderTrigger?: boolean;
  hovered?: boolean;
  validationErrors?: string[];
}

const InlineFiltersControl: React.FC<InlineFiltersControlProps> = ({
  name,
  label,
  description,
  value,
  columns = [],
  onChange,
  renderTrigger,
  hovered,
  validationErrors,
}) => {
  const theme = useTheme();
  const groups: InlineFilterConfig[] = Array.isArray(value) ? value : [];

  const emit = useCallback(
    (next: InlineFilterConfig[]) => {
      onChange?.(next);
    },
    [onChange],
  );

  const addGroup = () => {
    emit([
      ...groups,
      { id: nextId(), column: '', label: '' },
    ]);
  };

  const removeGroup = (idx: number) => {
    emit(groups.filter((_, i) => i !== idx));
  };

  const updateGroup = (idx: number, patch: Partial<InlineFilterConfig>) => {
    emit(groups.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  };

  const columnOptions = columns.map(c => ({
    value: c.column_name,
    label: c.column_name,
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
        {groups.map((group, idx) => (
          <GroupBlock key={group.id}>
            <Row>
              <StyledSelect
                aria-label={t('Column')}
                placeholder={t('Select column')}
                value={group.column || undefined}
                options={columnOptions}
                onChange={(col: string) => updateGroup(idx, { column: col })}
                showSearch
                allowClear
              />
              <StyledInput
                aria-label={t('Label')}
                placeholder={t('Label (e.g. Category)')}
                value={group.label || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateGroup(idx, { label: e.target.value })
                }
              />
              <Button size="small" danger onClick={() => removeGroup(idx)}>
                {t('Remove')}
              </Button>
            </Row>
          </GroupBlock>
        ))}
        <AddButton size="small" onClick={addGroup}>
          {t('+ Add inline filter')}
        </AddButton>
      </Container>
    </div>
  );
};

export default InlineFiltersControl;
