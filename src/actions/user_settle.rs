use crate::*;

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
        has_one = switchboard_request, // ensures a copy cat VRF account wasnt submitted
        has_one = house,
        has_one = escrow,
        has_one = reward_address,
    )]
    pub user: AccountLoader<'info, UserState>,

    #[account(
        seeds = [HOUSE_SEED],
        bump = house.load()?.bump,
        has_one = house_vault,
        has_one = switchboard_function,
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


    // SWITCHBOARD ACCOUNTS
    pub switchboard_function: AccountLoader<'info, FunctionAccountData>,
    #[account(
        constraint = switchboard_request.validate_signer(
            &switchboard_function.to_account_info(),
            &enclave_signer.to_account_info()
          )?
      )]
    pub switchboard_request: Box<Account<'info, FunctionRequestAccountData>>,
    pub enclave_signer: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct UserSettleParams {
    pub result: u32
}

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

    pub fn actuate(ctx: &Context<Self>, params: &UserSettleParams) -> anchor_lang::Result<()> {
        msg!("user_settle");
        let clock = Clock::get()?;

        let house = ctx.accounts.house.load()?;
        let house_bump = house.bump.clone();
        let house_seeds: &[&[&[u8]]] = &[&[&HOUSE_SEED, &[house_bump]]];
        drop(house);

        let mut user = ctx.accounts.user.load_mut()?;

        let user_won = user.current_round.settle(&params.result)?;
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

        user.current_round.status = RoundStatus::Settled;

        Ok(())
    }
}
