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
import { render, screen } from '@superset-ui/core/spec';
import InlineFiltersControl from '.';

jest.mock('@superset-ui/core/components', () => {
  const actual = jest.requireActual('@superset-ui/core/components');
  const ReactModule = jest.requireActual('react');
  const SelectProbe = (props: {
    'aria-label'?: string;
    popupMatchSelectWidth?: boolean | number;
    styles?: { popup?: { root?: { maxWidth?: number | string } } };
  }) =>
    ReactModule.createElement('select', {
      'data-test': 'inline-filter-column-select',
      'aria-label': props['aria-label'],
      'data-popup-match': String(props.popupMatchSelectWidth),
      'data-popup-max-width': String(props.styles?.popup?.root?.maxWidth ?? ''),
    });
  // The module exports lazy getters and is mid-load here, so read through to
  // it rather than spreading it, which would resolve them all too early.
  return new Proxy(actual, {
    get: (target, name) => (name === 'Select' ? SelectProbe : target[name]),
  });
});

const props = {
  name: 'inline_filters',
  label: 'Chart inline filters',
  value: [{ id: 'group-1', column: '上年度销售额同比', label: '' }],
  columns: [
    { column_name: '上年度销售额同比' },
    { column_name: '本年度销售额' },
  ],
  onChange: jest.fn(),
};

test('gives the column selector its own row so field names are not squeezed', () => {
  render(<InlineFiltersControl {...props} />);
  const removeButton = screen.getByRole('button', { name: 'Remove' });
  const labelInput = screen.getByLabelText('Label');

  // The label input used to share the row with the select and the remove
  // button, leaving the column selector only a few dozen pixels wide.
  expect(removeButton.parentElement).not.toContainElement(labelInput);
  expect(screen.getByLabelText('Column')).toBeInTheDocument();
  expect(labelInput).toHaveAttribute('placeholder', 'Label (e.g. Category)');
});

test('lets the column popup size to its content instead of the trigger', () => {
  render(<InlineFiltersControl {...props} />);
  const select = screen.getByTestId('inline-filter-column-select');
  expect(select).toHaveAttribute('data-popup-match', 'false');
  expect(select).toHaveAttribute('data-popup-max-width', '320');
});
