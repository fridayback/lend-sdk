const LendSdk = require('./lend-sdk');

var Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('https://rpc.testnet.moonbeam.network'));

const config = {
    apiUrl: 'http://192.168.1.121:8890',
    unitroller: '0x39aaf046a9d32976a099bdb49dd6c537c28dd647',
    multiCallAddr: '0x136333217C18Cd6E018B85Aaf8Bd563EB72E97Fd'
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