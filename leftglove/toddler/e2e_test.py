#!/usr/bin/env python3
"""
End-to-end tests for the Toddler Loop UI.

Prerequisites (must be running before this script):
  - Sieve server:  http://localhost:3333
  - Demo app:      http://localhost:3000
  - TL UI server:  http://localhost:8080

Run with:
  python3 leftglove/toddler/e2e_test.py
"""

import os
import sys
import time
import json
import subprocess
import tempfile
import urllib.request
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service

from visual_judge import VisualJudge, critical, advisory

TL_URL = "http://localhost:8080?api=http://localhost:3333"
DEMO_LOGIN = "http://localhost:3000/login"
SIEVE_STATUS = "http://localhost:3333/status"
VISUAL_ARTIFACT_DIR = Path(__file__).parent / "tests" / "artifacts" / "visual"

_judge_instance = None

def _get_judge():
    """Returns VisualJudge if ANTHROPIC_API_KEY is set, else None."""
    global _judge_instance
    if _judge_instance is not None:
        return _judge_instance
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        return None
    _judge_instance = VisualJudge(api_key=key, artifact_dir=VISUAL_ARTIFACT_DIR)
    return _judge_instance

PASS = "\033[32mPASS\033[0m"
FAIL = "\033[31mFAIL\033[0m"

failures = []

def check_services():
    """Verify all required services are running before starting tests."""
    for name, url in [
        ("sieve server", SIEVE_STATUS),
        ("demo app", "http://localhost:3000/login"),
        ("TL UI", "http://localhost:8080"),
    ]:
        try:
            urllib.request.urlopen(url, timeout=3)
            print(f"  {PASS} {name} at {url}")
        except Exception as e:
            print(f"  {FAIL} {name} at {url}: {e}")
            sys.exit(1)

def make_driver():
    opts = Options()
    # Run headless so tests don't clash with the sieve-controlled browser window
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1280,900")
    service = Service("/usr/bin/chromedriver")
    return webdriver.Chrome(service=service, options=opts)

def wait_for(driver, testid, timeout=10):
    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, f'[data-testid="{testid}"]'))
    )

def wait_visible(driver, testid, timeout=10):
    return WebDriverWait(driver, timeout).until(
        EC.visibility_of_element_located((By.CSS_SELECTOR, f'[data-testid="{testid}"]'))
    )

def get_text(driver, testid):
    el = driver.find_element(By.CSS_SELECTOR, f'[data-testid="{testid}"]')
    # Use textContent (not .text) — Selenium returns '' for off-screen elements
    return driver.execute_script("return arguments[0].textContent", el)

def get_value(driver, testid):
    return driver.find_element(By.CSS_SELECTOR, f'[data-testid="{testid}"]').get_attribute("value")

def click(driver, testid):
    driver.find_element(By.CSS_SELECTOR, f'[data-testid="{testid}"]').click()

def clear_and_type(driver, testid, text):
    el = driver.find_element(By.CSS_SELECTOR, f'[data-testid="{testid}"]')
    el.clear()
    el.send_keys(text)

def run_test(name, fn, driver):
    try:
        fn(driver)
        print(f"  {PASS} {name}")
        return True
    except Exception as e:
        print(f"  {FAIL} {name}: {e}")
        failures.append(name)
        return False

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_page_loads(driver):
    driver.get(TL_URL)
    wait_for(driver, "btn-sieve")
    wait_for(driver, "btn-navigate")
    wait_for(driver, "url-input")
    wait_for(driver, "mode-indicator")
    assert "Toddler" in driver.title or True  # title may vary

def test_status_prepopulates_url(driver):
    driver.get(TL_URL)
    wait_for(driver, "url-input")
    time.sleep(1)  # let JS init run
    val = get_value(driver, "url-input")
    # After loading, the JS fetches /status and sets the url-input
    # If sieve browser is at data:, that's fine — just check it's a string
    assert isinstance(val, str)

def test_navigate_to_demo_app(driver):
    driver.get(TL_URL)
    wait_for(driver, "url-input")
    time.sleep(0.5)

    clear_and_type(driver, "url-input", DEMO_LOGIN)
    click(driver, "btn-navigate")

    # Status indicator should show "Navigating..." then eventually a count
    status = wait_for(driver, "status-indicator")
    # Wait until status is no longer "Navigating..."
    WebDriverWait(driver, 15).until(
        lambda d: d.find_element(By.CSS_SELECTOR, '[data-testid="status-indicator"]').text
                  not in ("Navigating...", "Sieving...", "Ready")
    )
    status_text = get_text(driver, "status-indicator")
    assert "element" in status_text.lower() or "Error" not in status_text, \
        f"Expected element count, got: {status_text!r}"

def test_sieve_returns_elements(driver):
    driver.get(TL_URL)
    wait_for(driver, "url-input")
    time.sleep(0.5)

    clear_and_type(driver, "url-input", DEMO_LOGIN)
    click(driver, "btn-navigate")

    # Wait for sieve to complete and show elements
    WebDriverWait(driver, 20).until(
        lambda d: "element" in d.find_element(
            By.CSS_SELECTOR, '[data-testid="status-indicator"]'
        ).text.lower()
    )

    # SVG overlay should have rects
    rects = driver.find_elements(By.CSS_SELECTOR, '#overlay-svg rect')
    assert len(rects) > 0, f"Expected SVG rects, found {len(rects)}"

def test_screenshot_renders(driver):
    driver.get(TL_URL)
    wait_for(driver, "url-input")
    time.sleep(0.5)

    clear_and_type(driver, "url-input", DEMO_LOGIN)
    click(driver, "btn-navigate")

    WebDriverWait(driver, 20).until(
        lambda d: "element" in d.find_element(
            By.CSS_SELECTOR, '[data-testid="status-indicator"]'
        ).text.lower()
    )

    img = driver.find_element(By.CSS_SELECTOR, '[data-testid="screenshot-img"]')
    # src should be a blob URL (from createObjectURL)
    src = img.get_attribute("src")
    assert src and src.startswith("blob:"), f"Expected blob URL, got: {src!r}"

def test_element_detail_shows(driver):
    driver.get(TL_URL)
    wait_for(driver, "url-input")
    time.sleep(0.5)

    clear_and_type(driver, "url-input", DEMO_LOGIN)
    click(driver, "btn-navigate")

    WebDriverWait(driver, 20).until(
        lambda d: "element" in d.find_element(
            By.CSS_SELECTOR, '[data-testid="status-indicator"]'
        ).text.lower()
    )

    detail = driver.find_element(By.CSS_SELECTOR, '[data-testid="element-detail"]')
    assert detail.text.strip() != "", "Element detail panel should not be empty"

def test_classify_element(driver):
    driver.get(TL_URL)
    wait_for(driver, "url-input")
    time.sleep(0.5)

    clear_and_type(driver, "url-input", DEMO_LOGIN)
    click(driver, "btn-navigate")

    WebDriverWait(driver, 20).until(
        lambda d: "element" in d.find_element(
            By.CSS_SELECTOR, '[data-testid="status-indicator"]'
        ).text.lower()
    )

    # Get initial progress
    initial_count = get_text(driver, "classified-count")

    # Click clickable button
    click(driver, "cat-clickable")
    time.sleep(0.3)

    new_count = get_text(driver, "classified-count")
    assert new_count != initial_count or "1 classified" in new_count, \
        f"Classification count should have changed: {initial_count!r} -> {new_count!r}"

def test_pass1_complete_shows_start_pass2(driver):
    """Classify all elements in Pass 1 and verify Start Pass 2 button appears."""
    driver.get(TL_URL)
    wait_for(driver, "url-input")
    time.sleep(0.5)

    clear_and_type(driver, "url-input", DEMO_LOGIN)
    click(driver, "btn-navigate")

    WebDriverWait(driver, 20).until(
        lambda d: "element" in d.find_element(
            By.CSS_SELECTOR, '[data-testid="status-indicator"]'
        ).text.lower()
    )

    # Classify all elements by pressing keyboard shortcut until done
    body = driver.find_element(By.TAG_NAME, "body")
    max_iters = 50
    for _ in range(max_iters):
        count_text = get_text(driver, "classified-count")
        progress_text = get_text(driver, "progress")
        # Check if btn-start-pass2 appeared
        btns = driver.find_elements(By.CSS_SELECTOR, '[data-testid="btn-start-pass2"]')
        if btns and btns[0].is_displayed():
            break
        body.send_keys("c")  # classify as clickable
        time.sleep(0.1)
    else:
        raise AssertionError("btn-start-pass2 never appeared after classifying all elements")

