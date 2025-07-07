import Card from "./components/Card";
import Page from "./components/Page";

export default function NewHeadlinePage() {
	return <Page>
		<div className="m-4">
			<Card>
				<h1 className="text-lg font-bold">Propose New Headline</h1>
				<form className="flex flex-col">
					<label htmlFor="originalHeadline">Original headline</label>
					<input type="text" id="originalHeadline"
						className="border rounded-md p-2 bg-orange-50/50 text-orange-700 border-orange-400/50"
						value="New Study Proves Coffee Cures Cancer"
					/>
					<label htmlFor="originalHeadline">Replacement headline</label>
					<input type="text" id="originalHeadline"
						className="border rounded-md p-2 bg-green-50/50 text-green-700 border-green-400/50"
						value="Study Finds Correlation Between Coffee Consumption and Lower Risk of Certain Cancers"
					/>
				</form>
			</Card>
		</div>
	</Page>
}