import { useSession } from "@/contexts/SessionProvider"
import Page from "./Page";

type AuthPageProps = {
  children?: React.ReactNode;
};
export default function AuthPage({ children }: AuthPageProps) {
  const session = useSession();

  if (session.type === 'loggedIn') {
    return <Page>{children}</Page>;
  }

  return <Page signInOpen={true} />;
}
