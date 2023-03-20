import React from 'react';
import { useSelector } from 'react-redux';
import { Store } from '../../../data';
import { colorForSeverity } from '../../../util';
import { Severity } from '../../../util/const';
import css from '../../../util/css';

const FocusDisplay: React.FC = () => {
  const [tabHasFocus, setTabHasFocus] = React.useState(true);
  const cluster = useSelector((store: Store) => store.gameState.cluster);

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

  return (
    <div
      style={{
        ...css.walletText,
        ...css.noUserSelect,
        position: `absolute`,
        top: 0,
        left: 0,
        marginTop: '16px',
      }}
    >
      Playing on <strong style={{ color: colorForSeverity(Severity.Success) }}>{cluster}</strong>.
      <br />
      {!tabHasFocus && <strong style={{ color: colorForSeverity(Severity.Error) }}>Window needs focus.</strong>}
    </div>
  );
};

export default FocusDisplay;
