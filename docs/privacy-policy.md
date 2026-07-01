# Privacy Policy — Udemy AI Translator

**Last updated:** July 1, 2026

Udemy AI Translator ("the Extension") is a browser extension that translates Udemy
lecture captions in real time using an AI translation provider that **you** choose
and configure. This policy explains what data the Extension handles, where it goes,
and how it is stored.

**Summary:** The Extension does **not** collect, sell, or send any of your data to
the developer. It has no analytics, tracking, or advertising. All settings and cached
translations stay on your device. Caption text is sent only to the translation
provider you select, solely to produce translations.

---

## 1. Data the Extension handles

The Extension processes the following data locally on your device:

- **Caption text.** WebVTT subtitle text from the Udemy lecture you are watching, so
  it can be translated.
- **Lecture context.** The course identifier (from the page URL), lecture title, and
  section title. This is sent alongside caption text as context to improve translation
  quality.
- **Your API key / endpoint.** The API key or local endpoint URL you enter for your
  chosen translation provider (Anthropic Claude, Google Gemini, or a local Claude Code
  proxy).
- **Display preferences.** Font size, colors, display mode, target language, and
  similar settings.

The Extension does **not** access your browsing history, cookies, passwords, or any
sites other than Udemy lecture pages (`https://www.udemy.com/course/*/learn/*`).

## 2. How data is used and where it goes

- **Translation.** Caption text and lecture context are sent **only** to the
  translation provider you have configured, and **only** to perform translation:
  - Anthropic Claude API — `https://api.anthropic.com`
  - Google Gemini API — `https://generativelanguage.googleapis.com`
  - A local Claude Code proxy you run yourself — `http://localhost` (data never leaves
    your machine)

  Your API key is sent to the corresponding provider **only** for authentication.

- **No developer collection.** None of this data is ever sent to, stored by, or
  accessible to the developer of the Extension. The Extension contains no analytics,
  telemetry, tracking, or advertising code.

- **Third-party providers.** When you use a cloud provider (Anthropic or Google), the
  data you send is handled under that provider's own terms and privacy policy. Please
  review them:
  - Anthropic: https://www.anthropic.com/legal/privacy
  - Google: https://policies.google.com/privacy

  If you use the local Claude Code proxy option, no caption data leaves your device.

## 3. Data storage

All data is stored **locally on your device** using the browser's extension storage
(`chrome.storage.local`):

- Your API keys and settings.
- A cache of previously translated captions, kept so the same lecture does not need to
  be re-translated (this is why the Extension requests the `unlimitedStorage`
  permission).

This data is never transmitted to the developer or any server other than the
translation provider described above.

## 4. Your choices and control

- **Manage the cache.** You can view, search, and delete cached translations
  (individually, by section, by course, or all at once) from the Extension's cache
  management screen.
- **Remove your keys.** You can clear or change your API keys at any time in the
  Extension's settings.
- **Uninstall.** Uninstalling the Extension removes all locally stored data, including
  API keys and cached translations.

## 5. Data security

API keys and settings are stored using the browser's standard extension storage.
Network requests to cloud providers are made over HTTPS. Requests to a local proxy use
`http://localhost`, which does not leave your computer. Because API keys are stored
locally in plain form (as is standard for browser extensions), you should only install
the Extension on a device you trust.

## 6. Children's privacy

The Extension is not directed to children and does not knowingly collect any personal
information from anyone, including children.

## 7. Changes to this policy

This policy may be updated from time to time. Material changes will be reflected by
updating the "Last updated" date above and, where appropriate, the Extension's store
listing.

## 8. Contact

If you have questions about this policy, contact:

**Email:** garamcareer@gmail.com

---

### Appendix: Permission justifications

- **`storage` / `unlimitedStorage`** — Store your settings and cache translated
  captions locally so lectures are not re-translated unnecessarily.
- **`activeTab`** — Detect whether the active tab is a Udemy lecture page and send it
  instructions (e.g., re-translate) when you open the popup.
- **Host access to `api.anthropic.com`, `generativelanguage.googleapis.com`,
  `localhost`** — Send caption text to the translation provider you select.
- **Content scripts limited to `https://www.udemy.com/course/*/learn/*`** — The
  Extension runs only on Udemy lecture pages and nowhere else.
