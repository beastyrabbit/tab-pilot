# Organization strategy

## What existing organizers do

The public implementations reviewed on 2026-09-16 mostly use one batch categorization request:

- [auto-tab-grouper](https://github.com/ajinkya8010/auto-tab-grouper) sends titles, URLs, keywords, and descriptions to one LLM request. It offers passive and aggressive modes and leaves existing groups intact.
- [Clutterless](https://github.com/srikanthjg/Clutterless) describes batch processing for 50+ tabs, metadata previews, and a review-oriented grouping flow.
- [TabOrg](https://github.com/chen-ye/taborg) emphasizes selecting tabs, showing suggestions, and applying them manually. Its MCP integration is for external control, not a council of models.
- [TabBrain](https://github.com/ndg8743/TabBrain) describes a batch categorization request plus deterministic browser operations and duplicate detection.
- [TidyTabs](https://github.com/TheVerwalter/TidyTabs) sends a deliberately small payload per tab, then applies one categorization response. It avoids page bodies and screenshots by default.
- [tab-organizer](https://github.com/edward-arinin-web-dev/tab-organizer) uses a tiered local strategy: cheap rules first, then local model assistance when available. Its deduplication is deterministic before any AI judgment.
- [Browser Organizer](https://github.com/LUSKTECH/browser-organizer) uses a local helper to call a selected CLI or OpenAI-compatible backend and keeps changes behind user approval.

No reviewed organizer uses a multi-model council for ordinary tab grouping. The common quality controls are better input selection, deterministic rules, review before applying, and explicit aggressive/passive modes.

## Our approach

Tab Organizer uses one final grouping request, but it does not give every page the same amount of context:

1. Every tab contributes its title, URL, current group, and tab ID.
2. Every tab gets a fast metadata read.
3. Ambiguous tabs can receive a short page-text excerpt. The organizer caps these deeper reads at 24 per run.
4. The model receives existing groups, starred fixed groups, user policy settings, and the tab evidence in one request.
5. The extension validates tab IDs, removes duplicates from the response, protects fixed groups, and applies changes only after review.

This avoids a slow model call for each tab, keeps the final grouping decision globally consistent, and still gives unclear pages more evidence. Screenshots remain opt-in future evidence for visual tasks; they are not useful default input for ordinary topic grouping.

A second model or council would add latency and cost without giving the model better browser evidence. If evaluation later shows systematic mistakes, the first improvement should be a deterministic pre-pass or a targeted second pass for only low-confidence groups, measured against a fixture set.
