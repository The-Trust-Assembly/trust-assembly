import { Fragment } from "react/jsx-runtime";
import Page from "./components/Page";
import Card from "./components/Card";
import { getReplacementHeadlines, Replacement } from "./backend/api";
import { useSuspenseQuery } from "@tanstack/react-query";

type ReplacementItemProps = {
  replacement: Replacement,
}

type HeadlineContentProps = {
  label: string;
  headline: string;
  type: "original" | "replacement";
  borderType: "start" | "end";
}
function HeadlineContent({ label, headline, type, borderType }: HeadlineContentProps) {
  const styles = {
    original: {
      textColor: "text-orange-700",
      bgColor: "bg-orange-50/50",
      highlightColor: "bg-orange-100",
      borderColor: "border-orange-400/50",
    },
    replacement: {
      textColor:  "text-green-700",
      bgColor: "bg-green-50/50",
      highlightColor: "bg-green-100",
      borderColor: "border-green-400/50",
    }
  }

  const borderStyles = {
    start: "rounded-t-md md:rounded-l-md md:rounded-r-none",
    end: "rounded-b-md md:rounded-r-md md:rounded-l-none",
  }

  const {
    textColor,
    bgColor,
    highlightColor,
    borderColor
  } = styles[type];

  const borderStyle = borderStyles[borderType];

  const boxStyle = [textColor, bgColor, borderColor].join(" ");
   
  return (
    <>
      <div
        className={`text-xs pl-2 order-1 md:order-1 md:col-span-1 md:row-start-1 md:row-end-2 ${textColor}`}
      >
        {label.toUpperCase()}
      </div>
      <div
        className={
          `px-2 py-2 h-full text-left font-medium border whitespace-pre-line
          break-words order-2 md:order-3 md:col-span-1 md:row-start-2 md:row-end-3
          ${boxStyle} ${borderStyle}`
        }
      >
        <span className={`${highlightColor} p-1 box-decoration-clone`}>
          {headline}
        </span>
      </div>
    </>
  )
}

function ReplacementItem({replacement}: ReplacementItemProps) {
  return (
    <Card>
      <div
        className="col-span-2 items-stretch px-2"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-y-0">
          <HeadlineContent
            label="Original"
            headline={replacement.originalHeadline}
            type="original"
            borderType="start"
          />
          <HeadlineContent
            label="Replacement"
            headline={replacement.replacementHeadline}
            type="replacement"
            borderType="end"
          />
          {/* Status and URL */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 my-2 text-sm text-gray-800 col-span-1 break-all order-5 md:order-5 md:col-span-2 md:row-start-3 md:row-end-4 md:my-2">
            <div className="flex gap-2">
              <button className="px-3 py-1 rounded-md bg-blue-500 text-white font-bold">Submit</button>
              <span className="inline-block rounded-full bg-yellow-100 text-yellow-800 px-3 py-1 font-semibold text-sm shrink-0 text-left">{replacement.status}</span>
            </div>
            <a href={replacement.url} target="_blank" rel="noopener noreferrer" className="underline decoration-gray-400/50 hover:decoration-gray-800 transition-all text-left sm:px-1">{replacement.url}</a>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function Replacements() {
  const { data: replacementHeadlines } = useSuspenseQuery({
    queryKey: ["replacementHeadlines"],
    queryFn: getReplacementHeadlines
  });

  return (
    <Page>
      <h1 className="text-2xl text-center">Headline Replacements</h1>
      <div className="mt-6 gap-8 flex flex-col sm:px-2 lg:px-10 mb-8">
        {replacementHeadlines.map((replacement) => (
          <Fragment key={replacement.url} >
            <ReplacementItem replacement={replacement} />
          </Fragment>
        ))}
      </div>
    </Page>
  );
}
