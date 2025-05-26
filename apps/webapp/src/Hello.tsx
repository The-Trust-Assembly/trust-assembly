import { useSession } from "./contexts/SessionProvider";

// Test component for features in development
export default function Hello() {
  const session = useSession();

  return (
    <div>
      {session.type === "loggedIn" ? (
        <h1>Hello, {session.user.name}!</h1>
      ) : (
        <button
          onClick={session.login}
        >
          Login
        </button>
      )}
    </div>
  )
}
