import React from 'react';
import { colorForSeverity } from '../../../util';
import { Severity } from '../../../util/const';
import css from '../../../util/css';

const FocusDisplay: React.FC = () => {
  const [tabHasFocus, setTabHasFocus] = React.useState(true);

  const handleFocus = React.useCallback(() => setTabHasFocus(true), []);
  const handleBlur = React.useCallback(() => setTabHasFocus(false), []);

  React.useEffect(() => {
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, [handleBlur, handleFocus]);

  if (tabHasFocus) return null;
  return (
    <div
      style={{
        ...css.walletText,
        ...css.noUserSelect,
        position: `absolute`,
        top: 0,
        left: 0,
        marginTop: '16px',
        color: colorForSeverity(Severity.Error),
      }}
    >
      <strong>Window needs focus.</strong>
    </div>
  );
};

export default FocusDisplay;
