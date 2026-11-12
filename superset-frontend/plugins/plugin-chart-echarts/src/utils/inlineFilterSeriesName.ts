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
import { ensureIsArray, JsonObject, QueryFormData } from '@superset-ui/core';

/**
 * With a `groupby` dimension, Superset names every series
 * "<metric>, <dimension value>". A single-select chart inline filter on that
 * same dimension already narrows the query to one value, so the trailing
 * dimension label is redundant in the legend, tooltip and X-axis data table.
 *
 * The effective selection is read from the injected adhoc filters (the same
 * formData the query was run with) rather than from control state, so defaults,
 * "select first filter value" and required fallbacks are all covered. This
 * module deliberately mirrors the tiny slice of `inline_filters` shape it
 * needs instead of importing application code into a chart plugin.
 */
export type HiddenDimensionLabel = {
  column: string;
  value: string;
};

/** Single-select values that belong to each query section of a mixed chart. */
export type HiddenDimensionLabelsByQuery = {
  A: HiddenDimensionLabel[];
  B: HiddenDimensionLabel[];
};

type InlineFilterShape = {
  id?: unknown;
  column?: unknown;
  filterType?: unknown;
  multi?: unknown;
  inverseSelection?: unknown;
  queryScope?: unknown;
};

type AdhocFilterShape = {
  filterOptionName?: unknown;
  operator?: unknown;
  comparator?: unknown;
};

const INLINE_FILTER_PREFIX = 'inline_';

/**
 * `ChartProps` stores two copies of form data: `rawFormData` keeps the original
 * snake_case keys while `formData` is passed through `convertKeysToCamelCase`.
 * Either one may be the copy that actually carries the injected filters, so
 * both spellings have to be recognized, including the `_b` Query B section.
 */
const isAdhocFilterKey = (key: string): boolean =>
  key === 'adhoc_filters' ||
  key === 'adhocFilters' ||
  key.startsWith('adhoc_filters_') ||
  /^adhocFilters[A-Z_]/.test(key);

const getConfigs = (source: Record<string, unknown>): InlineFilterShape[] =>
  ensureIsArray(
    (source.inline_filters ?? source.inlineFilters) as JsonObject[] | undefined,
  ) as InlineFilterShape[];

const isSingleSelect = (config: InlineFilterShape): boolean => {
  // An inverse selection returns every *other* dimension value, so the label
  // still carries information and must stay visible.
  if (config.inverseSelection === true) return false;
  if (config.filterType === 'multiple' || config.filterType === 'input') {
    return false;
  }
  if (config.filterType === 'single') return true;
  // Charts saved before `filterType` existed rely on the `multi` flag.
  return config.multi !== true;
};

const getInjectedSingleValues = (
  sources: Record<string, unknown>[],
  configs: InlineFilterShape[],
): Record<'A' | 'B', Map<string, string>> => {
  const result = {
    A: new Map<string, string>(),
    B: new Map<string, string>(),
  };
  const scopeById = new Map<string, string>();
  configs.forEach(config => {
    if (config && typeof config.id === 'string') {
      const scope =
        config.queryScope === 'A' || config.queryScope === 'B'
          ? config.queryScope
          : 'all';
      scopeById.set(config.id, scope);
    }
  });
  sources.forEach(source => {
    Object.keys(source).forEach(key => {
      if (!isAdhocFilterKey(key)) return;
      ensureIsArray(source[key] as JsonObject[] | undefined).forEach(raw => {
        const filter = (raw ?? {}) as AdhocFilterShape;
        const { filterOptionName } = filter;
        // `==` with a scalar comparator is produced only by a non-inverse
        // single-select filter. Multi (`IN`), text input (`ILIKE`) and inverse
        // (`!=`) selections must keep their dimension labels.
        if (
          typeof filterOptionName !== 'string' ||
          !filterOptionName.startsWith(INLINE_FILTER_PREFIX) ||
          filter.operator !== '==' ||
          (typeof filter.comparator !== 'string' &&
            typeof filter.comparator !== 'number')
        ) {
          return;
        }
        const value = String(filter.comparator);
        if (value.length === 0) return;
        const id = filterOptionName.slice(INLINE_FILTER_PREFIX.length);
        const scope = scopeById.get(id) ?? 'all';
        // A filter explicitly bound to one query only rewrites that query's
        // series names. Legacy (unscoped) filters keep the original behaviour:
        // their selection applies to every query, regardless of which
        // adhoc_filters* section happens to carry the injected clause.
        if (scope === 'all' || scope === 'A') result.A.set(id, value);
        if (scope === 'all' || scope === 'B') result.B.set(id, value);
      });
    });
  });
  return result;
};

