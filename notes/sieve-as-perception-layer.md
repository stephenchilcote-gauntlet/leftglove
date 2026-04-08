# The Sieve as a General-Purpose Web Perception Layer

**Status:** Insight, not roadmap. Captured 2026-04-07 while dogfooding against Slashdot.

---

## The Observation

The sieve wasn't built for this, but it's a general-purpose structured
web perception layer for agents. Point it at any website, get a typed
inventory of every meaningful element — labels, locators, positions,
categories — in ~50ms with zero LLM tokens.

This means any agent that can call the sieve can navigate the web with
precise, structured commands instead of burning tokens on vision
recognition or HTML parsing.

## Why This Matters

Current agent-browsing approaches are expensive and fragile:

- Screenshot → vision model: costly image tokens, fuzzy spatial results
- Full HTML → LLM: massive context, guessing at selectors
- Accessibility tree → LLM: better, still unstructured

The sieve returns ~50 tokens of exact, actionable data per element.
For a 400-element page, that's ~20K tokens for perfect perception.
A vision model burns more tokens on a single screenshot and gets
worse results.

## Not Just Extraction — Interaction

The sieve gives agents locators, not just labels. An agent doesn't
just know "there's an email input" — it knows the exact CSS selector,
ID, testid, and name attribute. It can issue tiny, correct, constrained
commands: click this, fill that, submit this form.

This is structured interaction at sieve speed. No coordinate guessing,
no selector hunting, no "I think the button is in the upper right."

## Examples That Fall Out for Free

- **RSS from any site:** Sieve Slashdot → filter to story region →
  structured article feed with links, titles, metadata
- **Social media client:** Sieve Twitter → tweets with text, author,
  interaction buttons → read, like, reply via precise locators
- **Form automation:** Sieve any form → typable fields with labels →
  fill with exact data, submit
- **Content extraction:** Sieve a page → classify as content/ads/chrome
  → extract just the content, structured and labeled
- **Ad identification:** The sieve classification naturally separates
  ads from content. A glossary for a site is essentially a structured
  content policy.

## What This Means for the Project

The sieve was built for testing. But "structured perception of a web
page" is a more general capability. ShiftLefter's test engine is one
consumer. Agent browsing frameworks are another. Content extraction
tools are another.

This doesn't change the roadmap — the testing story is the right
thing to build and demo. But it means the sieve has a much larger
addressable surface than behavioral testing alone. When someone asks
"why would I use this instead of Playwright?" the answer includes
"because your agents can perceive the web through it."

## Not Pursuing Now

This is a platform capability that falls out of the testing work.
Don't market it, don't build features for it, don't distract from
the demo. Just be aware that it exists, and that it's the kind of
thing that makes a good Hacker News post after the tool is solid.
