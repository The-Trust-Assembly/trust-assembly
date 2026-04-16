import React from 'react';
import { AccountInfo } from '../App';

interface Props {
  accounts: AccountInfo[];
  selectedAccountId: string;
  onChange: (accountId: string) => void;
  disabled?: boolean;
}

export default React.memo(function AccountPicker({ accounts, selectedAccountId, onChange, disabled }: Props) {
  // Don't render if only one account
  if (accounts.length <= 1) return null;

  return (
    <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
      <label style={{ fontSize: 12 }}>Account</label>
      <select
        value={selectedAccountId}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={{ fontSize: 13 }}
      >
        {accounts.map(acct => (
          <option key={acct.accountId} value={acct.accountId}>
            {acct.taUsername}{acct.isDefault ? ' (default)' : ''}
            {acct.authStatus === 'unauthenticated' ? ' [offline]' : ''}
          </option>
        ))}
      </select>
    </div>
  );
});
