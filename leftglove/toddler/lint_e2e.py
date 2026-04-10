#!/usr/bin/env python3
"""
Linter for e2e_test.py: enforces that behavioral tests use only UI interactions.

Rule: e2e test functions may only call whitelisted Selenium methods.
Pure-function tests (name contains '_pure_') are exempt.

Usage:
    python3 lint_e2e.py                    # lint e2e_test.py in same directory
    python3 lint_e2e.py path/to/file.py    # lint specific file

Exit code 0 = clean, 1 = violations found.
"""

import ast
import sys
from pathlib import Path

# --- Whitelist -----------------------------------------------------------
# These are the ONLY method calls allowed on driver or element objects
# in behavioral e2e tests. Everything else is a violation.

DRIVER_WHITELIST = {
    # Navigation
    "get",
    # Element lookup
    "find_element",
    "find_elements",
    # Screenshots (for visual assertions)
    "get_screenshot_as_png",
    # Cleanup
    "quit",
}

ELEMENT_WHITELIST = {
    # User actions — the only two real interactions
    "click",
    "send_keys",
    # Observation (read-only, no JS execution)
    "get_attribute",
    "is_displayed",
    "is_enabled",
    "value_of_css_property",
}

# WebDriverWait.until is allowed (it's a polling wrapper, not a JS call)
WAIT_WHITELIST = {"until", "until_not"}

# --- Helpers -------------------------------------------------------------

def _is_pure_test(funcname: str) -> bool:
    """Tests with '_pure_' in the name are unit tests for JS functions — exempt."""
    return "_pure_" in funcname


def _is_visual_test(funcname: str) -> bool:
    """Visual tests may call get_screenshot_as_png but nothing else special."""
    return funcname.startswith("test_visual_")


def _enclosing_function(node, parents):
    """Walk up the parent chain to find the enclosing function def."""
    current = node
    while current in parents:
        current = parents[current]
        if isinstance(current, (ast.FunctionDef, ast.AsyncFunctionDef)):
            return current.name
    return None


def _build_parent_map(tree):
    """Build child→parent mapping for the AST."""
    parents = {}
    for node in ast.walk(tree):
        for child in ast.iter_child_nodes(node):
            parents[child] = node
    return parents


# --- Core check ----------------------------------------------------------

class Violation:
    def __init__(self, line, col, func, method, reason):
        self.line = line
        self.col = col
        self.func = func
        self.method = method
        self.reason = reason

    def __str__(self):
        return f"  line {self.line}: {self.func}() calls .{self.method}() — {self.reason}"


def check_file(filepath: Path) -> list[Violation]:
    source = filepath.read_text()
    tree = ast.parse(source, filename=str(filepath))
    parents = _build_parent_map(tree)
    violations = []

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if not isinstance(node.func, ast.Attribute):
            continue

        method_name = node.func.attr
        obj = node.func.value

        # Find which test function this call lives in
        enclosing = _enclosing_function(node, parents)
        if enclosing is None or not enclosing.startswith("test_"):
            continue  # not in a test function

        # Pure-function tests are exempt
        if _is_pure_test(enclosing):
            continue

        # --- Check: execute_script is always forbidden in e2e tests ---
        if method_name == "execute_script" or method_name == "execute_cdp_cmd":
            violations.append(Violation(
                node.lineno, node.col_offset, enclosing, method_name,
                "forbidden — e2e tests use clicks and keys only"
            ))
            continue

        # --- Check: driver.* calls ---
        if isinstance(obj, ast.Name) and obj.id == "driver":
            if method_name not in DRIVER_WHITELIST:
                violations.append(Violation(
                    node.lineno, node.col_offset, enclosing, method_name,
                    f"not in driver whitelist: {sorted(DRIVER_WHITELIST)}"
                ))
            continue

        # --- Check: WebDriverWait().until ---
        # Allow WebDriverWait(driver, N).until(...)
        if isinstance(obj, ast.Call) and isinstance(obj.func, ast.Name):
            if obj.func.id == "WebDriverWait" and method_name in WAIT_WHITELIST:
                continue

    return violations


# --- Main ----------------------------------------------------------------

def main():
    if len(sys.argv) > 1:
        target = Path(sys.argv[1])
    else:
        target = Path(__file__).parent / "e2e_test.py"

    if not target.exists():
        print(f"File not found: {target}")
        sys.exit(2)

    violations = check_file(target)

    if not violations:
        print(f"✓ {target.name}: all e2e tests use UI interactions only")
        sys.exit(0)

    print(f"✗ {target.name}: {len(violations)} violation(s)\n")
    # Group by function
    by_func = {}
    for v in violations:
        by_func.setdefault(v.func, []).append(v)
    for func, vs in by_func.items():
        print(f"  {func}():")
        for v in vs:
            print(f"    line {v.line}: .{v.method}() — {v.reason}")
        print()
    sys.exit(1)


if __name__ == "__main__":
    main()
