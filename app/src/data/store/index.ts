import { combineReducers, configureStore } from '@reduxjs/toolkit';
import gameState from './gameStateReducer';
import HUDLogger from './hudLoggerReducer';

/**
 * From RTK docs --
 * This creates a Redux store, and also automatically configures the Redux DevTools
 * extension so that you can inspect the store while developing. It also brings in redux-thunk
 * https://redux-toolkit.js.org/tutorials/quick-start#create-a-redux-store
 */
const store = configureStore({
  reducer: combineReducers({
    HUDLogger,
    gameState,
  }),
  devTools: process.env.NODE_ENV !== 'production',
});

export default store;
