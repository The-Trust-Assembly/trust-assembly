import gavel from './assets/gavel.jpg'
import socialMediaIcons from './assets/social-media-icons.jpg';

export default function Index() {

  return (
    <>
      <nav className="max-w-md flex-responsive nav-row">
        <div>
          <img src={gavel} alt="gavel icon" className="gavel-icon" />
          <strong className="text-lg">Trust Assembly</strong>
        </div>
        <div className="flex-grow"></div>
        <ul className="nav-list flex-row gap">
          <li>Home</li>
          <li>Explore</li>
          <li>About</li>
          <li className="button-link">Login</li>
        </ul>
      </nav>
      <main>
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
      </main>
      <footer className="flex-responsive max-w-md">
        <ul className="nav-list flex-row gap">
          <li>Terms</li>
          <li>Privacy</li>
          <li>Contact</li>
        </ul>
        <div className="flex-grow"></div>
        <img src={socialMediaIcons} alt="social media icons" className="social-icons" />
      </footer>
    </>
  )
}
