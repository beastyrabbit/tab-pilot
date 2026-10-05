import type {
	GroupingMode,
	GroupTitleLength,
	ModelInfo,
	PublicSettings,
	ServiceTier,
	ThinkingLevel,
} from "@tab-orga/shared";
import { useEffect, useReducer, useRef, useState } from "react";
import { listProxyModels, proxyBaseUrl } from "../services/cliproxy.js";
import { RunHistory } from "./RunHistory.js";

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

function ChoiceMenu<T extends string>({
	id,
	value,
	options,
	onChange,
}: {
	id: string;
	value: T;
	options: Array<{ value: T; label: string }>;
	onChange: (value: T) => void;
}) {
	const [open, setOpen] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const selected = options.find((option) => option.value === value);
	return (
		<div className="relative mt-1 min-w-0">
			<button
				ref={buttonRef}
				type="button"
				id={id}
				aria-expanded={open}
				aria-haspopup="listbox"
				onClick={() => setOpen((current) => !current)}
				className="flex w-full min-w-0 items-center justify-between rounded-lg border px-2.5 py-2 text-left text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
			>
				<span className="truncate">{selected?.label ?? value}</span>
				<span aria-hidden="true">▾</span>
			</button>
			{open && (
				<div
					role="listbox"
					aria-labelledby={id}
					className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800"
				>
					{options.map((option) => (
						<button
							type="button"
							role="option"
							aria-selected={option.value === value}
							key={option.value}
							onClick={() => {
								onChange(option.value);
								setOpen(false);
								buttonRef.current?.focus();
							}}
							className={`block w-full px-3 py-2 text-left text-sm ${option.value === value ? "bg-blue-600 text-white" : "text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"}`}
						>
							{option.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

interface SettingsFormState {
	proxyUrl: string;
	proxyApiKey: string;
	model: string;
	generalPrompt: string;
	organizationThinking: ThinkingLevel;
	summaryThinking: ThinkingLevel;
	serviceTier: ServiceTier;
	groupTitleLength: GroupTitleLength;
	groupingMode: GroupingMode;
	preserveExistingGroups: boolean;
	allowRenameGroups: boolean;
	allowComplexTitles: boolean;
	allowAddToExistingGroups: boolean;
	keepUngroupedTabs: boolean;
	closeDuplicateTabs: boolean;
	keepNewestDuplicate: boolean;
	models: ModelInfo[];
	saving: boolean;
	error: string | null;
}

type SettingsFormAction =
	| { type: "model"; value: string }
	| { type: "proxyUrl"; value: string }
	| { type: "proxyApiKey"; value: string }
	| { type: "generalPrompt"; value: string }
	| { type: "organizationThinking"; value: ThinkingLevel }
	| { type: "summaryThinking"; value: ThinkingLevel }
	| { type: "serviceTier"; value: ServiceTier }
	| { type: "groupTitleLength"; value: GroupTitleLength }
	| { type: "groupingMode"; value: GroupingMode }
	| {
			type: "boolean";
			key:
				| "preserveExistingGroups"
				| "allowRenameGroups"
				| "allowComplexTitles"
				| "allowAddToExistingGroups"
				| "keepUngroupedTabs"
				| "closeDuplicateTabs"
				| "keepNewestDuplicate";
			value: boolean;
	  }
	| { type: "models"; value: ModelInfo[] }
	| { type: "saving"; value: boolean }
	| { type: "error"; value: string | null };

function createSettingsFormState(settings: PublicSettings | null): SettingsFormState {
	const model = settings?.model || DEFAULT_MODEL;
	return {
		proxyUrl: settings?.proxyUrl || "http://127.0.0.1:8317/v1",
		proxyApiKey: settings?.proxyApiKey || "",
		model,
		generalPrompt: settings?.generalPrompt || "",
		organizationThinking: settings?.organizationThinking || "low",
		summaryThinking: settings?.summaryThinking || "medium",
		serviceTier: settings?.serviceTier || "default",
		groupTitleLength: settings?.groupTitleLength || "medium",
		groupingMode: settings?.groupingMode || "soft",
		preserveExistingGroups: settings?.preserveExistingGroups ?? true,
		allowRenameGroups: settings?.allowRenameGroups ?? false,
		allowComplexTitles: settings?.allowComplexTitles ?? false,
		allowAddToExistingGroups: settings?.allowAddToExistingGroups ?? true,
		keepUngroupedTabs: settings?.keepUngroupedTabs ?? true,
		closeDuplicateTabs: settings?.closeDuplicateTabs ?? false,
		keepNewestDuplicate: settings?.keepNewestDuplicate ?? true,
		models: [],
		saving: false,
		error: null,
	};
}

function settingsFormReducer(
	state: SettingsFormState,
	action: SettingsFormAction,
): SettingsFormState {
	switch (action.type) {
		case "proxyUrl":
			return { ...state, proxyUrl: action.value };
		case "proxyApiKey":
			return { ...state, proxyApiKey: action.value };
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
		case "groupingMode":
			return { ...state, groupingMode: action.value };
		case "boolean":
			return { ...state, [action.key]: action.value };
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
	const [connection, setConnection] = useState({
		status: "idle",
		message: "Check the connection to load available models.",
	});
	const [modelOpen, setModelOpen] = useState(false);
	const requestId = useRef(0);
	const modelButton = useRef<HTMLButtonElement>(null);
	const changeConnection = (type: "proxyUrl" | "proxyApiKey", value: string) => {
		requestId.current++;
		dispatch({ type, value });
		dispatch({ type: "models", value: [] });
		setModelOpen(false);
		setConnection({
			status: "idle",
			message: "Connection details changed. Check again to load models.",
		});
	};
	const checkConnection = async () => {
		const id = ++requestId.current;
		setConnection({ status: "checking", message: "Checking the address and loading models…" });
		setModelOpen(false);
		try {
			const models = await listProxyModels(form);
			if (id !== requestId.current) return;
			dispatch({ type: "models", value: models });
			dispatch({ type: "proxyUrl", value: proxyBaseUrl(form) });
			if (models.length && !models.some((model) => model.id === form.model))
				dispatch({ type: "model", value: models[0].id });
			setConnection({
				status: models.length ? "success" : "empty",
				message: models.length
					? `Connected. ${models.length} models available. ${form.proxyApiKey ? "The proxy accepted your key." : "Model discovery works without a key."}`
					: "The proxy responded, but returned no models. Connect your Codex account in EasyCLIProxyAPI, then check again.",
			});
		} catch (error) {
			if (id !== requestId.current) return;
			dispatch({ type: "models", value: [] });
			setConnection({
				status: "error",
				message: error instanceof Error ? error.message : "Connection check failed.",
			});
		}
	};
	const selectedModelInfo = form.models.find((model) => model.id === form.model);
	const availableThinking = selectedModelInfo?.thinkingLevels?.filter((level) => level !== "off") as
		| ThinkingLevel[]
		| undefined;
	const availableTiers = selectedModelInfo?.serviceTiers as ServiceTier[] | undefined;

	const initialCheck = useRef(checkConnection);
	useEffect(() => {
		void initialCheck.current();
		return () => {
			requestId.current++;
		};
	}, []);

	const handleSave = async () => {
		dispatch({ type: "saving", value: true });
		dispatch({ type: "error", value: null });
		try {
			await onUpdate({
				proxyUrl: proxyBaseUrl(form),
				proxyApiKey: form.proxyApiKey,
				model: form.model,
				generalPrompt: form.generalPrompt,
				organizationThinking: form.organizationThinking,
				summaryThinking: form.summaryThinking,
				serviceTier: form.serviceTier,
				groupTitleLength: form.groupTitleLength,
				groupingMode: form.groupingMode,
				preserveExistingGroups: form.preserveExistingGroups,
				allowRenameGroups: form.allowRenameGroups,
				allowComplexTitles: form.allowComplexTitles,
				allowAddToExistingGroups: form.allowAddToExistingGroups,
				keepUngroupedTabs: form.keepUngroupedTabs,
				closeDuplicateTabs: form.closeDuplicateTabs,
				keepNewestDuplicate: form.keepNewestDuplicate,
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
		<div className="fixed inset-0 bg-black/30 flex items-start justify-center p-3 z-50">
			<div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full min-w-0 max-w-md max-h-full overflow-y-auto overflow-x-hidden p-4">
				<h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-4">Settings</h2>

				<div className="space-y-4">
					<RunHistory />
					<div>
						<label
							htmlFor="proxy-url"
							className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							CLIProxyAPI URL
						</label>
						<input
							id="proxy-url"
							type="url"
							value={form.proxyUrl}
							onChange={(e) => changeConnection("proxyUrl", e.target.value)}
							placeholder="http://127.0.0.1:8317/v1"
							aria-describedby="proxy-url-help"
							className="mt-1 w-full min-w-0 px-2.5 py-2 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
						/>
						<p id="proxy-url-help" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
							Copy the API address from EasyCLIProxyAPI. Use 127.0.0.1 on this computer, or the
							other computer's LAN address. The usual port is 8317 and the path is /v1.
						</p>
					</div>

					<section className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
						<div className="mb-3">
							<h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
								Organization rules
							</h3>
							<p className="mt-0.5 text-[11px] leading-4 text-gray-500 dark:text-gray-400">
								Choose how much freedom the organizer has. Fixed groups marked with a star always
								stay protected.
							</p>
						</div>
						<label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
							Grouping mode
						</label>
						<ChoiceMenu
							id="grouping-mode"
							value={form.groupingMode}
							options={[
								{ value: "soft", label: "Soft · leave uncertain tabs alone" },
								{ value: "hard", label: "Hard · organize every tab" },
							]}
							onChange={(value) => dispatch({ type: "groupingMode", value })}
						/>
						<div className="mt-3 space-y-2">
							{(
								[
									[
										"preserveExistingGroups",
										"Keep current groups",
										"Keep normal groups; starred favorite groups are always protected",
									],
									[
										"allowAddToExistingGroups",
										"Add to existing groups",
										"Use a matching group before creating a new one",
									],
									[
										"allowRenameGroups",
										"Allow group renaming",
										"The organizer may improve existing group names",
									],
									[
										"allowComplexTitles",
										"Allow descriptive titles",
										"Use more than one or two words when useful",
									],
									[
										"keepUngroupedTabs",
										"Keep uncertain tabs ungrouped",
										"Only applies to soft grouping",
									],
								] as const
							).map(([key, title, hint]) => (
								<label
									key={key}
									className="flex cursor-pointer items-start gap-2 rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800"
								>
									<input
										type="checkbox"
										checked={form[key]}
										onChange={(event) =>
											dispatch({ type: "boolean", key, value: event.target.checked })
										}
										className="mt-0.5 size-4 accent-blue-600"
									/>
									<span>
										<span className="block text-xs font-medium text-gray-700 dark:text-gray-200">
											{title}
										</span>
										<span className="block text-[10px] leading-4 text-gray-500 dark:text-gray-400">
											{hint}
										</span>
									</span>
								</label>
							))}
						</div>
					</section>

					<section className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
						<h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
							Duplicate tabs
						</h3>
						<p className="mt-0.5 text-[11px] leading-4 text-gray-500 dark:text-gray-400">
							Duplicates are never closed unless you explicitly enable it.
						</p>
						<label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800">
							<input
								type="checkbox"
								checked={form.closeDuplicateTabs}
								onChange={(event) =>
									dispatch({
										type: "boolean",
										key: "closeDuplicateTabs",
										value: event.target.checked,
									})
								}
								className="mt-0.5 size-4 accent-blue-600"
							/>
							<span>
								<span className="block text-xs font-medium text-gray-700 dark:text-gray-200">
									Close duplicate tabs while organizing
								</span>
								<span className="block text-[10px] leading-4 text-gray-500 dark:text-gray-400">
									Only exact URL duplicates are candidates.
								</span>
							</span>
						</label>
						{form.closeDuplicateTabs && (
							<label className="flex cursor-pointer items-start gap-2 rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800">
								<input
									type="checkbox"
									checked={form.keepNewestDuplicate}
									onChange={(event) =>
										dispatch({
											type: "boolean",
											key: "keepNewestDuplicate",
											value: event.target.checked,
										})
									}
									className="mt-0.5 size-4 accent-blue-600"
								/>
								<span>
									<span className="block text-xs font-medium text-gray-700 dark:text-gray-200">
										Keep the newest tab
									</span>
									<span className="block text-[10px] leading-4 text-gray-500 dark:text-gray-400">
										Otherwise the first open copy is kept.
									</span>
								</span>
							</label>
						)}
					</section>
					<div>
						<label
							htmlFor="proxy-key"
							className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Proxy key (optional)
						</label>
						<input
							id="proxy-key"
							type="password"
							value={form.proxyApiKey}
							onChange={(e) => changeConnection("proxyApiKey", e.target.value)}
							autoComplete="off"
							aria-describedby="proxy-key-help"
							placeholder="Leave empty to check without a key"
							className="mt-1 w-full px-2.5 py-2 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
						/>
						<p id="proxy-key-help" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
							Only needed if EasyCLIProxyAPI requires a client API key. This is the key configured
							in your proxy, not an OpenAI API key or your ChatGPT password. Sign in to Codex in
							EasyCLIProxyAPI.
						</p>
					</div>
					<div className="space-y-2">
						<button
							type="button"
							onClick={() => void checkConnection()}
							disabled={connection.status === "checking"}
							className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"
						>
							{connection.status === "checking" ? "Checking…" : "Check connection & load models"}
						</button>
						<p
							role="status"
							aria-live="polite"
							className={`text-xs break-words ${connection.status === "error" ? "text-red-600 dark:text-red-400" : connection.status === "success" ? "text-green-700 dark:text-green-400" : "text-gray-500 dark:text-gray-400"}`}
						>
							{connection.message}
						</p>
						{connection.status === "success" && (
							<p className="text-xs text-gray-500 dark:text-gray-400">
								This checks model discovery only. No AI request is sent.
							</p>
						)}
					</div>
					<div>
						<label
							htmlFor="model-select"
							className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Model
						</label>
						<button
							type="button"
							id="model-select"
							ref={modelButton}
							aria-expanded={modelOpen}
							aria-controls="model-choices"
							disabled={!form.models.length || connection.status !== "success"}
							onClick={() => setModelOpen(!modelOpen)}
							className="mt-1 w-full min-w-0 px-2.5 py-2 text-sm border rounded-lg text-left break-all dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 disabled:opacity-50"
						>
							{connection.status === "success"
								? selectedModelInfo?.name || form.model
								: "Check connection to choose a model"}{" "}
							<span aria-hidden="true">▾</span>
						</button>
						{modelOpen && (
							<fieldset
								id="model-choices"
								aria-label="Available models"
								onKeyDown={(event) => {
									if (event.key === "Escape") {
										setModelOpen(false);
										modelButton.current?.focus();
									}
								}}
								className="mt-1 w-full min-w-0 max-h-48 overflow-y-auto rounded-lg border dark:border-gray-600"
							>
								{form.models.map((model) => (
									<button
										type="button"
										key={model.id}
										aria-pressed={model.id === form.model}
										onClick={() => {
											dispatch({ type: "model", value: model.id });
											setModelOpen(false);
											modelButton.current?.focus();
										}}
										className={`block w-full break-all px-3 py-2 text-left text-sm ${model.id === form.model ? "bg-blue-600 text-white" : "text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"}`}
									>
										{model.name}
									</button>
								))}
							</fieldset>
						)}
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

					<div>
						<label
							htmlFor="organization-thinking"
							className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Organization Thinking
						</label>
						<p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 mb-1">
							Low is usually enough for sorting tabs; higher levels are slower.
						</p>
						<ChoiceMenu
							id="organization-thinking"
							value={form.organizationThinking}
							options={THINKING_OPTIONS.filter(
								(option) => !availableThinking || availableThinking.includes(option.value),
							)}
							onChange={(value) => dispatch({ type: "organizationThinking", value })}
						/>
					</div>

					<div>
						<label
							htmlFor="service-tier"
							className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Speed
						</label>
						<ChoiceMenu
							id="service-tier"
							value={form.serviceTier}
							options={SERVICE_TIER_OPTIONS.filter(
								(option) => !availableTiers || availableTiers.includes(option.value),
							)}
							onChange={(value) => dispatch({ type: "serviceTier", value })}
						/>
					</div>

					<div>
						<label
							htmlFor="group-title-length"
							className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Group Title Length
						</label>
						<ChoiceMenu
							id="group-title-length"
							value={form.groupTitleLength}
							options={TITLE_LENGTH_OPTIONS}
							onChange={(value) => dispatch({ type: "groupTitleLength", value })}
						/>
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
