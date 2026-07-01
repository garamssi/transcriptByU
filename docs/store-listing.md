# Chrome Web Store Listing — Udemy AI Translator (English)

Copy-paste content for the Chrome Web Store Developer Dashboard.

---

## Store listing tab

### Product name (max 75 chars)
```
Udemy AI Translator — Real-time Claude & Gemini subtitles
```

### Summary / short description (max 132 chars)
```
Translate Udemy captions in real time with your Claude or Gemini API key. Original+translation view, styling, per-lecture cache.
```

### Detailed description (max 16,000 chars)
```
Udemy AI Translator translates Udemy lecture captions into your language in real time.
It uses an AI translation provider that YOU configure with your own API key, and caption
data is sent only to the provider you choose.

■ Features
• Real-time subtitle translation — captions are translated automatically as you watch.
• Original + translation view — study with the source text and the translation side by side.
• Subtitle styling — adjust font size, color, and background to your taste.
• Per-lecture cache — each lecture is translated only once, so it's fast and saves cost.
• Cache management — search, select, and delete cached translations by course, section, or lecture.
• Re-translate current captions — request a fresh translation whenever you want.

■ Supported providers (bring your own API key)
• Anthropic Claude API
• Google Gemini API
• Claude Code (when running a local proxy)

■ How to use
1) Click the extension icon to set your provider, API key, and target language.
2) Open a Udemy lecture transcript — captions are translated automatically.

■ Privacy
The developer does not collect or sell any data. There is no tracking and no ads.
All settings and the translation cache are stored only on your device. Caption text is
sent solely to the translation provider you select, only to perform translation.
See the privacy policy for details.

Note: This extension does not provide its own translation server. Translation requires
your own API key from the provider you choose.
```

### Category
```
Education
```
(Alternatives: Productivity / Workflow & Planning)

### Language
```
English
```
(You can add Korean — 한국어 — as an additional listing language for Korean users.)

---

## Images

| Asset | Size | Required | Notes |
|-------|------|----------|-------|
| Store icon | 128×128 PNG | Yes | use `icons/icon128.png` |
| Screenshot | 1280×800 (recommended) or 640×400, PNG/JPEG | Yes (≥1) | up to 5 |
| Small promo tile | 440×280 PNG/JPEG | Optional | improves discovery |
| Marquee promo | 1400×560 | Optional | |

Suggested 5 screenshots:
1. A lecture showing original + translation captions together
2. Popup settings — provider / model / target language
3. Subtitle style settings (font size & color)
4. Cache management — search results view
5. "Re-translate current captions" in action

Tip: capture/resize screenshots to exactly 1280×800, 24-bit PNG without alpha.

---

## URLs

- Homepage URL (Store listing, optional) — e.g., your GitHub repo
- Support URL (Store listing, optional) — e.g., GitHub Issues or a support email page
- Privacy policy URL (Privacy practices tab, REQUIRED) — a hosted URL of `docs/privacy-policy.md`

---

## Privacy practices tab (required to submit)

### Single purpose
```
Translate Udemy lecture captions in real time into the user's chosen language using an AI translation provider that the user configures.
```

### Permission justifications
- storage / unlimitedStorage:
```
Store user settings and cache translated captions locally so lectures are not re-translated unnecessarily.
```
- activeTab:
```
Detect whether the active tab is a Udemy lecture page and send it commands (e.g., re-translate) when the user opens the popup.
```
- Host access (api.anthropic.com, generativelanguage.googleapis.com, localhost):
```
Send caption text to the translation provider the user selects.
```

### Data usage disclosures
- Collected/transferred: **Website content** (caption text) — Yes
- Not sold to third parties — check
- Used only for the disclosed translation feature — check
- Not: personally identifiable info, financial info, health info, authentication info, location, personal communications

---

## Distribution tab
- Visibility: Public (or Unlisted while testing)
- Pricing: Free
- Regions: all, or select as desired

---

## Save draft & submit
- Use **Save draft** on each tab to save anytime (incomplete is fine).
- To **Submit for review**, you need at minimum: icon, ≥1 screenshot, summary, description,
  category, language, privacy policy URL, single purpose, permission justifications,
  data-usage disclosures, and the certification checkbox.
