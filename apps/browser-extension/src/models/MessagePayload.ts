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
    

export type Citation = { url: string; explanation: string };
    
export type HeadlineMessage =
  | {
    originalHeadline: string,
    replacementHeadline: string,
    citations: Citation[],
  };
