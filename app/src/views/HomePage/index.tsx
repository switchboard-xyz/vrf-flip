import React from 'react';
import { NAVBAR_HEIGHT, NAVBAR_HORZ_PAD } from '../../util/const';
import { DisplayLogger, FocusDisplay, Instructions, UserBalance } from './components';

const HomePage: React.FC = () => {
  return (
    // Page positioning, sizing, and framing.
    <div
      style={{
        display: `flex`,
        flexDirection: `column`,
        position: `absolute`,
        alignItems: 'center',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        margin: `${NAVBAR_HEIGHT}px ${NAVBAR_HORZ_PAD}px 0px`,
      }}
    >
      {/* Content Area */}
      <div
        style={{
          position: 'relative',
          display: `flex`,
          flexDirection: `column`,
          alignItems: `center`,
          minHeight: '100%',
          width: '100%',
          maxWidth: '1024px',
        }}
      >
        <UserBalance />
        <FocusDisplay />
        <Instructions />
        <DisplayLogger />
      </div>
    </div>
  );
};

export default HomePage;
