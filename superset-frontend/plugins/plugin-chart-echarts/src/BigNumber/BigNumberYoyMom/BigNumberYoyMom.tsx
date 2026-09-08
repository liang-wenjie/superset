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
import { useMemo } from 'react';
import { t } from '@apache-superset/core/translation';
import { css, styled, useTheme } from '@apache-superset/core/theme';
import { Tooltip } from '@superset-ui/core/components';
import { BigNumberYoyMomProps } from './types';

const MetricNameText = styled.div<{ metricNameFontSize?: number }>`
  ${({ theme, metricNameFontSize }) => `
    font-family: ${theme.fontFamily};
    font-weight: ${theme.fontWeightNormal};
    font-size: ${metricNameFontSize || theme.fontSizeSM * 2}px;
    text-align: center;
    margin-bottom: ${theme.sizeUnit * 3}px;
  `}
`;

const NumbersContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: auto;
  padding: 12px;
`;

const ComparisonValue = styled.div<{ comparisonFontSize?: number }>`
  ${({ theme, comparisonFontSize }) => `
    font-weight: ${theme.fontWeightLight};
    display: flex;
    justify-content: center;
    font-size: ${String(comparisonFontSize) || 20}px;
    flex: 1 1 0px;
  `}
`;

const SymbolWrapper = styled.span<{ backgroundColor: string; textColor: string }>`
  ${({ theme, backgroundColor, textColor }) => `
    background-color: ${backgroundColor};
    color: ${textColor};
    padding: ${theme.sizeUnit}px ${theme.sizeUnit * 2}px;
    border-radius: ${theme.borderRadius}px;
    margin-right: ${theme.sizeUnit}px;
  `}
`;

const SubtitleText = styled.div`
  ${({ theme }) => `
    font-family: ${theme.fontFamily};
    font-weight: ${theme.fontWeightNormal};
    text-align: center;
    margin-top: -10px;
    margin-bottom: ${theme.sizeUnit * 4}px;
  `}
`;

export default function BigNumberYoyMom(props: BigNumberYoyMomProps) {
  const {
    height,
    width,
    bigNumber,
    prevNumber,
    valueDifference,
    percentDifferenceFormattedString,
    metricName,
    metricNameFontSize,
    headerFontSize,
    subtitle,
    subtitleFontSize,
    showMetricName,
    showPrevValue,
    showValueDifference,
    showPercentChange,
    comparisonColorEnabled,
    percentDifferenceNumber,
  } = props;

  const theme = useTheme();
  const flexGap = theme.sizeUnit * 5;
  const wrapperDivStyles = css`
    font-family: ${theme.fontFamily};
    display: flex;
    justify-content: center;
    align-items: center;
    height: ${height}px;
    width: ${width}px;
    overflow: auto;
  `;

  const bigValueContainerStyles = css`
    font-size: ${String(headerFontSize) || 60}px;
    font-weight: ${theme.fontWeightNormal};
    text-align: center;
    margin-bottom: ${theme.sizeUnit * 4}px;
  `;

  const getArrowIndicatorColor = () => {
    if (!comparisonColorEnabled || percentDifferenceNumber === 0) {
      return theme.colorTextTertiary;
    }
    if (percentDifferenceNumber > 0) {
      return theme.colorSuccess;
    }
    return theme.colorError;
  };

  const arrowIndicatorStyle = css`
    color: ${getArrowIndicatorColor()};
    margin-left: ${theme.sizeUnit}px;
  `;

  const defaultBackgroundColor = theme.colorBgContainer;
  const defaultTextColor = theme.colorTextTertiary;
  const { backgroundColor, textColor } = useMemo(() => {
    let bgColor = defaultBackgroundColor;
    let txtColor = defaultTextColor;
    if (comparisonColorEnabled && percentDifferenceNumber !== 0) {
      const useSuccess = percentDifferenceNumber > 0;
      bgColor = useSuccess ? theme.colorSuccessBg : theme.colorErrorBg;
      txtColor = useSuccess ? theme.colorSuccessText : theme.colorErrorText;
    }
    return { backgroundColor: bgColor, textColor: txtColor };
  }, [
    theme,
    comparisonColorEnabled,
    percentDifferenceNumber,
    defaultBackgroundColor,
    defaultTextColor,
  ]);

  const comparisonFontSize = Math.max(14, headerFontSize * 0.35);

  const badges = useMemo(
    () =>
      [
        {
          key: 'prev',
          symbol: '#',
          value: prevNumber,
          tooltip: t('Value for the comparison period (%s)', props.shift || 'previous range'),
          visible: showPrevValue,
        },
        {
          key: 'diff',
          symbol: 'Δ',
          value: valueDifference,
          tooltip: t('Value difference between the time periods'),
          visible: showValueDifference,
        },
        {
          key: 'pct',
          symbol: '%',
          value: percentDifferenceFormattedString,
          tooltip: t('Percentage difference between the time periods'),
          visible: showPercentChange,
        },
      ].filter(item => item.visible),
    [
      prevNumber,
      valueDifference,
      percentDifferenceFormattedString,
      showPrevValue,
      showValueDifference,
      showPercentChange,
      props.shift,
    ],
  );

  return (
    <div css={wrapperDivStyles}>
      <NumbersContainer>
        {showMetricName && metricName && (
          <MetricNameText metricNameFontSize={metricNameFontSize}>
            {metricName}
          </MetricNameText>
        )}

        <div css={bigValueContainerStyles}>
          {bigNumber}
          {percentDifferenceNumber !== 0 && (
            <span css={arrowIndicatorStyle}>
              {percentDifferenceNumber > 0 ? '↑' : '↓'}
            </span>
          )}
        </div>
        {subtitle && (
          <SubtitleText
            style={{
              fontSize: `${subtitleFontSize * height * 0.4}px`,
            }}
          >
            {subtitle}
          </SubtitleText>
        )}

        {badges.length > 0 && (
          <div
            css={css`
              display: flex;
              justify-content: space-around;
              align-items: center;
              gap: ${flexGap}px;
              min-width: 0;
              flex-shrink: 1;
              flex-wrap: wrap;
            `}
          >
            {badges.map(badge => (
              <ComparisonValue
                key={`comparison-${badge.key}`}
                comparisonFontSize={comparisonFontSize}
              >
                <Tooltip id="tooltip" placement="top" title={badge.tooltip}>
                  <SymbolWrapper
                    backgroundColor={
                      badge.key === 'prev'
                        ? defaultBackgroundColor
                        : backgroundColor
                    }
                    textColor={
                      badge.key === 'prev' ? defaultTextColor : textColor
                    }
                  >
                    {badge.symbol}
                  </SymbolWrapper>
                  {badge.value}
                </Tooltip>
              </ComparisonValue>
            ))}
          </div>
        )}
      </NumbersContainer>
    </div>
  );
}
