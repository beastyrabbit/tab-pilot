import type { TabGroupInfo, TabInfo } from "@tab-orga/shared";
import { useState } from "react";

function Favicon({
	url,
	pageUrl,
	className,
}: { url?: string; pageUrl?: string; className?: string }) {
	const [failed, setFailed] = useState(false);
	const [googleFailed, setGoogleFailed] = useState(false);

	const googleFaviconUrl = (() => {
		if (!pageUrl) return null;
		try {
			const domain = new URL(pageUrl).hostname;
			return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
		} catch {
			return null;
		}
	})();

	if ((!url || failed) && (!googleFaviconUrl || googleFailed)) {
		return <div className={`${className} bg-gray-300 dark:bg-gray-600 rounded`} />;
	}

	if (!url || failed) {
		return (
			<img
				src={googleFaviconUrl!}
				alt=""
				className={className}
				onError={() => setGoogleFailed(true)}
			/>
		);
	}

	return <img src={url} alt="" className={className} onError={() => setFailed(true)} />;
}

interface TabItemProps {
	tab: TabInfo;
	groups?: TabGroupInfo[];
	onMoveToGroup?: (tabId: number, groupId: number) => void;
	onUngroup?: (tabId: number) => void;
}

export function TabItem({ tab, groups, onMoveToGroup, onUngroup }: TabItemProps) {
	const [showMenu, setShowMenu] = useState(false);

	const domain = (() => {
		try {
			return new URL(tab.url).hostname;
		} catch {
			return tab.url;
		}
	})();

	return (
		<div className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700/50 group/tab relative">
			<Favicon url={tab.favIconUrl} pageUrl={tab.url} className="w-4 h-4 flex-shrink-0" />
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
					{tab.title}
				</div>
				<div className="text-xs text-gray-400 dark:text-gray-500 truncate">{domain}</div>
			</div>

			{groups && groups.length > 0 && onMoveToGroup && (
				<div className="relative">
					<button
						type="button"
						onClick={() => setShowMenu(!showMenu)}
						className="invisible group-hover/tab:visible text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 p-0.5"
						title="Move to group"
					>
						<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
							/>
						</svg>
					</button>
					{showMenu && (
						<div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg shadow-lg z-20 py-1">
							{groups
								.filter((g) => g.id !== tab.groupId)
								.map((g) => (
									<button
										key={g.id}
										type="button"
										onClick={() => {
											onMoveToGroup(tab.id, g.id);
											setShowMenu(false);
										}}
										className="w-full text-left px-3 py-1 text-[10px] hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
									>
										{g.title || "Untitled"}
									</button>
								))}
							{tab.groupId !== -1 && onUngroup && (
								<button
									type="button"
									onClick={() => {
										onUngroup(tab.id);
										setShowMenu(false);
									}}
									className="w-full text-left px-3 py-1 text-[10px] hover:bg-gray-100 dark:hover:bg-gray-600 text-red-600 dark:text-red-400 border-t dark:border-gray-600"
								>
									Remove from group
								</button>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
