import Page from "./components/Page";

export default function Index() {
  return (
    <Page>
      <div className="hero-bg">
        <div className="flex flex-col items-center hero">
          <div className="hero-text">Repair the Headlines.</div>
          <div className="hero-text">Rebuild the Narrative.</div>
          <div className="hero-button">Get Started</div>
        </div>
      </div>
      <div className="flex flex-responsive justify-between text-lg small-width">
        <div className="column">
          <div>Trending Replacements</div>
          <ul className="my-5 pl-5 list-disc">
            <li>New York Times: ...</li>
            <li>Fox News: ...</li>
          </ul>
        </div>
        <div className="column">
          <div>Recently Adjudicated</div>
          <ul className="my-5 pl-5 list-disc">
            <li>CNN: ...</li>
            <li>BBC: ...</li>
          </ul>
        </div>
      </div>
    </Page>
  )
}