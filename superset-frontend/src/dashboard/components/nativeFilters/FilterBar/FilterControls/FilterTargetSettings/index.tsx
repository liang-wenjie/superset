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
import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import rison from 'rison';
import { t } from '@apache-superset/core/translation';
import { styled, css } from '@apache-superset/core/theme';
import { Theme } from '@emotion/react';
import {
  Column,
  DatasourceType,
  Filter,
  getClientErrorObject,
  NativeFilterTarget,
  selectClientErrorMessage,
} from '@superset-ui/core';
import {
  Modal,
  Button,
  FormItem,
  Input,
  Radio,
  Select,
  Tooltip,
} from '@superset-ui/core/components';
import { Icons } from '@superset-ui/core/components/Icons';
import { RootState } from 'src/dashboard/types';
import { useToasts } from 'src/components/MessageToasts/withToasts';
import { cachedSupersetGet } from 'src/utils/cachedSupersetGet';
import { useChartIds } from 'src/dashboard/util/charts/useChartIds';
import { CHART_TYPE } from 'src/dashboard/util/componentTypes';
import { useDashboardLayout } from 'src/dashboard/components/nativeFilters/state';
import { setFilterConfiguration } from 'src/dashboard/actions/nativeFilters';
import {
  fetchSemanticViewStructure,
  semanticViewDimensionsToColumns,
} from 'src/dashboard/components/nativeFilters/FiltersConfigModal/FiltersConfigForm/utils';

type TargetRow = {
  /** `${datasetId}__${datasourceType}` of the row's datasource */
  datasourceKey: string;
  datasetId: number;
  datasourceType: DatasourceType;
  chartIds: number[];
  chartNames: string[];
  /** Which override is being configured for this row: mapping the chart to
   * another column, or rewriting the field value with a SQL template. */
  mode: 'column' | 'transform';
  /** The column this chart's table actually stores (alias mapping) */
  column: string;
  /** SQL template applied to the column value, converting the stored field
   * value into the filter value's format before comparison */
  valueTransform: string;
  /** True for the filter's own target (targets[0]); column stays read-only */
  isDefault: boolean;
};

export type FilterTargetSettingsProps = {
  filter: Filter;
  open: boolean;
  onClose: () => void;
  /** When set, the dialog focuses on a single report's mapping: the left-hand
   * side shows that chart's datasource table and the row lets the builder pick
   * another column (or write a field-transform SQL) for this report only.
   * When omitted the dialog lists every datasource on the dashboard. */
  focus?: {
    chartId: number;
    datasetId: number;
    datasourceType: DatasourceType;
  };
  /** Display name for the focused report row. */
  focusLabel?: string;
  /** Edit-mode save callback (e.g. writes ``targets`` into the config form).
   * When omitted the dialog dispatches ``setFilterConfiguration`` instead. */
  onSaveTargets?: (targets: Partial<NativeFilterTarget>[]) => void;
};

/** Turns a stored '2026.7月' into '202607' so it matches a YYYYMM selection. */
const DEFAULT_TRANSFORM_HINT =
  "CONCAT(SUBSTRING({col},1,4),LPAD(CAST(SUBSTRING({col},6,1) AS UNSIGNED),2,'0'))";

const StyledRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.sizeUnit * 3}px;
  padding: ${({ theme }) => theme.sizeUnit * 3}px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colorBorder};

  &:last-of-type {
    border-bottom: none;
  }
