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
        // Extract sheet ID and range from query parameters
        const { sheetId, range } = event.queryStringParameters || {};
        
        if (!sheetId || !range) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: 'Missing sheetId or range parameters' 
                })
            };
        }

        // Get API key from environment variables
        const MATON_API_KEY = process.env.MATON_API_KEY;
        
        if (!MATON_API_KEY) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    error: 'MATON_API_KEY not configured' 
                })
            };
        }

        // Make request to Maton API
        const url = `https://gateway.maton.ai/google-sheets/v4/spreadsheets/${sheetId}/values/${range}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${MATON_API_KEY}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error('Sheets proxy error:', error);
        
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