// =============================================
// catModeration.js — מיתון קטגוריאלי (Bootstrap)
// מקבל: { data: [{x, w, y}], method, cats, mx }
// מחזיר: { resA, resB, sseA, sseB, bootRes }
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
    return { B, SE, df, VarCovar, sse };
}

function buildRow(d, cats, method, mx) {
    const k = cats.length - 1;
    const catIdx = cats.indexOf(d.w);
    const xc = d.x - mx;

    // dummy/sequential coding for category
    const dummies = [];
    for (let j = 1; j <= k; j++) {
        if (method === 'sequential') dummies.push(catIdx >= j ? 1 : 0);
        else dummies.push(d.w === cats[j] ? 1 : 0);
    }

    // interactions
    const interactions = dummies.map(dm => xc * dm);
    return [1, xc, ...dummies, ...interactions];
}

function buildRowMainOnly(d, cats, method, mx) {
    const k = cats.length - 1;
    const catIdx = cats.indexOf(d.w);
    const xc = d.x - mx;
    const dummies = [];
    for (let j = 1; j <= k; j++) {
        if (method === 'sequential') dummies.push(catIdx >= j ? 1 : 0);
        else dummies.push(d.w === cats[j] ? 1 : 0);
    }
    return [1, xc, ...dummies];
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" }, body: "" };
    }
    try {
        const { data, method, cats, mx } = JSON.parse(event.body || "{}");
        if (!data || data.length < 10) return { statusCode: 400, body: JSON.stringify({ error: "אין מספיק נתונים" }) };

        // Model A: main effects only
        const XA = data.map(d => buildRowMainOnly(d, cats, method, mx));
        const YA = data.map(d => [d.y]);
        const resA = ols(XA, YA);

        // Model B: main effects + interactions
        const XB = data.map(d => buildRow(d, cats, method, mx));
        const YB = data.map(d => [d.y]);
        const resB = ols(XB, YB);

        if (!resA || !resB) return { statusCode: 500, body: JSON.stringify({ error: "שגיאה בחישוב OLS" }) };

        // Bootstrap per category slope
        const nBoot = 2000;
        const n = data.length;
        const bootSamples = {};
        cats.forEach(c => bootSamples[c] = []);

        for (let b = 0; b < nBoot; b++) {
            const sample = Array.from({ length: n }, () => data[Math.floor(Math.random() * n)]);
            const Xs = sample.map(d => buildRow(d, cats, method, mx));
            const Ys = sample.map(d => [d.y]);
            const res = ols(Xs, Ys);
            if (!res) continue;
            const k = cats.length - 1;
            cats.forEach((cat, idx) => {
                let slope = res.B[1];
                for (let j = 1; j <= k; j++) {
                    let isOne = method === 'sequential' ? (idx >= j ? 1 : 0) : (cat === cats[j] ? 1 : 0);
                    if (isOne) slope += res.B[1 + k + j];
                }
                bootSamples[cat].push(slope);
            });
        }

        const bootRes = {};
        cats.forEach(c => {
            const arr = bootSamples[c].sort((a, b) => a - b);
            bootRes[c] = {
                llci: arr[Math.floor(nBoot * 0.025)],
                ulci: arr[Math.ceil(nBoot * 0.975)]
            };
        });

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({
                resA: { B: resA.B, SE: resA.SE, df: resA.df, VarCovar: resA.VarCovar },
                resB: { B: resB.B, SE: resB.SE, df: resB.df, VarCovar: resB.VarCovar },
                sseA: resA.sse,
                sseB: resB.sse,
                bootRes
            })
        };
    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};
