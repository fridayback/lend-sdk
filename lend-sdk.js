const LendApi = require('./api');
const { aggregate } = require('@makerdao/multicall');
const BigNumber = require('bignumber.js');

const MAX_MULTI_SIZE = 20;

// const CompoundOperationCode = {
//     Mint: 'mint',
//     Redeem: 'redeem',
//     RedeemUnderlying: 'redeemUnderlying',
//     Borrow: 'borrow',
//     Repay: 'repay',
//     Collateral: 'enterMarkets',
//     CanCelCollateral: 'exitMarket',
//     Liquidate: 'liquidate',
//     Approve: 'approve',
// };

// // class Market {
// //     constructor() {
// //         this.properties = {
// //             cash: 0,
// //             collateral_factor: 0,
// //             exchange_rate: 0,
// //             interest_rate_model_address: '',
// //             name: '',
// //             symbol: '',
// //             decimals: 8,
// //             token_address: '',
// //             underlying_address: '',
// //             underlying_name: '',
// //             underlying_symbol: '',
// //             underlying_decimals: 0,
// //             number_of_borrowers: 0,
// //             number_of_suppliers: 0,
// //             underlying_price: 0,
// //             reserves: 0,
// //             borrow_index: 0,
// //             accrual_block_number: 0,
// //             supply_rate: 0,
// //             borrow_rate: 0,
// //             total_supply: 0,
// //             total_borrows: 0,
// //             timestamp: 0,
// //             price_oracle: '',
// //             close_factor: 0,
// //             liquidation_incentive: 0,
// //             multiplierPerBlock: 0,
// //             baseRatePerBlock: 0,
// //             comp_speed: 0,
// //             comp_index_borrow: 0,
// //             comp_block_borrow: 0,
// //             comp_index_supply: 0,
// //             comp_block_supply: 0,
// //             rewardAddress: '',
// //             totalSpeed: 0,
// //             halfBonusPerBlock: 0,
// //             startBlock: 0,
// //             borrowCap: 0,
// //             reserve_factor: 0.2,
// //             utilization:0
// //         }
// //     }

// //     static newMarket(data) {
// //         let market = new Market();
// //         market.properties = data;
// //         market.utilization = 0;
// //         if(new BigNumber(market.cash).plus(market.total_borrows).minus(market.reserves).gt(0)){
// //             market.utilization = new BigNumber(market.total_borrows)
// //             .div(new BigNumber(market.cash)
// //             .plus(market.total_borrows)
// //             .minus(market.reserves))
// //         }


// //         return market;
// //     }
// // }

// // class AccountToken {
// //     constructor() {
// //         this.properties = {
// //             account_address: '',
// //             token_address: '',
// //             is_entered: false,
// //             account_total_borrow: 0,
// //             account_total_repay: 0,
// //             account_total_supply: 0,
// //             account_total_redeem: 0,
// //             account_total_liquidated: 0,
// //             account_total_liquidate: 0,
// //             lifetime_borrow_interest_accrued: 0.00000000,
// //             lifetime_supply_interest_accrued: 0.00000000,
// //             supply_balance: 0,
// //             borrow_balance_underlying: 0.00000000,
// //             supply_balance_underlying: 0.00000000,
// //             timestamp: 0,
// //             comp_index_borrow: 0,
// //             comp_index_supply: 0
// //         }
// //         this.market = undefined;
// //     }

// //     static newAccountToken(data) {
// //         let accountToken = new AccountToken();
// //         accountToken.properties = data;
// //         return accountToken;
// //     }
// // }


// // class Account {
// //     constructor() {
// //         this.properties = {
// //             address: '',
// //             health: 0,
// //             net_asset_value: 0,
// //             tokens: [],
// //             total_borrow_value: 0,
// //             total_collateral_value: 0,
// //             timestamp: 0,
// //             comp_reward: 0,
// //             rewardAddress: "",
// //             rewardBalance: 0
// //         }
// //     }

