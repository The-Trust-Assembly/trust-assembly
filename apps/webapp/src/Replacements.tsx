import Page from "./components/Page";

type Replacement = {
  originalHeadline: string;
  replacementHeadline: string;
  status: "Pending";
  url: string;
}

function renderReplacement(replacement: Replacement, idx: number) {
  return (
    <div
      key={idx}
      className="col-span-2 mb-8 flex flex-col items-stretch px-2"
    >
      <div className="grid grid-cols-2 bg-white border border-gray-200 rounded-3xl shadow-lg px-8 py-6 items-center relative z-10" style={{ minHeight: '80px' }}>
        <div className="text-orange-700 text-xs">ORIGINAL</div>
        <div className="text-green-700 text-xs">REPLACEMENT</div>
        <div className="px-2 py-1 h-full text-left font-medium text-orange-700 bg-orange-100 rounded-l-md whitespace-pre-line break-words">
          {replacement.originalHeadline}
        </div>
        <div className="px-2 py-1 h-full font-semibold text-green-700 bg-green-200 rounded-r-md whitespace-pre-line break-words">
          {replacement.replacementHeadline}
        </div>
      </div>
      <div className="grid grid-cols-2 bg-gray-100 rounded-b-3xl px-8 pb-3 pt-2 -mt-2 border-t border-gray-200 relative z-0">
        <div className="text-xs text-gray-500 col-span-1 break-all">
          <a href={replacement.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{replacement.url}</a>
        </div>
        <div className="text-xs text-right text-gray-500 col-span-1">
          <span className="inline-block rounded-full bg-yellow-100 text-yellow-800 px-3 py-1 font-semibold">{replacement.status}</span>
        </div>
      </div>
    </div>
  );
}

export default function Replacements() {
  const sampleData: Replacement[] = [
    {
      originalHeadline: "New Study Proves Coffee Cures Cancer",
      replacementHeadline: "Study Finds Correlation Between Coffee Consumption and Lower Risk of Certain Cancers",
      status: "Pending",
      url: "https://fake.news/coffee-cures-cancer/"
    },
    {
      originalHeadline: "Stock Market Collapse Imminent, Experts Warn",
      replacementHeadline: "Analysts Predict Market Volatility Amid Inflation Concerns",
      status: "Pending",
      url: "https://fake.news/stock-market-collapse/"
    },
    {
      originalHeadline: "Major Bank Crash Signals Financial Armageddon",
      replacementHeadline: "Bank Faces Liquidity Crisis; Regulators Monitor for Broader Impacts",
      status: "Pending",
      url: "https://fake.news/major-bank-crash/"
    },
    {
      originalHeadline: "Senator Caught in Massive Tax Fraud Scandal",
      replacementHeadline: "Senator Under Investigation for Alleged Tax Filing Irregularities",
      status: "Pending",
      url: "https://fake.news/senator-tax-fraud/"
    },
    {
      originalHeadline: "City Descends Into Chaos as Crime Soars",
      replacementHeadline: "City Reports Increase in Property Crime, Violent Crime Rates Steady",
      status: "Pending",
      url: "https://fake.news/city-descends-into-chaos/"
    },
    {
      originalHeadline: "The Singularity Starts Now",
      replacementHeadline: "OpenAI CEO Says Wonders Will Become Routine",
      status: "Pending",
      url: "https://fake.news/singularity-starts-now/"
    }
  ]

  return (
    <Page>
      <div className="mt-10">
        <div>
          {sampleData.map(renderReplacement)}
        </div>
      </div>
    </Page>
  );
}
