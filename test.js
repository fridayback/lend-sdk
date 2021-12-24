const LendSdk = require('./lend-sdk');

var Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('https://rpc.testnet.moonbeam.network'));

const config = {
    apiUrl: 'https://lend-api.huckleberry.finance',
    unitroller: '0x6652efa0a15939e8013522ac24dc3e6cb1a1f3e1',
    multiCallAddr: '0x136333217C18Cd6E018B85Aaf8Bd563EB72E97Fd'
}


const account = '0x52F1045671F56f572f7743232B558dDCa0627e10';//'0xD837BBcd310B2910eA89F2E064Ab4dA91C8357bb';

let compoundSdk = new LendSdk(config,web3);

// compoundSdk.getAllMarket().then(markets=>{
//     console.log(markets)
// }).catch(e=>{
//     console.error(e);
// });

compoundSdk.getCompoundData(account).then(async ({markets,account})=>{
    console.log(markets);
    console.log(account);

    for (const key in markets) {
        let approved = await compoundSdk.isAuthorized(account,markets[key])
        console.log(markets[key].name,approved?"is approved":"not approved");
    }

    console.log('maxBorrow:',compoundSdk.maxBorrow(account,markets));
    console.log('totalSupplyBalance:',compoundSdk.totalSupplyBalance(account,markets));
    console.log('totalBorrowBalance:',compoundSdk.totalBorrowBalance(account,markets));
    console.log('totalSupplyApr:',compoundSdk.totalSupplyApr(account,markets));
    console.log('totalBorrowApr:',compoundSdk.totalBorrowApr(account,markets));
    console.log('totalNetApr:',compoundSdk.totalNetApr(account,markets));
    console.log('maxFreeReedemAmountOfAllMarket:',compoundSdk.maxFreeReedemAmountOfAllMarket(account,markets));
    console.log('maxFreeBorrowOfAllMarket:',compoundSdk.maxFreeBorrowOfAllMarket(account,markets));
    console.log('maxFreeReedemAmountOfAllMarket:',compoundSdk.maxFreeReedemAmountOfAllMarket(account,markets));
    
    
}).catch(e=>{
    console.error(e);
});