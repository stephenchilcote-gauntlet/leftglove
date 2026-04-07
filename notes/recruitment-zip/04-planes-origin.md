# The Four Planes of Misfit — Origin and Evidence

**Canonical for:** Business background, bug RCA evidence, Alexander grounding, Conway connection
**Linked from:** VISION.md § The Planes
**Last verified:** 2026-04-04
**Source:** Chair's talk "Quality as a Dimension, Not a Phase" (originally 05-sl4.adoc)

---

## Where This Comes From

This model came from root-causing thousands of bugs across many years of QA
and test automation work — different kinds of hardware, software, testing
frameworks — and trying to answer: why do the same categories of defect keep
appearing, and why does our tooling only catch the cheapest ones?

The insight: every defect has a **causal origin** in one of four planes, and
knowing the plane tells you more about prevention than any triage category
(severity, reproducibility, impact, phase of discovery) ever could.

---

## The Shift-Left Cost Curve

There's a well-documented exponential cost to fixing defects later. Studies
since the 1970s, quantified starting in the 1980s, always show the same
shape. The effect is more pronounced the bigger and more complex the project.

But "shift left" usually just means "find bugs earlier" — faster feedback
loops. What if instead of just finding defects earlier, we could **stop
creating them**? Maybe we need to shift lefter, and revisit what quality
actually is.

---

## Quality as Absence of Misfit

From Christopher Alexander, *Notes on the Synthesis of Form* (1964):

> "Even in everyday life the concept of good fit, though positive in meaning,
> seems very largely to feed on negative instances; it is the aspects of our
> lives which are obsolete, incongruous, or out of tune that catch our
> attention. ...
>
> When we speak of bad fit we refer to a single identifiable property of an
> ensemble, which is immediate in experience, and describable. Wherever an
> instance of misfit occurs in an ensemble, we are able to point specifically
> at what fails and to describe it. **It seems as though in practice the
> concept of good fit, describing only the absence of such failures and hence
> leaving us nothing concrete to refer to in explanation, can only be explained
> indirectly; it is, in practice, as it were, the disjunction of all possible
> misfits.**"

Quality is a lack of anything for a stakeholder to make meaningful complaint
about. Everything else — code coverage, scalability, clean architecture,
SOLID principles, TDD, linting scores, cyclomatic complexity — is at best a
potential 2nd or 3rd order indicator of quality. Or just cargo-culted,
feel-good, billable busywork.

To a user, there is **no effective difference between a bug, a missing
feature, and a clunky workflow.** They're all misfit, of whatever significance.

---

## Bugs by Plane — Real Examples

### Plane 4: Misfit of Implementation — "Just plain broken"

Classic "QA bugs." Off-by-one errors, segfaults, race conditions, typos,
unindexed columns, dependency mismatches. The developer (AI or human) built
something where the end behavior does not meet the intention of the design.

This is where almost all testing effort is focused. And because we keep
increasing the total complexity of systems, it's hard to tell if we've made
any net progress.

### Plane 1: Misfit of Understanding — "Just plain wrong"

An error in the plane of facts. Something was incorrect from the start, or
changed without anyone noticing.

**The timezone bug:** A medical lab system. All users were on campus. Client
time always equaled server time. Then COVID enabled remote work across
timezones. Slowly, things got logged at the wrong time. Billing reports
covered the wrong window. Patients were scheduled for the wrong times. The
system had five different inconsistent time-handling strategies, but nobody
noticed until dates — not just hours — diverged. Users were blaming other
users for what was a system problem.

The baked-in assumption (same timezone) was never made explicit because it
was never wrong — until it was.

### Plane 2: Misfit of Evaluation — "Who would want that?"

The facts are correct. The hypothesis about what tension to solve, or its
priority, or how to mitigate it, is wrong.

**The IPS fail-open:** Tipping Point made intrusion prevention systems for
the DOD. When the device got too much traffic to inspect, it could fail
open (allow everything through) or fail closed (shut down all traffic until
it caught up). Management didn't want it to look like they were shutting off
the network, so they chose fail open. Any kid with a traffic flood tool
could hammer your $100K box for 30 seconds and turn it into a dumb switch.
No code defect. A correctly implemented decision that was wrong.

At the product level, Plane 2 bugs often just manifest as zero adoption.
Big feature, big fanfare, nobody uses it.

### Plane 3: Misfit of Strategy — "Who would do it like THAT?"

The user wants what the system provides. The system works. But the workflow
is hostile to how the user wants to achieve their goal.

You can delete, but you can't bulk delete. You can search or filter, but not
both. 100% of your users are in the US, but you force everyone to scroll to
the middle of a giant list to select "United States of America."

People make **desire paths** through your software because the paved ones
don't go where they need. If you have market lock-in, you can survive this
forever. If you don't, competitors will destroy you. This is what "UX" or
"design" usually means, and a strong argument could be made that this is why
the first iPod succeeded.

---

## The Irony of Focus

Very often, misfits arising from Implementation (Plane 4) are the
**cheapest** to fix. Anything broken upstream cascades and requires rework of
all the steps after it. Yet Plane 4 is where disproportionate effort is
focused — because it's the most visible and the easiest to measure.

---

## Conway's Law Connection

> "Organizations who design systems are constrained to produce designs which
> are copies of the communication structures of those organizations."
> — Melvin Conway, 1968

More commonly: "You ship your org chart."

Two common failure modes:

**Big orgs — too many cooks.** Observation, prioritization, and strategy are
handled by engineering, marketing, strategy, support, and legal — separately.
Who does what? Who wins in a fight? High latency, high noise, conflicting
signals between groups. Political pressure to shift blame ("it wasn't
implemented right!" "marketing gave us bad data!"). These are the opposite
of healthy feedback loops.

**Small orgs / OSS — everything's implicit.** No strategy docs, no user
interviews, no alignment. Just vibes. Assumptions are made, gaps are ignored,
everything is tribal knowledge, and turnover wrecks everything.

Both failure modes are the same underlying problem: the planes are squished
together, usually into a single PRD, with no explicit separation of concerns.
Even good teams rarely segregate observation from hypothesis from design from
implementation.

---

## The OODA / Scientific Method Mapping

| Planes | OODA | Scientific Method |
|--------|------|-------------------|
| 1: Observation | Observe | Observe |
| 2: Orientation | Orient | Hypothesize |
| 3: Design | Decide | Experiment Design |
| 4: Artifact | Act | Experiment |

These are not identical mappings — they're family resemblances. The planes
model splits Alexander's "synthesize a form" into explicit layers, making
the implicit stages visible and individually testable.

---

## What AI Changes

- **Plane 4 (artifact generation)** gets mostly sorted out — this is what
  everyone's excited about now.
- **Plane 1 (understanding)** becomes shared and internet-scale, plus big
  additions per organization for multi-product alignment.
- **Planes 2 & 3 become the new source code.** If Plane 4 is AI-generated
  and Plane 1 is internet-scale, then human input lives in Planes 2-3.
  The hypothesis (what to build) and the design (how to shape it) are where
  human judgment is irreplaceable — and where the most expensive misfits
  originate.
