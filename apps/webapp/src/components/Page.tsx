import { Link } from 'react-router-dom';
import Navbar from './Navbar';

const socialMediaIcons = '/social-media-icons.jpg';

type PageProps = {
  children?: React.ReactNode;
};

export default function Page({ children }: PageProps) {
  return (
    <div className="max-w-screen-lg mx-auto flex flex-col min-h-screen">
      <Navbar />
      <main>
        { children }
      </main>
      <footer className="flex flex-row px-2">
        <ul className="nav-list flex flex-row gap-4">
          <li><Link to="#">Terms</Link></li>
          <li><Link to="#">Privacy</Link></li>
          <li><Link to="#">Contact</Link></li>
        </ul>
        <div className="flex-grow"></div>
        <img src={socialMediaIcons} alt="social media icons" className="social-icons" />
      </footer>
    </div>
  )
}
