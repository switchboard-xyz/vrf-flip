use crate::*;
use anchor_spl::token::{Mint, MintTo, Token, TokenAccount};
const AIRDROP_AMOUNT: u64 = 1_000_000_000;
const INITIAL_AIRDROP_AMOUNT: u64 = 10 * 1_000_000_000;

#[derive(Accounts)]
#[instruction(params: UserAirdropParams)] // rpc parameters hint
pub struct UserAirdrop<'info> {
    #[account(
        mut,
        seeds = [
            USER_SEED, 
            house.key().as_ref(), 
            authority.key().as_ref()
        ],
        bump = user.load()?.bump,
        has_one = house,
        has_one = authority,
    )]
    pub user: AccountLoader<'info, UserState>,
    #[account(
        seeds = [HOUSE_SEED],
        bump = house.load()?.bump,
        has_one = house_vault,
    )]
    pub house: AccountLoader<'info, HouseState>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = house,
    )]
    pub house_vault: Account<'info, TokenAccount>,
    /// CHECK:
    #[account(
        mut,
        mint::decimals = 9,
        mint::authority = house,
        mint::freeze_authority = house,
    )]
    pub mint: Account<'info, Mint>,
    /// CHECK:
    #[account(mut)]
    pub authority: AccountInfo<'info>,
    /// CHECK:
    #[account(
        mut,
        token::mint = house.load()?.mint,
        token::authority = authority,
    )]
    pub airdrop_token_wallet: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct UserAirdropParams {}

impl UserAirdrop<'_> {
    pub fn validate(
        &self,
        ctx: &Context<Self>,
        _params: &UserAirdropParams,
    ) -> anchor_lang::Result<()> {
        let user = ctx.accounts.user.load()?;
        if user.last_airdrop_request_slot == 0 {
            return Ok(());
        }
        if user.last_airdrop_request_slot > Clock::get()?.slot.checked_sub(5000).unwrap_or(0) {
            return Err(error!(VrfFlipError::AirdropRequestedTooSoon));
        }
        if ctx.accounts.airdrop_token_wallet.amount > AIRDROP_AMOUNT {
            return Err(error!(VrfFlipError::UserTokenBalanceHealthy));
        }

        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, _params: &UserAirdropParams) -> anchor_lang::Result<()> {
        msg!("user_airdrop");

        let house = ctx.accounts.house.load()?;
        let house_bump = house.bump.clone();
        let house_seeds: &[&[&[u8]]] = &[&[&HOUSE_SEED, &[house_bump]]];
        drop(house);

        let user = &mut ctx.accounts.user.load_mut()?;
        user.last_airdrop_request_slot = Clock::get()?.slot.clone();
        let mut airdrop_amount: u64 = AIRDROP_AMOUNT;
        if user.last_airdrop_request_slot == 0 {
            airdrop_amount = INITIAL_AIRDROP_AMOUNT;
        }
        drop(user);

        msg!("minting 1 tokens to users token wallet");
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info().clone(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info().clone(),
                    authority: ctx.accounts.house.to_account_info().clone(),
                    to: ctx.accounts.airdrop_token_wallet.to_account_info().clone(),
                },
                house_seeds,
            ),
            airdrop_amount,
        )?;

        Ok(())
    }
}