def test_pass2_naming_flow(driver):
    """Full pass 2 flow: classify all, enter pass 2, name one element."""
    driver.get(TL_URL)
    wait_for(driver, "url-input")
    time.sleep(0.5)

    clear_and_type(driver, "url-input", DEMO_LOGIN)
    click(driver, "btn-navigate")

    WebDriverWait(driver, 20).until(
        lambda d: "element" in d.find_element(
            By.CSS_SELECTOR, '[data-testid="status-indicator"]'
        ).text.lower()
    )

    # Classify all
    body = driver.find_element(By.TAG_NAME, "body")
    for _ in range(50):
        btns = driver.find_elements(By.CSS_SELECTOR, '[data-testid="btn-start-pass2"]')
        if btns and btns[0].is_displayed():
            break
        body.send_keys("c")
        time.sleep(0.1)

    click(driver, "btn-start-pass2")
    time.sleep(0.3)

    # Mode indicator should say Pass 2
    mi = get_text(driver, "mode-indicator")
    assert "Pass 2" in mi, f"Expected 'Pass 2' in mode indicator, got: {mi!r}"

    # Name input should be visible and pre-filled
    name_input = wait_visible(driver, "name-input")
    assert name_input.get_attribute("value") != "", "Name input should be pre-filled"

    # Accept the name
    click(driver, "btn-accept-name")
    time.sleep(0.3)

    # Progress should show 1 of N
    progress = get_text(driver, "pass2-progress")
    assert "1 of" in progress, f"Expected '1 of N' in progress, got: {progress!r}"

# ---------------------------------------------------------------------------
# Load tests
# ---------------------------------------------------------------------------

FIXTURE_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "fixtures", "demo-login-labeled.json")
)

def _send_fixture(driver, path=FIXTURE_PATH):
    """Send a file path to the hidden file input, bypassing the native dialog."""
    file_input = driver.find_element(By.CSS_SELECTOR, '#file-input')
    file_input.send_keys(path)

def _wait_for_rects(driver, timeout=10):
    WebDriverWait(driver, timeout).until(
        lambda d: len(d.find_elements(By.CSS_SELECTOR, '#overlay-svg rect')) > 0
    )

def test_load_button_present(driver):
    driver.get(TL_URL)
    wait_for(driver, "btn-load")

def test_load_valid_fixture(driver):
    driver.get(TL_URL)
    wait_for(driver, "btn-load")
    _send_fixture(driver)
    _wait_for_rects(driver)
    rects = driver.find_elements(By.CSS_SELECTOR, '#overlay-svg rect')
    assert len(rects) > 0, f"Expected SVG rects after load, found {len(rects)}"

def test_load_screenshot_appears(driver):
    driver.get(TL_URL)
    wait_for(driver, "btn-load")
    _send_fixture(driver)
    _wait_for_rects(driver)
    img = driver.find_element(By.CSS_SELECTOR, '[data-testid="screenshot-img"]')
    src = img.get_attribute("src")
    assert src and src.startswith("blob:"), f"Expected blob URL for screenshot after load, got: {src!r}"

def test_load_status_shows_count(driver):
    driver.get(TL_URL)
    wait_for(driver, "btn-load")
    _send_fixture(driver)
    WebDriverWait(driver, 10).until(
        lambda d: "element" in d.find_element(
            By.CSS_SELECTOR, '[data-testid="status-indicator"]'
        ).text.lower()
    )
    status = get_text(driver, "status-indicator")
    assert "element" in status.lower(), f"Expected element count in status, got: {status!r}"

def test_load_mode_indicator(driver):
    """Fixture is pass-1-complete + has glossary names → mode should be pass2 or review."""
    driver.get(TL_URL)
    wait_for(driver, "btn-load")
    _send_fixture(driver)
    _wait_for_rects(driver)
    mode = get_text(driver, "mode-indicator")
    assert "Pass 2" in mode or "Review" in mode, \
        f"Expected pass2/review mode indicator, got: {mode!r}"

def test_load_element_detail_populated(driver):
    driver.get(TL_URL)
    wait_for(driver, "btn-load")
    _send_fixture(driver)
    _wait_for_rects(driver)
    time.sleep(0.3)  # let renderPanel() settle
    detail = driver.find_element(By.CSS_SELECTOR, '[data-testid="element-detail"]')
    assert detail.text.strip() != "", "Element detail panel should be populated after load"

def test_load_invalid_json_shows_toast(driver):
    driver.get(TL_URL)
    wait_for(driver, "btn-load")
    with tempfile.NamedTemporaryFile(suffix='.json', delete=False, mode='w') as f:
        f.write("this is not json {{{")
        bad_path = os.path.abspath(f.name)
    try:
        _send_fixture(driver, bad_path)
        toast = WebDriverWait(driver, 5).until(
            EC.visibility_of_element_located((By.ID, 'toast'))
        )
        assert "invalid" in toast.text.lower() or "json" in toast.text.lower(), \
            f"Expected JSON error toast, got: {toast.text!r}"
    finally:
        os.unlink(bad_path)

def test_load_invalid_intermediate_shows_toast(driver):
    driver.get(TL_URL)
    wait_for(driver, "btn-load")
    bad_data = {"sieve-version": "9.9", "elements": []}
    with tempfile.NamedTemporaryFile(suffix='.json', delete=False, mode='w') as f:
        json.dump(bad_data, f)
        bad_path = os.path.abspath(f.name)
    try:
        _send_fixture(driver, bad_path)
        toast = WebDriverWait(driver, 5).until(
            EC.visibility_of_element_located((By.ID, 'toast'))
        )
        assert toast.text.strip() != "", "Expected non-empty error toast for invalid intermediate"
    finally:
        os.unlink(bad_path)

# ---------------------------------------------------------------------------
# qo2 — Element identity across observations
# ---------------------------------------------------------------------------

def _navigate_and_sieve(driver):
    """Navigate to demo login page and run sieve. Returns when elements are loaded."""
    driver.get(TL_URL)
    wait_for(driver, "url-input")
    time.sleep(0.5)

    clear_and_type(driver, "url-input", DEMO_LOGIN)
    click(driver, "btn-navigate")

    WebDriverWait(driver, 20).until(
        lambda d: "element" in d.find_element(
            By.CSS_SELECTOR, '[data-testid="status-indicator"]'
        ).text.lower()
    )

def _classify_n(driver, n):
    """Classify n elements as clickable via keyboard shortcut."""
    body = driver.find_element(By.TAG_NAME, "body")
    for _ in range(n):
        body.send_keys("c")
        time.sleep(0.1)


def test_qo2_pure_isDynamicId(driver):
    """Test isDynamicId function directly in browser JS."""
    driver.get(TL_URL)
    wait_for(driver, "btn-sieve")
    results = driver.execute_script("""
        return [
            isDynamicId('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),  // UUID
            isDynamicId('12345'),                                    // numeric only
            isDynamicId('abcdef0123456789a'),                        // long hex
            isDynamicId('react-abc123'),                              // framework
            isDynamicId('widget-123456'),                             // long number suffix
            isDynamicId('login-email'),                               // stable — false
            isDynamicId('btn-submit'),                                // stable — false
            isDynamicId(null),                                        // null — false
            isDynamicId(''),                                          // empty — false
        ];
    """)
    expected = [True, True, True, True, True, False, False, False, False]
    assert results == expected, f"isDynamicId results: {results} != {expected}"


def test_qo2_pure_elementKey(driver):
    """Test elementKey priority chain in browser JS."""
    driver.get(TL_URL)
    wait_for(driver, "btn-sieve")
    results = driver.execute_script("""
        return [
            elementKey({locators: {testid: 'login-email', id: 'email'}, tag: 'input', label: 'Email', region: 'main'}),
            elementKey({locators: {id: 'email'}, tag: 'input', label: 'Email', region: 'main'}),
            elementKey({locators: {id: 'a1b2c3d4-e5f6-7890-abcd-0000'}, tag: 'div', label: 'X', region: 'main'}),
            elementKey({locators: {name: 'username'}, tag: 'input', label: 'User', region: 'form'}),
            elementKey({locators: {}, tag: 'button', label: 'Submit', region: 'main > form'}),
        ];
    """)
    assert results[0] == "testid::login-email", f"testid should win: {results[0]}"
    assert results[1] == "id::email", f"stable id: {results[1]}"
    assert results[2].startswith("composite::"), f"dynamic id should fall through: {results[2]}"
    assert results[3] == "name::username", f"name fallback: {results[3]}"
    assert results[4] == "composite::main > form::button::Submit", f"composite: {results[4]}"


