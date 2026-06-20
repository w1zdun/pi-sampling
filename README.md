# @w1zdun/pi-sampling

Per-model sampling params for [pi](https://pi.dev) custom providers using
the `openai-completions` API — `temperature`, `top_p`, `top_k`, `min_p`,
`presence_penalty`, `frequency_penalty`, `repetition_penalty`.

**Universal — works with any provider that uses `api: "openai-completions"`.**
Drop a `sampling` block into any provider in `~/.pi/agent/models.json` and
the matching fields are injected into every chat-completions request for
that provider's models. Not tied to any specific model family.

```json
"my-provider": {
  "baseUrl": "http://localhost:8000/v1",
  "api": "openai-completions",
  "apiKey": "ollama",
  "sampling": {
    "temperature": 0.6,
    "top_p": 0.95,
    "top_k": 20,
    "min_p": 0.0,
    "presence_penalty": 0.0,
    "repetition_penalty": 1.0
  },
  "models": [ ... ]
}
```

## Why

pi's built-in `openai-completions` payload builder forwards only
`temperature` and `max_tokens` from options. Fields that vLLM, MLX-LM,
llama.cpp server, SGLang, Together AI, Fireworks AI, OpenRouter, etc.
accept as OpenAI-extension parameters — `top_k`, `min_p`,
`repetition_penalty`, `frequency_penalty`, `presence_penalty` — are never
serialized.

This extension fixes that by hooking pi's `before_provider_request` event
and merging your declared `sampling` block into the outgoing request body
just before it's sent. No `streamSimple` reimplementation, no
monkey-patching — pi's stock streaming, tool calling, thinking, abort
handling, retries all stay untouched. In particular, this extension no
longer touches `chat_template_kwargs` — pi now owns that field natively
(see [Thinking / `chat_template_kwargs`](#thinking--chat_template_kwargs)).

## Install

```bash
pi install npm:@w1zdun/pi-sampling           # global (default)
pi install -l npm:@w1zdun/pi-sampling        # project-local
pi -e npm:@w1zdun/pi-sampling                # try once, no install
pi install git:github.com/w1zdun/pi-sampling # alternative source
```

Global install writes to `~/.pi/agent/settings.json`. Project install
writes to `.pi/settings.json` in the current directory.

## Configure

Add a `sampling` block to any provider in `~/.pi/agent/models.json`.
Provider-level fields are defaults; per-model `sampling` (inside a model
entry) overrides them field-by-field.

### Minimal example

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "sampling": { "temperature": 0.7, "top_k": 40, "min_p": 0.05 },
      "models": [{ "id": "llama3.1:8b" }]
    }
  }
}
```

### Recommended values for Qwen 3.6

Per the Qwen 3.6 model cards on HuggingFace
([35B-A3B](https://huggingface.co/Qwen/Qwen3.6-35B-A3B),
[27B](https://huggingface.co/Qwen/Qwen3.6-27B)):

| Use case                       | temperature | top_p | top_k | min_p | presence_penalty | repetition_penalty |
| ------------------------------ | ----------- | ----- | ----- | ----- | ---------------- | ------------------ |
| Thinking / reasoning (35B-A3B) | 0.6         | 0.95  | 20    | 0     | 0                | 1.0                |
| Non-thinking / instruct        | 1.0         | 1.0   | 20    | 0     | 2.0              | 1.0                |
| Vision (27B)                   | 0.7         | 0.8   | 20    | 0     | 1.5              | 1.0                |

### Full example — Qwen 3.6 thinking + vision

```json
{
  "providers": {
    "qwen-text": {
      "baseUrl": "http://localhost:8000/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false,
        "maxTokensField": "max_tokens"
      },
      "sampling": {
        "temperature": 0.6,
        "top_p": 0.95,
        "top_k": 20,
        "min_p": 0.0,
        "presence_penalty": 0.0,
        "repetition_penalty": 1.0
      },
      "models": [
        {
          "id": "Qwen3.6-35B-A3B",
          "name": "Qwen3.6-35B-A3B",
          "input": ["text", "image"],
          "contextWindow": 262144,
          "maxTokens": 65536,
          "reasoning": true,
          "thinkingFormat": "qwen-chat-template",
          "thinkingLevelMap": {
            "off": "false",
            "minimal": null,
            "low": null,
            "medium": null,
            "high": "true",
            "xhigh": null
          },
          "compat": { "supportsDeveloperRole": true }
        }
      ]
    },
    "qwen-vision": {
      "baseUrl": "http://localhost:8001/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false,
        "maxTokensField": "max_tokens"
      },
      "sampling": {
        "temperature": 0.7,
        "top_p": 0.8,
        "top_k": 20,
        "min_p": 0.0,
        "presence_penalty": 1.5,
        "repetition_penalty": 1.0
      },
      "models": [
        {
          "id": "Qwen3.6-27B-vision",
          "name": "Qwen3.6-27B-vision",
          "input": ["text", "image"],
          "contextWindow": 130572,
          "maxTokens": 65536,
          "reasoning": true,
          "thinkingFormat": "qwen-chat-template",
          "thinkingLevelMap": {
            "off": "false",
            "minimal": null,
            "low": null,
            "medium": null,
            "high": "true",
            "xhigh": null
          },
          "compat": { "supportsDeveloperRole": true }
        }
      ]
    }
  }
}
```

Replace `localhost` URLs with your actual vLLM / MLX-LM / llama.cpp server
addresses. The extension does not care what `baseUrl` points to as long as
it speaks OpenAI Chat Completions.

### Per-model override

Two models in the same provider with different sampling:

```json
"models": [
  {
    "id": "Qwen3.6-35B-A3B",
    "sampling": { "temperature": 0.6 }
  },
  {
    "id": "Qwen3.6-coder-30B",
    "sampling": { "temperature": 0.2, "top_p": 0.5 }
  }
]
```

Per-model `sampling` is merged with provider-level `sampling`. Model wins
field-by-field — model `temperature: 0.2` overrides provider
`temperature: 0.6`, but other provider-level fields (`top_k`, `min_p`,
etc.) still apply.

## Supported parameters

| Field                          | Type    | Effect                                                                                                                                                                                                                                |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `temperature`                  | number  | Top-level `temperature` in chat-completions body.                                                                                                                                                                                     |
| `top_p`                        | number  | Top-level `top_p`.                                                                                                                                                                                                                    |
| `top_k`                        | number  | Top-level `top_k`. Not in OpenAI spec; accepted by vLLM, MLX-LM, llama.cpp, SGLang.                                                                                                                                                   |
| `min_p`                        | number  | Top-level `min_p`. Same compatibility caveat as `top_k`.                                                                                                                                                                              |
| `presence_penalty`             | number  | Top-level `presence_penalty`.                                                                                                                                                                                                         |
| `frequency_penalty`            | number  | Top-level `frequency_penalty`.                                                                                                                                                                                                        |
| `repetition_penalty`           | number  | Top-level `repetition_penalty`. Accepted by vLLM, MLX-LM, llama.cpp, SGLang.                                                                                                                                                          |
| `qwenChatTemplateFlag`         | string  | **Deprecated — ignored.** Stripped from the body (with a one-time warning) so it can't leak as a bogus field. pi owns `chat_template_kwargs` natively now; see below.                                                                  |
| _(any other field)_            | any     | Forwarded to the top-level body as-is. Forward-compat for new vLLM/MLX params without needing an extension update.                                                                                                                    |

### Thinking / `chat_template_kwargs`

**This extension no longer manages `chat_template_kwargs`.** pi owns it
natively, and the old `qwenChatTemplateFlag` (which did a wholesale
*replace*) silently dropped pi's `preserve_thinking: true` default — the
field Qwen needs on for consistent multi-turn / post-compaction reasoning.
If the key is still in your config it is stripped and ignored, with a
one-time warning per model.

Configure thinking on the **model** instead, via `compat` in
`~/.pi/agent/models.json`:

```jsonc
// Template honors both keys — pi emits { enable_thinking, preserve_thinking: true }:
"compat": { "thinkingFormat": "qwen-chat-template" }

