import type { ContentDepth, ModelInfo, PublicSettings } from "@tab-orga/shared";
import { useEffect, useState } from "react";
import { serverApi } from "../services/serverApi.js";

interface SettingsPanelProps {
	settings: PublicSettings | null;
	testMode: boolean;
	onToggleTestMode: () => void;
	onUpdate: (
		partial: Partial<{ model: string; contentDepth: string; generalPrompt: string }>,
	) => Promise<PublicSettings>;
	onDissolveAllGroups: () => Promise<void>;
	onClose: () => void;
}

export function SettingsPanel({
	settings,
	testMode,
	onToggleTestMode,
	onUpdate,
	onDissolveAllGroups,
	onClose,
}: SettingsPanelProps) {
	const [model, setModel] = useState(settings?.model || "gpt-5.3-codex");
	const [contentDepth, setContentDepth] = useState<ContentDepth>(settings?.contentDepth || "meta");
	const [generalPrompt, setGeneralPrompt] = useState(settings?.generalPrompt || "");
	const fallbackModel = settings?.model || "gpt-5.3-codex";
	const [models, setModels] = useState<ModelInfo[]>([{ id: fallbackModel, name: fallbackModel }]);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		serverApi
			.getModels()
			.then((res) => {
				if (res.models.length > 0) setModels(res.models);
			})
			.catch(() => {});
	}, []);

	const handleSave = async () => {
		setSaving(true);
		try {
			await onUpdate({ model, contentDepth, generalPrompt });
			onClose();
		} finally {
			setSaving(false);
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
							value={model}
							onChange={(e) => setModel(e.target.value)}
							className="mt-1 w-full px-2.5 py-2 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
						>
							{models.map((m) => (
								<option key={m.id} value={m.id}>
									{m.name}
								</option>
							))}
						</select>
					</div>

					<div>
						<label
							htmlFor="depth-select"
							className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Content Depth
						</label>
						<select
							id="depth-select"
							value={contentDepth}
							onChange={(e) => setContentDepth(e.target.value as ContentDepth)}
							className="mt-1 w-full px-2.5 py-2 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
						>
							<option value="title-url">Title + URL only</option>
							<option value="meta">Include meta descriptions</option>
							<option value="full">Full page content</option>
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
							value={generalPrompt}
							onChange={(e) => setGeneralPrompt(e.target.value)}
							placeholder="Enter general instructions for the AI organizer..."
							rows={4}
							className="w-full px-2.5 py-2 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-400 resize-none"
						/>
					</div>

					<div className="flex items-center justify-between">
						<div>
							<div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
								Test Mode
							</div>
							<div className="text-[10px] text-gray-400 dark:text-gray-500">
								Disables Apply — everything else works normally
							</div>
						</div>
						<button
							type="button"
							onClick={onToggleTestMode}
							className={`relative w-10 h-5.5 rounded-full transition-colors ${
								testMode ? "bg-amber-500" : "bg-gray-300 dark:bg-gray-600"
							}`}
						>
							<span
								className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
									testMode ? "translate-x-5" : ""
								}`}
							/>
						</button>
					</div>
					<div className="pt-2 border-t border-gray-200 dark:border-gray-700">
						<button
							type="button"
							onClick={async () => {
								await onDissolveAllGroups();
								onClose();
							}}
							className="w-full px-3 py-2 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100 dark:text-red-400 dark:bg-red-900/20 dark:hover:bg-red-900/40"
						>
							Dissolve all groups
						</button>
						<div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
							Ungroups every tab in the current window
						</div>
					</div>
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
						disabled={saving}
						className="flex-1 px-3 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
					>
						{saving ? "Saving..." : "Save"}
					</button>
				</div>
			</div>
		</div>
	);
}
