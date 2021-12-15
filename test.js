const LendSdk = require('./lend-sdk');

var Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('https://gwan-ssl.wandevs.org:56891'));

const config = {
    apiUrl: 'https://v2.wanlend.finance:8889',
    unitroller: '0xd6980C52C20Fb106e54cC6c8AE04c089C3F6B9d6',
    multiCallAddr: '0xBa5934Ab3056fcA1Fa458D30FBB3810c3eb5145f'
}


const account = '0x52F1045671F56f572f7743232B558dDCa0627e10';

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
    
}).catch(e=>{
    console.error(e);
});