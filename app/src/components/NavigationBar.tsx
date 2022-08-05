import { useConnectedWallet, useWalletKit } from '@gokiprotocol/walletkit';
import { Box } from '@mui/material';
import React from 'react';
import { hooks, thunks } from '../data';
import { NAVBAR_HEIGHT, NAVBAR_HORZ_PAD, zIndices } from '../util/const';
import css from '../util/css';

const Title: React.FC = () => {
  return (
    <span
      style={{
        color: 'white',
        fontFamily: 'Fira Code',
        fontSize: '18px',
        ...css.noUserSelect,
      }}
    >
      🎲 vrf-demo
    </span>
  );
};

const WalletButton: React.FC = () => {
  const walletKit = useWalletKit();
  const wallet = useConnectedWallet();
  const dispatch = hooks.useThunkDispatch();
  const [hovered, setHovered] = React.useState(false);

  const disconnect = React.useCallback(() => {
    if (wallet) {
      dispatch(thunks.log({ message: `Disconnecting wallet ${wallet.publicKey.toBase58()}` }));
      wallet.disconnect();
    }
  }, [dispatch, wallet]);

  const content = React.useMemo(() => {
    if (wallet) {
      if (hovered) return 'Disconnect';

      const pubkey = wallet.publicKey.toBase58();
      const truncatedPubkey = `${pubkey.slice(0, 5)}...${pubkey.slice(-5)}`;
      return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          Connected as
          <span style={{ fontFamily: 'Fira Code' }}>{truncatedPubkey}</span>
        </div>
      );
    }
    return 'Connect Wallet';
  }, [wallet, hovered]);

  return (
    <Box
      sx={{
        ...css.noUserSelect,
        ...css.walletText,
        position: 'float',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '40px',
        minWidth: '140px',
        color: 'white',
        textTransform: 'none',
        lineHeight: 1.2,
        borderStyle: 'double',
        '&:hover': {
          backgroundColor: '#FFFFFF28',
          cursor: 'pointer',
        },
      }}
      onMouseOver={() => setHovered && setHovered(true)}
      onMouseEnter={() => setHovered && setHovered(true)}
      onMouseOut={() => setHovered && setHovered(false)}
      onMouseLeave={() => setHovered && setHovered(false)}
      onClick={wallet ? disconnect : walletKit.connect}
    >
      {content}
    </Box>
  );
};

const NavigationBar: React.FC = () => {
  return (
    <Box
      sx={{
        position: 'absolute',
        display: 'flex',
        justifyContent: 'center',
        left: 0,
        right: 0,
        height: `${NAVBAR_HEIGHT}px`,
        padding: `0px ${NAVBAR_HORZ_PAD}px`,
        zIndex: zIndices.Navbar,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          maxWidth: '1024px',
        }}
      >
        <Title />
        <WalletButton />
      </div>
    </Box>
  );
};

export default NavigationBar;
