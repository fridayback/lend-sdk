const LendSdk = require('./lend-sdk');

var Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('https://rpc.api.moonbase.moonbeam.network'));//https://rpc.moonriver.moonbeam.network//https://rpc.testnet.moonbeam.network

const config = {
    apiUrl: 'https://lend-api-testnet.huckleberry.finance',//,'https://lend-api.huckleberry.finance',
    unitroller: '0x6652efa0a15939e8013522ac24dc3e6cb1a1f3e1',//'0x6652efa0a15939e8013522ac24dc3e6cb1a1f3e1',
    multiCallAddr: '0x136333217C18Cd6E018B85Aaf8Bd563EB72E97Fd',//'0x1Fe0C23940FcE7f440248e00Ce2a175977EE4B16'
    helper:"0xec36dECC18E8d023B82ab97B6bC92151C9c882F6",
}


const account = '0xD837BBcd310B2910eA89F2E064Ab4dA91C8357bb';//'0xD837BBcd310B2910eA89F2E064Ab4dA91C8357bb';0x0da4b57c2bfc2afcf6f63cdc89dae588c943c5b6

let compoundSdk = new LendSdk(config,web3);

// compoundSdk.getAllMarket().then(markets=>{
//     console.log(markets)
// }).catch(e=>{
//     console.error(e);
// });

compoundSdk.getCompoundData2(account,0.067).then(async ({markets,account})=>{
    console.log('[markets]',markets);
    console.log('[account]',account);

    for (const key in markets) {
        let approved = await compoundSdk.isAuthorized(account,markets[key])
        console.log(markets[key].name,approved?"is approved":"not approved");
    }

    // for (let index = 0; index < account.tokens.length; index++) {
    //     if(account.tokens[index].token_address === '0x0da4b57c2bfc2afcf6f63cdc89dae588c943c5b6'){
    //         account.tokens[index].supply_balance_underlying = '4000000000000.9348083';
    //         account.tokens[index].is_entered = true;
    //     }
    // }

    // console.log('[markets]',markets);1.000223
    // console.log('[account]',account);

    console.log('maxBorrow:',compoundSdk.maxBorrow(account,markets));
    console.log('totalSupplyBalance:',compoundSdk.totalSupplyBalance(account,markets));
    console.log('totalBorrowBalance:',compoundSdk.totalBorrowBalance(account,markets));
    // console.log('totalSupplyApr:',compoundSdk.totalSupplyApr(account,markets));
    // console.log('totalBorrowApr:',compoundSdk.totalBorrowApr(account,markets));
    // console.log('totalNetApr:',compoundSdk.totalNetApr(account,markets));
    // // console.log('maxFreeReedemAmountOfAllMarket:',compoundSdk.maxFreeReedemAmountOfAllMarket(account,markets));
    // console.log('maxFreeBorrowOfAllMarket:',compoundSdk.maxFreeBorrowOfAllMarket(account,markets));
    console.log('maxFreeReedemAmountOfAllMarket:',compoundSdk.maxFreeReedemAmountOfAllMarket(account,markets));
    
    console.log('OVER');
}).catch(e=>{
    console.error(e);
});