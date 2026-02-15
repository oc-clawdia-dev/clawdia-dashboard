exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    try {
        const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
        const WALLET_ADDRESS = 'CdJSUeHX49eFK8hixbfDKNRLTakYcy59MbVEh8pDnn9U';
        const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        
        const { type } = event.queryStringParameters || {};
        
        let rpcPayload;
        
        switch (type) {
            case 'sol':
                rpcPayload = {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'getBalance',
                    params: [WALLET_ADDRESS]
                };
                break;
                
            case 'usdc':
                rpcPayload = {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'getTokenAccountsByOwner',
                    params: [
                        WALLET_ADDRESS,
                        { mint: USDC_MINT },
                        { encoding: 'jsonParsed' }
                    ]
                };
                break;
                
            default:
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        error: 'Invalid type parameter. Use "sol" or "usdc"' 
                    })
                };
        }

        // Make request to Solana RPC
        const response = await fetch(SOLANA_RPC_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(rpcPayload)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Process the response based on type
        let result;
        if (type === 'sol') {
            result = {
                balance: data.result ? data.result.value / 1000000000 : 0
            };
        } else if (type === 'usdc') {
            if (data.result && data.result.value.length > 0) {
                result = {
                    balance: data.result.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0
                };
            } else {
                result = { balance: 0 };
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(result)
        };

    } catch (error) {
        console.error('Wallet proxy error:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Internal server error',
                details: error.message 
            })
        };
    }
};