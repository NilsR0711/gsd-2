/**
 * Model definitions for the Claude Code CLI provider.
 *
 * Costs are zero because inference is covered by the user's Claude Code
 * subscription. The SDK's `result` message still provides token counts
 * for display in the TUI.
 */

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export const CLAUDE_CODE_MODELS = [
	{
		id: "claude-opus-4-20250514",
		name: "Claude Opus 4 (via Claude Code)",
		reasoning: true,
		input: ["text", "image"] as ("text" | "image")[],
		cost: ZERO_COST,
		contextWindow: 200_000,
		maxTokens: 32_768,
	},
	{
		id: "claude-sonnet-4-20250514",
		name: "Claude Sonnet 4 (via Claude Code)",
		reasoning: true,
		input: ["text", "image"] as ("text" | "image")[],
		cost: ZERO_COST,
		contextWindow: 200_000,
		maxTokens: 16_384,
	},
	{
		id: "claude-haiku-4-5-20251001",
		name: "Claude Haiku 4.5 (via Claude Code)",
		reasoning: false,
		input: ["text", "image"] as ("text" | "image")[],
		cost: ZERO_COST,
		contextWindow: 200_000,
		maxTokens: 8_192,
	},
];
