import React from 'react';
import css from '../../../util/css';

const content = `
1) Connect your favorite SPL wallet.
2) Create user accounts with \`user create\`.
3) Airdrop with \`user airdrop\`.
4) Play with \`user play <GUESS> <BET>\`.
5) Win (or lose, but verifiably).
`;

const Instructions: React.FC = (props) => {
  return (
    <span
      style={{
        whiteSpace: 'pre',
        marginTop: '64px',
        padding: '8px',
        borderStyle: 'double',
        ...css.bodyText,
      }}
    >
      <u>Switchboard VRF Game</u>
      <br />
      {content.trim()}
    </span>
  );
};

export default Instructions;
