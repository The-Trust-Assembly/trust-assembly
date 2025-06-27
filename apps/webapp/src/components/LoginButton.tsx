import { useState } from "react";
import { Session } from "../contexts/SessionProvider"
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { UnauthorizedError } from "../backend/api";

type LoginButtonProps = {
  session: Extract<Session, { type: "loggedOut" }>;
  onSuccess: () => void;
  onError: (errMessage: string) => void;
}
export default function LoginButton(
  { session, onSuccess, onError }: LoginButtonProps
) {
  const [googleCredential, setGoogleCredential] = useState<string | null>(null);

  if (googleCredential) {
    return (
      <button
        className="relative inline-flex items-center rounded-md bg-primary-blue px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-hidden focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800"
        onClick={() => {
          session.register(googleCredential)
            .then(onSuccess)
            .catch(err => onError(err.message));
        }}
      >
        Register with Google
      </button>
    );
  }

  return (
    <GoogleOAuthProvider clientId={"866724834732-5qma1gh7ns35hqg92oamrqgjlq8dbt77.apps.googleusercontent.com"}>
      <GoogleLogin
        onSuccess={credentialResponse => {
          session.login(credentialResponse.credential!)
            .then(onSuccess)
            .catch(err => {
              if (err instanceof UnauthorizedError) {
                setGoogleCredential(credentialResponse.credential!);
              }
              else {
                onError(err.message);
              }
            })
        }}
        onError={() => onError('Google login failed')}
      />
    </GoogleOAuthProvider>
  )
}