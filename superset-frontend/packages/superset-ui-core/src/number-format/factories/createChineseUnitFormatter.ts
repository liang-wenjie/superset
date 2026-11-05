/*
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
import { formatLocale, FormatLocaleDefinition } from 'd3-format';
import { DEFAULT_D3_FORMAT } from '../D3FormatConfig';
import NumberFormatter from '../NumberFormatter';

/**
 * Fixed Chinese large-number units. Unlike d3's SI prefixes, which step by
 * 10^3, Chinese numbering steps by 10^4: 万 -> 亿 -> 万亿. The ids are stored
 * in chart form_data, so they must stay ASCII for the backend report path.
 */
export const CHINESE_UNIT_FORMATS = {
  CHINESE_WAN: { divisor: 1e4, suffix: '万' },
  CHINESE_YI: { divisor: 1e8, suffix: '亿' },
  CHINESE_WANYI: { divisor: 1e12, suffix: '万亿' },
} as const;

export type ChineseUnitFormatId = keyof typeof CHINESE_UNIT_FORMATS;

// Ordered longest-first so 万亿 wins over 亿 / 万.
const UNIT_SUFFIXES: { suffix: string; divisor: number }[] = [
  { suffix: '万亿', divisor: 1e12 },
  { suffix: '亿', divisor: 1e8 },
  { suffix: '万', divisor: 1e4 },
];

export interface ChineseUnitSpecifier {
  d3Format: string;
  divisor: number;
  suffix: string;
}

/**
 * Parse a d3-style specifier with a Chinese unit suffix, e.g. `,.1万`.
 *
 * d3's SI prefixes (`.1s`) are hard-coded to 10^3 steps and cannot express
 * 万 / 亿, so this parses the fixed-point prefix itself and appends the unit
 * after scaling. The `f` type is optional: `.1万` is normalized to `.1f万`,
 * making the number after the dot the decimal places, just like `,.1f`.
 */
export function parseChineseUnitFormat(
  format: string,
): ChineseUnitSpecifier | null {
  const unit = UNIT_SUFFIXES.find(({ suffix }) => format.endsWith(suffix));
  if (!unit) return null;

  const prefix = format.slice(0, -unit.suffix.length);
  // Tolerate a leading `0` (d3's zero-pad flag, harmless for fixed point),
  // so `0.1万` behaves exactly like `.1万`.
  const normalizedPrefix = prefix.startsWith('0') ? prefix.slice(1) : prefix;
  const match = /^([+-]?)(,?)(?:\.(\d+))?(~?)(f?)$/.exec(normalizedPrefix);
  if (!match) return null;

  const [, sign, comma, precision, trim, type] = match;
  // A bare unit ("万") has no precision information; the fixed format ids
  // (CHINESE_WAN etc.) cover that case.
  if (!precision && !type) return null;

  const d3Format = `${sign}${comma}${precision ? `.${precision}` : ''}${trim}${
    type || 'f'
  }`;
  return { d3Format, divisor: unit.divisor, suffix: unit.suffix };
}

export default function createChineseUnitFormatter(config: {
  id: string;
  label?: string;
  description?: string;
  locale?: Partial<FormatLocaleDefinition>;
  specifier?: ChineseUnitSpecifier;
}) {
  const { id, label, description, locale, specifier } = config;
  const fixed =
    id in CHINESE_UNIT_FORMATS
      ? CHINESE_UNIT_FORMATS[id as ChineseUnitFormatId]
      : undefined;

  let resolved: ChineseUnitSpecifier;
  if (specifier) {
    resolved = specifier;
  } else if (fixed) {
    resolved = { d3Format: ',.2f', ...fixed };
  } else {
    throw new Error(`Unknown Chinese unit format: ${id}`);
  }

  const formatValue = formatLocale({
    ...DEFAULT_D3_FORMAT,
    ...locale,
  }).format(resolved.d3Format);

  return new NumberFormatter({
    id,
    label: label ?? id,
    description,
    formatFunc: (value: number) =>
      `${formatValue(value / resolved.divisor)}${resolved.suffix}`,
  });
}