// //     static newAccount(data) {
// //         let account = new Account();
// //         account.properties = data;
// //         let tokens = data.tokens;
// //         account.tokens = [];
// //         for (let index = 0; index < tokens.length; index++) {
// //             const accountToken = new AccountToken(tokens[index]);
// //             account.tokens.push(accountToken);
// //         }
// //         return account;
// //     }

// // }

class LendSdk {
    constructor(config, web3provider) {
        this.apiService = new LendApi(config.apiUrl);
        this.Unitroller = config.unitroller;
        this.gasLimit = config.gasLimit ? config.gasLimit : {
            market: {
                mint: 1000000,
                redeem: 1000000,
                redeemUnderlying: 1000000,
                borrow: 1000000,
                repay: 1000000,
                enterMarkets: 1000000,
                exitMarket: 1000000,
            },
            erc20: {
                approveErc20: 100000,
            }
        }

        this.multiCallAddr = config.multiCallAddr;
        this.web3provider = web3provider;

        this.markets = {};
    }

    // async init(){
    //     this.markets = await this.getAllMarket();
    // }

    // switchNetWork()

    async getAllMarket() {
        let data = await this.apiService.getMarkets();
        let markets = {};
        for (let index = 0; index < data.length; index++) {
            const market = data[index];
            markets[market.token_address] = market;
        }

        return markets;
    }

    async getAccountInfo(accountAddr) {
        let data = await this.apiService.getAccounts([accountAddr]);

        let account;
        if (data.length > 0) {
            account = data[0];
        }else{
            return {
                "address":accountAddr,
                "health":"0",
                "net_asset_value":"0",
                "tokens":[],
                "total_borrow_value":"0",
                "total_collateral_value":"0",
                "timestamp":Date.now(),
                "comp_reward":"0",
                "rewardAddress":"",
                "rewardBalance":"0"
            }
        }
        return account;
    }

    async getCompoundData(accountAddr) {
        let p = []
        p.push(this.getAllMarket());
        p.push(this.getAccountInfo(accountAddr));

        let ret = await Promise.all(p);
        let markets = ret[0];
        let account = ret[1];
        // for (let index = 0; index < account.tokens.length; index++) {
        //     let accountToken = account[index];
        //     accountToken.market = markets[accountToken.token_address];
        // }
        for (const key in markets) {
            let market = markets[key];
            if (new BigNumber(market.cash).plus(market.total_borrows).minus(market.reserves).gt(0)) {
                market.utilization = new BigNumber(market.total_borrows)
                    .div(new BigNumber(market.cash)
                        .plus(market.total_borrows)
                        .minus(market.reserves)).toNumber();
            }else{
                market.utilization = 0;
            }
        }
        return { markets, account };
    }

    async _getMultiAuthorized(account, markets) {
        let params = [];

        for (const marketAddr in markets) {
            let market = markets[marketAddr];
            if (
                market.underlying_address ===
                '0x0000000000000000000000000000000000000000'
            ) {
                markets[marketAddr].approved = true;
                continue;
            }

            this[market.underlying_address] = market.token_address;
            params.push({
                token: market.underlying_address,
                owner: account,
                spender: market.token_address,
            });
        }

        // let service = serviceFramework.getService(
        //     'OnChainServiceInterface',
        //     'OnChainServiceWan',
        // );
        // if (!service) {
        //     throw SERVICE_FRAME_ERROR.NoService + ': OnChainServiceWan';
        // }
        let index = 0;
        let p = [];
        let allowances = [];
        while (1) {
            let spliceParams = params.slice(index, index + MAX_MULTI_SIZE);
            if (spliceParams.length <= 0) break;
            index += spliceParams.length;
            p.push(this._getMultiTokenAllowance(spliceParams));
        }

        let ret = await Promise.all(p);
        ret.forEach(element => {
            allowances = allowances.concat(element);
        });

        allowances.forEach(element => {
            const marketAddr = this[element.token];
            markets[marketAddr].approved = new BigNumber(element.allowance).gte(
                '0x0fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
            );
        });

        return markets;
    }