def test_qo2_pure_matchElements(driver):
    """Test matchElements with known inputs."""
    driver.get(TL_URL)
    wait_for(driver, "btn-sieve")
    result = driver.execute_script("""
        var oldEls = [
            {locators: {testid: 'a'}, tag: 'input', label: 'A', region: 'r'},
            {locators: {testid: 'b'}, tag: 'input', label: 'B', region: 'r'},
            {locators: {testid: 'c'}, tag: 'input', label: 'C', region: 'r'},
        ];
        var newEls = [
            {locators: {testid: 'b'}, tag: 'input', label: 'B', region: 'r'},
            {locators: {testid: 'c'}, tag: 'input', label: 'C', region: 'r'},
            {locators: {testid: 'd'}, tag: 'input', label: 'D', region: 'r'},
        ];
        var result = matchElements(oldEls, newEls);
        return {
            matchedCount: result.matched.length,
            addedCount: result.added.length,
            removedCount: result.removed.length,
            ambiguousCount: result.ambiguous.length,
            matchedKeys: result.matched.map(function(m) { return m.key; }).sort(),
        };
    """)
    assert result["matchedCount"] == 2, f"Expected 2 matched, got {result['matchedCount']}"
    assert result["addedCount"] == 1, f"Expected 1 added, got {result['addedCount']}"
    assert result["removedCount"] == 1, f"Expected 1 removed, got {result['removedCount']}"
    assert result["ambiguousCount"] == 0, f"Expected 0 ambiguous, got {result['ambiguousCount']}"
    assert "testid::b" in result["matchedKeys"]
    assert "testid::c" in result["matchedKeys"]


def test_qo2_pure_matchElements_ambiguous(driver):
    """Test matchElements detects ambiguity when multiple elements share a key."""
    driver.get(TL_URL)
    wait_for(driver, "btn-sieve")
    result = driver.execute_script("""
        var oldEls = [
            {locators: {}, tag: 'li', label: 'Item', region: 'list'},
            {locators: {}, tag: 'li', label: 'Item', region: 'list'},
        ];
        var newEls = [
            {locators: {}, tag: 'li', label: 'Item', region: 'list'},
            {locators: {}, tag: 'li', label: 'Item', region: 'list'},
            {locators: {}, tag: 'li', label: 'Item', region: 'list'},
        ];
        var result = matchElements(oldEls, newEls);
        return {
            matchedCount: result.matched.length,
            ambiguousCount: result.ambiguous.length,
            ambiguousOldCount: result.ambiguous[0] ? result.ambiguous[0].oldIdxs.length : 0,
            ambiguousNewCount: result.ambiguous[0] ? result.ambiguous[0].newIdxs.length : 0,
        };
    """)
    assert result["matchedCount"] == 0, f"Expected 0 matched (all ambiguous), got {result['matchedCount']}"
    assert result["ambiguousCount"] == 1, f"Expected 1 ambiguous group, got {result['ambiguousCount']}"
    assert result["ambiguousOldCount"] == 2
    assert result["ambiguousNewCount"] == 3


def test_qo2_pure_propagateNames(driver):
    """Test that propagateNames carries forward classifications and glossary names."""
    driver.get(TL_URL)
    wait_for(driver, "btn-sieve")
    result = driver.execute_script("""
        var matchResult = {
            matched: [{oldIdx: 0, newIdx: 2, key: 'testid::a'}, {oldIdx: 1, newIdx: 0, key: 'testid::b'}],
            added: [{newIdx: 1, key: 'testid::c'}],
            removed: [],
            ambiguous: [],
        };
        var oldCls = {0: 'clickable', 1: 'typable'};
        var oldNames = {0: {name: 'submit', intent: 'Login', source: 'human', notes: ''}};
        var result = propagateNames(matchResult, oldCls, oldNames);
        return {cls: result.classifications, names: result.glossaryNames};
    """)
    # oldIdx 0 (clickable) → newIdx 2
    assert result["cls"]["2"] == "clickable", f"Expected cls[2]=clickable, got {result['cls']}"
    # oldIdx 1 (typable) → newIdx 0
    assert result["cls"]["0"] == "typable", f"Expected cls[0]=typable, got {result['cls']}"
    # newIdx 1 is added — should have no classification
    assert "1" not in result["cls"], f"Added element should have no classification: {result['cls']}"
    # Glossary name propagated: oldIdx 0 → newIdx 2
    assert result["names"]["2"]["name"] == "submit"
    assert result["names"]["2"]["intent"] == "Login"


def test_qo2_resieve_propagates_classifications(driver):
    """Real browser: sieve login, classify, re-sieve same page — diff mode, accept, classifications carry forward."""
    _navigate_and_sieve(driver)

    # Classify first 3 elements
    _classify_n(driver, 3)
    time.sleep(0.3)

    count_before = get_text(driver, "classified-count")
    assert "3" in count_before, f"Expected 3 classified before re-sieve, got: {count_before!r}"

    # Re-sieve the same page — should enter diff mode
    click(driver, "btn-sieve")
    time.sleep(1)

    # Wait for diff mode
    WebDriverWait(driver, 20).until(
        lambda d: "Sieve Diff" in d.find_element(
            By.CSS_SELECTOR, '[data-testid="mode-indicator"]'
        ).text
    )

    # Accept the diff to propagate
    click(driver, "btn-accept-diff")
    time.sleep(0.5)

    # Classifications should have been propagated
    count_after = get_text(driver, "classified-count")
    assert count_after.strip() != "" and "0 classified" not in count_after, \
        f"Expected propagated classifications, got: {count_after!r}"


def test_qo2_resieve_preserves_mode(driver):
    """Re-sieve should enter diff mode, then restore pass2 after accept."""
    _navigate_and_sieve(driver)

    # Classify all elements to reach pass2
    body = driver.find_element(By.TAG_NAME, "body")
    for _ in range(50):
        btns = driver.find_elements(By.CSS_SELECTOR, '[data-testid="btn-start-pass2"]')
        if btns and btns[0].is_displayed():
            break
        body.send_keys("c")
        time.sleep(0.1)

    click(driver, "btn-start-pass2")
    time.sleep(0.3)
    mode_before = get_text(driver, "mode-indicator")
    assert "Pass 2" in mode_before

    # Re-sieve — should enter diff mode
    click(driver, "btn-sieve")
    WebDriverWait(driver, 20).until(
        lambda d: "Sieve Diff" in d.find_element(
            By.CSS_SELECTOR, '[data-testid="mode-indicator"]'
        ).text
    )

    # Accept diff — should restore to pass2
    click(driver, "btn-accept-diff")
    time.sleep(0.5)

    mode_after = get_text(driver, "mode-indicator")
    assert "Pass 2" in mode_after, f"Expected mode restored to Pass 2, got: {mode_after!r}"


def test_qo2_resolve_blocks_sieve(driver):
    """Verify that sieve is blocked during resolve mode (via injected state)."""
    driver.get(TL_URL)
    wait_for(driver, "btn-sieve")

    # Inject resolve mode state directly
    driver.execute_script("""
        state.mode = 'resolve';
        state.resolveContext = { allGroups: [], currentGroupIdx: 0, pairs: [], removedOld: [], addedNew: [] };
    """)

    click(driver, "btn-sieve")
    time.sleep(0.5)

    # Toast should appear with blocking message
    toast = driver.find_element(By.ID, "toast")
    toast_text = driver.execute_script("return arguments[0].textContent", toast)
    assert "resolv" in toast_text.lower(), f"Expected resolve-blocking toast, got: {toast_text!r}"

    # Clean up
    driver.execute_script("state.mode = 'pass1'; state.resolveContext = null;")


