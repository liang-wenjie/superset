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
"""Validate a per-report filter value transform expression.

The expression is the SQL template a dashboard editor writes to convert a
stored field value into the filter value's format (e.g. ``2026.7月`` ->
``202607``). It is a scalar SQL expression over the ``{col}`` placeholder,
which the query path replaces with the quoted column name. This command
checks the same shape and safety gates the query path relies on -- parseable
single expression, no clause smuggling, no Jinja, no executable comments, no
sequence reads and no disallowed functions -- so a bad transform is caught in
the editor instead of failing every chart query that uses it.
"""
from __future__ import annotations

from flask import current_app as app
from flask_babel import gettext as __

from superset.commands.base import BaseCommand
from superset.commands.dataset.exceptions import DatasetNotFoundError
from superset.connectors.sqla.models import SqlaTable
from superset.connectors.sqla.partition_mapping import (
    contains_executable_comment,
    contains_jinja,
    contains_unicode_escaped_identifier,
    is_bare_expression,
    is_parseable,
    parse_error_detail,
    references_sequence,
)
from superset.daos.dataset import DatasetDAO
from superset.sql.parse import SQLStatement

#: Stand-in substituted for ``{col}`` before parsing: the placeholder itself
#: is not a valid identifier in any dialect, and the parse gates need one.
_COL_STANDIN = "__col"


class ValidateFilterTargetTransformCommand(BaseCommand):
    """Validate a per-report filter value transform expression."""

    def __init__(self, model_id: int, expression: str):
        self._model_id = model_id
        self._expression = expression
        self._model: SqlaTable | None = None

    def run(self) -> dict[str, object]:
        """
        Validate the expression.

        :return: ``{"valid": bool, "errors": [message, ...]}``
        :raises: DatasetNotFoundError
        """
        self.validate()
        dataset = self._model
        if dataset is None:
            raise DatasetNotFoundError()
        engine = dataset.db_engine_spec.engine
        expression = self._expression
        issues: list[str] = []

        if contains_jinja(expression):
            issues.append(
                __(
                    "Jinja templating is not supported in a value transform. "
                    "The transform is evaluated inside the generated SQL, at a "
                    "different time from the chart query."
                )
            )
        if contains_executable_comment(expression):
            issues.append(
                __(
                    "A value transform cannot contain a MySQL executable "
                    "comment (/*! ... */ or /*M! ... */). The database runs "
                    "the comment as statement text."
                )
            )
        if contains_unicode_escaped_identifier(expression):
            issues.append(
                __(
                    "A value transform cannot name anything through a "
                    'U&"..." escape sequence. The database decodes it and the '
                    "validators read it literally."
                )
            )

        # Replace the {col} placeholder with a benign identifier so the parse
        # gates below can run (mirrors how the query path binds the real column
        # name before the expression reaches the engine).
        expr = expression.replace("{col}", _COL_STANDIN)
        if not is_parseable(expr, engine):
            detail = parse_error_detail(expr, engine)
            issues.append(
                __(
                    "The value transform could not be parsed: %(detail)s.",
                    detail=detail,
                )
                if detail
                else __("The value transform could not be parsed.")
            )
        elif not is_bare_expression(expr, engine):
            issues.append(
                __(
                    "A value transform must be a single SQL expression. It "
                    "cannot carry a FROM, WHERE, GROUP BY or any other clause, "
                    "and it cannot contain a sub-query."
                )
            )
        else:
            statement = SQLStatement(f"SELECT {expr}", engine)
            if references_sequence(statement):
                issues.append(
                    __(
                        "A value transform cannot read a sequence. NEXTVAL "
                        "advances the sequence every time it is evaluated."
                    )
                )
            denied = app.config["DISALLOWED_SQL_FUNCTIONS"].get(engine, set())
            if denied and (found := statement.get_disallowed_functions(denied)):
                issues.append(
                    __(
                        "A value transform cannot call %(functions)s.",
                        functions=", ".join(sorted(found)),
                    )
                )

        return {"valid": not issues, "errors": issues}

    def validate(self) -> None:
        self._model = DatasetDAO.find_by_id(self._model_id)
        if self._model is None:
            raise DatasetNotFoundError()
