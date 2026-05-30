interface OrganizeButtonProps {
	onClick: () => void;
	loading: boolean;
	disabled: boolean;
	status?: string;
}

export function OrganizeButton({ onClick, loading, disabled, status }: OrganizeButtonProps) {
	const label = loading ? status || "Organizing..." : "Organize Tabs";

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled || loading}
			title={loading ? label : "Organize tabs"}
			className="min-w-0 flex-1 py-1.5 px-3 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
		>
			{loading ? (
				<span className="flex min-w-0 items-center justify-center gap-1.5">
					<span className="size-3 flex-shrink-0 border-2 border-white/30 border-t-white rounded-full animate-spin" />
					<span className="truncate">{label}</span>
				</span>
			) : (
				label
			)}
		</button>
	);
}
