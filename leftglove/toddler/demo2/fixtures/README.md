# Demo 2 Fixtures

Pre-classified sieve data for the hype demo video. These are created manually
by a human using the Toddler Loop UI, then exported here.

## Required files

- `amazon-product.json` — Amazon product page, fully classified + named
- `campsite-booking.json` — Reserve California booking form, fully classified + named

## How to create

1. Start services: `bin/demo-run`
2. Open TL UI: http://localhost:8080?api=http://localhost:3333
3. Navigate to the target URL
4. Run sieve (btn-navigate)
5. Pass 1: classify every element (c=clickable, t=typable, r=readable, x=chrome, .=skip)
6. Pass 2: name key elements with glossary names matching the demo script:

   **Amazon** — name these elements:
   - `add-to-cart` (clickable)
   - `price` (readable)
   - `quantity-selector` (selectable)

   **Campsite** — name these elements:
   - `park-selector` (selectable)
   - `arrival-date` (typable)
   - `departure-date` (typable)
   - `campsite-type` (selectable)
   - `search-button` (clickable)

7. Export: click Export button, save to this directory with the correct filename

## Format

Standard sieve intermediate format (same as TL UI export):
```json
{
  "sieve-version": "...",
  "source": {
    "url": "...",
    "viewport": { "w": 1920, "h": 1080 },
    "screenshot": "<base64 PNG>"
  },
  "elements": [
    {
      "tag": "button",
      "rect": { "x": 100, "y": 200, "w": 150, "h": 40 },
      "category": "clickable",
      "glossary-name": "add-to-cart",
      "glossary-intent": "Amazon",
      ...
    }
  ]
}
```
