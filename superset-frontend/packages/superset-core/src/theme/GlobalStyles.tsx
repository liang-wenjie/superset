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

// @fontsource/* v5.1+ doesn't play nice with eslint-import plugin v2.31+
/* eslint-disable import/extensions */
import '@fontsource/inter/200.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
/* eslint-enable import/extensions */

import { css, useTheme, Global } from '@emotion/react';
import { useThemeMode } from './utils/themeUtils';
import {
  DRAG_ATTRIBUTE,
  HOVER_ATTRIBUTE,
  OVERLAY_THUMB_CLASS,
  SCROLLBAR_ACTIVE_ATTRIBUTE,
  SCROLLBAR_THUMB_CLASS,
  SCROLLBAR_TRACK_CLASS,
  VISIBLE_ATTRIBUTE,
  useAutoHideScrollbars,
} from './useAutoHideScrollbars';

export const GlobalStyles = () => {
  const theme = useTheme();
  const isDark = useThemeMode();
  useAutoHideScrollbars();
  // Scrollbar overlays must float above the content they belong to, but below
  // every antd popup layer (modals, drawers, dropdowns, popovers, toasts),
  // which start at zIndexPopupBase. A hardcoded high value here used to put
  // scrollbars on top of unrelated UI.
  const overlayZIndex = theme.zIndexPopupBase - 1;
  return (
    <Global
      key={`global-${theme.colorLink}`}
      styles={css`
        /* SPA */
        html {
          color-scheme: ${isDark ? 'dark' : 'light'};
        }

        html {
          height: 100%;
        }

        /* Growable shell so content a host page injects above #app shrinks #app instead of #app clipping past the viewport (#44867). */
        body {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background-color: ${theme.colorBgBase};
          color: ${theme.colorText};
          -webkit-font-smoothing: antialiased;
          margin: 0;
          font-family: ${theme.fontFamily};
        }

        a {
          color: ${theme.colorLink};
        }

        h1,
        h2,
        h3,
        h4,
        h5,
        h6,
        strong,
        th {
          font-weight: ${theme.fontWeightStrong};
        }

        .echarts-tooltip[style*='visibility: hidden'] {
          display: none !important;
        }

        .no-wrap {
          white-space: nowrap;
        }

        .column-config-popover {
          & .ant-input-number {
            width: 100%;
          }
          && .btn-group svg {
            line-height: 0;
            top: 0;
          }
          & .btn-group > .btn {
            padding: 5px 10px 6px;
          }
        }

        /* Overriding bootstrap styles */
        #app {
          flex: 1 1 auto;
          position: relative;
          display: flex;
          flex-direction: column;
        }
        [role='button'] {
          cursor: pointer;
        }

        /* antd 6 removed the Tag's default trailing margin (v5 shipped */
        /* margin-inline-end: 8px on every tag) in favor of parents spacing */
        /* tags via flex/Space gaps. The app's layouts predate that and rely */
        /* on the v5 default (e.g. the dashboard header's Published tag), */
        /* so restore it for visual parity. Remove once Tag-adjacent layouts */
        /* declare their own gaps. */
        .ant-tag {
          margin-inline-end: ${theme.marginXS}px;
        }

        /* Override geostyler CSS that hides AntD ColorPicker alpha input */
        /* See: https://github.com/apache/superset/issues/34721 */
        .ant-color-picker .ant-color-picker-alpha-input {
          display: block;
        }

        .ant-color-picker .ant-color-picker-slider-alpha {
          display: flex;
          margin-top: ${theme.marginXS}px;
        }

        .superset-explore-popover.ant-popover
          .ant-popover-container:has(.ant-popover-title) {
          padding-top: 0;
        }
        .superset-explore-popover.ant-popover .ant-popover-title {
          padding-top: ${theme.paddingXS}px;
          margin-bottom: ${theme.paddingSM}px;
          line-height: 1;
        }
        .superset-explore-popover.ant-popover
          .ant-popover-container:has(.ant-popover-title)
          .ant-tabs-tab {
          padding-top: 0;
        }

        /* Native scrollbars reserve layout space on Windows/Linux. Hide them
           entirely and draw a floating thumb instead (see
           useAutoHideScrollbars): it overlays the content, appears only while
           scrolling, and never reflows the page. */
        :where(*) {
          scrollbar-width: none !important;
        }

        :where(*)::-webkit-scrollbar {
          width: 0 !important;
          height: 0 !important;
        }

        .${OVERLAY_THUMB_CLASS} {
          position: fixed;
          top: 0;
          left: 0;
          z-index: ${overlayZIndex};
          border-radius: 999px;
          background-color: color-mix(
            in srgb,
            ${theme.colorText},
            transparent 50%
          );
          opacity: 0;
          pointer-events: none;
          transition: opacity 180ms ease-out;
          will-change: transform;
        }

        .${OVERLAY_THUMB_CLASS}[${VISIBLE_ATTRIBUTE}] {
          opacity: 1;
          pointer-events: auto;
          cursor: grab;
        }

        .${OVERLAY_THUMB_CLASS}[${HOVER_ATTRIBUTE}],
        .${OVERLAY_THUMB_CLASS}[${DRAG_ATTRIBUTE}] {
          opacity: 1;
          pointer-events: auto;
          cursor: grab;
        }

        /* A small invisible hit area makes the 5px thumb easy to catch before
           it grows; it only exists while the thumb is on screen. */
        .${OVERLAY_THUMB_CLASS}[${VISIBLE_ATTRIBUTE}]::before {
          content: '';
          position: absolute;
          inset: -3px;
        }

        .${OVERLAY_THUMB_CLASS}[${HOVER_ATTRIBUTE}],
        .${OVERLAY_THUMB_CLASS}[${DRAG_ATTRIBUTE}] {
          background-color: color-mix(
            in srgb,
            ${theme.colorText},
            transparent 25%
          );
        }

        /* Grow across the scroll axis, keeping the outer edge anchored so the
           widened thumb never spills outside its container. */
        .${OVERLAY_THUMB_CLASS}[data-axis="y"][${HOVER_ATTRIBUTE}],
        .${OVERLAY_THUMB_CLASS}[data-axis="y"][${DRAG_ATTRIBUTE}] {
          width: 10px !important;
          margin-left: -5px;
        }

        .${OVERLAY_THUMB_CLASS}[${DRAG_ATTRIBUTE}] {
          cursor: grabbing;
        }

        /* Every horizontally scrollable container gets one of these tracks.
           The hook clamps each track to the visible part of its own table (it
           never docks to the window or spills past the table edges), and this
           z-index keeps it below every antd popup layer. Only the opacity is
           transitioned: transforming the track with a CSS transition would
           make it lag behind the table while the page scrolls. */
        .${SCROLLBAR_TRACK_CLASS} {
          position: fixed;
          top: 0;
          left: 0;
          z-index: ${overlayZIndex};
          border-radius: 999px;
          background-color: color-mix(
            in srgb,
            ${theme.colorText},
            transparent 92%
          );
          opacity: 0;
          pointer-events: none;
          transition: opacity 180ms ease-out;
          will-change: transform;
        }

        .${SCROLLBAR_TRACK_CLASS}[${VISIBLE_ATTRIBUTE}] {
          opacity: 1;
        }

        .${SCROLLBAR_THUMB_CLASS} {
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          border-radius: 999px;
          background-color: color-mix(
            in srgb,
            ${theme.colorText},
            transparent 55%
          );
          transition: background-color 180ms ease-out;
        }

        /* Emphasise the thumb while the pointer is in the container. */
        .${SCROLLBAR_TRACK_CLASS}[${SCROLLBAR_ACTIVE_ATTRIBUTE}] .${SCROLLBAR_THUMB_CLASS} {
          background-color: color-mix(
            in srgb,
            ${theme.colorText},
            transparent 30%
          );
        }

        /* Only the thumb (not the full-width track) accepts pointer input, so
           the rest of the container's bottom edge stays clickable. */
        .${SCROLLBAR_TRACK_CLASS}[${VISIBLE_ATTRIBUTE}] .${SCROLLBAR_THUMB_CLASS} {
          pointer-events: auto;
          cursor: grab;
        }

        .${SCROLLBAR_THUMB_CLASS}[${HOVER_ATTRIBUTE}],
        .${SCROLLBAR_THUMB_CLASS}[${DRAG_ATTRIBUTE}] {
          height: 12px;
          margin-top: -2px;
          background-color: color-mix(
            in srgb,
            ${theme.colorText},
            transparent 25%
          );
          cursor: grab;
        }

        .${SCROLLBAR_THUMB_CLASS}[${DRAG_ATTRIBUTE}] {
          cursor: grabbing;
        }
      `}
    />
  );
};
