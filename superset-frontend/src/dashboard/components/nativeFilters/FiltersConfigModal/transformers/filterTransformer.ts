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
  Filter,
  Divider,
  NativeFilterType,
  NativeFilterTarget,
  ChartCustomization,
  ChartCustomizationType,
  ChartCustomizationDivider,
} from '@superset-ui/core';
import { getInitialDataMask } from 'src/dataMask/reducer';
import { DASHBOARD_ROOT_ID } from 'src/dashboard/util/constants';
import {
  NativeFiltersFormItem,
  NativeFilterDivider,
  ChartCustomizationsFormItem,
} from '../types';
import {
  buildNativeFilterTarget,
  buildNativeFilterDefaultDataMask,
} from './buildTarget';

type FilterFormInput =
  | NativeFiltersFormItem
  | NativeFilterDivider
  | Filter
  | Divider
  | ChartCustomizationsFormItem
  | ChartCustomization
  | ChartCustomizationDivider;

type NativeFilterFormOrSaved = NativeFiltersFormItem | Filter;

function isCustomizationType(
  formInputs: FilterFormInput,
): formInputs is
  | ChartCustomizationsFormItem
  | ChartCustomization
  | ChartCustomizationDivider {
  return (
    'type' in formInputs &&
    (formInputs.type === ChartCustomizationType.ChartCustomization ||
      formInputs.type === ChartCustomizationType.Divider)
  );
}

function isDividerType(
  formInputs: FilterFormInput,
): formInputs is NativeFilterDivider | Divider {
  return formInputs.type === NativeFilterType.Divider;
}

function isFormInput(
  formInputs: NativeFilterFormOrSaved,
): formInputs is NativeFiltersFormItem {
  // A saved filter always carries a serialized `targets` array and an `id`;
  // a form item's id lives in the form name path, not in its value, and it
  // only gains a `targets` array once the scope-tree settings dialog writes
  // it into the form (via a hidden Form.Item). Keying off `targets` alone
  // would misclassify that still-untransformed form value as already saved.
  // Dashboards affected by an old stripping bug hold `filter_time` entries
  // with an `id` but no `targets`; those take the form-item path so the next
  // save repairs them. Keying off `dataset` misclassified filter types with
  // no dataset control (e.g. `filter_time`) as already saved.
  return !('id' in formInputs) || !Array.isArray(formInputs.targets);
}

function transformDivider(
  id: string,
  formInputs: NativeFilterDivider | Divider,
): Divider {
  return {
    id,
    type: NativeFilterType.Divider,
    title: formInputs.title,
    description: formInputs.description,
    scope: {
      rootPath: [DASHBOARD_ROOT_ID],
      excluded: [],
    },
  };
}

function buildFilterTarget(
  formInputs: NativeFiltersFormItem,
): Partial<NativeFilterTarget> {
  return buildNativeFilterTarget(formInputs);
}

function transformFormInput(
  id: string,
  formInputs: NativeFiltersFormItem,
  previousTargets?: Partial<NativeFilterTarget>[],
): Filter {
  const defaultScope = {
    rootPath: [DASHBOARD_ROOT_ID],
    excluded: [],
  };

  const formTargets = formInputs.targets;
  const baseTarget = formTargets?.[0] ?? buildFilterTarget(formInputs);
  const previousDefault = previousTargets?.[0];
  if (
    !formTargets &&
    previousDefault?.valueTransform &&
    String(previousDefault.datasetId) === String(baseTarget.datasetId) &&
    (previousDefault.datasourceType ?? 'table') ===
      (baseTarget.datasourceType ?? 'table') &&
    previousDefault.column?.name === baseTarget.column?.name
  ) {
    // Preserve the value transform configured on the default target when the
    // form's dataset/column are unchanged.
    baseTarget.valueTransform = previousDefault.valueTransform;
  }

  const result: Filter & { time_grains?: string[] } = {
    id,
    type: NativeFilterType.NativeFilter,
    name: formInputs.name,
    filterType: formInputs.filterType,
    description: (formInputs.description || '').trim(),
    targets:
      formTargets && formTargets.length > 0
        ? // The scope-tree settings dialog already wrote the full target list
          // (default target + per-report overrides) into the form.
          formTargets
        : [
            baseTarget,
            // Per-chart target overrides (alias columns / value transforms)
            // live on targets[1..]; the form has no UI for them, so keep them
            // across edits instead of silently dropping the mapping.
            ...(previousTargets?.slice(1) ?? []),
          ],
    scope: formInputs.scope || defaultScope,
    controlValues: formInputs.controlValues ?? {},
    defaultDataMask: buildNativeFilterDefaultDataMask(
      formInputs,
      formInputs.defaultDataMask ?? getInitialDataMask(),
    ),
    cascadeParentIds: formInputs.dependencies || [],
    adhoc_filters: formInputs.adhoc_filters,
    time_range: formInputs.time_range,
    granularity_sqla: formInputs.granularity_sqla,
    sortMetric: formInputs.sortMetric,
    requiredFirst: formInputs.requiredFirst
      ? Object.values(formInputs.requiredFirst).find(rf => rf)
      : undefined,
  };

  if (formInputs.time_grains?.length) {
    result.time_grains = formInputs.time_grains;
  }

  return result;
}

function transformSavedFilter(id: string, filter: Filter): Filter {
  return {
    ...filter,
    id,
    description: (filter.description || '').trim(),
  };
}

function transformFilter(
  id: string,
  formInputs: NativeFilterFormOrSaved,
  previousTargets?: Partial<NativeFilterTarget>[],
): Filter {
  if (isFormInput(formInputs)) {
    return transformFormInput(id, formInputs, previousTargets);
  }
  return transformSavedFilter(id, formInputs);
}

export function transformFilterForSave(
  id: string,
  formInputs: FilterFormInput | undefined,
  previousFilter?: Filter,
): Filter | Divider | undefined {
  if (!formInputs) {
    return undefined;
  }

  if (isCustomizationType(formInputs)) {
    return undefined;
  }

  if (isDividerType(formInputs)) {
    return transformDivider(id, formInputs);
  }

  return transformFilter(id, formInputs, previousFilter?.targets);
}
