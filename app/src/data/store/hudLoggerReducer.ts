import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';
import { Severity } from '../../util/const';

interface Log {
  key: string;
  timestamp: number;
  message: string;
  severity: Severity;
}

// Define a type for the slice state
interface HUDLoggerState {
  /** The list of logs to display. */
  logs: Log[];
}

const initialState: HUDLoggerState = { logs: [] };

/**
 * Creates a log in the log buffer.
 */
export const log = createAsyncThunk<Log, { message: string; severity?: Severity }>('logger/log', (props): Log => {
  return { key: uuid(), timestamp: Date.now(), severity: props.severity ?? Severity.Normal, message: props.message };
});

/**
 * A data slice to control the Ecosystem feature.
 */
const userSlice = createSlice({
  name: 'userSlice',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(log.fulfilled, (state, action) => {
      // Limit logs to buffer a specific number of logs (This can be configured as appropriate).
      state.logs = [action.payload, ...state.logs.slice(0, 500)];
    });
  },
});

export default userSlice.reducer;
