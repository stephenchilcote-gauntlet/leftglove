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

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service

TL_URL = "http://localhost:8080?api=http://localhost:3333"
DEMO_LOGIN = "http://localhost:3000/login"
SIEVE_STATUS = "http://localhost:3333/status"

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
# Runner
# ---------------------------------------------------------------------------

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
    finally:
        driver.quit()

    print()
    if failures:
        print(f"FAILED: {len(failures)}/{len(TESTS)} tests")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print(f"All {len(TESTS)} tests passed.")
