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

import { FC, ReactNode, useMemo, useState, memo, useCallback } from 'react';
import {
  DatasourceType,
  Filter,
  NativeFilterScope,
  NativeFilterTarget,
  NativeFilterType,
} from '@superset-ui/core';
import { styled, css } from '@apache-superset/core/theme';
import { Theme } from '@emotion/react';
import { t } from '@apache-superset/core/translation';
import Tree from '@superset-ui/core/components/Tree';
import { DASHBOARD_ROOT_ID } from 'src/dashboard/util/constants';
import { Tooltip } from '@superset-ui/core/components';
import { Icons } from '@superset-ui/core/components/Icons';
import { Layout, RootState } from 'src/dashboard/types';
import { useSelector } from 'react-redux';
import { useFilterScopeTree } from './state';
import { useDashboardLayout } from 'src/dashboard/components/nativeFilters/state';
import { findFilterScope, getTreeCheckedItems } from './utils';
import { CHART_TYPE } from 'src/dashboard/util/componentTypes';
import FilterTargetSettings from '../../../FilterBar/FilterControls/FilterTargetSettings';

const StyledTree = styled(Tree)`
  .ant-tree-title {
    display: flex;
    align-items: center;
    gap: ${({ theme }) => theme.sizeUnit}px;
  }
`;

/** Red warning badge shown on reports that are in the filter scope but whose
 * datasource does not match the filter's (and no per-report mapping is
 * configured), replacing the grey "datasets don't match" info icon. */
