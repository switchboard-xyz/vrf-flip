use crate::*;

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
        has_one = mint,
        has_one = switchboard_function,
    )]
    pub house: AccountLoader<'info, HouseState>,

    #[account(mut)]
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
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = authority,
    )]
    pub reward_address: Account<'info, TokenAccount>,

    #[account(mut)]
    pub switchboard_function: AccountLoader<'info, FunctionAccountData>,
    #[account(address = anchor_spl::token::spl_token::native_mint::ID)]
    pub switchboard_mint: Account<'info, Mint>,
    /// CHECK:
    #[account(
        mut,
        signer,
        owner = system_program.key(),
        constraint = switchboard_request.data_len() == 0 && switchboard_request.lamports() == 0
        )]
    pub switchboard_request: AccountInfo<'info>,
    /// CHECK:
    #[account(
        mut,
        owner = system_program.key(),
        constraint = switchboard_request_escrow.data_len() == 0 && switchboard_request_escrow.lamports() == 0
        )]
    pub switchboard_request_escrow: AccountInfo<'info>,

    /// CHECK:
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
pub struct UserInitParams {}

impl UserInit<'_> {
    pub fn validate(
        &self,
        ctx: &Context<Self>,
        _params: &UserInitParams,
    ) -> anchor_lang::Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, params: &UserInitParams) -> anchor_lang::Result<()> {
        msg!("user_init");

        // create the switchboard request account and set our user as the PDA
        let request_init_ctx = FunctionRequestInit {
            request: ctx.accounts.switchboard_request.clone(),
            authority: ctx.accounts.user.to_account_info(),
            function: ctx.accounts.switchboard_function.to_account_info(),
            function_authority: None,
            escrow: ctx.accounts.switchboard_request_escrow.to_account_info(),
            mint: ctx.accounts.switchboard_mint.to_account_info(),
            state: ctx.accounts.switchboard_state.to_account_info(),
            attestation_queue: ctx.accounts.switchboard_attestation_queue.to_account_info(),
            payer: ctx.accounts.payer.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
        };
        request_init_ctx.invoke(
            ctx.accounts.switchboard.clone(),
            &FunctionRequestInitParams {
                max_container_params_len: Some(512),
                container_params: vec![],
                garbage_collection_slot: None,
            })?;
            msg!("created switchboard request {}", ctx.accounts.switchboard_request.key());

        let user = &mut ctx.accounts.user.load_init()?;

        user.bump = *ctx.bumps.get("user").unwrap();
        user.authority = ctx.accounts.authority.key();
        user.house = ctx.accounts.house.key();
        user.escrow = ctx.accounts.escrow.key();
        user.reward_address = ctx.accounts.reward_address.key();
        user.switchboard_request = ctx.accounts.switchboard_request.key();

        user.current_round = Round::default();
        user.last_airdrop_request_slot = 0;
        user.history = History::default();
      
        let house_key = ctx.accounts.house.key();
        let house_bump = ctx.accounts.house.load()?.bump;
        let house_seeds: &[&[&[u8]]] = &[&[HOUSE_SEED, &[house_bump]]];

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

        if ctx.accounts.mint.mint_authority.is_some()
            && ctx.accounts.mint.mint_authority.unwrap() == ctx.accounts.house.key()
        {
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
        }

        Ok(())
    }
}
