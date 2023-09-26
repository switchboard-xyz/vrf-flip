import { Box } from '@mui/material';
import React from 'react';
import { hooks, thunks } from '../data';
import { NAVBAR_HEIGHT, NAVBAR_HORZ_PAD, zIndices } from '../util/const';
import css from '../util/css';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';

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
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const dispatch = hooks.useThunkDispatch();
  const { publicKey, disconnect } = useWallet();
  const [hovered, setHovered] = React.useState(false);

  const content = React.useMemo(() => {
    if (publicKey) {
      if (hovered) return 'Disconnect';

      const pubkey = publicKey.toBase58();
      const truncatedPubkey = `${pubkey.slice(0, 5)}...${pubkey.slice(-5)}`;
      return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          Connected as
          <span style={{ fontFamily: 'Fira Code' }}>{truncatedPubkey}</span>
        </div>
      );
    }
    return 'Connect Wallet';
  }, [publicKey, hovered]);

  const onWalletButtonClick = React.useCallback(() => {
    if (!publicKey) return setWalletModalVisible(true)

    dispatch(thunks.log({ message: `Disconnecting wallet ${publicKey.toBase58()}` }));
    disconnect();
  }, [publicKey, disconnect, setWalletModalVisible]);

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
      onClick={onWalletButtonClick}
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
