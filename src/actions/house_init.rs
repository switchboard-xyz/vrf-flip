use crate::*;

#[derive(Accounts)]
#[instruction(params: HouseInitParams)] // rpc parameters hint
pub struct HouseInit<'info> {
    #[account(
        init,
        space = 8 + std::mem::size_of::<HouseState>(),
        payer = payer,
        seeds = [HOUSE_SEED],
        bump
    )]
    pub house: AccountLoader<'info, HouseState>,
    /// CHECK:
    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,

    #[account(
        constraint = switchboard_function.load()?.authority == authority.key()
    )]
    pub switchboard_function: AccountLoader<'info, FunctionAccountData>,

    #[account(
        init_if_needed,
        payer = payer,
        mint::decimals = 9,
        mint::authority = house,
        mint::freeze_authority = house,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = house,
    )]
    pub house_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub payer: Signer<'info>,

    // SYSTEM ACCOUNTS
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// CHECK:
    #[account(address = solana_program::sysvar::rent::ID)]
    pub rent: AccountInfo<'info>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct HouseInitParams {}

impl HouseInit<'_> {
    pub fn validate(
        &self,
        _ctx: &Context<Self>,
        _params: &HouseInitParams,
    ) -> anchor_lang::Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, _params: &HouseInitParams) -> anchor_lang::Result<()> {
        msg!("house_init");

        let house_bump = *ctx.bumps.get("house").unwrap();

        if ctx.accounts.mint.mint_authority.is_some()
            && ctx.accounts.mint.mint_authority.unwrap() == ctx.accounts.house.key()
        {
            let house_seeds: &[&[&[u8]]] = &[&[HOUSE_SEED, &[house_bump]]];
            msg!("minting 100_000_000 tokens to house vault");
            token::mint_to(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info().clone(),
                    MintTo {
                        mint: ctx.accounts.mint.to_account_info().clone(),
                        authority: ctx.accounts.house.to_account_info().clone(),
                        to: ctx.accounts.house_vault.to_account_info().clone(),
                    },
                    house_seeds,
                ),
                100_000_000_000_000_000,
            )?;
        }

        let house = &mut ctx.accounts.house.load_init()?;
        house.bump = house_bump;
        house.authority = ctx.accounts.authority.key();
        house.mint = ctx.accounts.mint.key();
        house.switchboard_function = ctx.accounts.switchboard_function.key();
        house.house_vault = ctx.accounts.house_vault.key();

        Ok(())
    }
}
