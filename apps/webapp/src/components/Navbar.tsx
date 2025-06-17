import { useState } from "react";
import { useSession } from "@/contexts/SessionProvider";
import Logo from "./Logo";
import Modal from "./Modal";
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";

// built from the tailwind example https://tailwindcss.com/plus/ui-blocks/application-ui/navigation/navbars

type NavbarProps = React.ComponentProps<'nav'>;

export default function Navbar(props: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const session = useSession();

  return (
    <nav {...props}>
      <div className="mx-auto max-w-7xl px-2 sm:px-6 lg:px-8">
        <div className="relative flex h-16 items-center justify-between">
          <div className="absolute inset-y-0 left-0 flex items-center sm:hidden">
            <button
              type="button"
              className="relative inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-700 hover:text-white focus:ring-2 focus:ring-white focus:outline-hidden focus:ring-inset"
              aria-controls="mobile-menu"
              aria-expanded="false"
              onClick={() => setIsOpen(!isOpen)}
            >
              <span className="absolute -inset-0.5"></span>
              <span className="sr-only">Open main menu</span>
              <svg className="block size-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" data-slot="icon">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
              <svg className="hidden size-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" data-slot="icon">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center sm:items-stretch sm:justify-start">
            <Logo />
            <div className="hidden sm:ml-6 sm:block">
              <div className="flex space-x-4">
                <NavButtons />
              </div>
            </div>
          </div>
          <div className="absolute inset-y-0 right-0 flex items-center pr-2 sm:static sm:inset-auto sm:ml-6 sm:pr-0">
            <div className="relative ml-3">
              <div>
                {session.type === "loggedIn" ? (
                  <span>{session.user.name}</span>
                ) : (
                  <button
                    type="button"
                    className="relative inline-flex items-center rounded-md bg-primary-blue px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-hidden focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800"
                    onClick={() => setIsLoginModalOpen(true)}
                  >
                    <span className="absolute -inset-1.5"></span>
                    <span className="sr-only">Login</span>
                    Login
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="sm:hidden" id="mobile-menu">
          <div className="space-y-1 px-2 pt-2 pb-3">
            <NavButtons isBlock />
          </div>
        </div>
      )}
      <Modal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)}>
        <GoogleOAuthProvider clientId={"866724834732-5qma1gh7ns35hqg92oamrqgjlq8dbt77.apps.googleusercontent.com"}>
          {
            session.type === "loggedIn" ? (
              <h1 className="text-lg font-semibold">Hello, {session.user.name}!</h1>
            ) : (
              <GoogleLogin
                onSuccess={credentialResponse => {
                  session.login(credentialResponse.credential!);
                }}
                onError={() => {
                  console.log('Login Failed');
                }}
              />
            )
          }
        </GoogleOAuthProvider>
      </Modal>
    </nav>
  );
};

type NavButtonsProps = {
  isBlock?: boolean;
}

function NavButtons({ isBlock }: NavButtonsProps) {
  const className = `${isBlock ? 'block' : ''} rounded-md px-3 py-2 text-sm font-medium hover:bg-gray-700 hover:text-white`;

  return (
    <>
      <a href="#" className={className}>Home</a>
      <a href="#" className={className}>Explore</a>
      <a href="#" className={className}>About</a>
    </>
  );
}
