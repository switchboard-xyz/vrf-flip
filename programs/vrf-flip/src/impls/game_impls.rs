use crate::*;
use anchor_lang::prelude::*;
// use solana_program::clock::Clock;

impl GameType {
    pub fn from_u32(val: u32) -> anchor_lang::Result<GameType> {
        match val {
            0 => Ok(GameType::None),
            1 => Ok(GameType::CoinFlip),
            2 => Ok(GameType::SixSidedDiceRoll),
            3 => Ok(GameType::TwentySidedDiceRoll),
            _ => Err(error!(VrfFlipError::InvalidGameType)),
        }
    }

    pub fn get_game_config(&self) -> anchor_lang::Result<GameConfig> {
        match self {
            GameType::CoinFlip => Ok(GameConfig {
                num_vrf_requests: 1,
                min: 1,
                max: 2,
                payout_multiplier: 1,
            }),
            GameType::SixSidedDiceRoll => Ok(GameConfig {
                num_vrf_requests: 1,
                min: 1,
                max: 6,
                payout_multiplier: 5,
            }),
            GameType::TwentySidedDiceRoll => Ok(GameConfig {
                num_vrf_requests: 1,
                min: 1,
                max: 20,
                payout_multiplier: 19,
            }),
            _ => Err(error!(VrfFlipError::InvalidGameType)),
        }
    }

    // pub fn payout_amount(&self, bet_amount: u64) -> u64 {
    //     match self {
    //         GameType::None => 0,
    //         GameType::CoinFlip => bet_amount * 1,
    //         GameType::SixSidedDiceRoll => bet_amount * 5,
    //         GameType::TwentySidedDiceRoll => bet_amount * 19,
    //     }
    // }
}

impl Default for GameType {
    fn default() -> GameType {
        GameType::None
    }
}
