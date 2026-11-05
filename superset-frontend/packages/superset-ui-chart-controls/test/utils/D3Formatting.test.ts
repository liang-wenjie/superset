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
import { getNumberFormatter } from '@superset-ui/core';
import { D3_FORMAT_OPTIONS } from '../../src/utils/D3Formatting';

const chineseUnitOptions = D3_FORMAT_OPTIONS.filter(([value]) =>
  /万|亿/.test(value),
);

test('exposes exactly two Chinese unit templates', () => {
  expect(chineseUnitOptions.map(([value]) => value)).toEqual([
    ',.2万',
    ',.2万亿',
  ]);
});

test('Chinese unit templates use their format string as the label', () => {
  // y_axis_format is freeForm: the selected label is what lands in the
  // editable input, so it must be the specifier itself, not a description.
  chineseUnitOptions.forEach(([value, label]) => {
    expect(label).toBe(value);
  });
});

test('Chinese unit templates are valid, editable specifiers', () => {
  expect(getNumberFormatter(',.2万')(3808637.34)).toBe('380.86万');
  expect(getNumberFormatter(',.1万')(3808637.34)).toBe('380.9万');
  expect(getNumberFormatter(',.2万亿')(1234567890000)).toBe('1.23万亿');
});
