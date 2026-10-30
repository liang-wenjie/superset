# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
"""Unit tests for ``superset.datasets.commands.validate_filter_target_transform``."""

from __future__ import annotations

from unittest.mock import PropertyMock

import pytest
from flask import Flask
from pytest_mock import MockerFixture

from superset.commands.dataset.exceptions import DatasetNotFoundError
from superset.datasets.commands.validate_filter_target_transform import (
    ValidateFilterTargetTransformCommand,
)
from superset.db_engine_specs.mysql import MySQLEngineSpec


def _command(
    app: Flask,
    mocker: MockerFixture,
    expression: str,
    engine_spec: object = MySQLEngineSpec,
) -> ValidateFilterTargetTransformCommand:
    """A command backed by a mocked dataset whose engine is MySQL."""
    dataset = mocker.MagicMock()
    mocker.patch.object(
        type(dataset), "db_engine_spec", PropertyMock(return_value=engine_spec)
    )
    mocker.patch(
        "superset.datasets.commands.validate_filter_target_transform."
        "DatasetDAO.find_by_id",
        return_value=dataset,
    )
    return ValidateFilterTargetTransformCommand(model_id=1, expression=expression)


def test_valid_expression(app: Flask, mocker: MockerFixture) -> None:
    """The documented example for 2026.7月 -> 202607 validates."""
    command = _command(
        app,
        mocker,
        "CONCAT(SUBSTRING({col},1,4),LPAD(CAST(SUBSTRING({col},6,1) "
        "AS UNSIGNED),2,'0'))",
    )
    with app.app_context():
        result = command.run()
    assert result["valid"] is True
    assert result["errors"] == []


@pytest.mark.parametrize(
    ("expression", "expected"),
    [
        # A dangling open parenthesis fails to parse.
        ("CONCAT(", "parse"),
        # A clause smuggled in with the expression is refused, not run.
        ("{col} FROM some_table", "single SQL expression"),
        # Jinja is evaluated separately from the chart query and is refused.
        ("CONCAT({{ year }}, {col})", "Jinja"),
        # An executable comment is statement text to the engine.
        ("{col} /*!50000 SLEEP(10) */", "executable comment"),
    ],
)
def test_invalid_expressions(
    app: Flask,
    mocker: MockerFixture,
    expression: str,
    expected: str,
) -> None:
    command = _command(app, mocker, expression)
    with app.app_context():
        result = command.run()
    assert result["valid"] is False
    assert any(expected in error for error in result["errors"])


def test_missing_dataset_raises(app: Flask, mocker: MockerFixture) -> None:
    mocker.patch(
        "superset.datasets.commands.validate_filter_target_transform."
        "DatasetDAO.find_by_id",
        return_value=None,
    )
    with pytest.raises(DatasetNotFoundError):
        ValidateFilterTargetTransformCommand(
            model_id=999, expression="{col}"
        ).run()
