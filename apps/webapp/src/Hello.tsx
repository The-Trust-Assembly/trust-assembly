import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { useSession } from "./contexts/SessionProvider";
import Page from "./components/Page";

// Test component for features in development
export default function Hello() {
  const session = useSession();

  return (
    <Page>
      { /* TODO: move clientId to env variable */ }
      <GoogleOAuthProvider clientId={"866724834732-5qma1gh7ns35hqg92oamrqgjlq8dbt77.apps.googleusercontent.com"}>
        <div>
          {session.type === "loggedIn" ? (
            <h1>Hello, {session.user.name}!</h1>
          ) : (
            <GoogleLogin
              onSuccess={credentialResponse => {
                session.login(credentialResponse.credential!);
              }}
              onError={() => {
                console.log('Login Failed');
              }}
            />
          )}
        </div>
      </GoogleOAuthProvider>
    </Page>
  )
}