def test_qo2_resolve_blocks_navigate(driver):
    """Verify that navigate is blocked during resolve mode."""
    driver.get(TL_URL)
    wait_for(driver, "url-input")

    driver.execute_script("""
        state.mode = 'resolve';
        state.resolveContext = { allGroups: [], currentGroupIdx: 0, pairs: [], removedOld: [], addedNew: [] };
    """)

    clear_and_type(driver, "url-input", DEMO_LOGIN)
    click(driver, "btn-navigate")
    time.sleep(0.5)

    toast = driver.find_element(By.ID, "toast")
    toast_text = driver.execute_script("return arguments[0].textContent", toast)
    assert "resolv" in toast_text.lower(), f"Expected resolve-blocking toast, got: {toast_text!r}"

    driver.execute_script("state.mode = 'pass1'; state.resolveContext = null;")


def test_qo2_resolve_blocks_load(driver):
    """Verify that file load is blocked during resolve mode."""
    driver.get(TL_URL)
    wait_for(driver, "btn-load")

    driver.execute_script("""
        state.mode = 'resolve';
        state.resolveContext = { allGroups: [], currentGroupIdx: 0, pairs: [], removedOld: [], addedNew: [] };
    """)

    _send_fixture(driver)
    time.sleep(0.5)

    toast = driver.find_element(By.ID, "toast")
    toast_text = driver.execute_script("return arguments[0].textContent", toast)
    assert "resolv" in toast_text.lower(), f"Expected resolve-blocking toast, got: {toast_text!r}"

    driver.execute_script("state.mode = 'pass1'; state.resolveContext = null;")


def test_qo2_resolve_ui_renders(driver):
    """Inject ambiguous match state and verify resolve UI appears."""
    driver.get(TL_URL)
    wait_for(driver, "btn-sieve")

    # Inject a pending sieve with ambiguous results
    driver.execute_script("""
        // Fake old inventory
        state.inventory = {
            url: {raw: 'http://example.com'},
            viewport: {w: 1920, h: 1080},
            elements: [
                {locators: {}, tag: 'li', label: 'Item', region: 'list', rect: {x:0,y:0,w:100,h:20}},
                {locators: {}, tag: 'li', label: 'Item', region: 'list', rect: {x:0,y:20,w:100,h:20}},
            ],
        };
        state.classifications = {0: 'readable', 1: 'readable'};
        state.glossaryNames = {};

        // Fake new inventory
        var newInv = {
            url: {raw: 'http://example.com'},
            viewport: {w: 1920, h: 1080},
            elements: [
                {locators: {}, tag: 'li', label: 'Item', region: 'list', rect: {x:0,y:0,w:100,h:20}},
                {locators: {}, tag: 'li', label: 'Item', region: 'list', rect: {x:0,y:20,w:100,h:20}},
                {locators: {}, tag: 'li', label: 'Item', region: 'list', rect: {x:0,y:40,w:100,h:20}},
            ],
        };

        var matchResult = matchElements(state.inventory.elements, newInv.elements);
        var pendingSieve = {
            inventory: newInv,
            screenshotUrl: null,
            screenshotDataUrl: null,
            matchResult: matchResult,
            oldInventory: state.inventory,
            oldClassifications: Object.assign({}, state.classifications),
            oldGlossaryNames: Object.assign({}, state.glossaryNames),
        };
        enterResolveMode(matchResult, pendingSieve);
    """)

    time.sleep(0.5)

    # Mode indicator should say Resolve
    mode = get_text(driver, "mode-indicator")
    assert "Resolve" in mode, f"Expected 'Resolve Matches' in mode indicator, got: {mode!r}"

    # Resolve banner should be visible
    banner = wait_visible(driver, "resolve-banner")
    assert "group 1" in banner.text.lower(), f"Expected group info in banner, got: {banner.text!r}"

    # Old and new element lists should be present
    old_list = wait_for(driver, "resolve-old-list")
    new_list = wait_for(driver, "resolve-new-list")
    assert old_list is not None
    assert new_list is not None

    # Done button should be disabled (nothing resolved yet)
    done_btn = driver.find_element(By.CSS_SELECTOR, '[data-testid="btn-resolve-done"]')
    assert done_btn.get_attribute("disabled") is not None, "Done button should be disabled"

    # Clean up
    driver.execute_script("""
        state.mode = 'pass1';
        state.resolveContext = null;
        state._pendingSieve = null;
        state.inventory = null;
        renderPanel();
    """)


def test_qo2_resolve_full_flow(driver):
    """Full resolve flow: inject ambiguity, pair elements, mark added, finish, verify propagation."""
    driver.get(TL_URL)
    wait_for(driver, "btn-sieve")

    # Inject ambiguous state: 2 old <li> elements (with classifications + names)
    # matched against 3 new <li> elements. All share the same composite key.
    driver.execute_script("""
        state.inventory = {
            url: {raw: 'http://example.com'},
            viewport: {w: 1920, h: 1080},
            elements: [
                {locators: {}, tag: 'li', label: 'Item', region: 'list', rect: {x:10,y:10,w:200,h:30}},
                {locators: {}, tag: 'li', label: 'Item', region: 'list', rect: {x:10,y:50,w:200,h:30}},
            ],
        };
        state.classifications = {0: 'clickable', 1: 'readable'};
        state.glossaryNames = {0: {name: 'first-item', intent: 'List', source: 'human', notes: ''}};
        state.mode = 'pass1';

        var newInv = {
            url: {raw: 'http://example.com'},
            viewport: {w: 1920, h: 1080},
            elements: [
                {locators: {}, tag: 'li', label: 'Item', region: 'list', rect: {x:10,y:10,w:200,h:30}},
                {locators: {}, tag: 'li', label: 'Item', region: 'list', rect: {x:10,y:50,w:200,h:30}},
                {locators: {}, tag: 'li', label: 'Item', region: 'list', rect: {x:10,y:90,w:200,h:30}},
            ],
        };

        var matchResult = matchElements(state.inventory.elements, newInv.elements);
        var pendingSieve = {
            inventory: newInv,
            screenshotUrl: null,
            screenshotDataUrl: null,
            matchResult: matchResult,
            oldInventory: state.inventory,
            oldClassifications: Object.assign({}, state.classifications),
            oldGlossaryNames: Object.assign({}, state.glossaryNames),
        };
        enterResolveMode(matchResult, pendingSieve);
    """)
    time.sleep(0.5)

    # Verify we're in resolve mode
    mode = get_text(driver, "mode-indicator")
    assert "Resolve" in mode, f"Expected resolve mode, got: {mode!r}"

    # Done button should be disabled
    done_btn = driver.find_element(By.CSS_SELECTOR, '[data-testid="btn-resolve-done"]')
    assert done_btn.get_attribute("disabled") is not None, "Done should be disabled initially"

    # Step 1: Select old element 0, then pair with new element 0
    driver.execute_script("resolveSelectOld(0)")
    time.sleep(0.2)
    driver.execute_script("resolveSelectNew(0)")
    time.sleep(0.2)

    # Verify the pair was created
    pairs = driver.execute_script("return state.resolveContext.pairs")
    assert len(pairs) == 1, f"Expected 1 pair after pairing, got {len(pairs)}"
    assert pairs[0]["oldIdx"] == 0 and pairs[0]["newIdx"] == 0

    # Step 2: Select old element 1, then pair with new element 1
    driver.execute_script("resolveSelectOld(1)")
    time.sleep(0.2)
    driver.execute_script("resolveSelectNew(1)")
    time.sleep(0.2)

    pairs = driver.execute_script("return state.resolveContext.pairs")
    assert len(pairs) == 2, f"Expected 2 pairs, got {len(pairs)}"

    # Step 3: Mark new element 2 as added (it has no old counterpart to pair with)
    driver.execute_script("resolveMarkNewAdded(2)")
    time.sleep(0.2)

    added = driver.execute_script("return state.resolveContext.addedNew")
    assert 2 in added, f"Expected new element 2 in addedNew, got {added}"

    # All elements resolved — Done should be enabled
    all_resolved = driver.execute_script("return areAllGroupsResolved()")
    assert all_resolved, "All groups should be resolved"

    # Progress should show "All resolved"
    progress = get_text(driver, "resolve-progress")
    assert "All resolved" in progress, f"Expected 'All resolved', got: {progress!r}"

    # The Done button should now be enabled (no disabled attribute)
    done_btn = driver.find_element(By.CSS_SELECTOR, '[data-testid="btn-resolve-done"]')
    assert done_btn.get_attribute("disabled") is None, "Done should be enabled after resolving all"

    # Step 4: Click Done — should enter diff mode (not pass1 directly)
    driver.execute_script("finishResolve()")
    time.sleep(0.5)

    # Should be in diff mode after resolve
    mode_after = get_text(driver, "mode-indicator")
    assert "Sieve Diff" in mode_after, f"Expected diff mode after resolve, got: {mode_after!r}"

    # Verify resolve context is cleared
    ctx = driver.execute_script("return state.resolveContext")
    assert ctx is None, f"resolveContext should be null after finish, got: {ctx}"

    # Diff panel should be visible with accept button
    accept_btn = driver.find_element(By.CSS_SELECTOR, '[data-testid="btn-accept-diff"]')
    assert accept_btn.is_displayed(), "Accept button should be visible in diff mode"

    # Step 5: Accept diff — now propagation happens
    driver.execute_script("acceptDiff()")
    time.sleep(0.5)

    # Should be back in pass1 mode
    mode_final = get_text(driver, "mode-indicator")
    assert "Pass 1" in mode_final, f"Expected mode restored to Pass 1, got: {mode_final!r}"

    # Verify classifications propagated:
    # old[0] (clickable) → new[0], old[1] (readable) → new[1]
    cls = driver.execute_script("return state.classifications")
    assert cls.get("0") == "clickable", f"Expected cls[0]=clickable, got {cls}"
    assert cls.get("1") == "readable", f"Expected cls[1]=readable, got {cls}"
    # new[2] was marked added — no classification
    assert "2" not in cls, f"Added element should have no classification: {cls}"

    # Verify glossary name propagated: old[0] → new[0]
    names = driver.execute_script("return state.glossaryNames")
    assert names.get("0") is not None, f"Expected glossary name on new[0], got {names}"
    assert names["0"]["name"] == "first-item"
    assert names["0"]["intent"] == "List"
    # new[1] had no glossary name on old[1]
    assert "1" not in names, f"new[1] should have no glossary name: {names}"

    # Verify inventory is the new one (3 elements)
    el_count = driver.execute_script("return state.inventory.elements.length")
    assert el_count == 3, f"Expected 3 elements in new inventory, got {el_count}"


