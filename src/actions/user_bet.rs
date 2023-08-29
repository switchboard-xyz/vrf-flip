use crate::*;

const VRF_REQUEST_COST: u64 = 2 * LAMPORTS_PER_SOL / 1000;

#[derive(Accounts)]
#[instruction(params: UserBetParams)] // rpc parameters hint
pub struct UserBet<'info> {
    #[account(
        mut,
        seeds = [
            USER_SEED, 
            house.key().as_ref(), 
            authority.key().as_ref()
        ],
        bump = user.load()?.bump,
        has_one = switchboard_request,
        has_one = authority,
        has_one = escrow,
    )]
    pub user: AccountLoader<'info, UserState>,

    #[account(
        seeds = [HOUSE_SEED],
        bump = house.load()?.bump,
        has_one = house_vault,
        has_one = switchboard_function,
    )]
    pub house: AccountLoader<'info, HouseState>,

    #[account(
        associated_token::mint = house.load()?.mint,
        associated_token::authority = house,
    )]
    pub house_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK:
    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,

    #[account(
        mut,
        token::mint = house.load()?.mint,
        token::authority = house,
            
    )]
    pub escrow: Box<Account<'info, TokenAccount>>,

    // SWITCHBOARD ACCOUNTS
    #[account(address = anchor_spl::token::spl_token::native_mint::ID)]
    pub switchboard_mint: Account<'info, Mint>,
    #[account(mut)]
    pub switchboard_function: AccountLoader<'info, FunctionAccountData>,

    #[account(mut)]
    pub switchboard_request: Box<Account<'info, FunctionRequestAccountData>>,
    #[account(mut)]
    pub switchboard_request_escrow: Box<Account<'info, TokenAccount>>,
    #[account(
        seeds = [STATE_SEED],
        seeds::program = switchboard.key(),
        bump = switchboard_state.load()?.bump,
      )]
    pub switchboard_state: AccountLoader<'info, AttestationProgramState>,
    pub switchboard_attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,
    /// CHECK:
    #[account(executable, address = SWITCHBOARD_ATTESTATION_PROGRAM_ID)]
    pub switchboard: AccountInfo<'info>,

    // PAYER ACCOUNTS
    /// CHECK:
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        token::mint = house.load()?.mint,
        token::authority = payer,
    )]
    pub flip_payer: Box<Account<'info, TokenAccount>>,

    // SYSTEM ACCOUNTS
    /// CHECK:
    pub system_program: Program<'info, System>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct UserBetParams {
    pub game_type: u32,
    pub user_guess: u32,
    pub bet_amount: u64,
}

impl UserBet<'_> {
    pub fn validate(&self, ctx: &Context<Self>, params: &UserBetParams) -> anchor_lang::Result<()> {
        let user = ctx.accounts.user.load()?;

        // if user.current_round.is_open() {
        //     return Err(error!(VrfFlipError::CurrentRoundStillActive));
        // }

        let game_type = GameType::from_u32(params.game_type)?;
        let game_config = game_type.get_game_config()?;
        if params.user_guess < game_config.min || params.user_guess > game_config.max {
            return Err(error!(VrfFlipError::InvalidBet));
        }

        let house_vault_balance = ctx.accounts.house_vault.amount;
        if params.bet_amount * 10 > house_vault_balance || params.bet_amount > MAX_BET_AMOUNT {
            return Err(error!(VrfFlipError::MaxBetAmountExceeded));
        }

        // let clock = Clock::get()?;
        // if user.current_round.request_timestamp != 0
        //     && clock.unix_timestamp - 10 < user.current_round.request_timestamp
        // {
        //     return Err(error!(VrfFlipError::FlipRequestedTooSoon));
        // }

        // check FLIP balance
        if ctx.accounts.flip_payer.amount < params.bet_amount {
            msg!(
                "missing funds to play, need {}, have {}",
                params.bet_amount,
                ctx.accounts.flip_payer.amount
            );
            return Err(error!(VrfFlipError::InsufficientFunds));
        }

        // check token balance
        // let combined_balance = ctx
        //     .accounts
        //     .vrf_payer
        //     .amount
        //     .checked_add(ctx.accounts.vrf_escrow.amount)
        //     .unwrap_or(0);
        // if combined_balance < VRF_REQUEST_COST {
        //     msg!(
        //         "missing funds to request randomness, need {}, have {}",
        //         VRF_REQUEST_COST,
        //         combined_balance
        //     );
        //     return Err(error!(VrfFlipError::InsufficientFunds));
        // }

        Ok(())
    }

    pub fn actuate(ctx: Context<Self>, params: &UserBetParams) -> anchor_lang::Result<()> {
        msg!("user_flip");
        let clock = Clock::get()?;

        let user: std::cell::Ref<'_, UserState> = ctx.accounts.user.load()?;
        let user_bump = user.bump;
        drop(user);

        let request_ctx = FunctionRequestTrigger {
            request: ctx.accounts.switchboard_request.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
            escrow: ctx.accounts.switchboard_request_escrow.to_account_info(),
            function: ctx.accounts.switchboard_function.to_account_info(),
            state: ctx.accounts.switchboard_state.to_account_info(),
            attestation_queue: ctx.accounts.switchboard_attestation_queue.to_account_info(),
            payer: ctx.accounts.payer.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        request_ctx.invoke_signed(
            ctx.accounts.switchboard.clone(),
            None, 
            None, 
            None, 
            &[&[
                USER_SEED,
                ctx.accounts.house.key().as_ref(),
                ctx.accounts.authority.key().as_ref(),
                &[user_bump],
            ]]
        )?;
        msg!("randomness requested successfully");

        let user = &mut ctx.accounts.user.load_mut()?;

        let game_type = GameType::from_u32(params.game_type)?;

        user.new_round(game_type, params.user_guess, params.bet_amount)?;

        emit!(UserBetPlaced {
            round_id: user.current_round.round_id,
            user: ctx.accounts.user.key(),
            game_type,
            bet_amount: params.bet_amount,
            guess: params.user_guess,
            slot: clock.slot,
            timestamp: clock.unix_timestamp
        });

        Ok(())
    }
}
