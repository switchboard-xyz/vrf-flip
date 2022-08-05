import React from 'react';

const noUserSelect: React.CSSProperties = {
  userSelect: `none`,
  msUserSelect: `none`,
  WebkitUserSelect: 'none',
};

const bodyText: React.CSSProperties = {
  fontFamily: 'Fira Code',
  fontSize: '12px',
  color: 'white',
};

const walletText: React.CSSProperties = {
  fontFamily: 'Fira Code',
  fontSize: '12px',
  color: 'white',
};

const css = {
  bodyText,
  walletText,
  noUserSelect,
};

export default css;