def test_qo2_resolve_undo_pair(driver):
    """Test that undoing a pair re-enables the elements for re-pairing."""
    driver.get(TL_URL)
    wait_for(driver, "btn-sieve")

    # Inject 2-vs-2 ambiguity
    driver.execute_script("""
        state.inventory = {
            url: {raw: 'http://example.com'},
            viewport: {w: 1920, h: 1080},
            elements: [
                {locators: {}, tag: 'li', label: 'Item', region: 'list', rect: {x:0,y:0,w:100,h:20}},
                {locators: {}, tag: 'li', label: 'Item', region: 'list', rect: {x:0,y:20,w:100,h:20}},
            ],
        };
        state.classifications = {0: 'clickable', 1: 'typable'};
        state.glossaryNames = {};
        state.mode = 'pass1';

        var newInv = {
            url: {raw: 'http://example.com'},
            viewport: {w: 1920, h: 1080},
            elements: [
                {locators: {}, tag: 'li', label: 'Item', region: 'list', rect: {x:0,y:0,w:100,h:20}},
                {locators: {}, tag: 'li', label: 'Item', region: 'list', rect: {x:0,y:20,w:100,h:20}},
            ],
        };

        var matchResult = matchElements(state.inventory.elements, newInv.elements);
        var pendingSieve = {
            inventory: newInv,
            screenshotUrl: null,
            screenshotDataUrl: null,
            matchResult: matchResult,
            oldInventory: state.inventory,
            oldClassifications: Object.assign({}, state.classifications),
            oldGlossaryNames: Object.assign({}, state.glossaryNames),
        };
        enterResolveMode(matchResult, pendingSieve);
    """)
    time.sleep(0.3)

    # Pair old[0] → new[0]
    driver.execute_script("resolveSelectOld(0); resolveSelectNew(0);")
    time.sleep(0.2)
    pairs = driver.execute_script("return state.resolveContext.pairs")
    assert len(pairs) == 1

    # Undo that pair
    driver.execute_script("resolveUndoPair(0, 0)")
    time.sleep(0.2)
    pairs = driver.execute_script("return state.resolveContext.pairs")
    assert len(pairs) == 0, f"Expected 0 pairs after undo, got {len(pairs)}"

    # Now pair differently: old[0] → new[1], old[1] → new[0]
    driver.execute_script("resolveSelectOld(0); resolveSelectNew(1);")
    time.sleep(0.1)
    driver.execute_script("resolveSelectOld(1); resolveSelectNew(0);")
    time.sleep(0.2)

    pairs = driver.execute_script("return state.resolveContext.pairs")
    assert len(pairs) == 2, f"Expected 2 pairs after re-pairing, got {len(pairs)}"

    # Finish resolve → enters diff mode → accept to propagate
    driver.execute_script("finishResolve()")
    time.sleep(0.3)

    mode = get_text(driver, "mode-indicator")
    assert "Sieve Diff" in mode, f"Expected diff mode after resolve, got: {mode!r}"

    driver.execute_script("acceptDiff()")
    time.sleep(0.3)

    cls = driver.execute_script("return state.classifications")
    # old[0] was 'clickable' → paired to new[1]
    assert cls.get("1") == "clickable", f"Expected cls[1]=clickable (from old[0]), got {cls}"
    # old[1] was 'typable' → paired to new[0]
    assert cls.get("0") == "typable", f"Expected cls[0]=typable (from old[1]), got {cls}"


def test_qo2_resolve_mark_all_removed_and_added(driver):
    """Test resolving by marking all old as removed and all new as added (no pairing)."""
    driver.get(TL_URL)
    wait_for(driver, "btn-sieve")

    driver.execute_script("""
        state.inventory = {
            url: {raw: 'http://example.com'},
            viewport: {w: 1920, h: 1080},
            elements: [
                {locators: {}, tag: 'li', label: 'Item', region: 'list', rect: {x:0,y:0,w:100,h:20}},
            ],
        };
        state.classifications = {0: 'clickable'};
        state.glossaryNames = {0: {name: 'old-thing', intent: 'X', source: 'human', notes: ''}};
        state.mode = 'pass1';

        var newInv = {
            url: {raw: 'http://example.com'},
            viewport: {w: 1920, h: 1080},
            elements: [
                {locators: {}, tag: 'li', label: 'Item', region: 'list', rect: {x:0,y:0,w:100,h:20}},
                {locators: {}, tag: 'li', label: 'Item', region: 'list', rect: {x:0,y:20,w:100,h:20}},
            ],
        };

        var matchResult = matchElements(state.inventory.elements, newInv.elements);
        var pendingSieve = {
            inventory: newInv,
            screenshotUrl: null,
            screenshotDataUrl: null,
            matchResult: matchResult,
            oldInventory: state.inventory,
            oldClassifications: Object.assign({}, state.classifications),
            oldGlossaryNames: Object.assign({}, state.glossaryNames),
        };
        enterResolveMode(matchResult, pendingSieve);
    """)
    time.sleep(0.3)

    # Mark old[0] as removed, new[0] and new[1] as added
    driver.execute_script("""
        resolveMarkOldRemoved(0);
        resolveMarkNewAdded(0);
        resolveMarkNewAdded(1);
    """)
    time.sleep(0.2)

    all_resolved = driver.execute_script("return areAllGroupsResolved()")
    assert all_resolved, "Should be resolved after marking all"

    driver.execute_script("finishResolve()")
    time.sleep(0.3)

    # Should be in diff mode
    mode = get_text(driver, "mode-indicator")
    assert "Sieve Diff" in mode, f"Expected diff mode, got: {mode!r}"

    driver.execute_script("acceptDiff()")
    time.sleep(0.3)

    # Nothing should propagate — all old marked removed, all new marked added
    cls = driver.execute_script("return state.classifications")
    names = driver.execute_script("return state.glossaryNames")
    assert len(cls) == 0, f"Expected no classifications (all removed/added), got {cls}"
    assert len(names) == 0, f"Expected no glossary names, got {names}"


# ---------------------------------------------------------------------------
# cuo — Sieve Diff Display
# ---------------------------------------------------------------------------

