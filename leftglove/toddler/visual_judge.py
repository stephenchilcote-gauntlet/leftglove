"""
Selenium-adapted visual judge — LLM-powered visual assertions for Chromedriver tests.

Adapted from playwright-visual-judge. Takes raw PNG bytes instead of a Playwright Page,
so the caller uses driver.get_screenshot_as_png().

Two-call prompt caching strategy:
  Call 1: screenshot + "analyze in detail" -> detailed description (cached image)
  Call 2: cached image + analysis + structured rubric -> JSON results
"""
from __future__ import annotations

import base64
import json
import os
import re
import time
import warnings
from pathlib import Path


DEFAULT_MODEL = "claude-haiku-4-5-20251001"
DEFAULT_ARTIFACT_DIR = Path("tests/artifacts/visual")


class VisualCheck:
    """A single visual check with severity level."""
    __slots__ = ("question", "severity")

    def __init__(self, question: str, severity: str = "advisory"):
        self.question = question
        self.severity = severity

    def __repr__(self) -> str:
        return f"VisualCheck({self.question!r}, {self.severity!r})"


def critical(question: str) -> VisualCheck:
    """Mark a visual check as CRITICAL — test fails if this fails."""
    return VisualCheck(question, "critical")


def advisory(question: str) -> VisualCheck:
    """Mark a visual check as ADVISORY — reported as warning, doesn't fail test."""
    return VisualCheck(question, "advisory")


