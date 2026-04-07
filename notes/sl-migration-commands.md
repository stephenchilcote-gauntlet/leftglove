# SL Migration Commands — DRAFT

**Status:** Draft — review before executing
**Prerequisites:** Create `vision-docs` repo on private GitLab first

---

## Step 1: Create vision-docs repo

```bash
# On your GitLab, create a new repo called vision-docs
# Then clone it locally
cd ~/dev
git clone https://gl.3var.com/gjw/vision-docs.git
mkdir -p vision-docs/shiftlefter
mkdir -p vision-docs/leftglove
```

## Step 2: Move SL's _docs into vision-docs

```bash
# Copy _docs from SL into vision-docs (preserve history by copying, not moving yet)
cp -r ~/dev/shiftlefter-gherkin/_docs/* ~/dev/vision-docs/shiftlefter/

# Verify everything is there
ls ~/dev/vision-docs/shiftlefter/
# Should see: active/ canon/ private/ testing/ reconciled/ discard/ etc.

# Commit to vision-docs
cd ~/dev/vision-docs
git add -A
git commit -m "Import shiftlefter internal docs from shiftlefter-gherkin/_docs"
git push origin main
```

## Step 3: Remove _docs from SL and add symlink

```bash
cd ~/dev/shiftlefter-gherkin

# Remove _docs from git tracking (keeps files on disk until we verify symlink works)
git rm -r --cached _docs/
# NOTE: this stages the removal but files are still on disk

# Before committing, verify the copy in vision-docs is complete
diff -rq _docs/ ../vision-docs/shiftlefter/
# Should show no differences (or only .DS_Store type noise)

# Now safe to remove the actual directory and replace with symlink
rm -rf _docs
ln -s ../vision-docs/shiftlefter _docs

# Verify symlink works
ls _docs/canon/core/
# Should show glossary.md, decisions.md, etc.

# Add _docs to .gitignore
echo "_docs" >> .gitignore

# Commit
git add .gitignore
git commit -m "Move internal docs to vision-docs repo, replace with gitignored symlink"
git push origin main   # pushes to private GitLab
```

## Step 4: Rename the repo

```bash
cd ~/dev

# Rename local directory
mv shiftlefter-gherkin shiftlefter

# On GitHub: Settings → Repository name → change to "shiftlefter"
# On GitLab: Settings → General → change to "shiftlefter"

# Update remotes
cd shiftlefter
git remote set-url origin https://gl.3var.com/gjw/shiftlefter.git

# Add GitHub as second remote (if not already)
git remote add github https://github.com/shift-lefter/shiftlefter.git
# Or whatever the GitHub org/repo name is

# Verify
git remote -v
```

## Step 5: First clean push to GitHub

```bash
cd ~/dev/shiftlefter

# Verify _docs is not tracked
git ls-files | grep _docs
# Should return nothing

# Verify symlink is gitignored
git status
# _docs should NOT appear

# Push to GitHub
git push github main

# Verify on GitHub: no _docs directory, source code + docs/ is all there
```

## Step 6: Initialize beads in SL

```bash
cd ~/dev/shiftlefter
br init --prefix sl

# Create the pointer task for old work items
br create "Review and migrate pre-beads work items" -t task -p 2 \
  -d "Old epics live in vision-docs/shiftlefter/ (EP-031 through EP-RDD, EP-GP, EP-NEXT, EP-CLJIMP) and canon/core/backlog.md. Post-capstone: read through, decide what is still relevant, migrate to beads."
# Then label it:
# br label add <id> post-capstone

# Create capstone-scoped tasks
br create "Apply GitLab patches to GitHub release" -t task -p 0
br create "Verify REPL workflow from clean clone" -t task -p 1
br create "sl agent-prompt GP.005" -t task -p 2
# Then label each:
# br label add <id> capstone
```

## Step 7: Update leftglove references

```bash
cd ~/dev/leftglove

# Update any references to shiftlefter-gherkin in docs
grep -r "shiftlefter-gherkin" *.md notes/*.md ARCHITECTURE.md VISION.md
# Fix any found references to point to "shiftlefter"

# Update the symlink path in ARCHITECTURE.md bridge section if needed
```

## Step 8: Fix the symlink in the SL REPL workflow

After renaming, the sieve development REPL path changes:

```clojure
;; Old (before rename)
(def sieve-js (slurp "../leftglove/resources/sieve.js"))

;; Still works — leftglove didn't move, only SL was renamed
;; But verify the relative path is correct from the new location
```

---

## Verification Checklist

- [ ] `vision-docs` repo exists on private GitLab with SL docs
- [ ] `~/dev/shiftlefter/_docs` is a symlink to `../vision-docs/shiftlefter`
- [ ] `ls ~/dev/shiftlefter/_docs/canon/core/` shows files
- [ ] `git ls-files` in shiftlefter shows NO _docs entries
- [ ] `git status` in shiftlefter shows clean (symlink is gitignored)
- [ ] `git push github main` succeeds with no private files
- [ ] GitHub repo has source + `docs/` but no `_docs/`
- [ ] `br list` in shiftlefter shows initialized beads
- [ ] SL REPL starts and can provision a browser
- [ ] `(slurp "../leftglove/resources/sieve.js")` works from SL REPL

---

## Rollback

If something goes wrong, the original `_docs/` content is in two places:
1. `vision-docs` repo (the copy we just made)
2. Git history of shiftlefter (the `git rm --cached` only removes tracking, not history)

To restore: `git checkout HEAD~1 -- _docs/` gets the files back from the commit before removal.