const StyledWarningIcon = styled(Icons.ExclamationCircleOutlined)`
  color: ${({ theme }) => theme.colorError};
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

type ScopingTreeProps = {
  forceUpdate: Function;
  updateFormValues: (values: any) => void;
  formScope?: NativeFilterScope;
  initialScope: NativeFilterScope;
  chartId?: number;
  initiallyExcludedCharts?: number[];
  title?: string;
  /** The filter's saved targets, used to seed per-report mapping rows. */
  filterTargets?: Partial<NativeFilterTarget>[];
  /** Edit-mode callback that writes the updated targets into the form. */
  onSaveTargets?: (targets: Partial<NativeFilterTarget>[]) => void;
};

type SettingsChart = {
  chartId: number;
  label: string;
  datasetId: number;
  datasourceType: DatasourceType;
};

const separateKeys = (
  checkedKeys: string[],
): { layerKeys: string[]; nonLayerKeys: string[] } => {
  const layerKeys = checkedKeys.filter(key => key.includes('-layer-'));
  const nonLayerKeys = checkedKeys.filter(key => !key.includes('-layer-'));
  return { layerKeys, nonLayerKeys };
};

const extractParentChartIds = (layerKeys: string[]): Set<number> => {
  const LAYER_KEY_REGEX = /^chart-(\d+)-layer-\d+$/;
  const parentChartIds = new Set<number>();

  layerKeys.forEach(layerKey => {
    const match = layerKey.match(LAYER_KEY_REGEX);
    if (match) {
      const chartId = parseInt(match[1], 10);
      parentChartIds.add(chartId);
    }
  });
  return parentChartIds;
};

const updateScopeWithParentCharts = (
  scope: NativeFilterScope,
  parentChartIds: Set<number>,
  nonLayerKeys: string[],
  layout: Layout,
): NativeFilterScope => {
  const updatedScope = { ...scope };
  parentChartIds.forEach(chartId => {
    const chartLayoutKey = Object.keys(layout).find(
      key => layout[key]?.meta?.chartId === chartId,
    );
    if (chartLayoutKey && layout[chartLayoutKey]) {
      const tempScope = findFilterScope(
        [...nonLayerKeys, chartLayoutKey],
        layout,
      );
      updatedScope.rootPath = tempScope.rootPath;
      updatedScope.excluded = tempScope.excluded;
    }
  });
  return updatedScope;
};

const createFormValues = (
  scope: NativeFilterScope,
  layerKeys: string[],
  chartId?: number,
): { scope: NativeFilterScope & { selectedLayers?: string[] } } => {
  const finalScope = { ...scope };
  if (chartId !== undefined) {
    finalScope.excluded = [...new Set([...finalScope.excluded, chartId])];
  }
  return {
    scope:
      layerKeys.length > 0
        ? { ...finalScope, selectedLayers: layerKeys }
        : finalScope,
  };
};

const ScopingTree: FC<ScopingTreeProps> = ({
  formScope,
  initialScope,
  forceUpdate,
  updateFormValues,
  chartId,
  initiallyExcludedCharts = [],
  title,
  filterTargets,
  onSaveTargets,
}) => {
  const [expandedKeys, setExpandedKeys] = useState<string[]>([
    DASHBOARD_ROOT_ID,
  ]);

  const [settingsChart, setSettingsChart] = useState<SettingsChart | null>(
    null,
  );

  const charts = useSelector((state: RootState) => state.charts);

  // Dashboard layout (independent of the tree builder, which itself depends on
  // the warning set below) — used both by the scope tree and by the warning
  // badge computation.
  const layout = useDashboardLayout();

  const handleChartSettings = useCallback(
    (targetChartId: number, targetLabel?: string) => {
      const chart = charts[targetChartId];
      const datasource = chart?.form_data?.datasource;
      const parsed = datasource ? parseDatasource(datasource) : null;
      if (!parsed) {
        return;
      }
      setSettingsChart({
        chartId: targetChartId,
        label: targetLabel ?? String(targetChartId),
        datasetId: parsed.datasetId,
        datasourceType: parsed.datasourceType,
      });
    },
    [charts],
  );

  const checkedKeys = useMemo(
    () =>
      getTreeCheckedItems(
        { ...(formScope || initialScope) },
        layout,
        ((formScope || initialScope) as any)?.selectedLayers,
      ),
    [formScope, initialScope, layout],
  );

  // Reports to flag with a red warning badge: checked (in the filter scope),
  // their datasource does not match the filter's datasource (the grey
  // "datasets don't match" info icon), and no explicit per-report mapping is
  // configured — the filter value would not apply, so the grey hint turns
  // into a red warning.
  const warningChartIds = useMemo(() => {
    const warnings = new Set<number>();
    const explicitChartIds = new Set<number>();
    (filterTargets ?? []).forEach(target =>
      (target.chartIds ?? []).forEach(id => explicitChartIds.add(id)),
    );
    Object.entries(layout).forEach(([layoutKey, item]) => {
      if (item?.type !== CHART_TYPE || item.meta?.chartId == null) {
        return;
      }
      const chartId = item.meta.chartId;
      if (explicitChartIds.has(chartId)) {
        return;
      }
      if (!checkedKeys.includes(layoutKey)) {
        return;
      }
      if (initiallyExcludedCharts.includes(chartId)) {
        warnings.add(chartId);
      }
    });
    return warnings;
  }, [filterTargets, layout, checkedKeys, initiallyExcludedCharts]);

  const buildTreeLeafTitle = useCallback<
    (
      label: string,
      hasTooltip: boolean,
      tooltipTitle?: string,
      isDeckMultiChart?: boolean,
      chartId?: number,
      onChartSettings?: (chartId: number, label?: string) => void,
    ) => ReactNode
  >(
    (
      label,
      hasTooltip,
      tooltipTitle,
      isDeckMultiChart,
      chartId,
      onChartSettings,
    ) => {
      let title = <span>{label}</span>;

      if (isDeckMultiChart) {
        title = (
          <span
            css={css`
              display: inline-flex;
              align-items: center;
            `}
          >
            <Icons.CheckSquareOutlined
              iconSize="l"
              css={css`
                margin-right: 4px;
              `}
            />
            {label}
          </span>
        );
      }

      const isWarning = chartId != null && warningChartIds.has(chartId);
      if (isWarning) {
        title = (
          <>
            {title}&nbsp;
            <Tooltip
              placement="top"
              title={t(
                'This report is in the filter scope, but its dataset has no field matching the filter value and no mapping is configured. Click the settings button to map a column or write a value transform SQL.',
              )}
            >
              <StyledWarningIcon iconSize="m" />
            </Tooltip>
          </>
        );
      } else if (hasTooltip) {
        title = (
          <>
            {title}&nbsp;
            <Tooltip title={tooltipTitle}>
              <Icons.InfoCircleOutlined iconSize="m" />
            </Tooltip>
          </>
        );
      }

      if (chartId != null && onChartSettings) {
        title = (
          <>
            {title}&nbsp;
            <Tooltip
              placement="top"
              title={t('Filter target mapping and value transform')}
            >
              <button
                type="button"
                data-test="chart-filter-target-settings-button"
                aria-label={t('Filter target mapping and value transform')}
                css={(theme: Theme) => css`
                  border: none;
                  background: transparent;
                  padding: 0;
                  cursor: pointer;
                  color: ${theme.colorTextTertiary};
                  line-height: 1;
                  &:hover {
                    color: ${theme.colorPrimary};
                  }
                `}
                onClick={e => {
                  e.stopPropagation();
                  onChartSettings(chartId, label);
                }}
              >
                <Icons.SettingOutlined iconSize="m" />
              </button>
            </Tooltip>
          </>
        );
      }
      return title;
    },
    [warningChartIds],
  );

  const { treeData } = useFilterScopeTree(
    chartId,
    initiallyExcludedCharts,
    buildTreeLeafTitle,
    title,
    handleChartSettings,
  );

  const [autoExpandParent, setAutoExpandParent] = useState<boolean>(true);

  const handleExpand = (expandedKeys: string[]) => {
    setExpandedKeys(expandedKeys);
    setAutoExpandParent(false);
  };

  const handleCheck = (checkedKeys: string[]) => {
    forceUpdate();
    const { layerKeys, nonLayerKeys } = separateKeys(checkedKeys);
    const scope = findFilterScope(nonLayerKeys, layout);
    const parentChartIds = extractParentChartIds(layerKeys);
    const updatedScope = updateScopeWithParentCharts(
      scope,
      parentChartIds,
      nonLayerKeys,
      layout,
    );
    updateFormValues(createFormValues(updatedScope, layerKeys, chartId));
  };

  const settingsFilter = useMemo(
    () =>
      ({
        id: 'native-filter-settings',
        type: NativeFilterType.NativeFilter,
        name: t('Filter settings'),
        targets: filterTargets ?? [],
        scope: { rootPath: [], excluded: [] },
      }) as unknown as Filter,
    [filterTargets],
  );

  return (
    <>
      <StyledTree
        checkable
        selectable={false}
        onExpand={handleExpand}
        expandedKeys={expandedKeys}
        autoExpandParent={autoExpandParent}
        onCheck={handleCheck}
        checkedKeys={checkedKeys}
        treeData={treeData}
      />
      {settingsChart && (
        <FilterTargetSettings
          filter={settingsFilter}
          open
          onClose={() => setSettingsChart(null)}
          focus={{
            chartId: settingsChart.chartId,
            datasetId: settingsChart.datasetId,
            datasourceType: settingsChart.datasourceType,
          }}
          focusLabel={settingsChart.label}
          onSaveTargets={onSaveTargets}
        />
      )}
    </>
  );
};

export default memo(ScopingTree);