// Template honors only specific keys — declare exactly what to send:
"compat": {
  "thinkingFormat": "chat-template",
  "chatTemplateKwargs": { "enable_thinking": { "$var": "thinking.enabled" } }
}
```

`{ "$var": "thinking.enabled" }` resolves to pi's reasoning-effort state;
`{ "$var": "thinking.effort", "omitWhenOff": true }` maps the effort level
and drops the key when thinking is off. The `qwen-chat-template` format is
the shortcut for the common Qwen case and keeps `preserve_thinking` on.

## Compatibility

- **API**: requires `api: "openai-completions"` in the provider config.
  Other pi-ai APIs (`anthropic-messages`, `openai-responses`,
  `mistral-conversations`, `google-generative-ai`, …) have their own
  payload builders and are out of scope.
- **Servers**: any OpenAI-compatible endpoint. Tested patterns: vLLM,
  LM Studio, llama.cpp server, Ollama, MLX-LM, SGLang, Together AI,
  Fireworks AI, OpenRouter.
- **Models**: any model. The sampling fields are universal — Qwen, Llama,
  DeepSeek, Mistral, gpt-oss, etc. The extension is no longer Qwen-specific
  in any way.
- **pi version**: works on any pi with the `before_provider_request` event.
  Native `chat_template_kwargs` control (`qwen-chat-template`,
  `chat-template`) requires a recent pi; for `chat-template` specifically,
  pi with chat-template thinking compat.

## How it works

The extension subscribes to pi's documented `before_provider_request`
event, which fires after the payload is built and just before the HTTP
request is sent. The handler is scoped by `ctx.model.provider/id`: only
providers/models that declare a `sampling` block are touched. For each
matching request the handler merges sampling fields into the top-level
body. It does not touch `chat_template_kwargs` — pi builds that itself.
Pi's built-in streaming, tool-call handling, abort, retries are not
touched.

Source: [`./.pi/extensions/pi-sampling.ts`](./.pi/extensions/pi-sampling.ts).

## Upgrading from a local install

If you previously copied `pi-sampling.ts` manually into
`~/.pi/agent/extensions/`, remove that file before installing the package
to avoid loading the extension twice:

```bash
rm ~/.pi/agent/extensions/pi-sampling.ts
pi install npm:@w1zdun/pi-sampling
```

Your existing `~/.pi/agent/models.json` (with `sampling` blocks) requires
no changes — the package reads the same file the same way.

## Links

- pi docs: [extensions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md), [packages](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md), [models](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/models.md), [custom providers](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/custom-provider.md)
- Qwen 3.6 model cards: [35B-A3B](https://huggingface.co/Qwen/Qwen3.6-35B-A3B), [27B](https://huggingface.co/Qwen/Qwen3.6-27B)
- Package source: [github.com/w1zdun/pi-sampling](https://github.com/w1zdun/pi-sampling)

## License

[MIT](./LICENSE)