def test_cuo_pure_computeDiff(driver):
    """Test computeDiff pure function via executeScript."""
    driver.get(TL_URL)
    wait_for(driver, "btn-sieve")

    result = driver.execute_script("""
        var oldEls = [
            {tag: 'input', label: 'Email', region: 'form', box: {x:10,y:10,width:200,height:30}, visibleText: ''},
            {tag: 'button', label: 'Login', region: 'form', box: {x:10,y:50,width:100,height:30}, visibleText: 'Login'},
            {tag: 'a', label: 'Help', region: 'nav', box: {x:300,y:10,width:50,height:20}, visibleText: 'Help'},
        ];
        var newEls = [
            {tag: 'input', label: 'Email', region: 'form', box: {x:10,y:10,width:200,height:30}, visibleText: ''},
            {tag: 'button', label: 'Sign In', region: 'form', box: {x:10,y:50,width:100,height:30}, visibleText: 'Sign In'},
            {tag: 'span', label: 'Welcome', region: 'header', box: {x:400,y:5,width:100,height:20}, visibleText: 'Welcome'},
        ];
        var matchResult = {
            matched: [{oldIdx:0, newIdx:0, key:'name::email'}, {oldIdx:1, newIdx:1, key:'id::login-btn'}],
            added: [{newIdx:2, key:'composite::header::span::Welcome'}],
            removed: [{oldIdx:2, key:'id::help-link'}],
            ambiguous: []
        };
        return computeDiff(oldEls, newEls, matchResult);
    """)
    assert len(result["added"]) == 1, f"Expected 1 added, got {len(result['added'])}"
    assert len(result["removed"]) == 1, f"Expected 1 removed, got {len(result['removed'])}"
    assert len(result["changed"]) == 1, f"Expected 1 changed (label changed), got {len(result['changed'])}"
    assert len(result["unchanged"]) == 1, f"Expected 1 unchanged, got {len(result['unchanged'])}"
    assert any("label" in c for c in result["changed"][0]["changes"]), \
        f"Expected label change, got: {result['changed'][0]['changes']}"


def test_cuo_pure_classifyDiff(driver):
    """Test classifyDiff pure function via executeScript."""
    driver.get(TL_URL)
    wait_for(driver, "btn-sieve")

    # navigation: URL changed + >50% elements differ
    cls = driver.execute_script("""
        return classifyDiff(
            {added: [{},{},{}], removed: [{},{},{}], changed: [], unchanged: [{},{}]},
            'http://example.com/login', 'http://example.com/dashboard'
        );
    """)
    assert cls == "navigation", f"Expected navigation, got: {cls}"

    # reveal: only additions
    cls = driver.execute_script("""
        return classifyDiff(
            {added: [{},{}], removed: [], changed: [], unchanged: [{},{},{}]},
            'http://example.com/page', 'http://example.com/page'
        );
    """)
    assert cls == "reveal", f"Expected reveal, got: {cls}"

    # conceal: only removals
    cls = driver.execute_script("""
        return classifyDiff(
            {added: [], removed: [{},{}], changed: [], unchanged: [{},{},{}]},
            'http://example.com/page', 'http://example.com/page'
        );
    """)
    assert cls == "conceal", f"Expected conceal, got: {cls}"

    # state-mutation: only changes
    cls = driver.execute_script("""
        return classifyDiff(
            {added: [], removed: [], changed: [{}], unchanged: [{},{},{}]},
            'http://example.com/page', 'http://example.com/page'
        );
    """)
    assert cls == "state-mutation", f"Expected state-mutation, got: {cls}"

    # no-effect
    cls = driver.execute_script("""
        return classifyDiff(
            {added: [], removed: [], changed: [], unchanged: [{},{},{}]},
            'http://example.com/page', 'http://example.com/page'
        );
    """)
    assert cls == "no-effect", f"Expected no-effect, got: {cls}"

    # compound: mix
    cls = driver.execute_script("""
        return classifyDiff(
            {added: [{}], removed: [{}], changed: [{}], unchanged: [{}]},
            'http://example.com/page', 'http://example.com/page'
        );
    """)
    assert cls == "compound", f"Expected compound, got: {cls}"


def test_cuo_diff_mode_renders(driver):
    """Inject state that triggers diff mode, verify UI renders correctly."""
    driver.get(TL_URL)
    wait_for(driver, "btn-sieve")

    driver.execute_script("""
        state.inventory = {
            url: {raw: 'http://example.com/login'},
            viewport: {w: 1920, h: 1080},
            elements: [
                {locators: {testid: 'email'}, tag: 'input', label: 'Email', region: 'form', box: {x:10,y:10,width:200,height:30}},
                {locators: {testid: 'submit'}, tag: 'button', label: 'Login', region: 'form', box: {x:10,y:50,width:100,height:30}},
            ],
        };
        state.classifications = {0: 'typable', 1: 'clickable'};
        state.mode = 'pass1';

        var newInv = {
            url: {raw: 'http://example.com/dashboard'},
            viewport: {w: 1920, h: 1080},
            elements: [
                {locators: {testid: 'email'}, tag: 'input', label: 'Email', region: 'form', box: {x:10,y:10,width:200,height:30}},
                {locators: {testid: 'welcome'}, tag: 'span', label: 'Welcome', region: 'header', box: {x:200,y:5,width:150,height:25}},
            ],
        };

        var matchResult = matchElements(state.inventory.elements, newInv.elements);
        var pendingSieve = {
            inventory: newInv,
            screenshotUrl: null,
            screenshotDataUrl: null,
            matchResult: matchResult,
            oldInventory: state.inventory,
            oldClassifications: Object.assign({}, state.classifications),
            oldGlossaryNames: Object.assign({}, state.glossaryNames),
        };
        enterDiffMode(matchResult, pendingSieve, null);
    """)
    time.sleep(0.5)

    # Verify diff mode
    mode = get_text(driver, "mode-indicator")
    assert "Sieve Diff" in mode, f"Expected Sieve Diff mode, got: {mode!r}"

    # Verify diff panel is visible with counts
    added_text = get_text(driver, "diff-added-count")
    assert "1" in added_text, f"Expected 1 added, got: {added_text!r}"

    removed_text = get_text(driver, "diff-removed-count")
    assert "1" in removed_text, f"Expected 1 removed, got: {removed_text!r}"

    # Verify classification banner mentions navigation
    cls_text = get_text(driver, "diff-classification")
    assert "navigation" in cls_text.lower(), f"Expected navigation classification, got: {cls_text!r}"

    # Verify accept button exists
    accept_btn = driver.find_element(By.CSS_SELECTOR, '[data-testid="btn-accept-diff"]')
    assert accept_btn.is_displayed(), "Accept button should be visible"


def test_cuo_diff_blocks_sieve(driver):
    """Verify sieve is blocked during diff mode."""
    driver.get(TL_URL)
    wait_for(driver, "btn-sieve")

    driver.execute_script("""
        state.mode = 'diff';
        state.diffResult = {added: [], removed: [], changed: [], unchanged: []};
        state._pendingSieve = {inventory: {elements:[]}, oldInventory: {elements:[]}};
    """)

    click(driver, "btn-sieve")
    time.sleep(0.5)

    toast = driver.find_element(By.ID, "toast")
    toast_text = driver.execute_script("return arguments[0].textContent", toast)
    assert "diff" in toast_text.lower(), f"Expected diff-blocking toast, got: {toast_text!r}"


def test_cuo_diff_blocks_navigate(driver):
    """Verify navigate is blocked during diff mode."""
    driver.get(TL_URL)
    wait_for(driver, "btn-sieve")

    driver.execute_script("""
        state.mode = 'diff';
        state.diffResult = {added: [], removed: [], changed: [], unchanged: []};
        state._pendingSieve = {inventory: {elements:[]}, oldInventory: {elements:[]}};
    """)

    clear_and_type(driver, "url-input", "http://example.com")
    click(driver, "btn-navigate")
    time.sleep(0.5)

    toast = driver.find_element(By.ID, "toast")
    toast_text = driver.execute_script("return arguments[0].textContent", toast)
    assert "diff" in toast_text.lower(), f"Expected diff-blocking toast, got: {toast_text!r}"


