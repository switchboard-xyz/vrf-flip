use crate::*;
use anchor_lang::prelude::*;
use solana_program::clock::Clock;

pub struct RequestRandomnessAccounts<'a> {
    /// CHECK:
    pub user: AccountInfo<'a>,
    /// CHECK:
    pub vrf: AccountInfo<'a>,
    /// CHECK:
    pub oracle_queue: AccountInfo<'a>,
    /// CHECK:
    pub queue_authority: AccountInfo<'a>,
    /// CHECK:
    pub data_buffer: AccountInfo<'a>,
    /// CHECK:
    pub permission: AccountInfo<'a>,
    /// CHECK:
    pub vrf_escrow: Account<'a, TokenAccount>,
    /// CHECK:
    pub vrf_payer: Account<'a, TokenAccount>,
    /// CHECK:
    pub payer_authority: AccountInfo<'a>,
    /// CHECK:
    pub recent_blockhashes: AccountInfo<'a>,
    /// CHECK:
    pub switchboard_program_state: AccountInfo<'a>,
    /// CHECK:
    pub token_program: AccountInfo<'a>,
}

pub struct RequestRandomnessBumps {
    pub user: u8,
    pub switchboard_state: u8,
    pub vrf_permission: u8,
}

pub struct RequestRandomness<'a> {
    /// CHECK:
    pub switchboard_program: AccountInfo<'a>,
    /// CHECK:
    pub house: AccountInfo<'a>,
    /// CHECK:
    pub authority: AccountInfo<'a>,
    pub bumps: RequestRandomnessBumps,
    pub accounts: RequestRandomnessAccounts<'a>,
}

impl UserState {
    pub fn size() -> usize {
        std::mem::size_of::<UserState>() + 8
    }

    pub fn request_randomness(ctx: &RequestRandomness) -> anchor_lang::Result<()> {
        let vrf_request_randomness = VrfRequestRandomness {
            authority: ctx.accounts.user.clone(),
            vrf: ctx.accounts.vrf.clone(),
            oracle_queue: ctx.accounts.oracle_queue.clone(),
            queue_authority: ctx.accounts.queue_authority.clone(),
            data_buffer: ctx.accounts.data_buffer.clone(),
            permission: ctx.accounts.permission.clone(),
            escrow: ctx.accounts.vrf_escrow.clone(),
            payer_wallet: ctx.accounts.vrf_payer.clone(),
            payer_authority: ctx.accounts.payer_authority.clone(),
            recent_blockhashes: ctx.accounts.recent_blockhashes.clone(),
            program_state: ctx.accounts.switchboard_program_state.clone(),
            token_program: ctx.accounts.token_program.clone(),
        };

        vrf_request_randomness.invoke_signed(
            ctx.switchboard_program.clone(),
            ctx.bumps.switchboard_state,
            ctx.bumps.vrf_permission,
            &[&[
                &USER_SEED,
                ctx.house.key().as_ref(),
                ctx.authority.key().as_ref(),
                &[ctx.bumps.user],
            ]],
        )?;

        Ok(())
    }

    pub fn new_round(
        &mut self,
        game_type: GameType,
        guess: u32,
        bet_amount: u64,
    ) -> anchor_lang::Result<()> {
        let clock = Clock::get()?;

        // push current round to history
        if self.current_round != Round::default()
            && self.current_round.round_id
                != self.history.rounds[self.history.idx as usize].round_id
        {
            let history_idx = self.history.idx;
            self.history.rounds[history_idx as usize] = self.current_round;
            self.history.idx = (history_idx + 1) % MAX_HISTORY;
        }

        // set new round
        self.current_round = Round {
            game_type: game_type,
            status: RoundStatus::Awaiting,
            game_config: game_type.get_game_config()?,
            guess,
            result: 0,
            bet_amount,
            round_id: self.current_round.round_id.checked_add(1).unwrap(),
            request_slot: clock.slot,
            request_timestamp: clock.unix_timestamp,
            settle_slot: 0,
            settle_timestamp: 0,
        };

        Ok(())
    }
}
