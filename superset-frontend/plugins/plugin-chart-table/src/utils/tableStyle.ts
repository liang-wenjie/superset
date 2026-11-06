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
import type { CSSProperties } from 'react';
import {
  getTableStyleConfig,
  getTableStyleVariables as getSharedTableStyleVariables,
  normalizeTableColor,
  normalizeTablePixels,
  TABLE_STYLE_VARS,
} from '@superset-ui/chart-controls';
import type { TableStyleConfig } from '../types';

/**
 * The sanitizing logic and the variable names are shared with the Pivot Table
 * plugin through `@superset-ui/chart-controls`. Keep the local re-exports so
 * the rest of this plugin can keep importing from `./utils/tableStyle`.
 */
export {
  TABLE_STYLE_VARS,
  getTableStyleConfig,
  normalizeTableColor as normalizeColor,
  normalizeTablePixels as normalizePixels,
};

export function getTableStyleVariables(
  config: TableStyleConfig | undefined,
): CSSProperties {
  return getSharedTableStyleVariables(config, {
    variables: TABLE_STYLE_VARS,
    // The Table chart's original emphasis lines are 2px wide.
    bodyLineFallback: '2px',
  });
}
