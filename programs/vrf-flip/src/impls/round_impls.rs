use crate::*;
use anchor_lang::prelude::*;
use solana_program::clock::Clock;

impl Round {
    pub fn is_open(&self) -> bool {
        let clock = Clock::get().unwrap();

        if self.status == RoundStatus::Awaiting
            && self.request_timestamp > clock.unix_timestamp - 60
        {
            return true;
        }

        false
    }

    pub fn settle(&mut self, vrf_result: &[u32]) -> anchor_lang::Result<bool> {
        let clock = Clock::get().unwrap();

        let result = vrf_result[0] % self.game_config.max + self.game_config.min;

        self.result = result;
        self.settle_slot = clock.slot;
        self.settle_timestamp = clock.unix_timestamp;
        self.status = RoundStatus::Settled;

        Ok(self.result == self.guess)
    }

    pub fn payout_amount(&self) -> anchor_lang::Result<u64> {
        if self.result == 0 {
            return Err(error!(VrfFlipError::CurrentRoundStillActive));
        }
        if self.result != self.guess {
            return Ok(0);
        }

        let payout_amount = self
            .bet_amount
            .checked_mul(self.game_config.payout_multiplier as u64)
            .unwrap();

        Ok(payout_amount)
    }
}
