use crate::*;

pub struct ContainerParams {
    pub program_id: Pubkey,
    pub mint_key: Pubkey,
    pub user_key: Pubkey,
    pub escrow_key: Pubkey,
    pub reward_key: Pubkey,
}

impl ContainerParams {
    pub fn decode(container_params: &Vec<u8>) -> std::result::Result<Self, SwitchboardClientError> {
        let params = String::from_utf8(container_params.clone()).unwrap();

        let mut program_id: Pubkey = Pubkey::default();
        let mut mint_key: Pubkey = Pubkey::default();
        let mut user_key: Pubkey = Pubkey::default();
        let mut escrow_key: Pubkey = Pubkey::default();
        let mut reward_key: Pubkey = Pubkey::default();

        for env_pair in params.split(',') {
            let pair: Vec<&str> = env_pair.splitn(2, '=').collect();
            if pair.len() == 2 {
                match pair[0] {
                    "PID" => program_id = Pubkey::from_str(pair[1]).unwrap(),
                    "MINT" => mint_key = Pubkey::from_str(pair[1]).unwrap(),
                    "USER" => user_key = Pubkey::from_str(pair[1]).unwrap(),
                    "ESCROW" => escrow_key = Pubkey::from_str(pair[1]).unwrap(),
                    "REWARD" => reward_key = Pubkey::from_str(pair[1]).unwrap(),
                    _ => {}
                }
            }
        }

        if program_id == Pubkey::default() {
            return Err(SwitchboardClientError::CustomMessage(
                "PID cannot be undefined".to_string(),
            ));
        }
        if mint_key == Pubkey::default() {
            return Err(SwitchboardClientError::CustomMessage(
                "MINT cannot be undefined".to_string(),
            ));
        }
        if user_key == Pubkey::default() {
            return Err(SwitchboardClientError::CustomMessage(
                "USER cannot be undefined".to_string(),
            ));
        }
        if escrow_key == Pubkey::default() {
            return Err(SwitchboardClientError::CustomMessage(
                "ESCROW cannot be undefined".to_string(),
            ));
        }
        if reward_key == Pubkey::default() {
            return Err(SwitchboardClientError::CustomMessage(
                "REWARD cannot be undefined".to_string(),
            ));
        }

        Ok(Self {
            program_id,
            mint_key,
            user_key,
            escrow_key,
            reward_key,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_params_decode() {
        let request_params_string = format!(
            "PID={},MINT={},USER={},ESCROW={},REWARD={}",
            anchor_spl::token::ID,
            anchor_spl::token::ID,
            anchor_spl::token::ID,
            anchor_spl::token::ID,
            anchor_spl::token::ID
        );
        let request_params_bytes = request_params_string.into_bytes();

        let params = ContainerParams::decode(&request_params_bytes).unwrap();

        assert_eq!(params.program_id, anchor_spl::token::ID);
        assert_eq!(params.mint_key, anchor_spl::token::ID);
        assert_eq!(params.user_key, anchor_spl::token::ID);
        assert_eq!(params.escrow_key, anchor_spl::token::ID);
        assert_eq!(params.reward_key, anchor_spl::token::ID);
    }
}