class VisualJudge:
    """
    LLM-powered visual assertion engine for Selenium/Chromedriver tests.

    Usage:
        judge = VisualJudge(api_key="sk-ant-...")
        screenshot = driver.get_screenshot_as_png()
        judge.assert_screenshot(screenshot, [
            critical("Is the diff panel visible with added/removed counts?"),
            advisory("Are the overlay colors distinguishable?"),
        ], test_name="cuo_diff_mode")
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str = DEFAULT_MODEL,
        artifact_dir: Path | str = DEFAULT_ARTIFACT_DIR,
    ):
        key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        if not key:
            raise ValueError(
                "No API key provided. Pass api_key= or set ANTHROPIC_API_KEY."
            )
        import anthropic
        self._client = anthropic.Anthropic(api_key=key)
        self._model = model
        self._artifact_dir = Path(artifact_dir)

    def assert_screenshot(
        self,
        screenshot: bytes,
        checks: list[VisualCheck],
        *,
        test_name: str = "",
    ) -> dict[str, dict]:
        """
        Evaluate a screenshot against visual checks.

        Args:
            screenshot: Raw PNG bytes (from driver.get_screenshot_as_png()).
            checks: List of VisualCheck objects (use critical() / advisory()).
            test_name: Identifier for artifact directory naming.

        Returns:
            Dict mapping question -> {"passed": bool, "severity": str,
                                      "reason": str, "evidence": str}

        Raises:
            AssertionError: If any CRITICAL check fails.
        """
        if not checks:
            raise ValueError("checks list is required")

        cached = self._check_screenshot_cache(test_name, screenshot, checks)
        if cached is not None:
            results, artifact_dir = cached
            print(f"\n  Screenshot unchanged -- reusing cached results")
            self._report_results(results, artifact_dir)
            return results

        b64 = base64.b64encode(screenshot).decode()
        severity_map = {c.question: c.severity for c in checks}

        analysis = self._analyze_screenshot(b64)
        raw = self._evaluate_checks(b64, analysis, checks)

        results = self._parse_json_results(checks, raw, severity_map)
        artifact_dir = self._save_artifacts(
            test_name, screenshot, analysis, raw, results
        )

        self._report_results(results, artifact_dir)
        return results

    # -- Screenshot Cache --

    def _check_screenshot_cache(
        self, test_name: str, screenshot: bytes, checks: list[VisualCheck],
    ) -> tuple[dict[str, dict], Path] | None:
        if not test_name:
            return None
        safe_name = re.sub(r"[^\w\-.]", "_", test_name)
        matches = sorted(
            self._artifact_dir.glob(f"{safe_name}_*"),
            key=lambda p: p.name,
            reverse=True,
        )
        for prev_dir in matches:
            prev_screenshot = prev_dir / "screenshot.png"
            prev_results = prev_dir / "results.json"
            if not prev_screenshot.exists() or not prev_results.exists():
                continue
            if prev_screenshot.read_bytes() != screenshot:
                continue
            try:
                results = json.loads(prev_results.read_text())
                if set(results.keys()) != {c.question for c in checks}:
                    continue
                return results, prev_dir
            except (json.JSONDecodeError, KeyError):
                continue
        return None

    # -- LLM Calls --

    def _analyze_screenshot(self, b64: str) -> str:
        response = self._client.messages.create(
            model=self._model,
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": b64,
                        },
                        "cache_control": {"type": "ephemeral"},
                    },
                    {
                        "type": "text",
                        "text": (
                            "Analyze this screenshot of a web application in detail. "
                            "Describe everything you see: layout, colors, typography, "
                            "spacing, alignment, components, text content, visual "
                            "hierarchy, and overall quality. Be thorough."
                        ),
                    },
                ],
            }],
        )
        return response.content[0].text

    def _evaluate_checks(
        self, b64: str, analysis: str, checks: list[VisualCheck],
    ) -> str:
        checks_json = json.dumps(
            [
                {"id": i + 1, "severity": c.severity, "question": c.question}
                for i, c in enumerate(checks)
            ],
            indent=2,
        )

        response = self._client.messages.create(
            model=self._model,
            max_tokens=2048,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": b64,
                            },
                            "cache_control": {"type": "ephemeral"},
                        },
                        {
                            "type": "text",
                            "text": "Analyze this screenshot of a web application in detail.",
                        },
                    ],
                },
                {"role": "assistant", "content": analysis},
                {
                    "role": "user",
                    "content": (
                        "Based on your analysis of the screenshot, evaluate each "
                        "check below.\n\n"
                        f"Checks:\n{checks_json}\n\n"
                        "Respond with a JSON object in this EXACT format "
                        "(no markdown, no extra text):\n"
                        "{\n"
                        '  "checks": [\n'
                        "    {\n"
                        '      "id": 1,\n'
                        '      "status": "pass" or "fail",\n'
                        '      "evidence": "Quote visible text or describe the '
                        'specific element you see that supports your answer",\n'
                        '      "reason": "Brief explanation"\n'
                        "    }\n"
                        "  ]\n"
                        "}\n\n"
                        "Rules:\n"
                        '- Only mark "pass" if the criterion is clearly satisfied '
                        "in the screenshot.\n"
                        '- For "evidence", cite specific visible text or describe '
                        "exact UI elements you observe.\n"
                        "- Return ONLY the JSON object, nothing else."
                    ),
                },
            ],
        )
        return response.content[0].text

    # -- Parsing --

    @staticmethod
    def _parse_json_results(
        checks: list[VisualCheck], raw: str, severity_map: dict[str, str],
    ) -> dict[str, dict]:
        results: dict[str, dict] = {}

        try:
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
                cleaned = re.sub(r"\s*```$", "", cleaned)
            data = json.loads(cleaned)
            check_results = data.get("checks", [])
            for i, check in enumerate(checks):
                if i < len(check_results):
                    cr = check_results[i]
                    passed = str(cr.get("status", "")).lower() == "pass"
                    results[check.question] = {
                        "passed": passed,
                        "severity": severity_map.get(check.question, "advisory"),
                        "reason": cr.get("reason", ""),
                        "evidence": cr.get("evidence", ""),
                    }
                else:
                    results[check.question] = {
                        "passed": False,
                        "severity": severity_map.get(check.question, "advisory"),
                        "reason": "No result returned by LLM for this check",
                        "evidence": "",
                    }
            return results
        except (json.JSONDecodeError, KeyError, TypeError):
            pass

        # Fallback: line-based parsing
        lines = [ln.strip() for ln in raw.strip().split("\n") if ln.strip()]
        for i, check in enumerate(checks):
            matched = False
            prefix = f"{i + 1}."
            for line in lines:
                if line.startswith(prefix):
                    rest = line[len(prefix):].strip()
                    if rest.upper().startswith("PASS"):
                        reason = rest[4:].lstrip(":").lstrip()
                        results[check.question] = {
                            "passed": True,
                            "severity": severity_map.get(check.question, "advisory"),
                            "reason": reason,
                            "evidence": "",
                        }
                        matched = True
                    elif rest.upper().startswith("FAIL"):
                        reason = rest[4:].lstrip(":").lstrip()
                        results[check.question] = {
                            "passed": False,
                            "severity": severity_map.get(check.question, "advisory"),
                            "reason": reason,
                            "evidence": "",
                        }
                        matched = True
                    break
            if not matched:
                results[check.question] = {
                    "passed": False,
                    "severity": severity_map.get(check.question, "advisory"),
                    "reason": "Could not parse result from LLM output",
                    "evidence": "",
                }
        return results

    # -- Artifacts --

    def _save_artifacts(
        self, test_name: str, screenshot: bytes,
        analysis: str, raw_response: str, results: dict,
    ) -> Path:
        safe_name = (
            re.sub(r"[^\w\-.]", "_", test_name) if test_name else "unnamed"
        )
        ts = int(time.time())
        artifact_dir = self._artifact_dir / f"{safe_name}_{ts}"
        artifact_dir.mkdir(parents=True, exist_ok=True)

        (artifact_dir / "screenshot.png").write_bytes(screenshot)
        (artifact_dir / "analysis.txt").write_text(analysis)
        (artifact_dir / "llm_raw.txt").write_text(raw_response)
        (artifact_dir / "results.json").write_text(
            json.dumps(results, indent=2, default=str)
        )
        return artifact_dir

    # -- Reporting --

    @staticmethod
    def _report_results(results: dict[str, dict], artifact_dir: Path) -> None:
        print(f"\n  Screenshot: {artifact_dir / 'screenshot.png'}")
        critical_failures: list[tuple[str, dict]] = []
        advisory_failures: list[tuple[str, dict]] = []

        for question, r in results.items():
            sev = r["severity"]
            icon = "PASS" if r["passed"] else ("FAIL" if sev == "critical" else "WARN")
            tag = f"[{sev.upper()}]"
            print(f"  {icon} {tag} {question}")
            print(f"      -> {r['reason']}")
            if r.get("evidence"):
                print(f"      evidence: {r['evidence']}")
            if not r["passed"]:
                if sev == "critical":
                    critical_failures.append((question, r))
                else:
                    advisory_failures.append((question, r))

        for question, r in advisory_failures:
            warnings.warn(
                f"[ADVISORY VISUAL] {question}: {r['reason']} "
                f"(screenshot: {artifact_dir / 'screenshot.png'})",
                stacklevel=3,
            )

        if critical_failures:
            msg_lines = [
                f"Visual assertion CRITICAL failure: "
                f"{len(critical_failures)} critical check(s) failed",
                f"Screenshot: {artifact_dir / 'screenshot.png'}",
                f"Results: {artifact_dir / 'results.json'}",
                "",
            ]
            for question, r in critical_failures:
                msg_lines.append(f"  FAIL {question}")
                msg_lines.append(f"    -> {r['reason']}")
                if r.get("evidence"):
                    msg_lines.append(f"    evidence: {r['evidence']}")
            raise AssertionError("\n".join(msg_lines))
