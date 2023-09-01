import { Box } from '@mui/material';
import React from 'react';
import { hooks, thunks } from '../data';
import { NAVBAR_HEIGHT, NAVBAR_HORZ_PAD, zIndices } from '../util/const';
import css from '../util/css';
import { WalletConnectButton, WalletDisconnectButton, WalletMultiButton } from '@solana/wallet-adapter-react-ui';

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
        <WalletMultiButton />
      </div>
    </Box>
  );
};

export default NavigationBar;
