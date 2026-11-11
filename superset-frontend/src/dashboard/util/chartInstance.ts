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
import { NativeFilterScope, NativeFilterTarget } from '@superset-ui/core';
import { Layout } from '../types';
import { CHART_TYPE } from './componentTypes';

/**
 * The layout id of a CHART node doubles as its instance id. It is unique,
 * persisted in `position_json`, and preserved by dashboard import/export, so
 * duplicate holders of the same slice can be addressed independently without
 * adding a new field to the layout metadata.
 */
export const CHART_INSTANCE_KEY_SEPARATOR = '::';

export type ChartStateKey = number | string;

type ChartHolder = {
  type?: string;
  meta?: { chartId?: number };
};

const isChartHolder = (item: unknown): item is ChartHolder =>
  !!item && typeof item === 'object';

export function getChartInstanceCounts(
  layout: Layout | undefined,
): Record<number, number> {
  const counts: Record<number, number> = {};
  Object.values(layout ?? {}).forEach(item => {
    if (!isChartHolder(item) || item.type !== CHART_TYPE) {
      return;
    }
    const chartId = item.meta?.chartId;
    if (typeof chartId === 'number') {
      counts[chartId] = (counts[chartId] ?? 0) + 1;
    }
  });
  return counts;
}

/** Selector-friendly variant: returns a primitive so `useSelector` does not
 * trigger a re-render on every store update. */
export function countChartInstances(
  layout: Layout | undefined,
  chartId: number,
): number {
  let count = 0;
  Object.values(layout ?? {}).forEach(item => {
    if (
      isChartHolder(item) &&
      item.type === CHART_TYPE &&
      item.meta?.chartId === chartId
    ) {
      count += 1;
    }
  });
  return count;
}

export function getChartInstanceIds(
  layout: Layout | undefined,
  chartId: number,
): string[] {
  return Object.values(layout ?? {}).flatMap(item =>
    isChartHolder(item) &&
    item.type === CHART_TYPE &&
    item.meta?.chartId === chartId &&
    typeof (item as { id?: unknown }).id === 'string'
      ? [(item as { id: string }).id]
      : [],
  );
}

/**
 * Single-instance charts keep their numeric slice id as the Redux/chart key so
 * every existing consumer is untouched. Only duplicated slices get an
 * instance-scoped key, which is what produces one query per holder.
 */
export function getChartStateKey(
  chartId: number,
  componentId: string,
  instanceCount: number,
): ChartStateKey {
  return instanceCount > 1
    ? `${chartId}${CHART_INSTANCE_KEY_SEPARATOR}${componentId}`
    : chartId;
}

/**
 * Redux object keys are always strings, even for numeric chart ids, so a plain
 * `typeof key === 'string'` check would mistake `'127'` for an instance key.
 * Only the `<chartId>::<componentId>` form counts.
 */
export function isInstanceScopedKey(key: ChartStateKey): key is string {
  if (typeof key !== 'string' || !key.includes(CHART_INSTANCE_KEY_SEPARATOR)) {
    return false;
  }
  const [rawChartId] = key.split(CHART_INSTANCE_KEY_SEPARATOR);
  return /^\d+$/.test(rawChartId ?? '');
}

/**
 * Scope/refresh actions carry slice ids, but duplicated slices live under
 * instance-scoped Redux keys. Expand each id into every key that must be
 * triggered so all holders re-query when a filter value changes. Ids arriving
 * from filter scopes are sometimes numeric strings (`'127'`), while an
 * instance key looks like `127::CHART-abc`; only the latter passes through.
 */
export function expandChartStateKeys(
  layout: Layout | undefined,
  ids: readonly (string | number)[],
): (string | number)[] {
  const counts = getChartInstanceCounts(layout);
  const expanded: (string | number)[] = [];
  ids.forEach(id => {
    const numericId =
      typeof id === 'number' ? id : /^\d+$/.test(id) ? Number(id) : NaN;
    if (!Number.isFinite(numericId)) {
      expanded.push(id);
      return;
    }
    const count = counts[numericId] ?? 0;
    if (count > 1) {
      getChartInstanceIds(layout, numericId).forEach(instanceId => {
        expanded.push(getChartStateKey(numericId, instanceId, count));
      });
    } else {
      expanded.push(id);
    }
  });
  return [...new Set(expanded)];
}

/** Instance-scoped keys for every CHART holder of a duplicated slice. */
export function getChartInstanceKeys(
  layout: Layout | undefined,
): { stateKey: string; chartId: number }[] {
  const counts = getChartInstanceCounts(layout);
  return Object.values(layout ?? {}).flatMap(item => {
    if (!isChartHolder(item) || item.type !== CHART_TYPE) {
      return [];
    }
    const chartId = item.meta?.chartId;
    const holderId = (item as { id?: unknown }).id;
    if (
      typeof chartId !== 'number' ||
      typeof holderId !== 'string' ||
      (counts[chartId] ?? 1) <= 1
    ) {
      return [];
    }
    return [
      {
        stateKey: String(
          getChartStateKey(chartId, holderId, counts[chartId] ?? 1),
        ),
        chartId,
      },
    ];
  });
}

export function parseChartIdFromStateKey(key: ChartStateKey): number | null {
  if (typeof key === 'number') {
    return key;
  }
  const [raw] = key.split(CHART_INSTANCE_KEY_SEPARATOR);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

type TargetLike = Pick<NativeFilterTarget, 'chartIds' | 'instanceIds'>;

/**
 * Instance-scoped targets win over legacy `chartIds` targets. A legacy target
 * is still returned for duplicated slices so pre-existing dashboards keep
 * their old behaviour (all holders share the same SQL) until the user saves an
 * instance-specific override, at which point the legacy target is split.
 */
export function resolveFilterTarget<T extends TargetLike>(
  targets: readonly T[] | undefined,
  chartId: number,
  instanceId?: string,
): T | undefined {
  if (!targets?.length) {
    return undefined;
  }
  if (instanceId) {
    const instanceTarget = targets.find(target =>
      target.instanceIds?.includes(instanceId),
    );
    if (instanceTarget) {
      return instanceTarget;
    }
  }
  return targets.find(target => target.chartIds?.includes(chartId));
}

export function isInstanceExcluded(
  scope: NativeFilterScope | undefined,
  instanceId: string | undefined,
): boolean {
  return !!(
    instanceId &&
    scope?.excludedInstances?.length &&
    scope.excludedInstances.includes(instanceId)
  );
}
