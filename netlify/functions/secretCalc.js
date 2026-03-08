exports.handler = async function(event, context) {
    try {
        const body = JSON.parse(event.body || "{}");
        const num1 = body.number1 || 0;
        const num2 = body.number2 || 0;
        const secretResult = (num1 + num2) * 3.14159;
        
        return {
            statusCode: 200,
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ finalAnswer: secretResult })
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Server crashed" })
        };
    }
};