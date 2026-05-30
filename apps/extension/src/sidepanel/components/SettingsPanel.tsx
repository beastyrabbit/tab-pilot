import type {
	GroupTitleLength,
	ModelInfo,
	PublicSettings,
	ServiceTier,
	ThinkingLevel,
} from "@tab-orga/shared";
import { useEffect, useReducer } from "react";
import { serverApi } from "../services/serverApi.js";

interface SettingsPanelProps {
	settings: PublicSettings | null;
	testMode: boolean;
	onToggleTestMode: () => void;
	onUpdate: (partial: Partial<PublicSettings>) => Promise<PublicSettings>;
	onClose: () => void;
}

const THINKING_OPTIONS: Array<{ value: ThinkingLevel; label: string }> = [
	{ value: "minimal", label: "Minimal" },
	{ value: "low", label: "Low" },
	{ value: "medium", label: "Medium" },
	{ value: "high", label: "High" },
	{ value: "xhigh", label: "Extra High" },
];

const SERVICE_TIER_OPTIONS: Array<{ value: ServiceTier; label: string }> = [
	{ value: "flex", label: "Economy" },
	{ value: "default", label: "Standard" },
	{ value: "priority", label: "Priority" },
];

const TITLE_LENGTH_OPTIONS: Array<{ value: GroupTitleLength; label: string }> = [
	{ value: "short", label: "Short" },
	{ value: "medium", label: "Medium" },
	{ value: "long", label: "Long" },
];

const DEFAULT_MODEL = "gpt-5.3-codex";

interface SettingsFormState {
	model: string;
	generalPrompt: string;
	organizationThinking: ThinkingLevel;
	summaryThinking: ThinkingLevel;
	serviceTier: ServiceTier;
	groupTitleLength: GroupTitleLength;
	models: ModelInfo[];
	saving: boolean;
	error: string | null;
}

type SettingsFormAction =
	| { type: "model"; value: string }
	| { type: "generalPrompt"; value: string }
	| { type: "organizationThinking"; value: ThinkingLevel }
	| { type: "summaryThinking"; value: ThinkingLevel }
	| { type: "serviceTier"; value: ServiceTier }
	| { type: "groupTitleLength"; value: GroupTitleLength }
	| { type: "models"; value: ModelInfo[] }
	| { type: "saving"; value: boolean }
	| { type: "error"; value: string | null };

function createSettingsFormState(settings: PublicSettings | null): SettingsFormState {
	const model = settings?.model || DEFAULT_MODEL;
	return {
		model,
		generalPrompt: settings?.generalPrompt || "",
		organizationThinking: settings?.organizationThinking || "xhigh",
		summaryThinking: settings?.summaryThinking || "medium",
		serviceTier: settings?.serviceTier || "default",
		groupTitleLength: settings?.groupTitleLength || "medium",
		models: [{ id: model, name: model }],
		saving: false,
		error: null,
	};
}

function settingsFormReducer(
	state: SettingsFormState,
	action: SettingsFormAction,
): SettingsFormState {
	switch (action.type) {
		case "model":
			return { ...state, model: action.value };
		case "generalPrompt":
			return { ...state, generalPrompt: action.value };
		case "organizationThinking":
			return { ...state, organizationThinking: action.value };
		case "summaryThinking":
			return { ...state, summaryThinking: action.value };
		case "serviceTier":
			return { ...state, serviceTier: action.value };
		case "groupTitleLength":
			return { ...state, groupTitleLength: action.value };
		case "models":
			return { ...state, models: action.value };
		case "saving":
			return { ...state, saving: action.value };
		case "error":
			return { ...state, error: action.value };
	}
}

