import React from 'react';
import css from '../../../util/css';

const content = `
1) Connect your favorite SPL wallet.
2) Change cluster with \`network set\`.
3) Create user accounts with \`user create\`.
4) Airdrop with \`user airdrop\`.
5) Play with \`user play <GUESS> <BET>\`.
6) Win (or lose, but verifiably).
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
