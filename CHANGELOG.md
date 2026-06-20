# Changelog

## 0.2.0 — 2026-06-20

- **Deprecate `qwenChatTemplateFlag`.** pi now owns `chat_template_kwargs`
  natively: `thinkingFormat: "qwen-chat-template"` emits
  `{ enable_thinking, preserve_thinking: true }`, and the new
  `"chat-template"` format declares arbitrary kwargs via
  `compat.chatTemplateKwargs`. The old flag did a wholesale *replace* of
  that object, silently dropping pi's `preserve_thinking: true` default
  (the field Qwen needs for consistent multi-turn / post-compaction
  reasoning).
- The flag is now stripped from the request body and ignored, with a
  one-time warning per model pointing at the native config. Migrate
  thinking control to `compat.chatTemplateKwargs` in `models.json`.
- Sampling injection (`temperature`, `top_p`, `top_k`, `min_p`,
  `presence_penalty`, `frequency_penalty`, `repetition_penalty`, and any
  forward-compat field) is unchanged — still the extension's sole job.

## 0.1.0 — 2026-05-12

- Initial release.
- Inject per-model sampling params (`temperature`, `top_p`, `top_k`, `min_p`,
  `presence_penalty`, `frequency_penalty`, `repetition_penalty`) into
  chat-completions payloads via the `before_provider_request` hook.
- `qwenChatTemplateFlag` — replaces `chat_template_kwargs` with a single key
  (`preserve_thinking` or `enable_thinking`) for Qwen-style local servers.
- Config sourced from `~/.pi/agent/models.json` (provider-level + per-model
  overrides). Per-model wins over provider-level defaults.
- Any additional field placed in a `sampling` block is forwarded to the
  chat-completions body as-is (forward-compat for new vLLM/MLX params).
