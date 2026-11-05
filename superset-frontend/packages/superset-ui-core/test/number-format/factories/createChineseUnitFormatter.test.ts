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
import {
  CHINESE_UNIT_FORMATS,
  createChineseUnitFormatter,
  getNumberFormatter,
  NumberFormatter,
  parseChineseUnitFormat,
} from '@superset-ui/core';

test('exposes the three fixed Chinese units', () => {
  expect(Object.keys(CHINESE_UNIT_FORMATS)).toEqual([
    'CHINESE_WAN',
    'CHINESE_YI',
    'CHINESE_WANYI',
  ]);
  const formatter = createChineseUnitFormatter({ id: 'CHINESE_WAN' });
  expect(formatter).toBeInstanceOf(NumberFormatter);
  expect(formatter.id).toBe('CHINESE_WAN');
  expect(formatter.label).toBe('CHINESE_WAN');
});

test('scales values by a fixed 万 unit', () => {
  const formatter = createChineseUnitFormatter({ id: 'CHINESE_WAN' });
  expect(formatter(3808637.34)).toBe('380.86万');
  expect(formatter(1758.78)).toBe('0.18万');
  expect(formatter(12345678)).toBe('1,234.57万');
  expect(formatter(0)).toBe('0.00万');
  expect(formatter(-250000)).toBe('-25.00万');
});

test('scales values by 亿 and 万亿', () => {
  expect(createChineseUnitFormatter({ id: 'CHINESE_YI' })(1234567890)).toBe(
    '12.35亿',
  );
  expect(
    createChineseUnitFormatter({ id: 'CHINESE_WANYI' })(1234567890000),
  ).toBe('1.23万亿');
});

test('delegates non-finite values to NumberFormatter', () => {
  const formatter = createChineseUnitFormatter({ id: 'CHINESE_WAN' });
  expect(formatter(null)).toBe('null');
  expect(formatter(undefined)).toBe('undefined');
  expect(formatter(Number.POSITIVE_INFINITY)).toBe('∞');
});

test('honors custom label and description', () => {
  const formatter = createChineseUnitFormatter({
    id: 'CHINESE_YI',
    label: '亿元',
    description: 'Values in 100 millions',
  });
  expect(formatter.label).toBe('亿元');
  expect(formatter.description).toBe('Values in 100 millions');
});

test('parses d3-style Chinese unit specifiers', () => {
  expect(parseChineseUnitFormat(',.1万')).toEqual({
    d3Format: ',.1f',
    divisor: 1e4,
    suffix: '万',
  });
  expect(parseChineseUnitFormat('0.1万')).toEqual({
    d3Format: '.1f',
    divisor: 1e4,
    suffix: '万',
  });
  expect(parseChineseUnitFormat('.0亿')).toEqual({
    d3Format: '.0f',
    divisor: 1e8,
    suffix: '亿',
  });
  expect(parseChineseUnitFormat(',.2~f万亿')).toEqual({
    d3Format: ',.2~f',
    divisor: 1e12,
    suffix: '万亿',
  });
  expect(parseChineseUnitFormat('万')).toBeNull();
  expect(parseChineseUnitFormat(',.2f')).toBeNull();
  expect(parseChineseUnitFormat(',.1s万')).toBeNull();
});

test('resolves specifiers through the number formatter registry', () => {
  expect(getNumberFormatter(',.1万')(3808637.34)).toBe('380.9万');
  expect(getNumberFormatter('0.1万')(3808637.34)).toBe('380.9万');
  expect(getNumberFormatter(',.2万')(3808637.34)).toBe('380.86万');
  expect(getNumberFormatter('.0亿')(1234567890)).toBe('12亿');
});
