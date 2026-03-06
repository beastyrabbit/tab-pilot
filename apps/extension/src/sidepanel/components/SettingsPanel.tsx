import type { ContentDepth, ModelInfo, PublicSettings } from "@tab-orga/shared";
import { useEffect, useState } from "react";
import { serverApi } from "../services/serverApi.js";

interface SettingsPanelProps {
	settings: PublicSettings | null;
	onUpdate: (
		partial: Partial<{ apiKey: string; model: string; contentDepth: string }>,
	) => Promise<PublicSettings>;
	onClose: () => void;
}

export function SettingsPanel({ settings, onUpdate, onClose }: SettingsPanelProps) {
	const [apiKey, setApiKey] = useState("");
	const [model, setModel] = useState(settings?.model || "gpt-4o");
	const [contentDepth, setContentDepth] = useState<ContentDepth>(settings?.contentDepth || "meta");
	const [models, setModels] = useState<ModelInfo[]>([]);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (settings?.hasApiKey) {
			serverApi
				.getModels()
				.then((res) => setModels(res.models))
				.catch(() => {});
		}
	}, [settings?.hasApiKey]);

	const handleSave = async () => {
		setSaving(true);
		try {
			const update: Record<string, string> = { model, contentDepth };
			if (apiKey) update.apiKey = apiKey;
			await onUpdate(update);
			onClose();
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 bg-black/30 flex items-start justify-center pt-4 z-50">
			<div className="bg-white rounded-xl shadow-xl w-[360px] p-4">
				<h2 className="text-sm font-bold text-gray-900 mb-3">Settings</h2>

				<div className="space-y-3">
					<div>
						<label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
							OpenAI API Key
						</label>
						<input
							type="password"
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							placeholder={settings?.hasApiKey ? "Key configured (enter to change)" : "sk-..."}
							className="mt-1 w-full px-2 py-1.5 text-xs border rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>

					<div>
						<label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
							Model
						</label>
						{models.length > 0 ? (
							<select
								value={model}
								onChange={(e) => setModel(e.target.value)}
								className="mt-1 w-full px-2 py-1.5 text-xs border rounded-lg"
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
								className="mt-1 w-full px-2 py-1.5 text-xs border rounded-lg"
							/>
						)}
					</div>

					<div>
						<label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
							Content Depth
						</label>
						<select
							value={contentDepth}
							onChange={(e) => setContentDepth(e.target.value as ContentDepth)}
							className="mt-1 w-full px-2 py-1.5 text-xs border rounded-lg"
						>
							<option value="title-url">Title + URL only</option>
							<option value="meta">Include meta descriptions</option>
							<option value="full">Full page content</option>
						</select>
					</div>
				</div>

				<div className="flex gap-2 mt-4">
					<button
						type="button"
						onClick={onClose}
						className="flex-1 px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
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
