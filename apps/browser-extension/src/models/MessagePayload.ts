import { TrustAssemblyMessage } from '../utils/messagePassing';

export type MessagePayload =
  | {
      action: TrustAssemblyMessage.TOGGLE_MODIFICATION;
      headline?: string;
    }
  | {
      action: TrustAssemblyMessage.FETCH_TRANSFORMED_HEADLINE;
      url: string;
    };
