# Changelog

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
