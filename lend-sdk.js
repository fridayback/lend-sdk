const LendApi = require('./api');
const { aggregate } = require('@makerdao/multicall');
const BigNumber = require('bignumber.js');

const MAX_MULTI_SIZE = 20;
const BLOCKS_PER_YEAR = 2628000;
// var Web3 = require('web3');
const HELPER_ABI = require('./CompoundLens.json');

// console.log('########\n',HELPER_ABI);

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

        this.helper = config.helper;
        this.CompoundLens = new this.web3provider.eth.Contract(HELPER_ABI, config.helper);
        console.log('########\n', this.helper);
    }

    // async init(){
    //     this.markets = await this.getAllMarket();
    // }

    // switchNetWork()

    async getCompSeeds(markets) {
        let speeds = [];
        // let calls = [];
        // let speeds = [];
        // let call = {
        //     target: this.helper,
        //     call: ['getCompSpeedsAll(address[])((address,uint256,uint256)[])', markets],
        //     returns: [
        //         [
        //            'speeds',
        //             val => {
        //                 val.forEach(speedsInfo=>{
        //                     const market = speedsInfo.market;
        //                     const compSupplySpeed = new BigNumber(speedsInfo.compSupplySpeed).shiftedBy(-18).toString(10);//
        //                     const compBorrowSpeed = new BigNumber(compSupplySpeed.compBorrowSpeed).shiftedBy(-18).toString(10);//
        //                     speeds.push({market,compSupplySpeed,compBorrowSpeed});
        //                 })
        //             },
        //         ],
        //     ],
        // };

        // calls.push(call);

        // await aggregate(calls, {
        //     multicallAddress: this.multiCallAddr,
        //     web3: this.web3provider,
        // });
        let ret = await this.CompoundLens.methods.getCompSpeedsAll(markets).call();

        ret.forEach(speedsInfo => {
            const market = speedsInfo.market;
            const compSupplySpeed = new BigNumber(speedsInfo.compSupplySpeed).shiftedBy(-18).toString(10);//
            const compBorrowSpeed = new BigNumber(speedsInfo.compBorrowSpeed).shiftedBy(-18).toString(10);//
            speeds.push({ market, compSupplySpeed, compBorrowSpeed });
        })

        return speeds;
    }

    async getAllMarket() {
        let data = await this.apiService.getMarkets();
        let markets = {};
        for (let index = 0; index < data.length; index++) {
            const market = data[index];
            markets[market.token_address] = market;
        }

        let marketAddrLs = [];

        for (const key in markets) {
            let market = markets[key];
            if (new BigNumber(market.cash).plus(market.total_borrows).minus(market.reserves).gt(0)) {
                market.utilization = new BigNumber(market.total_borrows)
                    .div(new BigNumber(market.cash)
                        .plus(market.total_borrows)
                        .minus(market.reserves)).toNumber();
            } else {
                market.utilization = 0;
            }
            marketAddrLs.push(key);
        }

        const speeds = await this.getCompSeeds(marketAddrLs);
        for (let index = 0; index < speeds.length; index++) {
            const element = speeds[index];
            markets[element.market.toLowerCase()].compSupplySpeed = element.compSupplySpeed;
            markets[element.market.toLowerCase()].compBorrowSpeed = element.compBorrowSpeed;
        }

        return markets;
    }

    async getRewards(user, tokens) {
        let calls = [];
        let rewards = 0;
        let call = {
            target: this.helper,
            call: ['getRewardAll(address,address[])(uint)', user, tokens],
            returns: [
                [
                    'reward',
                    val => {
                        rewards = new BigNumber(rewards).plus(val).toString(10);
                    },
                ],
            ],
        };

        calls.push(call);

        calls.push({
            target: this.Unitroller,
            call: ['compAccrued(address)(uint)', user],
            returns: [
                [
                    'compAccrued',
                    val => {
                        rewards = new BigNumber(rewards).plus(val).toString(10);
                    },
                ],
            ],
        })

        await aggregate(calls, {
            multicallAddress: this.multiCallAddr,
            web3: this.web3provider,
        });

        return new BigNumber(rewards).shiftedBy(-18).toString(10);
    }

    async getAccountInfo(accountAddr) {
        let data = await this.apiService.getAccounts([accountAddr]);

        let account;
        if (data.length > 0) {
            account = data[0];
            let tokens = [];
            for (let index = 0; index < account.tokens.length; index++) {
                const element = account.tokens[index];
                tokens.push(element.token_address);
            }
            account.comp_reward = await this.getRewards(accountAddr, tokens);
        } else {
            return {
                "address": accountAddr,
                "health": "0",
                "net_asset_value": "0",
                "tokens": [],
                "total_borrow_value": "0",
                "total_collateral_value": "0",
                "timestamp": Date.now(),
                "comp_reward": "0",
                "rewardAddress": "",
                "rewardBalance": "0"
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

        return { markets, account };
    }

    async getCompoundData2(accountAddr, finnPrice) {
        let { markets, account } = await this.getCompoundData(accountAddr);
        for (const marketAddr in markets) {
            let market = markets[marketAddr];
            let supplyValue = new BigNumber(market.total_supply).times(market.exchange_rate).times(market.underlying_price);
            let borrowValue = new BigNumber(market.total_borrows).times(market.underlying_price);
            let rewardSupplyValue = new BigNumber(market.compSupplySpeed).times(finnPrice).times(BLOCKS_PER_YEAR);
            let rewardBorrowValue = new BigNumber(market.compBorrowSpeed).times(finnPrice).times(BLOCKS_PER_YEAR);
            market.borrow_rate = new BigNumber(market.borrow_rate).times(-1).toString(10);
            if(borrowValue.gt(0)){
                market.borrow_rate_with_reward = new BigNumber(borrowValue).times(market.borrow_rate).plus(rewardBorrowValue).div(borrowValue).toString(10);
            }else{
                market.borrow_rate_with_reward = market.borrow_rate;
            }
            if(supplyValue.gt(0)){
                market.supply_rate_with_reward = new BigNumber(supplyValue).times(market.supply_rate).plus(rewardSupplyValue).div(supplyValue).toString(10);
            }else{
                market.supply_rate_with_reward = market.supply_rate;
            }
            
        }

        let netIncome = 0;
        let incomeFromReward = 0;
        let totalSupplyValue = 0;
        for (let index = 0; index < account.tokens.length; index++) {
            const token = account.tokens[index];
            netIncome = new BigNumber(token.supply_balance_underlying)
                .times(markets[token.token_address].supply_rate)
                .times(markets[token.token_address].underlying_price).plus(netIncome);

            netIncome = new BigNumber(token.borrow_balance_underlying)
                .times(markets[token.token_address].borrow_rate)
                .times(markets[token.token_address].underlying_price).plus(netIncome);

            if (new BigNumber(markets[token.token_address].total_borrows).gt(0)) {
                incomeFromReward = new BigNumber(token.borrow_balance_underlying)
                    .times(markets[token.token_address].compBorrowSpeed).times(BLOCKS_PER_YEAR)
                    .times(finnPrice).div(markets[token.token_address].total_borrows).plus(incomeFromReward);
            }

            if (new BigNumber(markets[token.token_address].total_supply).gt(0)) {
                incomeFromReward = new BigNumber(token.supply_balance)
                    .times(markets[token.token_address].compSupplySpeed).times(BLOCKS_PER_YEAR)
                    .times(finnPrice).div(markets[token.token_address].total_supply).plus(incomeFromReward);
            }


            totalSupplyValue = new BigNumber(token.supply_balance_underlying)
                .times(markets[token.token_address].underlying_price).plus(totalSupplyValue);

        }
        account.netAPY = new BigNumber(netIncome).div(totalSupplyValue).toString(10);
        account.netAPY_with_reward = new BigNumber(netIncome).plus(incomeFromReward).div(totalSupplyValue).toString(10);
        account.rewardPerWeek = new BigNumber(incomeFromReward).times(7).div(BLOCKS_PER_YEAR).toString(10);

        return {markets, account}
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
            if (market.underlying_address.toLowerCase() === '0xFfFFfFff1FcaCBd218EDc0EbA20Fc2308C778080'.toLocaleLowerCase()) {
                return BigNumber(allowance[0].allowance).gte(
                    '0x0fffffffffffffffffffffffffffffff',
                );
            } else {
                return BigNumber(allowance[0].allowance).gte(
                    '0x0fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
                );
            }

        } else {
            return false;
        }

    }

    maxBorrow(account, markets) {
        let max_borrow = new BigNumber(0);
        for (let index = 0; index < account.tokens.length; index++) {
            const accountToken = account.tokens[index];
            const market = markets[accountToken.token_address];
            if (!accountToken.is_entered) continue;
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
        let { supply } = this.totalInterestPerBlock(account, markets);

        supply = new BigNumber(supply);

        if (supply.lte(0)) return 0;

        return supply.times(BLOCKS_PER_YEAR).div(this.totalSupplyBalance(account, markets)).toNumber();
    }

    totalInterestPerBlock(account, markets) {
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

        return { supply: total_supply_interests.toNumber(), borrow: total_borrow_interests.toNumber() }
    }

    totalBorrowApr(account, markets) {
        let { borrow } = this.totalInterestPerBlock(account, markets);

        borrow = new BigNumber(borrow);

        if (borrow.lte(0)) return 0;

        return borrow.times(BLOCKS_PER_YEAR).div(this.totalBorrowBalance(account, markets)).toNumber();
    }
    totalNetApr(account, markets) {
        let totalSupply = this.totalSupplyBalance(account, markets);
        if (totalSupply <= 0) return 0;

        let { supply, borrow } = this.totalInterestPerBlock(account, markets);
        let total_net_apr = new BigNumber(supply)
            .minus(borrow).times(BLOCKS_PER_YEAR)
            .div(totalSupply);


        return total_net_apr.toNumber();
    }

    freeLiquidity(account, markets, deltaBlock) {
        if (deltaBlock < 0) throw "bad deltaBlcok";

        let maxCollateralValue = this.maxBorrow(account, markets);
        let { supply, borrow } = this.totalInterestPerBlock(account, markets);
        let borrowed = this.totalBorrowBalance(account, markets);

        return new BigNumber(maxCollateralValue).minus((borrow - supply) * deltaBlock).minus(borrowed).toString(10);
    }

    maxFreeReedemAmountOfAllMarket(account, markets, deltaBlock = 20, percent = 0.8) {

        let totalBorrowed = this.totalBorrowBalance(account, markets);

        let maxBorrow = this.maxBorrow(account, markets);

        let { borrow } = this.totalInterestPerBlock(account, markets);

        let borrowLimited = new BigNumber(0);
        if (new BigNumber(maxBorrow).gt(0)) {
            borrowLimited = new BigNumber(totalBorrowed).plus(borrow).div(maxBorrow);
        }

        let maxReedemOfAllMarkets = {}

        for (const key in markets) {

            const market = markets[key];
            const accountToken = account.tokens.find((item, index, arr) => {
                if (item.token_address.toLowerCase() === market.token_address.toLowerCase()) {
                    return true;
                }
                return false;
            });

            maxReedemOfAllMarkets[key] = { amount: '0', method: 'redeem' };

            if (accountToken && (!accountToken.is_entered || new BigNumber(totalBorrowed).lte(0))) {
                maxReedemOfAllMarkets[key] = { amount: accountToken.supply_balance_underlying, method: 'redeem' };
            }


            // if ((accountToken && !accountToken.is_entered) || new BigNumber(totalBorrowed).gte(0)) {
            //     if (accountToken) maxReedemOfAllMarkets[key] = { amount: accountToken.supply_balance_underlying, method: 'redeem' };
            // } else {
            //     maxReedemOfAllMarkets[key] = { amount: '0', method: 'redeemUnderlying' };
            // }

        }

        // if (new BigNumber(totalBorrowed).div(maxBorrow).gte(percent)) {
        //     // for (const key in markets) {
        //     //     maxReedemOfAllMarkets[key] = { amount: '0', method: 'redeemUnderlying' };
        //     // }
        //     return maxReedemOfAllMarkets;
        // }


        let freeCollateral = this.freeLiquidity(account, markets, deltaBlock);
        // freeCollateral = new BigNumber(freeCollateral);
        let newMaxBorrow = new BigNumber(totalBorrowed).div(percent);
        let deltaMaxBorrow = new BigNumber(maxBorrow).minus(newMaxBorrow);
        if (deltaMaxBorrow.lt(freeCollateral)) freeCollateral = deltaMaxBorrow

        freeCollateral = new BigNumber(freeCollateral);
        if (freeCollateral.lte(0)) {
            freeCollateral = new BigNumber(0);
            // return maxReedemOfAllMarkets;
        }

        let suppliedMarkets = 0;
        let borrowedMarkets = 0;

        for (let index = 0; index < account.tokens.length; index++) {
            const accountToken = account.tokens[index];
            const market = markets[accountToken.token_address];

            if (new BigNumber(accountToken.supply_balance).gt(0)) suppliedMarkets++;
            if (new BigNumber(accountToken.borrow_balance_underlying).gt(0)) borrowedMarkets++;
        }

        for (let index = 0; index < account.tokens.length; index++) {

            const accountToken = account.tokens[index];
            const market = markets[accountToken.token_address];

            // if (new BigNumber(accountToken.supply_balance).gt(0)) suppliedMarkets++;
            // if (new BigNumber(accountToken.borrow_balance_underlying).gt(0)) borrowedMarkets++;

            if (new BigNumber(totalBorrowed).gt(0) && accountToken.is_entered && market.collateral_factor * 1 > 0) {
                maxReedemOfAllMarkets[accountToken.token_address] = { amount: freeCollateral.div(market.underlying_price).div(market.collateral_factor).toString(10), method: 'redeemUnderlying' };
            }

            if (market.collateral_factor * 1 === 0 && accountToken.is_entered && borrowLimited.lt(1)) {
                maxReedemOfAllMarkets[accountToken.token_address] = { amount: accountToken.supply_balance_underlying, method: 'redeem' };
            }
            // if (new BigNumber(totalBorrowed).gt(0) && accountToken.is_entered) {
            //     // maxReedemOfAllMarkets[accountToken.token_address] = {amount: accountToken.supply_balance_underlying,method: 'redeem'};
            // } else {

            //     if (!accountToken.is_entered) {
            //         // maxReedemOfAllMarkets[accountToken.token_address] = {amount:accountToken.supply_balance_underlying,method: 'redeem'};
            //     } else {
            //         maxReedemOfAllMarkets[accountToken.token_address] = { amount: freeCollateral.div(market.underlying_price).div(market.collateral_factor).toString(10), method: 'redeemUnderlying' };
            //     }

            // }


            if (new BigNumber(maxReedemOfAllMarkets[accountToken.token_address].amount).gte(accountToken.supply_balance_underlying) && accountToken.is_entered) {
                maxReedemOfAllMarkets[accountToken.token_address].amount = accountToken.supply_balance_underlying;
                if (borrowedMarkets > 0 && suppliedMarkets === 1) {
                    maxReedemOfAllMarkets[accountToken.token_address].method = 'redeemUnderlying';
                } else {
                    maxReedemOfAllMarkets[accountToken.token_address].method = 'redeem';
                }
            }

            if (new BigNumber(maxReedemOfAllMarkets[accountToken.token_address].amount).gt(market.cash)) {
                maxReedemOfAllMarkets[accountToken.token_address].amount = market.cash;
                maxReedemOfAllMarkets[accountToken.token_address].method = 'redeemUnderlying';
            }
        }

        for (const key in maxReedemOfAllMarkets) {
            maxReedemOfAllMarkets[key].amount = new BigNumber(maxReedemOfAllMarkets[key].amount).toFixed(markets[key].underlying_decimals, BigNumber.ROUND_FLOOR);
        }
        return maxReedemOfAllMarkets;
    }

    maxFreeBorrowOfAllMarket(account, markets, deltaBlock = 20, percent = 0.8) {
        let freeBorrow = this.freeLiquidity(account, markets, deltaBlock);

        let borrowed = this.totalBorrowBalance(account, markets);

        let maxBorrow = this.maxBorrow(account, markets);



        freeBorrow = new BigNumber(freeBorrow);

        let maxBorrowOfAllMarkets = {}

        for (const key in markets) {
            maxBorrowOfAllMarkets[key] = '0';
        }

        if (freeBorrow.lte(0)) return maxBorrowOfAllMarkets;


        if (new BigNumber(borrowed).div(maxBorrow).gt(percent)) return maxBorrowOfAllMarkets;

        let availableBorrow = new BigNumber(maxBorrow).times(percent).minus(borrowed);
        if (freeBorrow.gte(availableBorrow)) {
            freeBorrow = availableBorrow;
        }


        for (let index = 0; index < account.tokens.length; index++) {
            const accountToken = account.tokens[index];
            const market = markets[accountToken.token_address];

            maxBorrowOfAllMarkets[accountToken.token_address] = freeBorrow.div(market.underlying_price).toString(10);
        }

        return maxBorrowOfAllMarkets;
    }


}

module.exports = LendSdk;