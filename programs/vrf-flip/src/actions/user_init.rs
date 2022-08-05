use crate::*;

use anchor_spl::{
    associated_token::AssociatedToken,
    token::{spl_token::instruction::AuthorityType, Mint, MintTo, Token, TokenAccount},
};

#[derive(Accounts)]
#[instruction(params: UserInitParams)] // rpc parameters hint
pub struct UserInit<'info> {
    #[account(
        init,
        space = 8 + std::mem::size_of::<UserState>(),
        payer = payer,
        seeds = [
            USER_SEED, 
            house.key().as_ref(), 
            authority.key().as_ref()
        ],
        bump
    )]
    pub user: AccountLoader<'info, UserState>,
    #[account(
        seeds = [HOUSE_SEED],
        bump = house.load()?.bump,
        has_one = mint
    )]
    pub house: AccountLoader<'info, HouseState>,
    #[account(
        mut,
        mint::decimals = 9,
        mint::authority = house,
        mint::freeze_authority = house,
    )]
    pub mint: Account<'info, Mint>,
    /// CHECK:
    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,
    #[account(
        init,
        payer = payer,
        token::mint = mint,
        token::authority = authority,
    )]
    pub escrow: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = authority,
    )]
    pub reward_address: Account<'info, TokenAccount>,
    /// CHECK:
    #[account(mut,
        owner = SWITCHBOARD_PROGRAM_ID @ VrfFlipError::InvalidSwitchboardAccount,
        constraint = 
            vrf.load()?.authority == user.key() &&
            vrf.load()?.oracle_queue == house.load()?.switchboard_queue @ VrfFlipError::OracleQueueMismatch
    )]
    pub vrf: AccountLoader<'info, VrfAccountData>,
    /// CHECK:
    #[account(mut)]
    pub payer: Signer<'info>,

    // system accounts
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// CHECK:
    #[account(address = solana_program::sysvar::rent::ID)]
    pub rent: AccountInfo<'info>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct UserInitParams {
    pub switchboard_state_bump: u8,
    pub vrf_permission_bump: u8,
}

impl UserInit<'_> {
    pub fn validate(
        &self,
        ctx: &Context<Self>,
        _params: &UserInitParams,
    ) -> anchor_lang::Result<()> {
        let vrf = ctx.accounts.vrf.load()?;
        if vrf.counter != 0 {
            return Err(error!(VrfFlipError::InvalidInitialVrfCounter));
        }
        if vrf.authority != ctx.accounts.user.key() {
            return Err(error!(VrfFlipError::InvalidVrfAuthority));
        }
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, params: &UserInitParams) -> anchor_lang::Result<()> {
        msg!("user_init");

        let user = &mut ctx.accounts.user.load_init()?;

        user.bump = ctx.bumps.get("user").unwrap().clone();
        user.authority = ctx.accounts.authority.key().clone();
        user.house = ctx.accounts.house.key();
        user.escrow = ctx.accounts.escrow.key();
        user.reward_address = ctx.accounts.reward_address.key();
        user.vrf = ctx.accounts.vrf.key();
        user.switchboard_state_bump = params.switchboard_state_bump;
        user.vrf_permission_bump = params.vrf_permission_bump;
        user.current_round = Round::default();
        user.last_airdrop_request_slot = 0;
        user.history = History::default();

        drop(user);

        let house = ctx.accounts.house.load()?;
        let house_key = ctx.accounts.house.key().clone();
        let house_seeds: &[&[&[u8]]] = &[&[&HOUSE_SEED, &[house.bump]]];
        drop(house);

        msg!("setting user escrow authority to the house");
        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info().clone(),
                SetAuthority {
                    account_or_mint: ctx.accounts.escrow.to_account_info().clone(),
                    current_authority: ctx.accounts.authority.clone(),
                },
                house_seeds,
            ),
            AuthorityType::AccountOwner,
            Some(house_key.clone()),
        )?;

        msg!("removing escrow close authority");
        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info().clone(),
                SetAuthority {
                    account_or_mint: ctx.accounts.escrow.to_account_info().clone(),
                    current_authority: ctx.accounts.house.to_account_info().clone(),
                },
                house_seeds,
            ),
            AuthorityType::CloseAccount,
            None,
        )?;

        msg!("removing reward_address close authority");
        token::set_authority(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info().clone(),
                SetAuthority {
                    account_or_mint: ctx.accounts.reward_address.to_account_info().clone(),
                    current_authority: ctx.accounts.authority.to_account_info().clone(),
                },
            ),
            AuthorityType::CloseAccount,
            None,
        )?;

        msg!("minting 10 tokens to users token wallet");
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info().clone(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info().clone(),
                    authority: ctx.accounts.house.to_account_info().clone(),
                    to: ctx.accounts.reward_address.to_account_info().clone(),
                },
                house_seeds,
            ),
            10 * 1_000_000_000,
        )?;

        Ok(())
    }
}
