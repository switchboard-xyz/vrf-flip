import { useConnectedWallet } from '@gokiprotocol/walletkit';
import _ from 'lodash';
import React from 'react';
import { useSelector } from 'react-redux';
import { Store } from '../../../data';
import css from '../../../util/css';

const UserBalance: React.FC = () => {
  const wallet = useConnectedWallet();
  const balances = useSelector((store: Store) => store.gameState.userBalances);
  const formatValue = React.useCallback((balance: any) => (_.isNumber(balance) ? balance.toPrecision(5) : '--'), []);

  if (!wallet) return null;
  return (
    <div
      title="Ribs are used to play,&#013;Sol pays for VRF"
      style={{
        position: `absolute`,
        top: 0,
        right: 0,
        marginTop: '16px',
        ...css.walletText,
        ...css.noUserSelect,
      }}
    >
      Balances: <br />
      {formatValue(balances?.ribs)} ψ<br />
      {formatValue(balances?.sol)} ◎
    </div>
  );
};

export default UserBalance;
