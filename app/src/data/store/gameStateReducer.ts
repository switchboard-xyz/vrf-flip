import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import _ from 'lodash';
import { GameTypeValue } from '../../api';
import { Cluster } from '../providers/ApiProvider';

interface Balances {
  sol?: number;
  ribs?: number;
}

// Define a type for the slice state
export interface GameState {
  cluster: Cluster;
  /**
   * The latest known balance of the user's wallet.
   */
  userBalances: Balances;
  /**
   * Boolean indicating whether a load is in progress.
   */
  loading: boolean;
  /**
   * The current mode tha the game is being played with.
   */
  gameMode: GameTypeValue;
}

/**
 * The initial {@linkcode GameState} to set in the data slice.
 */
const initialState: GameState = {
  cluster: 'devnet',
  loading: false,
  gameMode: GameTypeValue.COIN_FLIP,
  userBalances: {},
};

/**
 * A data slice to control the Ecosystem feature.
 */
const gameStateSlice = createSlice({
  name: 'gameStateSlice',
  initialState: initialState,
  reducers: {
    setCluster: (state: GameState, action: PayloadAction<Cluster>) => {
      state.cluster = action.payload;
    },
    setUserBalance: (state: GameState, action: PayloadAction<Balances | undefined>) => {
      if (action.payload) {
        // If ribs value changed, update.
        if (!_.isUndefined(action.payload.ribs)) state.userBalances.ribs = action.payload.ribs;
        // If sol value changed, update.
        if (!_.isUndefined(action.payload.sol)) state.userBalances.sol = action.payload.sol;
      } else {
        // Clear user balances.
        state.userBalances.sol = undefined;
        state.userBalances.ribs = undefined;
      }
    },
  },
});

export const { setCluster, setUserBalance } = gameStateSlice.actions;
export default gameStateSlice.reducer;
