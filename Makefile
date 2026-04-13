.PHONY: demo-browser demo-terminal demo-audio demo-final demo-rebuild demo-run
.PHONY: demo2-browser demo2-audio demo2-final demo2-rebuild demo2-quick

DEMO_DIR = leftglove/toddler/demo
DEMO2_DIR = leftglove/toddler/demo2

# Start all demo services (demo app + TL UI + sieve)
demo-run:
	bin/demo-run

# Record browser segments via Playwright (requires services running)
demo-browser:
	cd $(DEMO_DIR) && npx playwright test --config playwright.config.ts

# Generate terminal segment .cast files and convert to .mp4
demo-terminal:
	cd $(DEMO_DIR) && python3 terminal-segments.py

# Generate TTS audio from narration script (requires Fish Speech)
demo-audio:
	cd /home/login/PycharmProjects/chat_reader_zonos && \
	  source .venv/bin/activate && \
	  python $(CURDIR)/$(DEMO_DIR)/gen-demo-audio.py

# Full pipeline: browser + terminal + audio → demo-final.mp4
demo-final: demo-browser demo-terminal demo-audio
	cd $(DEMO_DIR) && bash assemble.sh

# Regenerate audio + re-assemble (no re-record)
demo-rebuild:
	cd /home/login/PycharmProjects/chat_reader_zonos && \
	  source .venv/bin/activate && \
	  python $(CURDIR)/$(DEMO_DIR)/gen-demo-audio.py $(if $(FORCE),--force,)
	cd $(DEMO_DIR) && bash assemble.sh

# Terminal segments only → concatenated video (no browser, no audio)
demo-quick:
	cd $(DEMO_DIR) && python3 terminal-segments.py && bash assemble.sh

# ── Demo 2: LeftGlove + OpenClaw hype demo (Amazon + Campsite) ──────────

# Record browser segments via Playwright (requires sieve running)
demo2-browser:
	cd $(DEMO2_DIR) && npm install --silent && npx playwright test --config playwright.config.ts

# Generate TTS audio from narration script (requires Fish Speech)
demo2-audio:
	cd /home/login/PycharmProjects/chat_reader_zonos && \
	  source .venv/bin/activate && \
	  python $(CURDIR)/$(DEMO2_DIR)/gen-demo-audio.py

# Full pipeline: browser recording + audio → demo2-final.mp4
demo2-final: demo2-browser demo2-audio
	cd $(DEMO2_DIR) && bash assemble.sh

# Regenerate audio + re-assemble (no re-record)
demo2-rebuild:
	cd /home/login/PycharmProjects/chat_reader_zonos && \
	  source .venv/bin/activate && \
	  python $(CURDIR)/$(DEMO2_DIR)/gen-demo-audio.py $(if $(FORCE),--force,)
	cd $(DEMO2_DIR) && bash assemble.sh

# Assemble only (no re-record, no re-generate audio)
demo2-quick:
	cd $(DEMO2_DIR) && bash assemble.sh
