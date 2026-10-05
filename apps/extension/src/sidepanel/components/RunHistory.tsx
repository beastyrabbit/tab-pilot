import { useEffect, useState } from "react";
import {
	clearRunHistory,
	getRunHistory,
	type OrganizeRunLog,
	RUN_HISTORY_KEY,
} from "../services/runHistory.js";

function downloadRun(run: OrganizeRunLog) {
	const url = URL.createObjectURL(
		new Blob([JSON.stringify(run, null, 2)], { type: "application/json" }),
	);
	const link = document.createElement("a");
	link.href = url;
	link.download = `tab-organizer-run-${run.id}.json`;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function RunDetails({ run }: { run: OrganizeRunLog }) {
	const [revision, setRevision] = useState(-1);
	const proposals = run.proposals || [];
	const proposal = proposals[revision < 0 ? proposals.length - 1 : revision];
	const groupName = (id: number | null | undefined, actual = false) => {
		if (id == null) return "Missing / closed";
		if (id === -1) return "Ungrouped";
		return (
			(actual ? run.outcome?.groups : run.groups)?.find((group) => group.id === id)?.name ||
			`Group ${id}`
		);
	};
	return (
		<div className="mt-2 space-y-2 break-words">
			<button
				type="button"
				onClick={() => downloadRun(run)}
				className="rounded border border-gray-300 px-2 py-1 text-blue-700 dark:border-gray-600 dark:text-blue-300"
			>
				Export this run (JSON)
			</button>
			{!run.tabs ? (
				<p>This older run only contains counts. Tab details are recorded for new runs.</p>
			) : (
				<>
					{run.settings && (
						<details>
							<summary className="cursor-pointer">Settings used</summary>
							<dl className="mt-1">
								{Object.entries(run.settings).map(([key, value]) => (
									<div key={key} className="flex flex-wrap justify-between gap-x-2">
										<dt>{key}</dt>
										<dd>{String(value)}</dd>
									</div>
								))}
							</dl>
						</details>
					)}
					{proposals.length > 0 && (
						<label className="block">
							Proposal version
							<select
								aria-label="Proposal version"
								className="mt-1 w-full min-w-0 rounded border bg-white p-1 dark:border-gray-600 dark:bg-gray-800"
								value={revision < 0 ? proposals.length - 1 : revision}
								onChange={(event) => setRevision(Number(event.target.value))}
							>
								{proposals.map((item, index) => (
									<option key={`${item.at}-${item.kind}`} value={index}>
										{item.kind} · {new Date(item.at).toLocaleTimeString()}
									</option>
								))}
							</select>
						</label>
					)}
					{proposal && (
						<p>
							{run.tabs.length - proposal.unassignedTabIds.length} of {run.tabs.length} tabs
							assigned. {proposal.unassignedTabIds.length} omitted. These are proposals after the
							extension's validation, not raw model output. An omission does not explain why the
							model left a tab out.
						</p>
					)}
					{[...new Set(proposal?.warnings)].map((warning) => (
						<p key={warning} className="text-amber-700 dark:text-amber-300">
							{warning}
						</p>
					))}
					{run.outcome && (
						<div className="rounded bg-gray-100 p-2 dark:bg-gray-900">
							<p>
								Browser state read at {new Date(run.outcome.at).toLocaleString()}.{" "}
								{run.outcome.closedDuplicateIds.length} duplicates closed.
							</p>
							{run.outcome.warnings.length ? (
								[...new Set(run.outcome.warnings)].map((warning) => (
									<p key={warning} className="text-amber-700 dark:text-amber-300">
										{warning}
									</p>
								))
							) : (
								<p>
									No assignment or favorite mismatches found in the checks performed. Topic
									relevance still needs review.
								</p>
							)}
						</div>
					)}
					{!run.outcome && <p>Apply has not been verified for this run.</p>}
					<div className="space-y-2">
						{run.tabs.map((tab) => {
							const target = proposal?.groups.find((group) => group.tabIds.includes(tab.id));
							const fixed = run.groups?.find((group) => group.id === tab.groupId)?.fixed;
							const observed = run.outcome?.tabs.find((item) => item.id === tab.id);
							return (
								<div
									key={tab.id}
									className="rounded border border-gray-200 p-2 dark:border-gray-700"
								>
									<p className="font-medium">{tab.title || "Untitled"}</p>
									<p className="text-gray-500 dark:text-gray-400">
										{tab.domain} · tab {tab.id} · {tab.context}
									</p>
									<p>
										{fixed ? "★ " : ""}
										{groupName(tab.groupId)} →{" "}
										{target ? target.name : "Not assigned in this proposal"}
									</p>
									{observed && (
										<p>
											Observed after Apply: {groupName(observed.groupId, true)}
											{run.outcome?.closedDuplicateIds.includes(tab.id)
												? " (duplicate closed)"
												: ""}
										</p>
									)}
								</div>
							);
						})}
					</div>
				</>
			)}
		</div>
	);
}

export function RunHistory() {
	const [runs, setRuns] = useState<OrganizeRunLog[]>([]);
	const [error, setError] = useState("");
	useEffect(() => {
		const refresh = () => {
			void getRunHistory()
				.then(setRuns)
				.catch(() => setError("Could not read run history."));
		};
		const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
			if (area === "local" && changes[RUN_HISTORY_KEY]) refresh();
		};
		chrome.storage.onChanged.addListener(changed);
		refresh();
		return () => chrome.storage.onChanged.removeListener(changed);
	}, []);
	return (
		<section className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-200">
			<div className="flex justify-between gap-2">
				<h3 className="text-sm font-semibold">Recent runs</h3>
				{runs.length > 0 && (
					<button
						type="button"
						className="text-red-600 dark:text-red-400"
						onClick={() => {
							void clearRunHistory()
								.then(() => setRuns([]))
								.catch(() => setError("Could not clear run history."));
						}}
					>
						Clear history
					</button>
				)}
			</div>
			<p className="my-2 text-[11px] text-gray-500 dark:text-gray-400">
				Up to 20 runs kept on this device. Includes tab titles, domains, settings and group
				assignments. No full URLs, prompts, page text or connection keys. Exported files include
				browsing details; review them before sharing. Each run keeps its initial proposal and latest
				nine revisions.
			</p>
			{error && (
				<p role="alert" className="text-red-600">
					{error}
				</p>
			)}
			{!runs.length && <p>No runs recorded yet.</p>}
			<div className="space-y-2">
				{runs.map((run) => (
					<details
						key={run.id}
						className="rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800"
					>
						<summary className="cursor-pointer">
							<span className="font-medium">
								{new Date(run.startedAt).toLocaleString()} · {run.status}
							</span>
							<span className="mt-1 block text-[11px]">
								{run.tabCount} tabs · {run.groupCount} groups · {run.deepContextCount ?? 0} page
								excerpts
							</span>
							{run.fixedGroupNames?.length ? (
								<span className="block text-amber-700 dark:text-amber-300">
									★ {run.fixedGroupNames.join(", ")}
								</span>
							) : null}
						</summary>
						{run.error && (
							<p role="alert" className="mt-1 text-red-600">
								{run.error}
							</p>
						)}
						<RunDetails run={run} />
					</details>
				))}
			</div>
		</section>
	);
}
