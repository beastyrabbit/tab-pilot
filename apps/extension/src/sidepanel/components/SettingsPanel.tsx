import type { ContentDepth, ModelInfo, PublicSettings } from "@tab-orga/shared";
import { useEffect, useState } from "react";
import { serverApi } from "../services/serverApi.js";

interface SettingsPanelProps {
	settings: PublicSettings | null;
	testMode: boolean;
	onToggleTestMode: () => void;
	onUpdate: (partial: Partial<{ model: string; contentDepth: string }>) => Promise<PublicSettings>;
	onClose: () => void;
}

export function SettingsPanel({
	settings,
	testMode,
	onToggleTestMode,
	onUpdate,
	onClose,
}: SettingsPanelProps) {
	const [model, setModel] = useState(settings?.model || "o3");
	const [contentDepth, setContentDepth] = useState<ContentDepth>(settings?.contentDepth || "meta");
	const [models, setModels] = useState<ModelInfo[]>([]);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		serverApi
			.getModels()
			.then((res) => setModels(res.models))
			.catch(() => {});
	}, []);

	const handleSave = async () => {
		setSaving(true);
		try {
			await onUpdate({ model, contentDepth });
			onClose();
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 bg-black/30 flex items-start justify-center pt-4 z-50">
			<div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-[360px] p-4">
				<h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">Settings</h2>

				<div className="space-y-3">
					<div>
						<label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
							Model
						</label>
						{models.length > 0 ? (
							<select
								value={model}
								onChange={(e) => setModel(e.target.value)}
								className="mt-1 w-full px-2 py-1.5 text-xs border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
							>
								{models.map((m) => (
									<option key={m.id} value={m.id}>
										{m.name}
									</option>
								))}
							</select>
						) : (
							<input
								type="text"
								value={model}
								onChange={(e) => setModel(e.target.value)}
								className="mt-1 w-full px-2 py-1.5 text-xs border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
							/>
						)}
					</div>

					<div>
						<label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
							Content Depth
						</label>
						<select
							value={contentDepth}
							onChange={(e) => setContentDepth(e.target.value as ContentDepth)}
							className="mt-1 w-full px-2 py-1.5 text-xs border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
						>
							<option value="title-url">Title + URL only</option>
							<option value="meta">Include meta descriptions</option>
							<option value="full">Full page content</option>
						</select>
					</div>

					<div className="flex items-center justify-between">
						<div>
							<div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
								Test Mode
							</div>
							<div className="text-[10px] text-gray-400 dark:text-gray-500">
								Preview suggestions without applying them
							</div>
						</div>
						<button
							type="button"
							onClick={onToggleTestMode}
							className={`relative w-9 h-5 rounded-full transition-colors ${
								testMode ? "bg-amber-500" : "bg-gray-300 dark:bg-gray-600"
							}`}
						>
							<span
								className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
									testMode ? "translate-x-4" : ""
								}`}
							/>
						</button>
					</div>
				</div>

				<div className="flex gap-2 mt-4">
					<button
						type="button"
						onClick={onClose}
						className="flex-1 px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleSave}
						disabled={saving}
						className="flex-1 px-3 py-1.5 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
					>
						{saving ? "Saving..." : "Save"}
					</button>
				</div>
			</div>
		</div>
	);
}