`;

const StyledChartInfo = styled.div`
  flex: 0 0 220px;
  min-width: 0;
  padding-top: ${({ theme }) => theme.sizeUnit * 1.5}px;

  .chart-name {
    font-weight: ${({ theme }) => theme.fontWeightStrong};
    font-size: ${({ theme }) => theme.fontSizeSM}px;
    color: ${({ theme }) => theme.colorText};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .datasource-label {
    font-size: ${({ theme }) => theme.fontSizeXS}px;
    color: ${({ theme }) => theme.colorTextTertiary};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const StyledFields = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.sizeUnit * 2}px;
`;

const parseDatasource = (
  datasource: string,
): { datasetId: number; datasourceType: DatasourceType } | null => {
  const [id, type = 'table'] = String(datasource).split('__');
  const datasetId = Number(id);
  if (!id || Number.isNaN(datasetId)) {
    return null;
  }
  return { datasetId, datasourceType: type as DatasourceType };
};

const datasourceKey = (datasetId: number, datasourceType: DatasourceType) =>
  `${datasetId}__${datasourceType}`;

const FilterTargetSettings = ({
  filter,
  open,
  onClose,
  focus,
  focusLabel,
  onSaveTargets,
}: FilterTargetSettingsProps) => {
  const dispatch = useDispatch();
  const chartIds = useChartIds();
  const layout = useDashboardLayout();
  const charts = useSelector((state: RootState) => state.charts);
  const focusDatasource = useSelector((state: RootState) =>
    focus
      ? state.datasources[datasourceKey(focus.datasetId, focus.datasourceType)]
      : undefined,
  );

  const inScopeChartIds = useMemo(() => {
    if (filter.chartsInScope?.length) {
      return filter.chartsInScope;
    }
    return chartIds;
  }, [filter.chartsInScope, chartIds]);

  const chartNameById = useMemo(() => {
    const map: Record<number, string> = {};
    Object.values(layout).forEach(item => {
      if (
        item.type === CHART_TYPE &&
        item.meta?.chartId != null &&
        item.meta.sliceName
      ) {
        map[item.meta.chartId] = item.meta.sliceName;
      }
    });
    return map;
  }, [layout]);

  // Charts grouped by datasource so one target row serves every chart on the
  // same dataset.
  const datasourceRows = useMemo(() => {
    const groups = new Map<string, TargetRow>();
    inScopeChartIds.forEach(chartId => {
      const chart = charts[chartId];
      const datasource = chart?.form_data?.datasource;
      const parsed = datasource ? parseDatasource(datasource) : null;
      if (!parsed) {
        return;
      }
      const key = datasourceKey(parsed.datasetId, parsed.datasourceType);
      const existing = groups.get(key);
      if (existing) {
        existing.chartIds.push(chartId);
        existing.chartNames.push(chartNameById[chartId] ?? String(chartId));
        return;
      }
      groups.set(key, {
        datasourceKey: key,
        datasetId: parsed.datasetId,
        datasourceType: parsed.datasourceType,
        chartIds: [chartId],
        chartNames: [chartNameById[chartId] ?? String(chartId)],
        mode: 'column',
        column: '',
        valueTransform: '',
        isDefault: false,
      });
    });
    return groups;
  }, [inScopeChartIds, charts, chartNameById]);

  const { addDangerToast } = useToasts();

  // Table columns of the focused datasource, loaded from the dataset API (the
  // dashboard redux store does not carry column metadata). Semantic views use
  // their own structure endpoint.
  const [columns, setColumns] = useState<Column[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  useEffect(() => {
    if (!open || !focus) {
      return;
    }
    const { datasetId, datasourceType } = focus;
    if (datasetId == null) {
      setColumns([]);
      return;
    }
    let cancelled = false;
    setColumnsLoading(true);
    const handleError = async (
      badResponse: Parameters<typeof getClientErrorObject>[0],
    ) => {
      if (cancelled) return;
      const errorText = selectClientErrorMessage(
        await getClientErrorObject(badResponse),
        t('An error has occurred'),
        { 403: t('You do not have permission to edit this dashboard') },
      );
      if (!cancelled) {
        addDangerToast(errorText, { noDuplicate: true });
      }
    };
    if (datasourceType === DatasourceType.SemanticView) {
      fetchSemanticViewStructure(datasetId)
        .then(({ dimensions }) => {
          if (!cancelled) {
            setColumns(semanticViewDimensionsToColumns(dimensions));
          }
        }, handleError)
        .finally(() => {
          if (!cancelled) setColumnsLoading(false);
        });
    } else {
      cachedSupersetGet({
        endpoint: `/api/v1/dataset/${datasetId}?q=${rison.encode({
          columns: [
            'columns.column_name',
            'columns.is_dttm',
            'columns.type_generic',
            'columns.filterable',
          ],
        })}`,
      })
        .then(({ json: { result } }) => {
          if (!cancelled) setColumns(result?.columns ?? []);
        }, handleError)
        .finally(() => {
          if (!cancelled) setColumnsLoading(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [open, focus, addDangerToast]);

  // Columns of the focused datasource, for the column picker. Falls back to
  // whatever the dashboard redux store carries (usually empty).
  const columnOptions = useMemo(
    () =>
      (columns.length > 0 ? columns : (focusDatasource?.columns ?? []))
        .map(col => ({ label: col.column_name, value: col.column_name }))
        .filter(option => option.value),
    [columns, focusDatasource],
  );

  const [rows, setRows] = useState<TargetRow[]>([]);

  // (Re)initialize the rows whenever the modal opens, from the filter's saved
  // targets.
  useEffect(() => {
    if (!open) {
      return;
    }
    const targets = filter.targets ?? [];
    const [defaultTarget] = targets;
    const defaultColumn =
      defaultTarget?.column?.name ??
      (typeof defaultTarget?.column === 'string' ? defaultTarget.column : '');
    const defaultKey =
      defaultTarget?.datasetId != null
        ? datasourceKey(
            defaultTarget.datasetId,
            defaultTarget.datasourceType ?? DatasourceType.Table,
          )
        : '';

    const targetByDatasource = new Map<string, Partial<NativeFilterTarget>>();
    targets.forEach(target => {
      if (target.datasetId == null) {
        return;
      }
      targetByDatasource.set(
        datasourceKey(
          target.datasetId,
          target.datasourceType ?? DatasourceType.Table,
        ),
        target,
      );
    });

    if (focus) {
      const focusKey = datasourceKey(focus.datasetId, focus.datasourceType);
      // Per-report targets carry the chart id; the focused chart's saved
      // override is the target whose ``chartIds`` includes it.
      const saved = targets.find(target =>
        target.chartIds?.includes(focus.chartId),
      );
      const seedColumn =
        saved?.column?.name ??
        (typeof saved?.column === 'string' ? saved.column : '');
      // The default mapping is "same field name": the picker pre-selects the
      // filter's own column name, so an untouched row means "match by name"
      // (no explicit target needed). Once the table's columns are known and
      // the field is absent, the correction effect below clears the
      // preselection (default is empty, no mapping).
      setRows([
        {
          datasourceKey: focusKey,
          datasetId: focus.datasetId,
          datasourceType: focus.datasourceType,
          chartIds: [focus.chartId],
          chartNames: focusLabel ? [focusLabel] : [String(focus.datasetId)],
          mode: saved?.valueTransform ? 'transform' : 'column',
          column: seedColumn || defaultColumn,
          valueTransform: saved?.valueTransform ?? '',
          isDefault: false,
        },
      ]);
      return;
    }

    const defaultRow: TargetRow = {
      datasourceKey: defaultKey,
      datasetId: defaultTarget?.datasetId ?? 0,
      datasourceType: defaultTarget?.datasourceType ?? DatasourceType.Table,
      chartIds: [],
      chartNames: [t('Default (filter datasource)')],
      mode: 'transform',
      column: defaultColumn,
      valueTransform: defaultTarget?.valueTransform ?? '',
      isDefault: true,
    };

    const nextRows: TargetRow[] = [defaultRow];
    datasourceRows.forEach(row => {
      const saved = targetByDatasource.get(row.datasourceKey);
      if (saved && defaultKey === row.datasourceKey) {
        return;
      }
      nextRows.push({
        ...row,
        mode: saved?.valueTransform ? 'transform' : 'column',
        column: saved?.column?.name ?? '',
        valueTransform: saved?.valueTransform ?? '',
      });
    });

    setRows(nextRows);
  }, [open, filter.targets, datasourceRows, focus, focusLabel]);

  // After the focused table's columns are known, clear the default "same
  // name" preselection when the table has no such field: the default mapping
  // is "match by name", so an untouched row must be empty (no mapping) rather
  // than showing a column that does not exist on the table.
  useEffect(() => {
    if (!focus || columnsLoading || columns.length === 0) {
      return;
    }
    const [defaultTarget] = filter.targets ?? [];
    const defaultColumn =
      defaultTarget?.column?.name ??
      (typeof defaultTarget?.column === 'string' ? defaultTarget.column : '');
    if (!defaultColumn) {
      return;
    }
    const columnNames = new Set(columns.map(col => col.column_name));
    if (columnNames.has(defaultColumn)) {
      return;
    }
    const focusKey = datasourceKey(focus.datasetId, focus.datasourceType);
    setRows(prev =>
      prev.map(row =>
        row.datasourceKey === focusKey && row.column === defaultColumn
          ? { ...row, column: '' }
          : row,
      ),
    );
  }, [focus, columns, columnsLoading, filter.targets]);

  const updateRow = (datasourceKey: string, patch: Partial<TargetRow>) => {
    setRows(prev =>
      prev.map(row =>
        row.datasourceKey === datasourceKey ? { ...row, ...patch } : row,
      ),
    );
  };

  const handleSave = () => {
    const targets: Partial<NativeFilterTarget>[] = [];
    const [defaultTarget] = filter.targets ?? [];
    const defaultColumn =
      defaultTarget?.column?.name ??
      (typeof defaultTarget?.column === 'string' ? defaultTarget.column : '');

    if (focus) {
      const focusKey = datasourceKey(focus.datasetId, focus.datasourceType);
      const row = rows.find(r => r.datasourceKey === focusKey);
      const column = row?.column.trim() ?? '';
      const valueTransform = row?.valueTransform.trim() ?? '';
      const mode = row?.mode ?? 'column';

      // Keep the default target (targets[0], shared by every chart) and the
      // overrides of other charts untouched; this dialog only edits the
      // focused chart's per-report target. A value transform left on the
      // default target by a previous implementation is stripped: per-report
      // transforms now live on chart-scoped targets only.
      (filter.targets ?? []).forEach(target => {
        if (
          Array.isArray(target.chartIds) &&
          target.chartIds.includes(focus.chartId)
        ) {
          return; // replaced by the upsert below
        }
        if (target === filter.targets?.[0] && target.valueTransform) {
          const { valueTransform: _stripped, ...rest } = target;
          targets.push(rest);
          return;
        }
        targets.push(target);
      });

      // Upsert the focused chart's override. A column mapping that equals the
      // default column (same field name) is the implicit default behavior, so
      // it needs no explicit target.
      if (mode === 'transform') {
        if (valueTransform) {
          targets.push({
            datasetId: focus.datasetId,
            datasourceType: focus.datasourceType,
            // {col} inside the transform template resolves to the filter's
            // default column.
            column: { name: defaultColumn },
            valueTransform,
            chartIds: [focus.chartId],
          });
        }
      } else if (column && column !== defaultColumn) {
        targets.push({
          datasetId: focus.datasetId,
          datasourceType: focus.datasourceType,
          column: { name: column },
          chartIds: [focus.chartId],
        });
      }
    } else {
      const defaultRow = rows.find(row => row.isDefault);
      if (defaultRow && defaultTarget) {
        targets.push({
          ...defaultTarget,
          datasetId: defaultRow.datasetId,
          datasourceType: defaultRow.datasourceType,
          column: { name: defaultRow.column || defaultColumn },
          ...(defaultRow.valueTransform.trim()
            ? { valueTransform: defaultRow.valueTransform.trim() }
            : {}),
        });
      }
      rows
        .filter(row => !row.isDefault)
        .forEach(row => {
          const column = row.column.trim();
          const valueTransform = row.valueTransform.trim();
          if (row.mode === 'transform') {
            if (valueTransform) {
              targets.push({
                datasetId: row.datasetId,
                datasourceType: row.datasourceType,
                column: { name: defaultRow?.column || defaultColumn },
                valueTransform,
                chartIds: row.chartIds,
              });
            }
            return;
          }
          if (!column) {
            return; // no override: chart falls back to the default target
          }
          targets.push({
            datasetId: row.datasetId,
            datasourceType: row.datasourceType,
            column: { name: column },
            chartIds: row.chartIds,
          });
        });

      // Preserve targets for datasources not shown in this dialog (e.g. the
      // filter's own datasource when it is not on the dashboard).
      const handledKeys = new Set(
        rows.map(row => datasourceKey(row.datasetId, row.datasourceType)),
      );
      (filter.targets ?? []).forEach(target => {
        if (target.datasetId == null) {
          return;
        }
        const key = datasourceKey(
          target.datasetId,
          target.datasourceType ?? DatasourceType.Table,
        );
        if (!handledKeys.has(key) && target !== filter.targets?.[0]) {
          targets.push(target);
        }
      });
    }

    if (onSaveTargets) {
      onSaveTargets(targets);
    } else {
      dispatch(
        setFilterConfiguration({
          modified: [{ ...filter, targets }],
          deleted: [],
          reordered: [],
        }),
      );
    }
    onClose();
  };

  const defaultColumnPlaceholder = rows.find(r => r.isDefault)?.column;

  return (
    <Modal
      show={open}
      onHide={onClose}
      title={t('Filter target mapping and value transform')}
      width={760}
      destroyOnHidden
      footer={
        <div
          css={(theme: Theme) => css`
            display: flex;
            justify-content: flex-end;
            gap: ${theme.sizeUnit * 2}px;
          `}
        >
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button buttonStyle="primary" onClick={handleSave}>
            {t('Save')}
          </Button>
        </div>
      }
    >
      <div
        css={(theme: Theme) => css`
          font-size: ${theme.fontSizeSM}px;
          color: ${theme.colorTextTertiary};
          margin-bottom: ${theme.sizeUnit * 2}px;
        `}
      >
        {t(
          `Choose one of the two — pick another column of this table, or write a SQL that converts the stored field value into the filter value's format ({col} is the quoted column name). Example: ${DEFAULT_TRANSFORM_HINT} maps a stored 2026.7月 to 202607 so it matches a YYYYMM selection.`,
        )}
      </div>
      {rows.map(row => (
        <StyledRow key={row.datasourceKey || row.chartNames[0]}>
          <StyledChartInfo>
            <div className="chart-name">
              {focus
                ? focusDatasource?.table_name ||
                  row.datasourceKey ||
                  t('Unknown table')
                : row.isDefault
                  ? row.chartNames[0]
                  : row.chartNames.join('、') || row.datasourceKey}
            </div>
            <div className="datasource-label">
              {focus
                ? row.chartNames[0]
                : row.isDefault
                  ? row.datasourceKey || t('No default target')
                  : `${t('Datasource')}: ${row.datasourceKey}`}
            </div>
            {!row.isDefault && row.chartIds.length > 1 && (
              <div className="datasource-label">
                {t('Charts')}: {row.chartIds.length}
              </div>
            )}
          </StyledChartInfo>
          <StyledFields>
            {focus && (
              <FormItem label={t('Mapping type')} style={{ marginBottom: 0 }}>
                <Radio.GroupWrapper
                  value={row.mode}
                  options={[
                    {
                      label: t('Map to another column'),
                      value: 'column',
                    },
                    {
                      label: t('Value transform SQL'),
                      value: 'transform',
                    },
                  ]}
                  onChange={e =>
                    updateRow(row.datasourceKey, {
                      mode: e.target.value as TargetRow['mode'],
                    })
                  }
                />
              </FormItem>
            )}
            {!focus && row.isDefault ? (
              <FormItem label={t('Column')} style={{ marginBottom: 0 }}>
                <Input value={row.column} disabled onChange={() => undefined} />
              </FormItem>
            ) : null}
            {row.mode === 'column' ? (
              <FormItem label={t('Column')} style={{ marginBottom: 0 }}>
                {focus ? (
                  <Select
                    value={row.column || undefined}
                    allowClear
                    showSearch
                    loading={columnsLoading}
                    placeholder={
                      defaultColumnPlaceholder
                        ? `${t('Default')}: ${defaultColumnPlaceholder}`
                        : t('Select a column')
                    }
                    notFoundContent={t('No columns found')}
                    options={columnOptions}
                    onChange={value =>
                      updateRow(row.datasourceKey, {
                        column:
                          typeof value === 'string'
                            ? value
                            : ((value as { value?: string } | null)?.value ??
                              ''),
                      })
                    }
                  />
                ) : (
                  <Input
                    value={row.column}
                    placeholder={
                      defaultColumnPlaceholder
                        ? `${t('Default')}: ${defaultColumnPlaceholder}`
                        : t('Same as default')
                    }
                    onChange={e =>
                      updateRow(row.datasourceKey, { column: e.target.value })
                    }
                  />
                )}
              </FormItem>
            ) : null}
            {row.mode === 'transform' ? (
              <FormItem
                label={
                  <span
                    css={(theme: Theme) => css`
                      display: inline-flex;
                      align-items: center;
                      gap: ${theme.sizeUnit}px;
                    `}
                  >
                    {t('Value transform SQL')}
                    <Tooltip
                      placement="top"
                      title={t(
                        `SQL template applied to the column value before comparison. {col} is replaced with the quoted column name (the filter's default column). Example: ${DEFAULT_TRANSFORM_HINT} maps 2026.7月 to 202607.`,
                      )}
                    >
                      <Icons.InfoCircleOutlined iconSize="s" />
                    </Tooltip>
                  </span>
                }
                style={{ marginBottom: 0 }}
              >
                <Input
                  value={row.valueTransform}
                  placeholder={DEFAULT_TRANSFORM_HINT}
                  onChange={e =>
                    updateRow(row.datasourceKey, {
                      valueTransform: e.target.value,
                    })
                  }
                />
              </FormItem>
            ) : null}
            {!row.isDefault &&
            !row.column.trim() &&
            !row.valueTransform.trim() ? (
              <div
                css={(theme: Theme) => css`
                  display: flex;
                  align-items: center;
                  gap: ${theme.sizeUnit}px;
                  color: ${theme.colorError};
                  font-size: ${theme.fontSizeSM}px;
                `}
              >
                <Icons.ExclamationCircleOutlined iconSize="s" />
                <span>
                  {t(
                    'No mapping set: choose a column, or write a value transform SQL.',
                  )}
                </span>
              </div>
            ) : null}
          </StyledFields>
        </StyledRow>
      ))}
    </Modal>
  );
};

export default FilterTargetSettings;
