import { Link } from 'react-router-dom';
import gavel from '../assets/gavel.jpg'
import socialMediaIcons from '../assets/social-media-icons.jpg';

type PageProps = {
  children?: React.ReactNode;
};

export default function Page({ children }: PageProps) {
  return (
    <>
      <nav className="medium-width flex flex-responsive nav-row">
        <Link to="#" className="flex flex-row items-baseline">
          <img src={gavel} alt="gavel icon" className="gavel-icon" />
          <strong className="text-lg">Trust Assembly</strong>
        </Link>
        <div className="flex-grow"></div>
        <ul className="nav-list flex flex-row gap items-baseline gap-4">
          <li><Link to="#">Home</Link></li>
          <li><Link to="#">Explore</Link></li>
          <li><Link to="#">About</Link></li>
          <li className="button-link"><Link to="#">Login</Link></li>
        </ul>
      </nav>
      <main>
        { children }
      </main>
      <footer className="flex flex-responsive medium-width">
        <ul className="nav-list flex flex-row gap-4">
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
