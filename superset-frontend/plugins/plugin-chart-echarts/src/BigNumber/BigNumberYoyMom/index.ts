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
import { t } from '@apache-superset/core/translation';
import { ChartMetadata, ChartPlugin } from '@superset-ui/core';
import buildQuery from './buildQuery';
import controlPanel from './controlPanel';
import transformProps from './transformProps';
import thumbnail from './images/thumbnail.png';
import thumbnailDark from './images/thumbnail-dark.png';

export default class BigNumberYoyMomChartPlugin extends ChartPlugin {
  constructor() {
    const metadata = new ChartMetadata({
      category: t('KPI'),
      description: t(
        'Big number with YoY/MoM comparison. The metric can come from any ' +
          'dataset (including one backed by SQL), and the comparison is ' +
          'computed via the standard time-comparison mechanism.',
      ),
      name: t('Big Number with YoY/MoM'),
      tags: [
        t('Comparison'),
        t('Business'),
        t('ECharts'),
        t('Percentages'),
        t('Report'),
        t('Advanced-Analytics'),
      ],
      thumbnail,
      thumbnailDark,
    });

    super({
      buildQuery,
      controlPanel,
      loadChart: () => import('./BigNumberYoyMom'),
      metadata,
      transformProps,
    });
  }
}