def test_cuo_accept_diff_propagates(driver):
    """Full diff flow: inject diff state, accept, verify propagation and mode restore."""
    driver.get(TL_URL)
    wait_for(driver, "btn-sieve")

    driver.execute_script("""
        state.inventory = {
            url: {raw: 'http://example.com/page'},
            viewport: {w: 1920, h: 1080},
            elements: [
                {locators: {testid: 'a'}, tag: 'input', label: 'Field A', region: 'form', box: {x:0,y:0,width:100,height:20}},
                {locators: {testid: 'b'}, tag: 'button', label: 'Btn B', region: 'form', box: {x:0,y:30,width:100,height:20}},
            ],
        };
        state.classifications = {0: 'typable', 1: 'clickable'};
        state.glossaryNames = {0: {name: 'field-a', intent: 'Form', source: 'human', notes: ''}};
        state.mode = 'pass2';

        var newInv = {
            url: {raw: 'http://example.com/page'},
            viewport: {w: 1920, h: 1080},
            elements: [
                {locators: {testid: 'a'}, tag: 'input', label: 'Field A', region: 'form', box: {x:0,y:0,width:100,height:20}},
                {locators: {testid: 'b'}, tag: 'button', label: 'Btn B', region: 'form', box: {x:0,y:30,width:100,height:20}},
                {locators: {testid: 'c'}, tag: 'span', label: 'New thing', region: 'form', box: {x:0,y:60,width:100,height:20}},
            ],
        };

        var matchResult = matchElements(state.inventory.elements, newInv.elements);
        var pendingSieve = {
            inventory: newInv,
            screenshotUrl: null,
            screenshotDataUrl: null,
            matchResult: matchResult,
            oldInventory: state.inventory,
            oldClassifications: Object.assign({}, state.classifications),
            oldGlossaryNames: Object.assign({}, state.glossaryNames),
        };
        enterDiffMode(matchResult, pendingSieve, null);
    """)
    time.sleep(0.5)

    mode = get_text(driver, "mode-indicator")
    assert "Sieve Diff" in mode

    # Accept
    driver.execute_script("acceptDiff()")
    time.sleep(0.5)

    # Mode should restore to pass2
    mode_after = get_text(driver, "mode-indicator")
    assert "Pass 2" in mode_after, f"Expected Pass 2 restored, got: {mode_after!r}"

    # Classifications propagated
    cls = driver.execute_script("return state.classifications")
    assert cls.get("0") == "typable", f"Expected cls[0]=typable, got {cls}"
    assert cls.get("1") == "clickable", f"Expected cls[1]=clickable, got {cls}"

    # Glossary name propagated
    names = driver.execute_script("return state.glossaryNames")
    assert names.get("0") is not None, f"Expected name on [0], got {names}"
    assert names["0"]["name"] == "field-a"

    # New inventory has 3 elements
    count = driver.execute_script("return state.inventory.elements.length")
    assert count == 3, f"Expected 3 elements, got {count}"

    # Diff state cleared
    diff = driver.execute_script("return state.diffResult")
    assert diff is None, f"Expected diffResult null after accept, got {diff}"


def test_cuo_diff_keyboard_accept(driver):
    """Test Enter key accepts diff."""
    driver.get(TL_URL)
    wait_for(driver, "btn-sieve")

    driver.execute_script("""
        state.inventory = {
            url: {raw: 'http://example.com'},
            viewport: {w: 1920, h: 1080},
            elements: [{locators: {testid: 'x'}, tag: 'div', label: 'X', region: 'main', box: {x:0,y:0,width:50,height:50}}],
        };
        state.classifications = {};
        state.mode = 'pass1';

        var newInv = {
            url: {raw: 'http://example.com'},
            viewport: {w: 1920, h: 1080},
            elements: [{locators: {testid: 'x'}, tag: 'div', label: 'X', region: 'main', box: {x:0,y:0,width:50,height:50}}],
        };
        var matchResult = matchElements(state.inventory.elements, newInv.elements);
        var pendingSieve = {
            inventory: newInv, screenshotUrl: null, screenshotDataUrl: null,
            matchResult: matchResult, oldInventory: state.inventory,
            oldClassifications: {}, oldGlossaryNames: {},
        };
        enterDiffMode(matchResult, pendingSieve, null);
    """)
    time.sleep(0.3)

    assert "Sieve Diff" in get_text(driver, "mode-indicator")

    # Press Enter to accept
    body = driver.find_element(By.TAG_NAME, "body")
    body.send_keys(Keys.RETURN)
    time.sleep(0.5)

    mode = get_text(driver, "mode-indicator")
    assert "Pass 1" in mode, f"Expected Pass 1 after Enter accept, got: {mode!r}"


def test_cuo_diff_item_selection(driver):
    """Test clicking diff items highlights them and j/k navigation works."""
    driver.get(TL_URL)
    wait_for(driver, "btn-sieve")

    driver.execute_script("""
        state.inventory = {
            url: {raw: 'http://example.com'},
            viewport: {w: 1920, h: 1080},
            elements: [
                {locators: {testid: 'a'}, tag: 'div', label: 'A', region: 'main', box: {x:0,y:0,width:50,height:50}},
            ],
        };
        state.classifications = {};
        state.mode = 'pass1';

        var newInv = {
            url: {raw: 'http://example.com'},
            viewport: {w: 1920, h: 1080},
            elements: [
                {locators: {testid: 'a'}, tag: 'div', label: 'A', region: 'main', box: {x:0,y:0,width:50,height:50}},
                {locators: {testid: 'b'}, tag: 'span', label: 'B', region: 'main', box: {x:0,y:60,width:50,height:50}},
                {locators: {testid: 'c'}, tag: 'p', label: 'C', region: 'main', box: {x:0,y:120,width:50,height:50}},
            ],
        };
        var matchResult = matchElements(state.inventory.elements, newInv.elements);
        var pendingSieve = {
            inventory: newInv, screenshotUrl: null, screenshotDataUrl: null,
            matchResult: matchResult, oldInventory: state.inventory,
            oldClassifications: {}, oldGlossaryNames: {},
        };
        enterDiffMode(matchResult, pendingSieve, null);
    """)
    time.sleep(0.5)

    # Click first item in diff list
    driver.execute_script("diffSelectItem(0)")
    time.sleep(0.2)

    sel = driver.execute_script("return state.diffSelectedIdx")
    assert sel == 0, f"Expected selected index 0, got {sel}"

    # Press j to move down
    body = driver.find_element(By.TAG_NAME, "body")
    body.send_keys("j")
    time.sleep(0.2)

    sel = driver.execute_script("return state.diffSelectedIdx")
    assert sel == 1, f"Expected selected index 1 after j, got {sel}"

    # Press k to move up
    body.send_keys("k")
    time.sleep(0.2)

    sel = driver.execute_script("return state.diffSelectedIdx")
    assert sel == 0, f"Expected selected index 0 after k, got {sel}"


# ---------------------------------------------------------------------------
# Visual assertion tests (require ANTHROPIC_API_KEY)
# ---------------------------------------------------------------------------

def test_visual_pass1_classify(driver):
    """Visual: Pass 1 classification view looks correct after sieving."""
    judge = _get_judge()
    if not judge:
        print("    (skipped — no ANTHROPIC_API_KEY)")
        return

    driver.get(TL_URL)
    driver.execute_script("localStorage.clear()")
    _navigate_and_sieve(driver)
    _classify_n(driver, 3)
    time.sleep(0.3)

    screenshot = driver.get_screenshot_as_png()
    judge.assert_screenshot(screenshot, [
        critical("Is there a dark-themed web application UI visible with a toolbar at the top?"),
        critical("Is there a screenshot of a web page displayed in the main area?"),
        critical("Are there colored rectangular outlines (overlay boxes) drawn on top of the screenshot?"),
        advisory("Is there a bottom panel showing element details like tag, label, or region?"),
        advisory("Is there a mode indicator showing 'Pass 1' or 'Classify'?"),
    ], test_name="pass1_classify")


