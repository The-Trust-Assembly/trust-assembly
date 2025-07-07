import { useState } from "react";
import Card from "./components/Card";
import Page from "./components/Page";

const MAX_HEADLINE_LENGTH = 120;

export default function NewHeadlinePage() {
    const [originalHeadline, setOriginalHeadline] = useState("New Study Proves Coffee Cures Cancer");
    const [replacementHeadline, setReplacementHeadline] = useState("Study Finds Correlation Between Coffee Consumption and Lower Risk of Certain Cancers");
    // Citations state: always at least one empty field at the end
    const [citations, setCitations] = useState<string[]>([""]);

    // Handle citation change
    const handleCitationChange = (idx: number, value: string) => {
        const newCitations = [...citations];
        newCitations[idx] = value;
        // If last field is being edited and is not empty, add a new empty field
        if (idx === citations.length - 1 && value.trim() !== "") {
            newCitations.push("");
        }
        // Remove trailing empty fields (but always keep at least one)
        while (
            newCitations.length > 1 &&
            newCitations[newCitations.length - 1] === "" &&
            newCitations[newCitations.length - 2] === ""
        ) {
            newCitations.pop();
        }
        setCitations(newCitations);
    };

    return (
        <Page>
            <div className="m-4">
                <Card>
                    <h1 className="text-lg font-bold">Propose New Headline</h1>

                    <form className="flex flex-col">
                        <div className="mt-2 flex flex-row justify-between">
                            <label htmlFor="originalHeadline">Original headline</label>
                            <div className={originalHeadline.length > MAX_HEADLINE_LENGTH ? 'text-red-600' : ''}>
                                {originalHeadline.length} / {MAX_HEADLINE_LENGTH}
                            </div>
                        </div>
                        <textarea
                            id="originalHeadline"
                            className="border rounded-md p-2 bg-orange-50/50 text-orange-700 border-orange-400/50"
                            value={originalHeadline}
                            onChange={e => setOriginalHeadline(e.target.value)}
                        />
                        <div className="mt-2 flex flex-row justify-between">
                            <label htmlFor="replacementHeadline">Replacement headline</label>
                            <div className={replacementHeadline.length > MAX_HEADLINE_LENGTH ? 'text-red-600' : ''}>
                                {replacementHeadline.length} / {MAX_HEADLINE_LENGTH}
                            </div>
                        </div>
                        <textarea
                            id="replacementHeadline"
                            className="border rounded-md p-2 bg-green-50/50 text-green-700 border-green-400/50"
                            value={replacementHeadline}
                            onChange={e => setReplacementHeadline(e.target.value)}
                        />
                    </form>

                    <section className="mt-2">
                        <h2 className="font-bold">Citations</h2>
                        {citations.map((citation, idx) => (
                            <input
                                key={idx}
                                type="text"
                                placeholder="https://..."
                                className="border border-gray-200 rounded-md p-2 w-full mb-2"
                                value={citation}
                                onChange={e => handleCitationChange(idx, e.target.value)}
                            />
                        ))}
                    </section>
					<div className="flex justify-between mt-2">
						 <button className="px-3 py-1 rounded-md border border-gray-200">Cancel</button>
						 <button className="px-3 py-1 rounded-md bg-blue-500 text-white font-bold">Save & Submit</button>
					</div>
                </Card>
            </div>
        </Page>
    );
}