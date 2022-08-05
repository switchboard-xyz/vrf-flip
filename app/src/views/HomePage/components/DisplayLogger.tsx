import dateFormat from 'dateformat';
import _ from 'lodash';
import React from 'react';
import { useSelector } from 'react-redux';
import { hooks, Store, thunks } from '../../../data';
import { colorForSeverity } from '../../../util';
import { Severity } from '../../../util/const';
import css from '../../../util/css';

const DisplayLog: React.FC<{ timestamp: number; message: string; color: string }> = (props) => (
  <div style={{ display: 'flex', ...css.bodyText, color: props.color }}>
    <span style={{ minWidth: '80px' }}>{dateFormat(new Date(props.timestamp), 'HH:MM:ss')} ❯</span>
    <span style={{ wordBreak: 'break-all' }}>{props.message}</span>
  </div>
);

const UserInput: React.FC = () => {
  const api = hooks.useApi();
  const dispatch = hooks.useThunkDispatch();
  const [timestamp, setTimestamp] = React.useState(Date.now());
  const [userInput, setUserInput] = React.useState('');
  const commandRef = React.useRef<string | undefined>();

  React.useEffect(() => {
    const command = commandRef.current;
    commandRef.current = undefined;
    if (command && !_.isEmpty(command)) {
      dispatch(thunks.log({ message: command, severity: Severity.User }));
      api.handleCommand(command);
    }
  }, [api, dispatch, userInput]);

  const keydownCallback = React.useCallback((event: KeyboardEvent) => {
    window.scrollTo(0, 0);
    if (event.metaKey) return;
    // Prevent the default spacebar behavior - where it will normally try to scroll the page body down.
    if (event.key === ' ' && event.target === document.body) event.preventDefault();

    const key = event.key;
    switch (key) {
      case 'Enter':
        return setUserInput((prev) => {
          if (!_.isEmpty(prev)) commandRef.current = prev;
          return '';
        });
      case 'Shift':
        return;
      case 'Backspace':
        return setUserInput((prev) => prev.slice(0, -1));
      default: {
        if (key.length === 1 && key.match(/^[A-Za-z0-9 _-]{1}/)) setUserInput((prev) => prev + key);
        return;
      }
    }
  }, []);

  React.useEffect(() => {
    window.addEventListener('keydown', keydownCallback, false);
    return () => window.removeEventListener('keydown', keydownCallback, false);
  }, [keydownCallback]);

  // Set an interval to update timestamp.
  React.useEffect(() => {
    const timerId = setInterval(() => setTimestamp(Date.now()), 1000);
    return () => clearInterval(timerId);
  }, []);

  return <DisplayLog timestamp={timestamp} message={`${userInput}█`} color={colorForSeverity(Severity.User)} />;
};

const DisplayLogger: React.FC = () => {
  const logs = useSelector(({ HUDLogger }: Store) => HUDLogger.logs);

  return (
    <div style={{ width: '100%', marginTop: '24px' }}>
      <UserInput />
      {logs.map(({ key, timestamp, message, severity }) => (
        <DisplayLog key={key} timestamp={timestamp} message={message} color={colorForSeverity(severity)} />
      ))}
    </div>
  );
};

export default DisplayLogger;
