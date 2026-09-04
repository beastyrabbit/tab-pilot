import type { AIRuntimeResponse, GroupTitleLength, PublicSettings } from "@tab-orga/shared";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { serverApi } from "../services/serverApi.js";

interface SettingsPanelProps {
	settings: PublicSettings | null;
	testMode: boolean;
	onToggleTestMode: () => void;
	onUpdate: (partial: Partial<PublicSettings>) => Promise<PublicSettings>;
	onClose: () => void;
}

const TITLE_LENGTH_OPTIONS: Array<{ value: GroupTitleLength; label: string }> = [
	{ value: "short", label: "Two letters" },
	{ value: "medium", label: "One concise word" },
	{ value: "long", label: "A few compact words" },
];

function RuntimeValue({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[92px_1fr] gap-3 border-t border-stone-200 py-2.5 first:border-t-0 dark:border-gray-700">
			<dt className="text-xs text-stone-500 dark:text-gray-400">{label}</dt>
			<dd className="text-xs font-medium leading-5 text-stone-800 dark:text-gray-200">
				{children}
			</dd>
		</div>
	);
}

export function SettingsPanel({
	settings,
	testMode,
	onToggleTestMode,
	onUpdate,
	onClose,
}: SettingsPanelProps) {
	const [generalPrompt, setGeneralPrompt] = useState(settings?.generalPrompt || "");
	const [groupTitleLength, setGroupTitleLength] = useState<GroupTitleLength>(
		settings?.groupTitleLength || "medium",
	);
	const [runtime, setRuntime] = useState<AIRuntimeResponse | null>(null);
	const [runtimeError, setRuntimeError] = useState<string | null>(null);
	const [runtimeLoading, setRuntimeLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const loadRuntime = useCallback(async () => {
		setRuntimeLoading(true);
		setRuntimeError(null);
		try {
			setRuntime(await serverApi.getAIRuntime());
		} catch (loadError) {
			setRuntime(null);
			setRuntimeError(
				loadError instanceof Error ? loadError.message : "Could not load the AI runtime",
			);
		} finally {
			setRuntimeLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadRuntime();
	}, [loadRuntime]);

	const handleSave = async () => {
		setSaving(true);
		setError(null);
		try {
			await onUpdate({ generalPrompt, groupTitleLength });
			onClose();
		} catch (saveError) {
			setError(saveError instanceof Error ? saveError.message : "Failed to save settings");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 px-3 pt-4">
			<div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 shadow-xl dark:border-gray-700 dark:bg-gray-800">
				<div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-gray-700">
					<h2 className="text-base font-semibold text-stone-900 dark:text-gray-100">Settings</h2>
					<button
						type="button"
						onClick={onClose}
						className="rounded-md px-2 py-1 text-sm text-stone-500 transition-colors hover:bg-stone-200 hover:text-stone-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
					>
						Close
					</button>
				</div>

				<div className="space-y-5 p-4">
					<section>
						<div className="mb-2 flex items-center justify-between">
							<h3 className="text-sm font-semibold text-stone-900 dark:text-gray-100">
								AI runtime
							</h3>
							{runtime && (
								<span
									className={`text-xs font-medium ${runtime.authenticated ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}
								>
									{runtime.authenticated ? "OAuth connected" : "Login required"}
								</span>
							)}
						</div>
						<div className="rounded-lg border border-stone-200 bg-white px-3 dark:border-gray-700 dark:bg-gray-900">
							{runtimeLoading && (
								<p className="py-4 text-xs text-stone-500 dark:text-gray-400">Loading runtime…</p>
							)}
							{runtimeError && (
								<div className="py-3">
									<p className="text-xs text-red-700 dark:text-red-400">{runtimeError}</p>
									<button
										type="button"
										onClick={() => void loadRuntime()}
										className="mt-2 rounded-md border border-stone-300 px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
									>
										Retry
									</button>
								</div>
							)}
							{runtime && (
								<dl>
									<RuntimeValue label="Lead">
										{runtime.roles.lead.name} · {runtime.roles.lead.reasoning}
									</RuntimeValue>
									<RuntimeValue label="Delegates">
										Terra or Sol · {runtime.roles.delegates.reasoning} · up to{" "}
										{runtime.roles.delegates.maxConcurrent}
									</RuntimeValue>
									<RuntimeValue label="Tab profiles">
										{runtime.roles.summaries.name} · {runtime.roles.summaries.reasoning}
									</RuntimeValue>
									<RuntimeValue label="Connection">
										WebSocket with SSE fallback · {runtime.serviceTier} tier
									</RuntimeValue>
								</dl>
							)}
						</div>
					</section>

					<div>
						<label
							htmlFor="general-prompt"
							className="block text-sm font-medium text-stone-800 dark:text-gray-200"
						>
							Organization preferences
						</label>
						<p className="mb-1.5 mt-0.5 text-xs text-stone-500 dark:text-gray-400">
							Persistent guidance such as “Homelab is a project” or “keep gaming separate.”
						</p>
						<textarea
							id="general-prompt"
							value={generalPrompt}
							onChange={(event) => setGeneralPrompt(event.target.value)}
							placeholder="How should tabs be organized?"
							rows={4}
							className="w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition-colors placeholder:text-stone-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
						/>
					</div>

					<div>
						<label
							htmlFor="group-title-length"
							className="block text-sm font-medium text-stone-800 dark:text-gray-200"
						>
							Group title length
						</label>
						<select
							id="group-title-length"
							value={groupTitleLength}
							onChange={(event) => setGroupTitleLength(event.target.value as GroupTitleLength)}
							className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
						>
							{TITLE_LENGTH_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</div>

					<div className="flex items-center justify-between border-t border-stone-200 pt-4 dark:border-gray-700">
						<div>
							<p className="text-sm font-medium text-stone-800 dark:text-gray-200">Test mode</p>
							<p className="text-xs text-stone-500 dark:text-gray-400">
								Preview normally, but disable Apply.
							</p>
						</div>
						<button
							type="button"
							role="switch"
							aria-checked={testMode}
							onClick={onToggleTestMode}
							className={`relative h-6 w-11 rounded-full transition-colors ${testMode ? "bg-amber-500" : "bg-stone-300 dark:bg-gray-600"}`}
						>
							<span
								className={`absolute left-1 top-1 size-4 rounded-full bg-white transition-transform ${testMode ? "translate-x-5" : ""}`}
							/>
						</button>
					</div>

					{error && <p className="text-xs text-red-700 dark:text-red-400">{error}</p>}
				</div>

				<div className="flex justify-end gap-2 border-t border-stone-200 px-4 py-3 dark:border-gray-700">
					<button
						type="button"
						onClick={onClose}
						className="rounded-lg px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-200 dark:text-gray-300 dark:hover:bg-gray-700"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={() => void handleSave()}
						disabled={saving}
						className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{saving ? "Saving…" : "Save"}
					</button>
				</div>
			</div>
		</div>
	);
}
