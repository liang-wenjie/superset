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
import { render } from '@testing-library/react';
import { GlobalStyles } from './GlobalStyles';
import { Theme } from './Theme';

// Locks in the app shell's CSS contract (superset#44867): body/#app must stay
// a growable min-height:100vh flex column, not a fixed height:100% box, or
// content a host page injects above #app clips past the viewport again.
// Emotion inserts rules via the CSSOM (sheet.insertRule) rather than setting
// <style> textContent, so the rules must be read from document.styleSheets.
function findRule(selectorText: string): string {
  const themeObject = Theme.fromConfig();
  render(
    <themeObject.SupersetThemeProvider>
      <GlobalStyles />
    </themeObject.SupersetThemeProvider>,
  );
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if ((rule as CSSStyleRule).selectorText === selectorText) {
        return rule.cssText;
      }
    }
  }
  throw new Error(`No rule found for selector ${selectorText}`);
}

function allRules(): string {
  const themeObject = Theme.fromConfig();
  render(
    <themeObject.SupersetThemeProvider>
      <GlobalStyles />
    </themeObject.SupersetThemeProvider>,
  );
  const cssText: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      cssText.push(rule.cssText);
    }
  }
  return cssText.join('\n');
}

test('body is a growable min-height flex column, not a fixed-height box', () => {
  const bodyRule = findRule('body');

  expect(bodyRule).toMatch(/min-height:\s*100vh/);
  expect(bodyRule).toMatch(/display:\s*flex/);
  expect(bodyRule).toMatch(/flex-direction:\s*column/);
  // The pre-#44867 shell fixed body to exactly 100% of the viewport, which
  // clips rather than grows when a host page injects content above #app.
  expect(bodyRule).not.toMatch(/\bheight:\s*100%/);
});

test('#app has no explicit height, so it flex-grows into the space body leaves it', () => {
  const appRule = findRule('#app');

  expect(appRule).toMatch(/flex:\s*1 1 auto/);
  expect(appRule).not.toMatch(/\bheight:\s*100%/);
});

test('native scrollbars reserve no layout space and the overlay thumb floats', () => {
  expect(findRule(':where(*)')).toMatch(/scrollbar-width:\s*none/);

  const webkitRule = findRule(':where(*)::-webkit-scrollbar');
  expect(webkitRule).toMatch(/width:\s*0/);
  expect(webkitRule).toMatch(/height:\s*0/);

  const thumbRule = findRule('.superset-overlay-scrollbar-thumb');
  expect(thumbRule).toMatch(/position:\s*fixed/);
  expect(thumbRule).toMatch(/pointer-events:\s*none/);
  expect(thumbRule).toMatch(/opacity:\s*0/);

  expect(findRule('.superset-overlay-scrollbar-thumb[data-visible]')).toMatch(
    /opacity:\s*1/,
  );
});

test('horizontal scrollbars use an auto-hiding track with a rounded thumb', () => {
  const trackRule = findRule('.superset-scrollbar-track');
  expect(trackRule).toMatch(/position:\s*fixed/);
  expect(trackRule).toMatch(/pointer-events:\s*none/);
  expect(trackRule).toMatch(/opacity:\s*0/);

  expect(findRule('.superset-scrollbar-track[data-visible]')).toMatch(
    /opacity:\s*1/,
  );

  const thumbRule = findRule('.superset-scrollbar-thumb');
  expect(thumbRule).toMatch(/position:\s*absolute/);
  expect(thumbRule).toMatch(/border-radius:\s*999px/);
});

test('scrollbar overlays sit below every antd popup layer', () => {
  const popupBase = Theme.fromConfig().theme.zIndexPopupBase;
  const readZIndex = (rule: string) =>
    Number(rule.match(/z-index:\s*(\d+)/)?.[1]);

  // A hardcoded 10000 used to float scrollbars above modals and dropdowns.
  expect(readZIndex(findRule('.superset-overlay-scrollbar-thumb'))).toBe(
    popupBase - 1,
  );
  expect(readZIndex(findRule('.superset-scrollbar-track'))).toBe(popupBase - 1);
});

test('hovered and dragged thumbs grow and become draggable', () => {
  const css = allRules();
  expect(css).toMatch(/pointer-events:\s*auto/);
  expect(css).toMatch(/cursor:\s*grab/);
  expect(css).toMatch(/cursor:\s*grabbing/);
  expect(css).toMatch(/width:\s*10px\s*!important/);
  // Horizontal thumbs live inside an 8px track and grow to 12px on hover.
  expect(css).toMatch(/height:\s*12px/);
  expect(css).toMatch(/\[data-hover\]/);
  expect(css).toMatch(/\[data-drag\]/);
  expect(css).toMatch(/superset-scrollbar-thumb\[data-hover\]/);
});
