use crate::*;
use anchor_spl::token::{Token, TokenAccount, Transfer};
use solana_program::native_token::LAMPORTS_PER_SOL;
pub use switchboard_v2::{
    OracleQueueAccountData, PermissionAccountData, SbState, VrfAccountData, VrfRequestRandomness,
    SWITCHBOARD_PROGRAM_ID,
};
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
        has_one = vrf,
        has_one = authority,
        has_one = escrow,
    )]
    pub user: AccountLoader<'info, UserState>,
    #[account(
        seeds = [HOUSE_SEED],
        bump = house.load()?.bump,
        has_one = house_vault
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
    #[account(mut,
        owner = SWITCHBOARD_PROGRAM_ID @ VrfFlipError::InvalidSwitchboardAccount,
        constraint = 
            vrf.load()?.escrow == vrf_escrow.key() && 
            vrf.load()?.authority == user.key()
    )]
    pub vrf: AccountLoader<'info, VrfAccountData>,
    /// CHECK
    #[account(mut, 
        has_one = data_buffer,
        owner = SWITCHBOARD_PROGRAM_ID @ VrfFlipError::InvalidSwitchboardAccount,
        constraint = 
            oracle_queue.load()?.authority == queue_authority.key()
    )]
    pub oracle_queue: AccountLoader<'info, OracleQueueAccountData>,
    /// CHECK: Will be checked in the CPI instruction
    pub queue_authority: UncheckedAccount<'info>,
    /// CHECK
    #[account(mut, 
        owner = SWITCHBOARD_PROGRAM_ID @ VrfFlipError::InvalidSwitchboardAccount,
    )]
    pub data_buffer: AccountInfo<'info>,
    /// CHECK
    #[account(mut, 
        owner = SWITCHBOARD_PROGRAM_ID @ VrfFlipError::InvalidSwitchboardAccount,
    )]
    pub permission: AccountLoader<'info, PermissionAccountData>,
    #[account(
        mut, 
        token::mint = house.load()?.switchboard_mint,
        token::authority = switchboard_program_state,
    )]
    pub vrf_escrow: Box<Account<'info, TokenAccount>>,
    /// CHECK: Will be checked in the CPI instruction
    #[account(mut, 
        owner = SWITCHBOARD_PROGRAM_ID @ VrfFlipError::InvalidSwitchboardAccount,
    )]
    pub switchboard_program_state: AccountLoader<'info, SbState>,
    /// CHECK:
    #[account(
        address = SWITCHBOARD_PROGRAM_ID @ VrfFlipError::InvalidSwitchboardAccount,
        constraint = 
            switchboard_program.executable == true 
    )]
    pub switchboard_program: AccountInfo<'info>,

    // PAYER ACCOUNTS
    /// CHECK:
    #[account(mut, signer)]
    pub payer: AccountInfo<'info>,
    #[account(
        mut,
        token::mint = house.load()?.switchboard_mint,
        token::authority = payer,
    )]
    pub vrf_payer: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = house.load()?.mint,
        token::authority = payer,
    )]
    pub flip_payer: Box<Account<'info, TokenAccount>>,

    // SYSTEM ACCOUNTS
    /// CHECK:
    #[account(address = solana_program::sysvar::recent_blockhashes::ID)]
    pub recent_blockhashes: AccountInfo<'info>,
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
        let clock = Clock::get()?;

        if user.current_round.is_open() {
            return Err(error!(VrfFlipError::CurrentRoundStillActive));
        }

        let game_type = GameType::from_u32(params.game_type)?;
        let game_config = game_type.get_game_config()?;
        if params.user_guess < game_config.min || params.user_guess > game_config.max {
            return Err(error!(VrfFlipError::InvalidBet));
        }

        let house_vault_balance = ctx.accounts.house_vault.amount;
        if params.bet_amount * 10 > house_vault_balance || params.bet_amount > MAX_BET_AMOUNT {
            return Err(error!(VrfFlipError::MaxBetAmountExceeded));
        }

        if user.current_round.request_timestamp != 0
            && clock.unix_timestamp - 10 < user.current_round.request_timestamp
        {
            return Err(error!(VrfFlipError::FlipRequestedTooSoon));
        }

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
        let combined_balance = ctx
            .accounts
            .vrf_payer
            .amount
            .checked_add(ctx.accounts.vrf_escrow.amount)
            .unwrap_or(0);
        if combined_balance < VRF_REQUEST_COST {
            msg!(
                "missing funds to request randomness, need {}, have {}",
                VRF_REQUEST_COST,
                combined_balance
            );
            return Err(error!(VrfFlipError::InsufficientFunds));
        }

        Ok(())
    }

    pub fn actuate(ctx: Context<Self>, params: &UserBetParams) -> anchor_lang::Result<()> {
        msg!("user_flip");
        let clock = Clock::get()?;

        let vrf = ctx.accounts.vrf.load()?;
        let round_id = vrf.counter.checked_add(1).unwrap();
        drop(vrf);

        let user = ctx.accounts.user.load()?;

        let user_bump = user.bump;
        let switchboard_state_bump = user.switchboard_state_bump;
        let vrf_permission_bump = user.vrf_permission_bump;

        drop(user);

        if ctx.accounts.escrow.amount >= params.bet_amount {
            msg!("escrow already funded");
        } else {
            let escrow_transfer_amount = params
                .bet_amount
                .checked_sub(ctx.accounts.escrow.amount)
                .unwrap_or(params.bet_amount);
            msg!(
                "transferring {} flip tokens to escrow",
                escrow_transfer_amount
            );
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info().clone(),
                    Transfer {
                        from: ctx.accounts.flip_payer.to_account_info(),
                        to: ctx.accounts.escrow.to_account_info(),
                        authority: ctx.accounts.authority.clone(),
                    },
                ),
                escrow_transfer_amount,
            )?;
        }

        msg!("creating randomness instruction");
        UserState::request_randomness(&RequestRandomness {
            switchboard_program: ctx.accounts.switchboard_program.to_account_info(),
            house: ctx.accounts.house.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
            bumps: RequestRandomnessBumps {
                user: user_bump,
                switchboard_state: switchboard_state_bump,
                vrf_permission: vrf_permission_bump,
            },
            accounts: RequestRandomnessAccounts {
                user: ctx.accounts.user.to_account_info().clone(),
                vrf: ctx.accounts.vrf.to_account_info(),
                oracle_queue: ctx.accounts.oracle_queue.to_account_info(),
                queue_authority: ctx.accounts.queue_authority.to_account_info(),
                data_buffer: ctx.accounts.data_buffer.to_account_info(),
                permission: ctx.accounts.permission.to_account_info(),
                vrf_escrow: *ctx.accounts.vrf_escrow.clone(),
                vrf_payer: *ctx.accounts.vrf_payer.clone(),
                payer_authority: ctx.accounts.payer.to_account_info(),
                recent_blockhashes: ctx.accounts.recent_blockhashes.to_account_info(),
                switchboard_program_state: ctx.accounts.switchboard_program_state.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
            },
        })?;
        msg!("randomness requested successfully");

        let user = &mut ctx.accounts.user.load_mut()?;

        let game_type = GameType::from_u32(params.game_type)?;

        user.new_round(game_type, params.user_guess, params.bet_amount)?;

        drop(user);

        emit!(UserBetPlaced {
            round_id: round_id,
            user: ctx.accounts.user.key(),
            game_type: game_type,
            bet_amount: params.bet_amount,
            guess: params.user_guess,
            slot: clock.slot,
            timestamp: clock.unix_timestamp
        });

        Ok(())
    }
}
