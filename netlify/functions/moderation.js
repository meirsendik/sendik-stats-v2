// =============================================
// moderation.js — Hayes Model 1 (Bootstrap 5000)
// מקבל: { data: [{x, y, w}], wLow, wHigh }
// מחזיר: { B, SE, df, VarCovar, bootCI: { low, high } }
// =============================================

const M = {
    mul: (A, B) => A.map((r, i) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0))),
    inv: (m) => {
        let n = m.length, i = 0, k = 0;
        let a = m.map(r => [...r]);
        let b = a.map((_, x) => a.map((_, y) => x == y ? 1 : 0));
        for (; i < n; i++) {
            let p = a[i][i];
            if (Math.abs(p) < 1e-9) return null;
            for (k = 0; k < n; k++) { a[i][k] /= p; b[i][k] /= p; }
            for (let j = 0; j < n; j++) if (i != j) {
                let v = a[j][i];
                for (k = 0; k < n; k++) { a[j][k] -= v * a[i][k]; b[j][k] -= v * b[i][k]; }
            }
        }
        return b;
    },
    t: (m) => m[0].map((_, i) => m.map(r => r[i]))
};

function ols(X, Y) {
    const n = Y.length, k = X[0].length;
    const Xt = M.t(X), XtX = M.mul(Xt, X);
    const Inv = M.inv(XtX);
    if (!Inv) return null;
    const B = M.mul(M.mul(Inv, Xt), Y).map(r => r[0]);
    const Yhat = X.map(r => r.reduce((s, v, i) => s + v * B[i], 0));
    const resid = Y.map((y, i) => y[0] - Yhat[i]);
    const sse = resid.reduce((s, v) => s + v * v, 0);
    const df = n - k;
    const mse = sse / df;
    const VarCovar = Inv.map(row => row.map(v => v * mse));
    const SE = VarCovar.map((row, i) => Math.sqrt(row[i]));
    return { B, SE, df, VarCovar };
}

function bootstrapSlopes(data, wLow, wHigh, nBoot = 5000) {
    const n = data.length;
    const slopesLow = [], slopesHigh = [];
    for (let b = 0; b < nBoot; b++) {
        const sample = Array.from({ length: n }, () => data[Math.floor(Math.random() * n)]);
        const X = sample.map(d => [1, d.x, d.w, d.x * d.w]);
        const Y = sample.map(d => [d.y]);
        const res = ols(X, Y);
        if (!res) continue;
        slopesLow.push(res.B[1] + res.B[3] * wLow);
        slopesHigh.push(res.B[1] + res.B[3] * wHigh);
    }
    const ci = (arr) => {
        arr.sort((a, b) => a - b);
        return { llci: arr[Math.floor(nBoot * 0.025)], ulci: arr[Math.ceil(nBoot * 0.975)] };
    };
    return { low: ci(slopesLow), high: ci(slopesHigh) };
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" }, body: "" };
    }
    try {
        const { data, wLow, wHigh } = JSON.parse(event.body || "{}");
        if (!data || data.length < 10) return { statusCode: 400, body: JSON.stringify({ error: "אין מספיק נתונים" }) };

        const X = data.map(d => [1, d.x, d.w, d.x * d.w]);
        const Y = data.map(d => [d.y]);
        const res = ols(X, Y);
        if (!res) return { statusCode: 500, body: JSON.stringify({ error: "שגיאה בחישוב OLS" }) };

        const bootCI = bootstrapSlopes(data, wLow, wHigh, 5000);

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({
                B: res.B,
                SE: res.SE,
                df: res.df,
                VarCovar: res.VarCovar,
                bootCI
            })
        };
    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};
