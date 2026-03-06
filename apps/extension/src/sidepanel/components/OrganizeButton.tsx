interface OrganizeButtonProps {
	onClick: () => void;
	loading: boolean;
	disabled: boolean;
}

export function OrganizeButton({ onClick, loading, disabled }: OrganizeButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled || loading}
			className="flex-1 py-1.5 px-3 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
		>
			{loading ? (
				<span className="flex items-center justify-center gap-1.5">
					<span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
					Analyzing...
				</span>
			) : (
				"Organize Tabs"
			)}
		</button>
	);
}
