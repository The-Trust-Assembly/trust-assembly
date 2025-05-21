import { Link } from 'react-router-dom';
import Page from './components/Page';
import gavel from './assets/gavel.jpg'
import socialMediaIcons from './assets/social-media-icons.jpg';

export default function Index() {

  return (
    <>
      <nav className="max-w-md flex-responsive nav-row">
        <Link to="#">
          <img src={gavel} alt="gavel icon" className="gavel-icon" />
          <strong className="text-lg">Trust Assembly</strong>
        </Link>
        <div className="flex-grow"></div>
        <ul className="nav-list flex-row gap">
          <li><Link to="#">Home</Link></li>
          <li><Link to="#">Explore</Link></li>
          <li><Link to="#">About</Link></li>
          <li className="button-link"><Link to="#">Login</Link></li>
        </ul>
      </nav>
      <main>
        <Page/>
      </main>
      <footer className="flex-responsive max-w-md">
        <ul className="nav-list flex-row gap">
          <li><Link to="#">Terms</Link></li>
          <li><Link to="#">Privacy</Link></li>
          <li><Link to="#">Contact</Link></li>
        </ul>
        <div className="flex-grow"></div>
        <img src={socialMediaIcons} alt="social media icons" className="social-icons" />
      </footer>
    </>
  )
}
