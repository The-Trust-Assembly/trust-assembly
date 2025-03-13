import { TrustAssemblyMessage } from '../utils/messagePassing';

export type MessagePayload =
  | {
      action: TrustAssemblyMessage.TOGGLE_MODIFICATION;
      headline?: string;
    }
  | {
      action: TrustAssemblyMessage.SET_MODIFIED_HEADLINE;
      headline?: string;
    };
