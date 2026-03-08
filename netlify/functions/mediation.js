// =============================================
// mediation.js — Hayes Model 4 (Bootstrap 5000)
// מקבל: { data: [{x, m, y}] }
// מחזיר: { pathA, pathB, pathCtag, pathC, indirectEffect, bootCI }
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

function bootstrap(data, nBoot = 5000) {
    const n = data.length;
    const indirects = [];
    for (let b = 0; b < nBoot; b++) {
        const sample = Array.from({ length: n }, () => data[Math.floor(Math.random() * n)]);
        const Xm = sample.map(d => [1, d.x]);
        const Ym_m = sample.map(d => [d.m]);
        const r1 = ols(Xm, Ym_m);
        if (!r1) continue;
        const Xy = sample.map(d => [1, d.x, d.m]);
        const Yy = sample.map(d => [d.y]);
        const r2 = ols(Xy, Yy);
        if (!r2) continue;
        indirects.push(r1.B[1] * r2.B[2]);
    }
    indirects.sort((a, b) => a - b);
    const lo = Math.floor(nBoot * 0.025), hi = Math.ceil(nBoot * 0.975);
    return { llci: indirects[lo], ulci: indirects[hi] };
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" }, body: "" };
    }
    try {
        const { data } = JSON.parse(event.body || "{}");
        if (!data || data.length < 10) return { statusCode: 400, body: JSON.stringify({ error: "אין מספיק נתונים" }) };

        // Path A: X -> M
        const Xa = data.map(d => [1, d.x]);
        const Ya = data.map(d => [d.m]);
        const pathA_res = ols(Xa, Ya);

        // Path B + C': X, M -> Y
        const Xb = data.map(d => [1, d.x, d.m]);
        const Yb = data.map(d => [d.y]);
        const pathB_res = ols(Xb, Yb);

        // Path C (total): X -> Y
        const Xc = data.map(d => [1, d.x]);
        const Yc = data.map(d => [d.y]);
        const pathC_res = ols(Xc, Yc);

        const indirectEffect = pathA_res.B[1] * pathB_res.B[2];
        const bootCI = bootstrap(data, 5000);

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({
                pathA:    { B: pathA_res.B[1],  SE: pathA_res.SE[1],  df: pathA_res.df },
                pathB:    { B: pathB_res.B[2],  SE: pathB_res.SE[2],  df: pathB_res.df },
                pathCtag: { B: pathB_res.B[1],  SE: pathB_res.SE[1],  df: pathB_res.df },
                pathC:    { B: pathC_res.B[1],  SE: pathC_res.SE[1],  df: pathC_res.df },
                indirectEffect,
                bootCI
            })
        };
    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};