export function SettingsPanel({
	settings,
	testMode,
	onToggleTestMode,
	onUpdate,
	onClose,
}: SettingsPanelProps) {
	const [form, dispatch] = useReducer(settingsFormReducer, settings, createSettingsFormState);

	useEffect(() => {
		serverApi
			.getModels()
			.then((res) => {
				if (res.models.length > 0) dispatch({ type: "models", value: res.models });
			})
			.catch(() => {});
	}, []);

	const handleSave = async () => {
		dispatch({ type: "saving", value: true });
		dispatch({ type: "error", value: null });
		try {
			await onUpdate({
				model: form.model,
				generalPrompt: form.generalPrompt,
				organizationThinking: form.organizationThinking,
				summaryThinking: form.summaryThinking,
				serviceTier: form.serviceTier,
				groupTitleLength: form.groupTitleLength,
			});
			onClose();
		} catch (saveError) {
			dispatch({
				type: "error",
				value: saveError instanceof Error ? saveError.message : "Failed to save settings",
			});
		} finally {
			dispatch({ type: "saving", value: false });
		}
	};

	return (
		<div className="fixed inset-0 bg-black/30 flex items-start justify-center pt-4 z-50">
			<div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-3 max-h-[90vh] overflow-y-auto p-4">
				<h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-4">Settings</h2>

				<div className="space-y-4">
					<div>
						<label
							htmlFor="model-select"
							className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Model
						</label>
						<select
							id="model-select"
							value={form.model}
							onChange={(e) => dispatch({ type: "model", value: e.target.value })}
							className="mt-1 w-full px-2.5 py-2 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
						>
							{form.models.map((m) => (
								<option key={m.id} value={m.id}>
									{m.name}
								</option>
							))}
						</select>
					</div>

					<div>
						<label
							htmlFor="general-prompt"
							className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							General Behavior
						</label>
						<p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 mb-1">
							Guide how tabs are organized. e.g., "homelab would be a good group", "keep gaming
							separate from media"
						</p>
						<textarea
							id="general-prompt"
							value={form.generalPrompt}
							onChange={(e) => dispatch({ type: "generalPrompt", value: e.target.value })}
							placeholder="Enter general instructions for the AI organizer..."
							rows={4}
							className="w-full px-2.5 py-2 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-400 resize-none"
						/>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div>
							<label
								htmlFor="organization-thinking"
								className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
							>
								Organization Thinking
							</label>
							<select
								id="organization-thinking"
								value={form.organizationThinking}
								onChange={(e) =>
									dispatch({
										type: "organizationThinking",
										value: e.target.value as ThinkingLevel,
									})
								}
								className="mt-1 w-full px-2.5 py-2 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
							>
								{THINKING_OPTIONS.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</div>

						<div>
							<label
								htmlFor="summary-thinking"
								className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
							>
								Summary Thinking
							</label>
							<select
								id="summary-thinking"
								value={form.summaryThinking}
								onChange={(e) =>
									dispatch({
										type: "summaryThinking",
										value: e.target.value as ThinkingLevel,
									})
								}
								className="mt-1 w-full px-2.5 py-2 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
							>
								{THINKING_OPTIONS.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</div>
					</div>

					<div>
						<label
							htmlFor="service-tier"
							className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Speed
						</label>
						<select
							id="service-tier"
							value={form.serviceTier}
							onChange={(e) =>
								dispatch({ type: "serviceTier", value: e.target.value as ServiceTier })
							}
							className="mt-1 w-full px-2.5 py-2 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
						>
							{SERVICE_TIER_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</div>

					<div>
						<label
							htmlFor="group-title-length"
							className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Group Title Length
						</label>
						<select
							id="group-title-length"
							value={form.groupTitleLength}
							onChange={(e) =>
								dispatch({
									type: "groupTitleLength",
									value: e.target.value as GroupTitleLength,
								})
							}
							className="mt-1 w-full px-2.5 py-2 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
						>
							{TITLE_LENGTH_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</div>

					<div className="flex items-center justify-between">
						<div>
							<div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
								Test Mode
							</div>
							<div className="text-[10px] text-gray-400 dark:text-gray-500">
								Disables Apply; everything else works normally
							</div>
						</div>
						<button
							type="button"
							aria-label={testMode ? "Disable test mode" : "Enable test mode"}
							onClick={onToggleTestMode}
							className={`relative w-10 h-5.5 rounded-full transition-colors ${
								testMode ? "bg-amber-500" : "bg-gray-300 dark:bg-gray-600"
							}`}
						>
							<span
								className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white transition-transform ${
									testMode ? "translate-x-5" : ""
								}`}
							/>
						</button>
					</div>

					{form.error && <div className="text-xs text-red-600 dark:text-red-400">{form.error}</div>}
				</div>

				<div className="flex gap-2 mt-5">
					<button
						type="button"
						onClick={onClose}
						className="flex-1 px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleSave}
						disabled={form.saving}
						className="flex-1 px-3 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
					>
						{form.saving ? "Saving..." : "Save"}
					</button>
				</div>
			</div>
		</div>
	);
}
