const LendApi = require('./api');
const { aggregate } = require('@makerdao/multicall');
const BigNumber = require('bignumber.js');

const MAX_MULTI_SIZE = 20;
const BLOCKS_PER_YEAR = 2628000;


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
        // for (const key in markets) {
        //     let market = markets[key];
        //     if (new BigNumber(market.cash).plus(market.total_borrows).minus(market.reserves).gt(0)) {
        //         market.utilization = new BigNumber(market.total_borrows)
        //             .div(new BigNumber(market.cash)
        //                 .plus(market.total_borrows)
        //                 .minus(market.reserves)).toNumber();
        //     }else{
        //         market.utilization = 0;
        //     }
        // }
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
        let {supply}= this.totalInterestPerBlock(account,markets);

        supply = new BigNumber(supply);

        if (supply.lte(0)) return 0;

        return supply.times(BLOCKS_PER_YEAR).div(this.totalSupplyBalance(account, markets)).toNumber();
    }

    totalInterestPerBlock(account,markets){
        let total_borrow_interests = new BigNumber(0);
        let total_supply_interests = new BigNumber(0);

        for (let index = 0; index < account.tokens.length; index++) {
            const accountToken = account.tokens[index];
            const market = markets[accountToken.token_address];
            total_borrow_interests = total_borrow_interests.plus(
                new BigNumber(accountToken.borrow_balance_underlying).times(market.borrow_rate).times(market.underlying_price).div(BLOCKS_PER_YEAR)
            );
            total_supply_interests = total_supply_interests.plus(
                new BigNumber(accountToken.supply_balance_underlying).times(market.supply_rate).times(market.underlying_price).div(BLOCKS_PER_YEAR)
            );
        }

        return {supply:total_supply_interests.toNumber(),borrow:total_borrow_interests.toNumber()}
    }

    totalBorrowApr(account, markets) {
        let {borrow}= this.totalInterestPerBlock(account,markets);

        borrow = new BigNumber(borrow);

        if (borrow.lte(0)) return 0;

        return borrow.times(BLOCKS_PER_YEAR).div(this.totalBorrowBalance(account, markets)).toNumber();
    }
    totalNetApr(account, markets) {
        let totalSupply = this.totalSupplyBalance(account, markets);
        if (totalSupply <= 0) return 0;

        let {supply, borrow} = this.totalInterestPerBlock(account,markets);
        let total_net_apr = new BigNumber(supply)
            .minus(borrow).times(BLOCKS_PER_YEAR)
            .div(totalSupply);


        return total_net_apr.toNumber();
    }

    freeLiquidity(account, markets,deltaBlock) {
        if(deltaBlock <0) throw "bad deltaBlcok";

        let maxCollateralValue = this.maxBorrow(account,markets);
        let {supply,borrow} = this.totalInterestPerBlock(account,markets);
        let borrowed = this.totalBorrowBalance(account,markets);

        return new BigNumber(maxCollateralValue).minus((borrow - supply)*deltaBlock).minus(borrowed).toString(10);
    }

    maxFreeReedemAmountOfAllMarket(account,markets,deltaBlock = 20){

        let totalBorrowed = this.totalBorrowBalance(account,markets);
        
        let freeCollateral = this.freeLiquidity(account,markets,deltaBlock);
        freeCollateral = new BigNumber(freeCollateral);

        let freeCollateralNoDelta = this.freeLiquidity(account,markets,0);
        freeCollateralNoDelta = new BigNumber(freeCollateralNoDelta);

        let maxReedemOfAllMarkets = {}

        for (const key in markets) {
            maxReedemOfAllMarkets[key] = '0';
        }
        
        if(freeCollateral.lte(0)) return maxReedemOfAllMarkets;

        for (let index = 0; index < account.tokens.length; index++) {
            
            const accountToken = account.tokens[index];
            const market = markets[accountToken.token_address];

            if(new BigNumber(totalBorrowed).lte(0) || !accountToken.is_entered) {
                maxReedemOfAllMarkets[accountToken.token_address] = accountToken.supply_balance_underlying;
            }else{
                if(new BigNumber(market.collateral_factor).lte(0)){
                    maxReedemOfAllMarkets[accountToken.token_address] = accountToken.supply_balance_underlying;
                }else{
                    maxReedemOfAllMarkets[accountToken.token_address] = freeCollateral.div(market.underlying_price).div(market.collateral_factor).toString(10);
                }
                
            }
            

            if(new BigNumber(maxReedemOfAllMarkets[accountToken.token_address]).gt(accountToken.supply_balance_underlying)){
                maxReedemOfAllMarkets[accountToken.token_address] = accountToken.supply_balance_underlying
            }
        }

        return maxReedemOfAllMarkets;
    }

    maxFreeBorrowOfAllMarket(account,markets,deltaBlock = 20,percent = 0.8){
        let freeBorrow = this.freeLiquidity(account,markets,deltaBlock);

        let borrowed = this.totalBorrowBalance(account,markets);

        let maxBorrow = this.maxBorrow(account,markets);

        
        
        freeBorrow = new BigNumber(freeBorrow);

        let maxBorrowOfAllMarkets = {}

        for (const key in markets) {
            maxBorrowOfAllMarkets[key] = '0';
        }

        if(new BigNumber(borrowed).div(maxBorrow).gt(percent)) return maxBorrowOfAllMarkets;

        let availableBorrow = new BigNumber(maxBorrow).minus(borrowed);
        if(freeBorrow.gte(availableBorrow)){
            freeBorrow = availableBorrow;
        }
        
        // if(freeBorrow <=0) return maxBorrowOfAllMarkets;

        for (let index = 0; index < account.tokens.length; index++) {
            const accountToken = account.tokens[index];
            const market = markets[accountToken.token_address];
            
            maxBorrowOfAllMarkets[accountToken.token_address] = freeBorrow.div(market.underlying_price).toString(10);
        }

        return maxBorrowOfAllMarkets;
    }


}

module.exports = LendSdk;