    // params format like this:[{token, owner, spender}]
    async _getMultiTokenAllowance(params) {
        let calls = [];
        let ret = [];
        params.forEach(arg => {
            let call = {
                target: arg.token,
                call: ['allowance(address,address)(uint256)', arg.owner, arg.spender],
                returns: [
                    [
                        arg.token + '_' + arg.owner + '_' + arg.spender,
                        val =>
                            ret.push({
                                token: arg.token,
                                owner: arg.owner,
                                allowance: val.toString(),
                            }),
                    ],
                ],
            };

            calls.push(call);
        });

        await aggregate(calls, {
            multicallAddress: this.multiCallAddr,
            web3: this.web3provider,
        });

        return ret;
    }

    async isAuthorized(account, market) {

        if (market.underlying_address === '0x0000000000000000000000000000000000000000') {
            return true;
        }

        let allowance = await this._getMultiTokenAllowance([{ token: market.underlying_address, owner: account.address, spender: market.token_address }]);

        if (allowance.length > 0) {
            return BigNumber(allowance[0].allowance).gte(
                '0x0fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
            );
        } else {
            return false;
        }

    }

    maxBorrow(account, markets) {
        let max_borrow = new BigNumber(0);
        for (let index = 0; index < account.tokens.length; index++) {
            const accountToken = account.tokens[index];
            const market = markets[accountToken.token_address];
            max_borrow = max_borrow.plus(
                new BigNumber(accountToken.supply_balance_underlying).times(market.underlying_price).times(market.collateral_factor)
            )
        }

        return max_borrow.toNumber();
    }

    totalSupplyBalance(account, markets) {
        let total_supply_value = new BigNumber(0);
        for (let index = 0; index < account.tokens.length; index++) {
            const accountToken = account.tokens[index];
            const market = markets[accountToken.token_address];
            total_supply_value = total_supply_value.plus(
                new BigNumber(accountToken.supply_balance_underlying).times(market.underlying_price)
            )
        }

        return total_supply_value.toNumber();
    }

    totalBorrowBalance(account, markets) {
        let total_borrow_value = new BigNumber(0);
        for (let index = 0; index < account.tokens.length; index++) {
            const accountToken = account.tokens[index];
            const market = markets[accountToken.token_address];
            total_borrow_value = total_borrow_value.plus(
                new BigNumber(accountToken.borrow_balance_underlying).times(market.underlying_price)
            )
        }

        return total_borrow_value.toNumber();
    }

    totalSupplyApr(account, markets) {
        let total_supply_interests = new BigNumber(0);
        for (let index = 0; index < account.tokens.length; index++) {
            const accountToken = account.tokens[index];
            const market = markets[accountToken.token_address];
            total_supply_interests = total_supply_interests.plus(
                new BigNumber(accountToken.supply_balance_underlying).times(market.supply_rate).times(market.underlying_price)
            )
        }

        if (total_supply_interests.lte(0)) return 0;

        return total_supply_interests.div(this.totalSupplyBalance(account, markets)).toNumber();
    }

    totalBorrowApr(account, markets) {
        let total_borrow_interests = new BigNumber(0);
        for (let index = 0; index < account.tokens.length; index++) {
            const accountToken = account.tokens[index];
            const market = markets[accountToken.token_address];
            total_borrow_interests = total_borrow_interests.plus(
                new BigNumber(accountToken.borrow_balance_underlying).times(market.supply_rate).times(market.underlying_price)
            )
        }

        if (total_borrow_interests.lte(0)) return 0;

        return total_borrow_interests.div(this.totalBorrowBalance(account, markets)).toNumber();
    }
    totalNetApr(account, markets) {
        let totalSupply = this.totalSupplyBalance(account, markets);
        if (totalSupply <= 0) return 0;
        let total_net_apr = new BigNumber(this.totalSupplyBalance(account, markets))
            .minus(this.totalBorrowBalance(account, markets))
            .div(totalSupply);


        return total_net_apr.toNumber();
    }


}

module.exports = LendSdk;