import { Fragment } from "react/jsx-runtime";
import Page from "./components/Page";

type Replacement = {
  originalHeadline: string;
  replacementHeadline: string;
  status: "Pending";
  url: string;
}

type ReplacementItemProps = {
  replacement: Replacement,
}

function ReplacementItem({replacement}: ReplacementItemProps) {
  return (
    <div
      className="col-span-2 mb-8 flex flex-col items-stretch px-2"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 bg-white border border-gray-200 rounded-3xl shadow-lg px-4 md:px-8 py-4 items-center relative z-10 gap-y-2 md:gap-y-0" style={{ minHeight: '80px' }}>
        {/* ORIGINAL label */}
        <div className="text-xs pl-2 text-orange-700 order-1 md:order-1 md:col-span-1 md:row-start-1 md:row-end-2">ORIGINAL</div>
        {/* ORIGINAL headline */}
        <div className="px-2 py-2 h-full text-left font-medium text-orange-700 bg-orange-50/50 border md:border-r-0 border-orange-400/50 rounded-t-md md:rounded-l-md md:rounded-tr-none whitespace-pre-line break-words order-2 md:order-3 md:col-span-1 md:row-start-2 md:row-end-3">
          <span className="bg-orange-100 p-1 box-decoration-clone">{replacement.originalHeadline}</span>
        </div>
        {/* REPLACEMENT label */}
        <div className="text-xs pl-2 text-green-700 order-3 md:order-2 md:col-span-1 md:row-start-1 md:row-end-2 md:col-start-2">REPLACEMENT</div>
        {/* REPLACEMENT headline */}
        <div className="px-2 py-2 h-full font-semibold text-green-700 bg-green-50/50 border border-green-400/50 rounded-b-md md:rounded-r-md md:rounded-bl-none whitespace-pre-line break-words order-4 md:order-4 md:col-span-1 md:row-start-2 md:row-end-3 md:col-start-2">
          <span className="bg-green-100 p-1 box-decoration-clone">{replacement.replacementHeadline}</span>
        </div>
        {/* Status and URL */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 my-2 text-sm text-gray-800 col-span-1 break-all order-5 md:order-5 md:col-span-2 md:row-start-3 md:row-end-4 md:my-2">
          <div><span className="inline-block rounded-full bg-yellow-100 text-yellow-800 px-3 py-1 font-semibold text-sm shrink-0 text-left">{replacement.status}</span></div>
          <a href={replacement.url} target="_blank" rel="noopener noreferrer" className="underline decoration-gray-400/50 hover:decoration-gray-800 transition-all text-left px-3 sm:px-1">{replacement.url}</a>
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
      replacementHeadline: "City Reports Increase in Property Crime; Violent Crime Rates Steady",
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
      <h1 className="text-2xl text-center">Headline Replacements</h1>
      <div className="mt-6 sm:px-2 lg:px-10">
        {sampleData.map((replacement, idx) => (
          <Fragment key={replacement.url} >
            <ReplacementItem replacement={replacement} />
          </Fragment>
        ))}
      </div>
    </Page >
  );
}