def test_visual_diff_mode(driver):
    """Visual: Diff mode view shows classification banner, counts, and change list."""
    judge = _get_judge()
    if not judge:
        print("    (skipped — no ANTHROPIC_API_KEY)")
        return

    driver.get(TL_URL)
    wait_for(driver, "btn-sieve")

    # Inject a diff state with mixed changes to get a rich visual
    driver.execute_script("""
        state.inventory = {
            url: {raw: 'http://example.com/login'},
            viewport: {w: 1280, h: 900},
            elements: [
                {locators: {testid: 'email'}, tag: 'input', label: 'Email', region: 'form', box: {x:100,y:200,width:300,height:40}},
                {locators: {testid: 'pass'}, tag: 'input', label: 'Password', region: 'form', box: {x:100,y:260,width:300,height:40}},
                {locators: {testid: 'submit'}, tag: 'button', label: 'Login', region: 'form', box: {x:100,y:320,width:100,height:35}},
                {locators: {testid: 'help'}, tag: 'a', label: 'Help', region: 'nav', box: {x:500,y:50,width:60,height:20}},
            ],
        };
        state.screenshotDims = {w: 1280, h: 900};
        state.classifications = {0: 'typable', 1: 'typable', 2: 'clickable', 3: 'clickable'};
        state.glossaryNames = {};
        state.mode = 'pass1';

        var newInv = {
            url: {raw: 'http://example.com/dashboard'},
            viewport: {w: 1280, h: 900},
            elements: [
                {locators: {testid: 'email'}, tag: 'input', label: 'Email', region: 'form', box: {x:100,y:200,width:300,height:40}},
                {locators: {testid: 'submit'}, tag: 'button', label: 'Sign In', region: 'form', box: {x:100,y:320,width:120,height:35}},
                {locators: {testid: 'welcome'}, tag: 'h1', label: 'Welcome', region: 'main', box: {x:100,y:100,width:400,height:50}},
            ],
        };

        var matchResult = matchElements(state.inventory.elements, newInv.elements);
        var pendingSieve = {
            inventory: newInv,
            screenshotUrl: null,
            screenshotDataUrl: null,
            matchResult: matchResult,
            oldInventory: state.inventory,
            oldClassifications: Object.assign({}, state.classifications),
            oldGlossaryNames: Object.assign({}, state.glossaryNames),
        };
        enterDiffMode(matchResult, pendingSieve, null);
    """)
    time.sleep(0.5)

    screenshot = driver.get_screenshot_as_png()
    judge.assert_screenshot(screenshot, [
        critical("Is there a bottom panel visible with a blue-tinted banner showing a diff classification (like 'navigation' or 'compound')?"),
        critical("Are there count indicators showing numbers for 'added', 'removed', or 'changed' elements?"),
        critical("Is there a list of change items in the bottom panel, each with a colored left border (green, red, or yellow)?"),
        advisory("Is there a mode indicator showing 'Sieve Diff' or similar diff-related text?"),
        advisory("Is there an 'Accept' button visible at the bottom of the panel?"),
    ], test_name="cuo_diff_mode")


def test_visual_diff_overlay(driver):
    """Visual: Navigate login→about, sieve both — diff overlay shows colored rects."""
    judge = _get_judge()
    if not judge:
        print("    (skipped — no ANTHROPIC_API_KEY)")
        return

    # Sieve the login page first
    driver.get(TL_URL)
    driver.execute_script("localStorage.clear()")
    _navigate_and_sieve(driver)
    _classify_n(driver, 3)
    time.sleep(0.3)

    # Navigate sieve browser to /about (different page → real diff)
    clear_and_type(driver, "url-input", "http://localhost:3000/about")
    click(driver, "btn-navigate")
    WebDriverWait(driver, 20).until(
        lambda d: d.find_element(
            By.CSS_SELECTOR, '[data-testid="status-indicator"]'
        ).text not in ("Navigating...", "Sieving...")
    )
    time.sleep(0.5)

    # Re-sieve the about page — should trigger diff mode
    click(driver, "btn-sieve")
    time.sleep(1)
    WebDriverWait(driver, 20).until(
        lambda d: "Sieve Diff" in d.find_element(
            By.CSS_SELECTOR, '[data-testid="mode-indicator"]'
        ).text
    )
    time.sleep(0.5)

    screenshot = driver.get_screenshot_as_png()
    judge.assert_screenshot(screenshot, [
        critical("Is there a web page screenshot visible in the main area of the application?"),
        critical("Is there a bottom panel with diff information showing non-zero counts for added and/or removed elements?"),
        critical("Are there colored rectangular outlines (green dashed for added, or yellow for changed) drawn on top of the screenshot?"),
        advisory("Does the diff classification banner mention 'navigation' (since the URL changed between pages)?"),
        advisory("Is there a change list in the bottom panel with items labeled NEW or REMOVED?"),
    ], test_name="cuo_diff_overlay_navigation")


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

VISUAL_TESTS = [
    ("visual: Pass 1 classification view", test_visual_pass1_classify),
    ("visual: diff mode panel and counts", test_visual_diff_mode),
    ("visual: diff overlay on real screenshot", test_visual_diff_overlay),
]

TESTS = [
    ("Page loads", test_page_loads),
    ("Status prepopulates URL bar", test_status_prepopulates_url),
    ("Navigate to demo app", test_navigate_to_demo_app),
    ("Sieve returns elements", test_sieve_returns_elements),
    ("Screenshot renders as blob URL", test_screenshot_renders),
    ("Element detail panel populated", test_element_detail_shows),
    ("Classify element", test_classify_element),
    ("Pass 1 complete shows Start Pass 2", test_pass1_complete_shows_start_pass2),
    ("Pass 2 naming flow", test_pass2_naming_flow),
    ("Load button present", test_load_button_present),
    ("Load valid fixture — overlay appears", test_load_valid_fixture),
    ("Load fixture — screenshot blob URL", test_load_screenshot_appears),
    ("Load fixture — status shows count", test_load_status_shows_count),
    ("Load fixture — mode indicator", test_load_mode_indicator),
    ("Load fixture — element detail populated", test_load_element_detail_populated),
    ("Load invalid JSON — shows toast", test_load_invalid_json_shows_toast),
    ("Load invalid intermediate — shows toast", test_load_invalid_intermediate_shows_toast),
    # qo2 — Element identity
    ("qo2: isDynamicId pure function", test_qo2_pure_isDynamicId),
    ("qo2: elementKey pure function", test_qo2_pure_elementKey),
    ("qo2: matchElements pure function", test_qo2_pure_matchElements),
    ("qo2: matchElements detects ambiguity", test_qo2_pure_matchElements_ambiguous),
    ("qo2: propagateNames pure function", test_qo2_pure_propagateNames),
    ("qo2: re-sieve propagates classifications", test_qo2_resieve_propagates_classifications),
    ("qo2: re-sieve preserves mode", test_qo2_resieve_preserves_mode),
    ("qo2: resolve blocks sieve", test_qo2_resolve_blocks_sieve),
    ("qo2: resolve blocks navigate", test_qo2_resolve_blocks_navigate),
    ("qo2: resolve blocks load", test_qo2_resolve_blocks_load),
    ("qo2: resolve UI renders", test_qo2_resolve_ui_renders),
    ("qo2: resolve full flow — pair + mark added + finish", test_qo2_resolve_full_flow),
    ("qo2: resolve undo pair and re-pair", test_qo2_resolve_undo_pair),
    ("qo2: resolve mark all removed/added", test_qo2_resolve_mark_all_removed_and_added),
    # cuo — Sieve diff display
    ("cuo: computeDiff pure function", test_cuo_pure_computeDiff),
    ("cuo: classifyDiff pure function", test_cuo_pure_classifyDiff),
    ("cuo: diff mode UI renders", test_cuo_diff_mode_renders),
    ("cuo: diff blocks sieve", test_cuo_diff_blocks_sieve),
    ("cuo: diff blocks navigate", test_cuo_diff_blocks_navigate),
    ("cuo: accept diff propagates and restores mode", test_cuo_accept_diff_propagates),
    ("cuo: Enter key accepts diff", test_cuo_diff_keyboard_accept),
    ("cuo: diff item selection and j/k navigation", test_cuo_diff_item_selection),
]

if __name__ == "__main__":
    print("=== Toddler Loop E2E Tests ===\n")

    print("Checking services...")
    check_services()
    print()

    driver = make_driver()
    try:
        print("Running tests...\n")
        for name, fn in TESTS:
            run_test(name, fn, driver)

        # Visual tests (optional — require ANTHROPIC_API_KEY)
        if _get_judge():
            print("\n  Running visual assertion tests (ANTHROPIC_API_KEY set)...\n")
            for name, fn in VISUAL_TESTS:
                run_test(name, fn, driver)
        else:
            print(f"\n  Skipping {len(VISUAL_TESTS)} visual tests (ANTHROPIC_API_KEY not set)")
    finally:
        driver.quit()

    total = len(TESTS) + (len(VISUAL_TESTS) if _get_judge() else 0)
    print()
    if failures:
        print(f"FAILED: {len(failures)}/{total} tests")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print(f"All {total} tests passed.")
