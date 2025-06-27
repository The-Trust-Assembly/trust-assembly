import { createContext, useContext } from "react";
import { getUser, login, register, User } from "../backend/api";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";

export type Session = {
  type: "loggedIn";
  user: User;
} | {
  type: "loggedOut";
  login: (token: string) => Promise<User>;
  register: (token: string) => Promise<User>;
};

export const SessionContext = createContext<Session | null>(null);

export const useSession = () => {
  const value = useContext(SessionContext);
  if (value === null) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return value;
}

type Props = {
  children: React.ReactNode;
}
export default function SessionProvider({ children }: Props) {
  const queryClient = useQueryClient();
  const { data: user } = useSuspenseQuery({
    queryKey: ["user"],
    queryFn: getUser,
  });
  const loginMutator = useMutation({
    mutationFn: login,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });
  const registerMutator = useMutation({
    mutationFn: register,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
    }
  });

  const session: Session = user
    ? { type: "loggedIn", user }
    : {
      type: "loggedOut",
      login: (token) => loginMutator.mutateAsync(token),
      register: (token) => registerMutator.mutateAsync(token),
    };
  
  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}
