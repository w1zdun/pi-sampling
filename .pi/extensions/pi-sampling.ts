// pi-sampling — per-model sampling params for pi's openai-completions providers.
//
// Complements custom providers declared in ~/.pi/agent/models.json. Reads a
// `sampling` block (at provider and/or model level) from that same file and
// injects it into the outgoing chat-completions body via the
// `before_provider_request` event. Adds fields that pi's built-in payload
// builder does not emit: top_k, min_p, repetition_penalty, plus the standard
// OpenAI sampling fields when you want explicit per-model defaults.
//
// Per-model `sampling` overrides win over provider-level defaults. The handler
// is scoped to providers/models that declare a `sampling` block — other models
// are untouched. Config files are re-read when their mtime changes, so edits
// take effect without restarting pi.
//
// Control keys (filtered out before the top-level spread):
//
//   qwenChatTemplateFlag: <string>
//     For models that use compat.thinkingFormat: "qwen-chat-template". Pi
//     defaults to chat_template_kwargs: { enable_thinking, preserve_thinking }.
//     Setting this flag REPLACES that object with { [flag]: true } — useful
//     for chat templates that only honor one of these keys.

import fs from "node:fs";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Sampling = {
	temperature?: number;
	top_p?: number;
	top_k?: number;
	min_p?: number;
	presence_penalty?: number;
	frequency_penalty?: number;
	repetition_penalty?: number;
	qwenChatTemplateFlag?: string;
	[extra: string]: unknown;
};

type PiModelEntry = { id: string; sampling?: Sampling; [k: string]: unknown };
type PiProviderEntry = { models?: PiModelEntry[]; sampling?: Sampling; [k: string]: unknown };
type PiModelsConfig = { providers?: Record<string, PiProviderEntry> };

// String-aware stripper for JSON-with-comments. Tracks `"..."` boundaries so
// `//` and `/* */` inside string values are preserved, then does a second
// string-aware pass to drop trailing commas before `}` / `]`.
function stripJsonComments(s: string): string {
	let out = "";
	let i = 0;
	let inString = false;
	while (i < s.length) {
		const ch = s[i];
		if (inString) {
			out += ch;
			if (ch === "\\" && i + 1 < s.length) {
				out += s[i + 1];
				i += 2;
				continue;
			}
			if (ch === '"') inString = false;
			i++;
			continue;
		}
		if (ch === '"') {
			inString = true;
			out += ch;
			i++;
			continue;
		}
		if (ch === "/" && s[i + 1] === "/") {
			while (i < s.length && s[i] !== "\n") i++;
			continue;
		}
		if (ch === "/" && s[i + 1] === "*") {
			i += 2;
			while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++;
			i = Math.min(i + 2, s.length);
			continue;
		}
		out += ch;
		i++;
	}

	let result = "";
	i = 0;
	inString = false;
	while (i < out.length) {
		const ch = out[i];
		if (inString) {
			result += ch;
			if (ch === "\\" && i + 1 < out.length) {
				result += out[i + 1];
				i += 2;
				continue;
			}
			if (ch === '"') inString = false;
			i++;
			continue;
		}
		if (ch === '"') {
			inString = true;
			result += ch;
			i++;
			continue;
		}
		if (ch === ",") {
			let j = i + 1;
			while (
				j < out.length &&
				(out[j] === " " || out[j] === "\t" || out[j] === "\n" || out[j] === "\r")
			) j++;
			if (j < out.length && (out[j] === "}" || out[j] === "]")) {
				i++;
				continue;
			}
		}
		result += ch;
		i++;
	}
	return result;
}

const candidates: string[] = [];
if (process.env.HOME) {
	candidates.push(path.join(process.env.HOME, ".pi/agent/models.json"));
}
candidates.push(path.resolve(".pi/models.json"));

function fileSignature(): string {
	return candidates
		.map((f) => {
			try {
				return `${f}:${fs.statSync(f).mtimeMs}`;
			} catch {
				return `${f}:-`;
			}
		})
		.join("|");
}

function loadSamplingIndex(): Map<string, Sampling> {
	const index = new Map<string, Sampling>();
	for (const file of candidates) {
		if (!fs.existsSync(file)) continue;
		let cfg: unknown;
		try {
			cfg = JSON.parse(stripJsonComments(fs.readFileSync(file, "utf-8")));
		} catch (err) {
			console.warn(`[pi-sampling] failed to parse ${file}: ${(err as Error).message}`);
			continue;
		}
		if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) continue;
		const providers = (cfg as PiModelsConfig).providers ?? {};
		for (const [providerName, provider] of Object.entries(providers)) {
			const providerDefaults = provider.sampling ?? {};
			for (const model of provider.models ?? []) {
				if (typeof model.id !== "string" || model.id.length === 0) {
					console.warn(
						`[pi-sampling] skipping model with missing/empty id under provider ${providerName} in ${file}`,
					);
					continue;
				}
				const merged = { ...providerDefaults, ...(model.sampling ?? {}) };
				if (Object.keys(merged).length === 0) continue;
				index.set(`${providerName}/${model.id}`, merged);
			}
		}
	}
	return index;
}

let cachedSignature = "";
let cachedIndex = new Map<string, Sampling>();

function getSamplingIndex(): Map<string, Sampling> {
	const sig = fileSignature();
	if (sig !== cachedSignature) {
		cachedIndex = loadSamplingIndex();
		cachedSignature = sig;
	}
	return cachedIndex;
}

export default function (pi: ExtensionAPI) {
	pi.on("before_provider_request", (event, ctx) => {
		const model = ctx.model;
		if (!model) return;
		const extras = getSamplingIndex().get(`${model.provider}/${model.id}`);
		if (
			!extras ||
			!event.payload ||
			typeof event.payload !== "object" ||
			Array.isArray(event.payload)
		) {
			return;
		}

		const { qwenChatTemplateFlag, ...topLevelExtras } = extras;
		const next: Record<string, unknown> = {
			...(event.payload as Record<string, unknown>),
			...topLevelExtras,
		};

		if (typeof qwenChatTemplateFlag === "string" && qwenChatTemplateFlag.length > 0) {
			next.chat_template_kwargs = { [qwenChatTemplateFlag]: true };
		}

		return next;
	});
}
