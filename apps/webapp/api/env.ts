import { Session } from "@jcs224/hono-sessions";
import BasicDbRepo from "./basicDbRepo.ts";

export type SessionData = {
  user: User;
};

export type User = {
  id: string;
  name: string;
  email: string;
};

export type Env = {
  Variables: {
    db: BasicDbRepo;
    session: Session<SessionData>;
    session_key_rotation: boolean;
  },
};