use crate::*;
pub use switchboard_v2::{VrfAccountData, VrfRequestRandomness, VrfStatus};

#[derive(Accounts)]
#[instruction(params: UserSettleParams)] // rpc parameters hint
pub struct UserSettle<'info> {
    #[account(
        mut,
        seeds = [
            USER_SEED, 
            house.key().as_ref(), 
            user.load()?.authority.key().as_ref()
        ],
        bump = user.load()?.bump,
        has_one = vrf, // ensures a copy cat VRF account wasnt submitted
        has_one = house,
        has_one = escrow,
        has_one = reward_address,
    )]
    pub user: AccountLoader<'info, UserState>,
    #[account(
        seeds = [HOUSE_SEED],
        bump = house.load()?.bump,
        has_one = house_vault,
    )]
    pub house: AccountLoader<'info, HouseState>,
    /// CHECK:
    #[account(
        mut,
        token::mint = house.load()?.mint,
        token::authority = house,
    )]
    pub escrow: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = house.load()?.mint,
        token::authority = user.load()?.authority,
    )]
    pub reward_address: Account<'info, TokenAccount>,
    /// CHECK:
    #[account(
        mut,
        token::mint = house.load()?.mint,
        token::authority = house,
    )]
    pub house_vault: Account<'info, TokenAccount>,

    /// CHECK:
    #[account(
        constraint = 
            vrf.load()?.authority == user.key() @ VrfFlipError::InvalidVrfAuthority
    )]
    pub vrf: AccountLoader<'info, VrfAccountData>,
    pub token_program: Program<'info, Token>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct UserSettleParams {}

impl UserSettle<'_> {
    pub fn validate(
        &self,
        ctx: &Context<Self>,
        _params: &UserSettleParams,
    ) -> anchor_lang::Result<()> {
        let user = ctx.accounts.user.load()?;
        if user.current_round.status != RoundStatus::Awaiting {
            return Err(error!(VrfFlipError::CurrentRoundAlreadyClosed));
        }
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, _params: &UserSettleParams) -> anchor_lang::Result<()> {
        msg!("user_settle");
        let clock = Clock::get()?;

        let house = ctx.accounts.house.load()?;
        let house_bump = house.bump.clone();
        let house_seeds: &[&[&[u8]]] = &[&[&HOUSE_SEED, &[house_bump]]];
        drop(house);

        let vrf = ctx.accounts.vrf.load()?;
        if vrf.authority != ctx.accounts.user.key() {
            return Err(error!(VrfFlipError::InvalidVrfAuthority));
        }

        let mut user = ctx.accounts.user.load_mut()?;

        if vrf.counter != user.current_round.round_id {
            return Err(error!(VrfFlipError::IncorrectVrfCounter));
        }

        let vrf_result_buffer = vrf.get_result()?;
        let vrf_value: &[u32] = bytemuck::cast_slice(&vrf_result_buffer[..]);

        let user_won = user.current_round.settle(vrf_value)?;
        let reward_amount = user.current_round.payout_amount()?;

        let escrow_change: u64;
        if user_won {
            escrow_change = reward_amount + user.current_round.bet_amount;
            msg!("user won {} tokens!", reward_amount);
            transfer(
                &ctx.accounts.token_program,
                &ctx.accounts.house_vault,
                &ctx.accounts.reward_address,
                &ctx.accounts.house.to_account_info(),
                house_seeds,
                reward_amount,
            )?;
            transfer(
                &ctx.accounts.token_program,
                &ctx.accounts.escrow,
                &ctx.accounts.reward_address,
                &ctx.accounts.house.to_account_info(),
                house_seeds,
                ctx.accounts.escrow.amount,
            )?;
        } else {
            escrow_change = user.current_round.bet_amount;
            msg!("whomp whomp, loser!");
            transfer(
                &ctx.accounts.token_program,
                &ctx.accounts.escrow,
                &ctx.accounts.house_vault,
                &ctx.accounts.house.to_account_info(),
                house_seeds,
                user.current_round.bet_amount,
            )?;
        }

        emit!(UserBetSettled {
            round_id: user.current_round.round_id,
            user: ctx.accounts.user.key(),
            user_won: user_won,
            game_type: user.current_round.game_type,
            bet_amount: user.current_round.bet_amount,
            escrow_change: escrow_change,
            guess: user.current_round.guess,
            result: user.current_round.result,
            slot: clock.slot,
            timestamp: clock.unix_timestamp
        });

        Ok(())
    }
}
