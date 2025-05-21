export default function Page() {
	return (
		<>
			<div className="hero-bg">
				<div className="flex-col items-center hero">
					<div className="hero-text">Repair the Headlines.</div>
					<div className="hero-text">Rebuild the Narrative.</div>
					<div className="hero-button">Get Started</div>
				</div>
			</div>
			<div className="flex-responsive justify-between text-lg max-w-sm">
				<div className="column">
					<div>Trending Replacements</div>
					<ul>
						<li>New York Times: ...</li>
						<li>Fox News: ...</li>
					</ul>
				</div>
				<div className="column">
					<div>Recently Adjudicated</div>
					<ul>
						<li>CNN: ...</li>
						<li>BBC: ...</li>
					</ul>
				</div>
			</div>
		</>
	)
}

