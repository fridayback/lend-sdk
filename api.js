
// var https = require('https');

// const fetchJsonPromise = async (method,url, request) => {

//     return new Promise((resolve, reject) => {
//         https.get(url, function (res) {
//             let chunk = '';
//             if (res.statusCode < 200 || res.statusCode >= 300) {
//                 reject('http error:' + res.statusCode);
//             }
//             res.on('data', function (data) {
//                 chunk += data;
//             });
//             res.on('end', () => {
//                 resolve(JSON.parse(chunk));
//             })
//             res.on('error', (err) => {
//                 reject(err);
//             })
//         });
//     });

// }

const fetchJsonPromise = (method, url, formData) => {
    return new Promise((resolve, reject) => {
        let request = { method: method };
        if (method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
            request = {
                method: method,
                body: formData,
                headers: {
                    "Content-Type": "application/json"
                }
            }
            // request.body = formData;
            // request.headers = {
            //     'content-type': 'application/json'
            // }
        }

        fetch(url, request).then((response) => {
            if (response.ok) {
                return response.json();
            } else {
                reject('服务器异常');
            }
        }).then((responseJson) => {
            resolve(responseJson);
        }).catch((err) => {
            reject(new Error(err));
        })
    })
}

class LendApi {
    constructor(url) {
        this.url = url;
    }

    async getMarkets(marketsAddresses) {

        let fetchUrl = this.url + '/market';
        if (marketsAddresses) {
            fetchUrl += '?addresses=' + JSON.stringify(marketsAddresses);
        }
        return (await fetchJsonPromise('GET', fetchUrl, '')).markets;
    }

    async getAccounts(accountAddresses) {
        let fetchUrl = this.url + '/account';
        if (accountAddresses) {
            fetchUrl += '?addresses=' + JSON.stringify(accountAddresses);
        }
        return (await fetchJsonPromise('GET', fetchUrl, '')).accounts;
    }
}

module.exports = LendApi;