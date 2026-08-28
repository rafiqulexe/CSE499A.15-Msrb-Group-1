"""Week 5 placeholder tests for documentation and exports."""

import os


def test_docs_exist():
    assert os.path.exists("README.md")
    assert os.path.exists("docs")
