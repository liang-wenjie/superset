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
import type { InlineFilterConfig, InlineFilterSelection } from './types';
import { buildInlineAdhocFilter } from './types';

/**
 * Returns a new formData with the selected inline-filter values injected as
 * extra adhoc WHERE clauses. Existing adhoc_filters are preserved; inline
 * filters are keyed by `inline_<id>` so re-injection is idempotent.
 *
 * Inline filters target the underlying dataset, so the same selection is
 * injected into every query section the chart declares. Single-query charts
 * only have `adhoc_filters`; mixed charts also declare `adhoc_filters_b`
 * (Query B), so picking a value filters both series.
 */
export function injectInlineFilters(
  formData: QueryFormData,
  config: InlineFilterConfig[],
  selection: InlineFilterSelection,
): QueryFormData {
  if (!Array.isArray(config) || config.length === 0) return formData;

  const adhocKeys = Object.keys(formData).filter(
    key => key === 'adhoc_filters' || key.startsWith('adhoc_filters_'),
  );
  if (adhocKeys.length === 0) return formData;

  const injected = config
    .map(cfg => {
      const selected = selection[cfg.id] ?? cfg.defaultValue;
      if (selected === undefined || selected === null) return null;
      if (!cfg.column) return null;
      return buildInlineAdhocFilter(cfg, selected);
    })
    .filter(Boolean);

  const stripInjected = (existing: JsonObject[]) =>
    existing.filter(
      f =>
        typeof f?.filterOptionName !== 'string' ||
        !f.filterOptionName.startsWith('inline_'),
    );

  const entries = adhocKeys.map(key => {
    const existing = ensureIsArray(
      (formData as unknown as Record<string, unknown>)[key] as
        | JsonObject[]
        | undefined,
    );
    return [key, stripInjected(existing)] as const;
  });

  if (injected.length === 0) {
    // Nothing selected: keep the original object unless previously injected
    // filters must be stripped (the config was cleared).
    const unchanged = entries.every(
      ([key, withoutInline]) =>
        withoutInline.length ===
        ensureIsArray(
          (formData as unknown as Record<string, unknown>)[key] as
            | JsonObject[]
            | undefined,
        ).length,
    );
    if (unchanged) return formData;
    return {
      ...formData,
      ...Object.fromEntries(entries),
    } as QueryFormData;
  }

  return {
    ...formData,
    ...Object.fromEntries(
      entries.map(([key, withoutInline]) => [
        key,
        [...withoutInline, ...injected],
      ]),
    ),
  } as QueryFormData;
}