const collectForQuery = (
  configs: InlineFilterShape[],
  selected: Map<string, string>,
): HiddenDimensionLabel[] => {
  const seen = new Set<string>();
  return configs.reduce<HiddenDimensionLabel[]>((acc, config) => {
    if (!config || !isSingleSelect(config)) return acc;
    const { column, id } = config;
    if (typeof column !== 'string' || typeof id !== 'string') return acc;
    if (seen.has(id)) return acc;
    const value = selected.get(id);
    if (value === undefined) return acc;
    seen.add(id);
    acc.push({ column, value });
    return acc;
  }, []);
};

const getRecords = (
  sources: (QueryFormData | undefined | null)[],
): Record<string, unknown>[] =>
  sources
    .filter((source): source is QueryFormData => Boolean(source))
    .map(source => source as unknown as Record<string, unknown>);

/**
 * Single-select inline filters whose column is a chart dimension, split by
 * query section. A filter bound to Query A is injected only into
 * `adhoc_filters`, so it must not strip dimension values from Query B's
 * series names (and vice versa). Unscoped filters reach both queries.
 */
export function getHiddenDimensionLabelsByQuery(
  ...sources: (QueryFormData | undefined | null)[]
): HiddenDimensionLabelsByQuery {
  const records = getRecords(sources);
  if (records.length === 0) return { A: [], B: [] };
  const configs = records.flatMap(getConfigs);
  if (configs.length === 0) return { A: [], B: [] };
  const selected = getInjectedSingleValues(records, configs);
  return {
    A: collectForQuery(configs, selected.A),
    B: collectForQuery(configs, selected.B),
  };
}

/** All single-select dimension labels, for single-query charts. */
export function getHiddenDimensionLabels(
  ...sources: (QueryFormData | undefined | null)[]
): HiddenDimensionLabel[] {
  const { A, B } = getHiddenDimensionLabelsByQuery(...sources);
  const seen = new Set<string>();
  return [...A, ...B].filter(({ column, value }) => {
    const key = `${column}\u0000${value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Physical columns are plain strings; adhoc columns carry `column_name`. */
export function getDimensionColumnNames(dimensions: unknown[]): Set<string> {
  const names = new Set<string>();
  ensureIsArray(dimensions).forEach(dimension => {
    if (typeof dimension === 'string') {
      names.add(dimension);
    } else if (dimension && typeof dimension === 'object') {
      const candidate =
        (dimension as JsonObject).column_name ??
        (dimension as JsonObject).label;
      if (typeof candidate === 'string') names.add(candidate);
    }
  });
  return names;
}

/**
 * Drop the dimension-value segments from a rendered series name. Only segments
 * after the first one are candidates, so a metric label is never removed.
 * Returns the original name when nothing matches.
 */
export function stripDimensionValueLabels(
  seriesName: string,
  values: string[],
): string {
  if (values.length === 0) return seriesName;
  const segments = seriesName.split(', ');
  if (segments.length < 2) return seriesName;

  const indices = new Set<number>();
  values.forEach(value => {
    const index = segments.lastIndexOf(value);
    if (index > 0) indices.add(index);
  });
  if (indices.size === 0) return seriesName;
  return segments.filter((_, index) => !indices.has(index)).join(', ');
}
