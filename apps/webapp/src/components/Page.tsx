import { Link } from 'react-router-dom';
import Navbar from './Navbar';

const socialMediaIcons = '/social-media-icons.jpg';

type PageProps = {
  children?: React.ReactNode;
  signInOpen?: boolean;
  onSignInClose?: () => void;
};

export default function Page({ children, signInOpen, onSignInClose }: PageProps) {
  return (<>
    <div className="mx-auto flex flex-col max-w-7xl justify-between items-stretch px-2">
      <Navbar signInOpen={signInOpen} onSignInClose={onSignInClose} />
    </div>
    <div>
      <main>
        { children }
      </main>
    </div>
    <div className="mx-auto flex flex-col max-w-7xl justify-between items-stretch px-2">
      <footer className="flex flex-row justify-between pb-2">
        <ul className="nav-list flex flex-row gap-4">
          <li><Link to="#">Terms</Link></li>
          <li><Link to="#">Privacy</Link></li>
          <li><Link to="#">Contact</Link></li>
        </ul>
        <div className="flex-grow"></div>
        <img src={socialMediaIcons} alt="social media icons" className="social-icons" width={109} height={23} loading="lazy" decoding="async" />
      </footer>
    </div>
  </>)
}
