import { useState } from "react";
import Card from "./components/Card";
import Page from "./components/Page";

const MAX_HEADLINE_LENGTH = 120;

export default function NewHeadlinePage() {
    const [originalHeadline, setOriginalHeadline] = useState("New Study Proves Coffee Cures Cancer");
    const [replacementHeadline, setReplacementHeadline] = useState("Study Finds Correlation Between Coffee Consumption and Lower Risk of Certain Cancers");
    // Each citation is an object: { url: string, explanation: string }
    const [citations, setCitations] = useState<{ url: string; explanation: string }[]>([
        { url: "", explanation: "" }
    ]);

    // Error state
    const [fieldErrors, setFieldErrors] = useState<{
        originalHeadline?: string;
        replacementHeadline?: string;
        citations?: string;
    }>({});

    // Handle citation URL change
    const handleCitationUrlChange = (idx: number, value: string) => {
        const newCitations = [...citations];
        newCitations[idx] = { ...newCitations[idx], url: value };
        // If last field is being edited and is not empty, add a new empty field
        if (idx === citations.length - 1 && value.trim() !== "") {
            newCitations.push({ url: "", explanation: "" });
        }
        // Remove trailing empty fields (but always keep at least one)
        while (
            newCitations.length > 1 &&
            newCitations[newCitations.length - 1].url === "" &&
            newCitations[newCitations.length - 2].url === ""
        ) {
            newCitations.pop();
        }
        setCitations(newCitations);
    };

    // Handle citation explanation change
    const handleCitationExplanationChange = (idx: number, value: string) => {
        const newCitations = [...citations];
        newCitations[idx] = { ...newCitations[idx], explanation: value };
        setCitations(newCitations);
    };

    // Form submit handler
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const errors: { originalHeadline?: string; replacementHeadline?: string; citations?: string } = {};
        if (!originalHeadline.trim()) {
            errors.originalHeadline = "Original headline is required.";
        } else if (originalHeadline.length > MAX_HEADLINE_LENGTH) {
            errors.originalHeadline = `Original headline must be at most ${MAX_HEADLINE_LENGTH} characters.`;
        }
        if (!replacementHeadline.trim()) {
            errors.replacementHeadline = "Replacement headline is required.";
        } else if (replacementHeadline.length > MAX_HEADLINE_LENGTH) {
            errors.replacementHeadline = `Replacement headline must be at most ${MAX_HEADLINE_LENGTH} characters.`;
        }
        const hasCitation = citations.some(c => c.url.trim() !== "");
        if (!hasCitation) {
            errors.citations = "At least one citation URL is required.";
        }
        setFieldErrors(errors);
        if (Object.keys(errors).length === 0) {
            // Submit logic here (e.g. API call)
            // For now, just log
            console.log({ originalHeadline, replacementHeadline, citations });
        }
    };

    return (
        <Page>
            <div className="mx-auto p-4 max-w-4xl">
                <Card>
                    <div className="flex flex-col md:flex-row">
                        <div className="flex-2/3">
                            <h1 className="text-lg font-bold">Propose New Headline</h1>
                            <form className="flex flex-col" onSubmit={handleSubmit}>
                                <div className="mt-2 flex flex-row justify-between">
                                    <label htmlFor="originalHeadline">Original headline</label>
                                    <div className={originalHeadline.length > MAX_HEADLINE_LENGTH ? 'text-red-600' : ''}>
                                        {originalHeadline.length} / {MAX_HEADLINE_LENGTH}
                                    </div>
                                </div>
                                <textarea
                                    id="originalHeadline"
                                    className={`border rounded-md p-2 bg-orange-50/50 text-orange-700 border-orange-400/50 ${fieldErrors.originalHeadline ? 'border-red-400' : ''}`}
                                    value={originalHeadline}
                                    onChange={e => setOriginalHeadline(e.target.value)}
                                />
                                {fieldErrors.originalHeadline && (
                                    <div className="text-red-600 text-sm mt-1 mb-1">{fieldErrors.originalHeadline}</div>
                                )}
                                <div className="mt-2 flex flex-row justify-between">
                                    <label htmlFor="replacementHeadline">Replacement headline</label>
                                    <div className={replacementHeadline.length > MAX_HEADLINE_LENGTH ? 'text-red-600' : ''}>
                                        {replacementHeadline.length} / {MAX_HEADLINE_LENGTH}
                                    </div>
                                </div>
                                <textarea
                                    id="replacementHeadline"
                                    className={`border rounded-md p-2 bg-green-50/50 text-green-700 border-green-400/50 ${fieldErrors.replacementHeadline ? 'border-red-400' : ''}`}
                                    value={replacementHeadline}
                                    onChange={e => setReplacementHeadline(e.target.value)}
                                />
                                {fieldErrors.replacementHeadline && (
                                    <div className="text-red-600 text-sm mt-1 mb-1">{fieldErrors.replacementHeadline}</div>
                                )}
                                <section className="mt-2">
                                    <h2 className="font-bold">Citations</h2>
                                    {citations.map((citation, idx) => (
                                        <div key={idx} className="mb-4">
                                            <input
                                                type="text"
                                                placeholder="https://..."
                                                className={`border border-gray-200 rounded-md p-2 w-full mb-1 ${fieldErrors.citations && idx === 0 ? 'border-red-400' : ''}`}
                                                value={citation.url}
                                                onChange={e => handleCitationUrlChange(idx, e.target.value)}
                                            />
                                            <textarea
                                                placeholder="Optional explanation (e.g. what this citation supports)"
                                                className="border border-gray-200 rounded-md p-2 w-full text-sm text-gray-700 bg-gray-50"
                                                value={citation.explanation}
                                                onChange={e => handleCitationExplanationChange(idx, e.target.value)}
                                                rows={2}
                                            />
                                            {/* Only show error under the first citation field */}
                                            {fieldErrors.citations && idx === 0 && (
                                                <div className="text-red-600 text-sm mt-1 mb-1">{fieldErrors.citations}</div>
                                            )}
                                        </div>
                                    ))}
                                </section>
                                <div className="flex justify-between mt-2">
                                    <button type="button" className="px-3 py-1 rounded-md border border-gray-200">Cancel</button>
                                    <button type="submit" className="px-3 py-1 rounded-md bg-blue-500 text-white font-bold">Save & Submit</button>
                                </div>
                            </form>
                        </div>
                        <hr className="md:hidden border-t border-gray-400 mt-4 mb-2"/>
                        <aside className="pl-4 flex-1/3 shrink-0">
                            <h2 className="font-bold my-2">Group policy tips</h2>
                            <ul className="list-disc pl-6 flex flex-col gap-1">
                                <li>Strive for accuracy</li>
                                <li>Avoid loaded language</li>
                                <li>Provide supporting evidence</li>
                            </ul>
                        </aside>
                    </div>
                </Card>
            </div>
        </Page>
    );
}